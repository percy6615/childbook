const express = require('express')
const { body, validationResult } = require('express-validator')
const { PrismaClient } = require('@prisma/client')
const { authenticate, requireRole, authorizeChildAccess } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.use(authenticate)

// ─── GET /api/v1/children ─────────────────────────────────────────────────────
// 取得目前登入者可存取的幼童清單
router.get('/', async (req, res, next) => {
  try {
    const { user } = req
    let children = []

    if (user.role === 'ADMIN') {
      children = await prisma.child.findMany({
        include: {
          parents:  { select: { id: true, displayName: true, email: true } },
          teachers: { select: { id: true, displayName: true, email: true } },
          _count: { select: { records: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    } else if (user.role === 'PARENT') {
      children = await prisma.child.findMany({
        where: { parents: { some: { id: user.id } } },
        include: {
          parents:  { select: { id: true, displayName: true, email: true } },
          teachers: { select: { id: true, displayName: true, email: true } },
          _count: { select: { records: true } }
        },
        orderBy: { name: 'asc' }
      })
    } else if (user.role === 'TEACHER') {
      children = await prisma.child.findMany({
        where: { teachers: { some: { id: user.id } } },
        include: {
          parents:  { select: { id: true, displayName: true, email: true } },
          teachers: { select: { id: true, displayName: true, email: true } },
          _count: { select: { records: true } }
        },
        orderBy: { name: 'asc' }
      })
    }
    // UNBOUND → 空陣列

    res.json(children)
  } catch (err) { next(err) }
})

// ─── GET /api/v1/children/:childId ───────────────────────────────────────────
router.get('/:childId', authorizeChildAccess, async (req, res, next) => {
  try {
    const child = await prisma.child.findUnique({
      where: { id: req.params.childId },
      include: {
        parents:  { select: { id: true, displayName: true, email: true } },
        teachers: { select: { id: true, displayName: true, email: true } }
      }
    })
    if (!child) return res.status(404).json({ error: '幼童資料不存在' })

    // ADMIN 可額外看到綁定碼，一般使用者不顯示
    const result = req.user.role === 'ADMIN'
      ? child
      : { ...child, parentBindingCode: undefined, teacherBindingCode: undefined }

    res.json(result)
  } catch (err) { next(err) }
})

// ─── POST /api/v1/children ────────────────────────────────────────────────────
// 只有 ADMIN 可建立幼童檔案（系統後台操作）
router.post('/', requireRole('ADMIN'), [
  body('name').trim().notEmpty().withMessage('請輸入幼童姓名'),
  body('birthDate').optional().isISO8601(),
  body('gender').optional().isIn(['M', 'F'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { name, birthDate, gender, notes } = req.body

    const child = await prisma.child.create({
      data: {
        name,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        gender, notes
        // parentBindingCode & teacherBindingCode 由 @default(cuid()) 自動產生
      }
    })

    res.status(201).json({
      message: '幼童檔案建立成功',
      child,
      bindingCodes: {
        parent:  child.parentBindingCode,
        teacher: child.teacherBindingCode
      }
    })
  } catch (err) { next(err) }
})

// ─── POST /api/v1/children/bind ──────────────────────────────────────────────
// v2.2 核心：輸入綁定碼，建立 User ↔ Child 多對多關聯
router.post('/bind', [
  body('bindingCode').trim().notEmpty().withMessage('請輸入綁定碼')
], async (req, res, next) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { bindingCode } = req.body
    const userId = req.user.id

    // 同時查詢 parentBindingCode 和 teacherBindingCode
    const child = await prisma.child.findFirst({
      where: {
        OR: [
          { parentBindingCode: bindingCode },
          { teacherBindingCode: bindingCode }
        ]
      },
      include: {
        parents:  { select: { id: true } },
        teachers: { select: { id: true } }
      }
    })

    if (!child) {
      return res.status(404).json({ error: '綁定碼無效，請確認後重新輸入' })
    }

    const isParentCode  = child.parentBindingCode  === bindingCode
    const isTeacherCode = child.teacherBindingCode === bindingCode

    // 防止重複綁定
    const alreadyParent  = child.parents.some(p => p.id === userId)
    const alreadyTeacher = child.teachers.some(t => t.id === userId)

    if ((isParentCode && alreadyParent) || (isTeacherCode && alreadyTeacher)) {
      return res.status(409).json({ error: '您已綁定此幼童' })
    }

    // 建立關聯 & 更新使用者角色
    const newRole = isParentCode ? 'PARENT' : 'TEACHER'

    await prisma.$transaction([
      // 建立 Child ↔ User 多對多關聯
      prisma.child.update({
        where: { id: child.id },
        data: isParentCode
          ? { parents:  { connect: { id: userId } } }
          : { teachers: { connect: { id: userId } } }
      }),
      // 若使用者目前是 UNBOUND，升級為對應角色
      // 若已是 PARENT/TEACHER/ADMIN，不降級
      prisma.user.updateMany({
        where: { id: userId, role: 'UNBOUND' },
        data: { role: newRole }
      })
    ])

    // 取得更新後的幼童資料（不含綁定碼）
    const updatedChild = await prisma.child.findUnique({
      where: { id: child.id },
      select: {
        id: true, name: true, birthDate: true, gender: true, notes: true, avatarUrl: true,
        parents:  { select: { id: true, displayName: true, email: true } },
        teachers: { select: { id: true, displayName: true, email: true } }
      }
    })

    // 回傳更新後的使用者角色（前端需更新 store）
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, displayName: true }
    })

    res.json({
      message: `成功綁定「${child.name}」，您的角色為 ${newRole === 'PARENT' ? '家長' : '教師'}`,
      boundAs: newRole,
      child: updatedChild,
      user: updatedUser
    })
  } catch (err) { next(err) }
})

// ─── DELETE /api/v1/children/:childId/unbind ──────────────────────────────────
// 解除自己與幼童的綁定
router.delete('/:childId/unbind', authorizeChildAccess, async (req, res, next) => {
  try {
    const { user } = req
    const childId = req.params.childId

    if (user.role === 'PARENT') {
      await prisma.child.update({
        where: { id: childId },
        data: { parents: { disconnect: { id: user.id } } }
      })
    } else if (user.role === 'TEACHER') {
      await prisma.child.update({
        where: { id: childId },
        data: { teachers: { disconnect: { id: user.id } } }
      })
    }

    // 確認是否還有其他綁定，沒有則降回 UNBOUND
    const remaining = await prisma.child.count({
      where: {
        OR: [
          { parents:  { some: { id: user.id } } },
          { teachers: { some: { id: user.id } } }
        ]
      }
    })

    if (remaining === 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'UNBOUND' }
      })
    }

    res.json({ message: '已解除綁定' })
  } catch (err) { next(err) }
})

// ─── PATCH /api/v1/children/:childId ─────────────────────────────────────────
router.patch('/:childId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, birthDate, gender, notes } = req.body
    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (birthDate !== undefined) updateData.birthDate = new Date(birthDate)
    if (gender !== undefined) updateData.gender = gender
    if (notes !== undefined) updateData.notes = notes

    const child = await prisma.child.update({
      where: { id: req.params.childId },
      data: updateData
    })
    res.json({ message: '更新成功', child })
  } catch (err) { next(err) }
})

// ─── DELETE /api/v1/children/:childId ────────────────────────────────────────
router.delete('/:childId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.child.delete({ where: { id: req.params.childId } })
    res.json({ message: '幼童資料已刪除' })
  } catch (err) { next(err) }
})

module.exports = router
