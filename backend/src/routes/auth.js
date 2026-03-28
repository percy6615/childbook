const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { body, validationResult } = require('express-validator')
const { PrismaClient } = require('@prisma/client')
const { authenticate } = require('../middleware/auth')
const { sendPasswordResetEmail } = require('../utils/email')

const router = express.Router()
const prisma = new PrismaClient()

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Email 格式錯誤'),
  body('password').isLength({ min: 6 }).withMessage('密碼至少 6 字元'),
  body('displayName').optional().trim().isLength({ max: 50 }),
  // 不接受 role 參數，角色由綁定碼決定，預設 UNBOUND
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password, displayName } = req.body   // 不取 role

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: '此 Email 已被註冊' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName, role: 'UNBOUND' },  // 強制 UNBOUND
      select: { id: true, email: true, role: true, displayName: true, createdAt: true }
    })

    const token = generateToken(user.id)
    res.status(201).json({ message: '註冊成功', user, token })
  } catch (err) { next(err) }
})

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('請輸入有效 Email'),
  body('password').notEmpty().withMessage('請輸入密碼')
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password } = req.body
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true, displayName: true }
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' })
    }

    const { passwordHash, ...userData } = user
    const token = generateToken(user.id)
    res.json({ message: '登入成功', user: userData, token })
  } catch (err) { next(err) }
})

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, role: true, displayName: true, createdAt: true,
        parentOf:  { select: { id: true, name: true, avatarUrl: true } },
        teacherOf: { select: { id: true, name: true, avatarUrl: true } }
      }
    })
    res.json(user)
  } catch (err) { next(err) }
})

// ─── PATCH /api/v1/auth/profile ───────────────────────────────────────────────
router.patch('/profile', authenticate, [
  body('displayName').optional().trim().isLength({ max: 50 }),
  body('password').optional().isLength({ min: 6 })
], async (req, res, next) => {
  try {
    const { displayName, password } = req.body
    const updateData = {}
    if (displayName !== undefined) updateData.displayName = displayName
    if (password) updateData.passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, email: true, role: true, displayName: true }
    })
    res.json({ message: '更新成功', user })
  } catch (err) { next(err) }
})

// ─── PUT /api/v1/auth/change-password ────────────────────────────────────────
// v2.2.1：已登入使用者修改密碼（需驗證舊密碼）
router.put('/change-password', authenticate, [
  body('oldPassword').notEmpty().withMessage('請輸入目前密碼'),
  body('newPassword').isLength({ min: 6 }).withMessage('新密碼至少 6 字元')
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { oldPassword, newPassword } = req.body

    // 取得含 passwordHash 的完整使用者
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true }
    })

    // 驗證舊密碼
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash)
    if (!isMatch) {
      return res.status(400).json({ error: '目前密碼不正確' })
    }

    // 舊新密碼不能相同
    if (oldPassword === newPassword) {
      return res.status(400).json({ error: '新密碼不可與目前密碼相同' })
    }

    const newHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newHash }
    })

    res.json({ message: '密碼修改成功，請重新登入以確認' })
  } catch (err) { next(err) }
})


router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('請輸入有效 Email')
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email } = req.body

    // ✅ 不管 email 是否存在都回 200（防止帳號枚舉攻擊）
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.json({ message: '若此 Email 已註冊，您將收到重置信件' })
    }

    const expiresMin = parseInt(process.env.RESET_TOKEN_EXPIRES_MIN || '30')
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + expiresMin * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry }
    })

    await sendPasswordResetEmail({
      to: user.email,
      displayName: user.displayName,
      resetToken
    })

    res.json({ message: '若此 Email 已註冊，您將收到重置信件' })
  } catch (err) { next(err) }
})

// ─── POST /api/v1/auth/reset-password ────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token 無效'),
  body('newPassword').isLength({ min: 6 }).withMessage('新密碼至少 6 字元')
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { token, newPassword } = req.body

    const user = await prisma.user.findUnique({ where: { resetToken: token } })

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: '重置連結無效或已過期，請重新申請' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null
      }
    })

    res.json({ message: '密碼已成功重置，請重新登入' })
  } catch (err) { next(err) }
})

module.exports = router
