/**
 * Backend Integration Tests - v2.2
 * Covers: Auth (email/password/forgot/reset), Children (bind/unbind), Records, Analytics
 * Run: npm test  (from backend/)
 */
require('dotenv').config()
const request = require('supertest')
const app = require('../../src/app')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL } }
})

// ─── State ────────────────────────────────────────────────────────────────────
let adminToken, parentToken, teacherToken, unboundToken
let adminUser, parentUser, teacherUser, unboundUser
let testChild1, testChild2

const PARENT_BIND_CODE = '__test_parent_bind__'
const TEACHER_BIND_CODE = '__test_teacher_bind__'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const post = (url, token) => (body) =>
  request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)

const get = (url, token) =>
  request(app).get(url).set('Authorization', `Bearer ${token}`)

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Clean test data
  await prisma.$executeRawUnsafe(`
    DELETE FROM "DailyRecord" WHERE "childId" IN (
      SELECT id FROM "Child" WHERE name LIKE '__test%'
    )
  `).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "Child" WHERE name LIKE '__test%'`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE '__test%'`).catch(() => {})

  const hash = await bcrypt.hash('TestPass123!', 10)

  adminUser   = await prisma.user.create({ data: { email: '__test__admin@t.com',   passwordHash: hash, role: 'ADMIN',   displayName: 'Test Admin' } })
  parentUser  = await prisma.user.create({ data: { email: '__test__parent@t.com',  passwordHash: hash, role: 'PARENT',  displayName: 'Test Parent' } })
  teacherUser = await prisma.user.create({ data: { email: '__test__teacher@t.com', passwordHash: hash, role: 'TEACHER', displayName: 'Test Teacher' } })
  unboundUser = await prisma.user.create({ data: { email: '__test__unbound@t.com', passwordHash: hash, role: 'UNBOUND', displayName: 'Test Unbound' } })

  // Login tokens
  const loginAdmin   = await request(app).post('/api/v1/auth/login').send({ email: '__test__admin@t.com',   password: 'TestPass123!' })
  const loginParent  = await request(app).post('/api/v1/auth/login').send({ email: '__test__parent@t.com',  password: 'TestPass123!' })
  const loginTeacher = await request(app).post('/api/v1/auth/login').send({ email: '__test__teacher@t.com', password: 'TestPass123!' })
  const loginUnbound = await request(app).post('/api/v1/auth/login').send({ email: '__test__unbound@t.com', password: 'TestPass123!' })

  adminToken   = loginAdmin.body.token
  parentToken  = loginParent.body.token
  teacherToken = loginTeacher.body.token
  unboundToken = loginUnbound.body.token

  // Test children (with known binding codes)
  testChild1 = await prisma.child.create({
    data: {
      name: '__test__child1',
      parentBindingCode:  PARENT_BIND_CODE,
      teacherBindingCode: TEACHER_BIND_CODE,
      parents:  { connect: { id: parentUser.id } },
      teachers: { connect: { id: teacherUser.id } }
    }
  })

  testChild2 = await prisma.child.create({
    data: {
      name: '__test__child2',
      parents:  { connect: { id: parentUser.id } }
    }
  })
})

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "HealthRecord" WHERE "recordId" IN (SELECT id FROM "DailyRecord" WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%'))`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "BowelRecord"  WHERE "recordId" IN (SELECT id FROM "DailyRecord" WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%'))`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "SleepRecord"  WHERE "recordId" IN (SELECT id FROM "DailyRecord" WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%'))`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "DietRecord"   WHERE "recordId" IN (SELECT id FROM "DailyRecord" WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%'))`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "DailyRecord" WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%')`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "UploadTask"  WHERE "childId" IN (SELECT id FROM "Child" WHERE name LIKE '__test%')`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "Child" WHERE name LIKE '__test%'`).catch(() => {})
  await prisma.$executeRawUnsafe(`DELETE FROM "User"  WHERE email LIKE '__test%'`).catch(() => {})
  await prisma.$disconnect()
})

// ════════════════════════════════════════════════════════════════════════════
// AUTH TESTS
// ════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/register', () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: '__test__newreg@t.com' } })
  })

  test('新帳號 email+password 註冊 → 201 + token + UNBOUND role', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: '__test__newreg@t.com', password: 'Pass123456', displayName: '新用戶' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('UNBOUND')
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  test('重複 email → 409', async () => {
    await request(app).post('/api/v1/auth/register').send({ email: '__test__newreg@t.com', password: 'Pass123456' })
    const res = await request(app).post('/api/v1/auth/register').send({ email: '__test__newreg@t.com', password: 'Pass123456' })
    expect(res.status).toBe(409)
  })

  test('無效 email 格式 → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'not-an-email', password: 'Pass123456' })
    expect(res.status).toBe(400)
  })

  test('密碼少於 6 字元 → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: '__test__weak@t.com', password: '123' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/login', () => {
  test('正確憑證 → 200 + token', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__parent@t.com', password: 'TestPass123!' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('PARENT')
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  test('錯誤密碼 → 401', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__parent@t.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  test('不存在的 email → 401', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'nobody@t.com', password: 'anything' })
    expect(res.status).toBe(401)
  })

  test('未填欄位 → 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/auth/me', () => {
  test('有效 token → 回傳使用者（含綁定幼童）', async () => {
    const res = await get('/api/v1/auth/me', parentToken)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('__test__parent@t.com')
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(res.body).toHaveProperty('parentOf')
    expect(res.body).toHaveProperty('teacherOf')
  })

  test('無 token → 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401)
  })

  test('無效 token → 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')
      .set('Authorization', 'Bearer bad.token.here')).status).toBe(401)
  })
})

describe('POST /api/v1/auth/forgot-password', () => {
  test('已存在 email → 200（防枚舉，不透露是否存在）', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: '__test__parent@t.com' })
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('若此 Email')
  })

  test('不存在的 email → 同樣 200（防帳號枚舉攻擊）', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexist@t.com' })
    expect(res.status).toBe(200)
  })

  test('無效格式 → 400', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'not-email' })
    expect(res.status).toBe(400)
  })

  test('成功後，DB 中有 resetToken', async () => {
    await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: '__test__parent@t.com' })
    const user = await prisma.user.findUnique({ where: { email: '__test__parent@t.com' } })
    expect(user.resetToken).toBeTruthy()
    expect(user.resetTokenExpiry).toBeTruthy()
    expect(user.resetTokenExpiry > new Date()).toBe(true)
  })
})

describe('POST /api/v1/auth/reset-password', () => {
  let validToken

  beforeAll(async () => {
    const crypto = require('crypto')
    validToken = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({
      where: { email: '__test__teacher@t.com' },
      data: {
        resetToken: validToken,
        resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000)
      }
    })
  })

  test('有效 token → 密碼重置成功', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: validToken, newPassword: 'NewPass999!' })
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('重置')
    // token 已清除
    const user = await prisma.user.findUnique({ where: { email: '__test__teacher@t.com' } })
    expect(user.resetToken).toBeNull()
  })

  test('重置後可用新密碼登入', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__teacher@t.com', password: 'NewPass999!' })
    expect(res.status).toBe(200)
    teacherToken = res.body.token // 更新 token
  })

  test('過期 token → 400', async () => {
    const expiredToken = 'expired_token_abc123'
    await prisma.user.update({
      where: { email: '__test__teacher@t.com' },
      data: { resetToken: expiredToken, resetTokenExpiry: new Date(Date.now() - 1000) }
    })
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: expiredToken, newPassword: 'AnotherPass123' })
    expect(res.status).toBe(400)
  })

  test('不存在的 token → 400', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: 'totally-fake-token', newPassword: 'AnotherPass123' })
    expect(res.status).toBe(400)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CHILDREN & BINDING TESTS
// ════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/children', () => {
  test('家長只看到自己的幼童', async () => {
    const res = await get('/api/v1/children', parentToken)
    expect(res.status).toBe(200)
    res.body.forEach(c => {
      const parentIds = c.parents?.map(p => p.id) || []
      expect(parentIds).toContain(parentUser.id)
    })
  })

  test('教師只看到自己教導的幼童', async () => {
    const res = await get('/api/v1/children', teacherToken)
    expect(res.status).toBe(200)
    res.body.forEach(c => {
      const teacherIds = c.teachers?.map(t => t.id) || []
      expect(teacherIds).toContain(teacherUser.id)
    })
  })

  test('Admin 看到全部幼童（含綁定碼）', async () => {
    const res = await get('/api/v1/children', adminToken)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
  })

  test('UNBOUND → 200 但空陣列', async () => {
    const res = await get('/api/v1/children', unboundToken)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})

describe('POST /api/v1/children (Admin only)', () => {
  let createdId

  afterEach(async () => {
    if (createdId) {
      await prisma.child.deleteMany({ where: { id: createdId } })
      createdId = null
    }
  })

  test('Admin 建立幼童 → 201 + 兩組綁定碼', async () => {
    const res = await post('/api/v1/children', adminToken)({ name: '__test__newchild' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('bindingCodes')
    expect(res.body.bindingCodes).toHaveProperty('parent')
    expect(res.body.bindingCodes).toHaveProperty('teacher')
    expect(res.body.bindingCodes.parent).not.toBe(res.body.bindingCodes.teacher)
    createdId = res.body.child.id
  })

  test('非 Admin 建立幼童 → 403', async () => {
    const res = await post('/api/v1/children', parentToken)({ name: '__test__unauthorized' })
    expect(res.status).toBe(403)
  })

  test('缺少 name → 400', async () => {
    const res = await post('/api/v1/children', adminToken)({ name: '' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/children/bind', () => {
  let freshUser, freshToken

  beforeAll(async () => {
    freshUser = await prisma.user.create({
      data: { email: '__test__fresh@t.com', passwordHash: await bcrypt.hash('Pass123', 10), role: 'UNBOUND' }
    })
    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__fresh@t.com', password: 'Pass123' })
    freshToken = login.body.token
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: '__test__fresh@t.com' } })
  })

  test('輸入家長綁定碼 → 200 + role 升為 PARENT', async () => {
    const res = await post('/api/v1/children/bind', freshToken)({ bindingCode: PARENT_BIND_CODE })
    expect(res.status).toBe(200)
    expect(res.body.boundAs).toBe('PARENT')
    expect(res.body.child.name).toBe('__test__child1')
    expect(res.body.user.role).toBe('PARENT')
  })

  test('重複綁定同一幼童 → 409', async () => {
    const res = await post('/api/v1/children/bind', freshToken)({ bindingCode: PARENT_BIND_CODE })
    expect(res.status).toBe(409)
  })

  test('錯誤的綁定碼 → 404', async () => {
    const res = await post('/api/v1/children/bind', freshToken)({ bindingCode: 'invalid-code-xyz' })
    expect(res.status).toBe(404)
  })

  test('輸入教師綁定碼 → 成功（PARENT 也可額外綁定教師碼）', async () => {
    const res = await post('/api/v1/children/bind', teacherToken)({ bindingCode: TEACHER_BIND_CODE })
    // 已是 TEACHER 不應降級
    expect([200, 409]).toContain(res.status)
  })
})

describe('DELETE /api/v1/children/:id/unbind', () => {
  let unbindUser, unbindToken

  beforeAll(async () => {
    unbindUser = await prisma.user.create({
      data: {
        email: '__test__unbind2@t.com',
        passwordHash: await bcrypt.hash('Pass123', 10),
        role: 'PARENT',
        parentOf: { connect: { id: testChild1.id } }
      }
    })
    const login = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__unbind2@t.com', password: 'Pass123' })
    unbindToken = login.body.token
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: '__test__unbind2@t.com' } })
  })

  test('解除綁定 → 200，無其他幼童則降回 UNBOUND', async () => {
    const res = await request(app)
      .delete(`/api/v1/children/${testChild1.id}/unbind`)
      .set('Authorization', `Bearer ${unbindToken}`)
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { id: unbindUser.id } })
    expect(user.role).toBe('UNBOUND')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RECORDS TESTS
// ════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/records', () => {
  let createdId

  const payload = () => ({
    childId: testChild1.id,
    recordDate: '2025-04-01',
    dropOffTime: '08:00', pickUpTime: '17:00',
    mood: 'HAPPY', homeBowel: true,
    diets:   [{ time: '10:00', type: 'MILK', volumeCc: 150 }],
    sleeps:  [{ startTime: '13:00', endTime: '14:30', quality: 'GOOD' }],
    bowels:  [{ time: '11:00', quality: 'NORMAL' }],
    healths: [{ time: '08:05', temperature: 36.8, symptoms: [] }]
  })

  afterEach(async () => {
    if (createdId) {
      await prisma.dailyRecord.delete({ where: { id: createdId } }).catch(() => {})
      createdId = null
    }
  })

  test('家長建立完整紀錄 → 201 + MANUAL', async () => {
    const res = await post('/api/v1/records', parentToken)(payload())
    expect(res.status).toBe(201)
    expect(res.body.entryMode).toBe('MANUAL')
    expect(res.body.record.diets).toHaveLength(1)
    createdId = res.body.recordId
  })

  test('重複日期 → 409', async () => {
    const r1 = await post('/api/v1/records', parentToken)(payload())
    createdId = r1.body.recordId
    const r2 = await post('/api/v1/records', parentToken)(payload())
    expect(r2.status).toBe(409)
  })

  test('UNBOUND 使用者 → 403', async () => {
    const res = await post('/api/v1/records', unboundToken)({ ...payload(), recordDate: '2025-04-02' })
    expect(res.status).toBe(403)
  })

  test('越權（非自己幼童）→ 403', async () => {
    const stranger = await prisma.user.create({
      data: { email: '__test__stranger@t.com', passwordHash: await bcrypt.hash('x', 10), role: 'PARENT' }
    })
    const stLogin = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__stranger@t.com', password: 'x' })
    const stToken = stLogin.body.token
    const res = await post('/api/v1/records', stToken)({ ...payload(), recordDate: '2025-04-03' })
    expect(res.status).toBe(403)
    await prisma.user.delete({ where: { id: stranger.id } })
  })

  test('缺少 childId → 400', async () => {
    const { childId, ...rest } = payload()
    const res = await post('/api/v1/records', parentToken)(rest)
    expect(res.status).toBe(400)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// AI CONFIRM TESTS
// ════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/records/confirm', () => {
  let task, recordId

  beforeAll(async () => {
    task = await prisma.uploadTask.create({
      data: { childId: testChild1.id, imageUrl: 'https://example.com/t.jpg', status: 'REVIEW_NEEDED', rawAiData: {} }
    })
  })

  afterAll(async () => {
    if (recordId) await prisma.dailyRecord.delete({ where: { id: recordId } }).catch(() => {})
    await prisma.uploadTask.delete({ where: { id: task.id } }).catch(() => {})
  })

  test('AI 確認 → 201 + AI_ASSISTED + task 變 COMPLETED', async () => {
    const res = await post('/api/v1/records/confirm', parentToken)({
      taskId: task.id, childId: testChild1.id, recordDate: '2025-05-10',
      mood: 'STABLE', diets: [], sleeps: [], bowels: [],
      healths: [{ time: '08:00', temperature: 36.5, symptoms: [] }]
    })
    expect(res.status).toBe(201)
    expect(res.body.entryMode).toBe('AI_ASSISTED')
    recordId = res.body.recordId
    const t = await prisma.uploadTask.findUnique({ where: { id: task.id } })
    expect(t.status).toBe('COMPLETED')
  })

  test('已 COMPLETED 的 task 再次確認 → 409', async () => {
    const res = await post('/api/v1/records/confirm', parentToken)({
      taskId: task.id, childId: testChild1.id, recordDate: '2025-05-11',
      diets: [], sleeps: [], bowels: [], healths: []
    })
    expect(res.status).toBe(409)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS TESTS
// ════════════════════════════════════════════════════════════════════════════
describe('Analytics APIs', () => {
  test('Level 1 basic → 有 summary + dailySeries', async () => {
    const res = await get(`/api/v1/analytics/${testChild1.id}/basic?days=7`, parentToken)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(res.body).toHaveProperty('dailySeries')
    expect(res.body.summary).toHaveProperty('avgMilkCc')
    expect(res.body.summary).toHaveProperty('avgSleepHours')
  })

  test('Level 2 correlation → 有 foodBowelCorrelation', async () => {
    const res = await get(`/api/v1/analytics/${testChild1.id}/correlation`, parentToken)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('foodBowelCorrelation')
  })

  test('Level 3 alerts → 有 alerts 陣列', async () => {
    const res = await get(`/api/v1/analytics/${testChild1.id}/alerts`, parentToken)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.alerts)).toBe(true)
    expect(res.body).toHaveProperty('stats')
  })

  test('UNBOUND 使用者存取 analytics → 403', async () => {
    const res = await get(`/api/v1/analytics/${testChild1.id}/alerts`, unboundToken)
    expect(res.status).toBe(403)
  })

  test('非授權使用者存取他人幼童 analytics → 403', async () => {
    const stranger = await prisma.user.create({
      data: { email: '__test__strangerB@t.com', passwordHash: await bcrypt.hash('x', 10), role: 'PARENT' }
    })
    const stLogin = await request(app).post('/api/v1/auth/login')
      .send({ email: '__test__strangerB@t.com', password: 'x' })
    const res = await get(`/api/v1/analytics/${testChild1.id}/alerts`, stLogin.body.token)
    expect(res.status).toBe(403)
    await prisma.user.delete({ where: { id: stranger.id } })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK & 404
// ════════════════════════════════════════════════════════════════════════════
describe('基礎端點', () => {
  test('GET /health → 200', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  test('未知路由 → 404', async () => {
    expect((await request(app).get('/api/v1/nonexistent')).status).toBe(404)
  })
})
