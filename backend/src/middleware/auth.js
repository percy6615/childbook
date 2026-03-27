const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * 驗證 JWT，將 user 附加到 req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '請先登入' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, displayName: true }
    })

    if (!user) return res.status(401).json({ error: '使用者不存在' })

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Token 無效' })
    if (err.name === 'TokenExpiredError')  return res.status(401).json({ error: 'Token 已過期，請重新登入' })
    next(err)
  }
}

/**
 * 角色限制
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未授權' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '權限不足' })
    next()
  }
}

/**
 * v2.2 核心：確認登入者是否為指定幼童的 parent 或 teacher（多對多）
 * ADMIN：全域通行
 * PARENT：必須在該 child 的 parents 陣列中
 * TEACHER：必須在該 child 的 teachers 陣列中
 * UNBOUND：全部拒絕
 */
const authorizeChildAccess = async (req, res, next) => {
  try {
    const childId = req.params.childId || req.body.childId || req.query.childId
    if (!childId) return next()

    const { user } = req
    if (user.role === 'ADMIN') return next()
    if (user.role === 'UNBOUND') return res.status(403).json({ error: '請先綁定幼童才能存取資料' })

    // 查詢幼童，同時取出 parents 與 teachers id 清單
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: {
        id: true,
        parents:  { select: { id: true } },
        teachers: { select: { id: true } }
      }
    })

    if (!child) return res.status(404).json({ error: '幼童資料不存在' })

    const parentIds  = child.parents.map(p => p.id)
    const teacherIds = child.teachers.map(t => t.id)

    if (user.role === 'PARENT'  && !parentIds.includes(user.id)) {
      return res.status(403).json({ error: '無權存取此幼童資料' })
    }
    if (user.role === 'TEACHER' && !teacherIds.includes(user.id)) {
      return res.status(403).json({ error: '無權存取此幼童資料' })
    }

    req.child = child
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * 確保已綁定至少一位幼童（UNBOUND 使用者導向綁定頁）
 */
const requireBound = (req, res, next) => {
  if (req.user?.role === 'UNBOUND') {
    return res.status(403).json({
      error: '帳號尚未綁定幼童，請先輸入綁定碼',
      code: 'UNBOUND'
    })
  }
  next()
}

module.exports = { authenticate, requireRole, authorizeChildAccess, requireBound }
