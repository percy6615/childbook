/**
 * IAM Integration Tests (v2.2)
 * Tests: Email auth, Register, Forgot/Reset Password, Bind API, RBAC
 * Run: npm test  (from backend/)
 */

const request = require('supertest')
const app = require('../../src/app')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL } }
})

let adminToken, parentToken, teacherToken, unboundToken
let adminUser, parentUser, teacherUser, unboundUser
let testChild

const post = (url, token) => (body) =>
  request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)

const get = (url, token) =>
  request(app).get(url).set('Authorization', `Bearer ${token}`)

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Clean
  await prisma.healthRecord.deleteMany()
  await prisma.bowelRecord.deleteMany()
  await prisma.sleepRecord.deleteMany()
  await prisma.dietRecord.deleteMany()
  await prisma.dailyRecord.deleteMany()
  await prisma.uploadTask.deleteMany()
  // Disconnect users from children first
  const children = await prisma.child.findMany({
    where: { name: { startsWith: '__iam__' } },
    include: { parents: true, teachers: true }
  })
  for (const c of children) {
    await prisma.child.update({
      where: { id: c.id },
      data: {
        parents:  { disconnect: c.parents.map(p => ({ id: p.id })) },
        teachers: { disconnect: c.teachers.map(t => ({ id: t.id })) }
      }
    })
  }
  await prisma.child.deleteMany({ where: { name: { startsWith: '__iam__' } } })
  await prisma.user.deleteMany({ where: { email: { contains: '__iam__' } } })

  const hash = await bcrypt.hash('TestPass123', 10)

  adminUser   = await prisma.user.create({ data: { email: 'admin__iam__@t.com',   passwordHash: hash, role: 'ADMIN',   displayName: 'Admin' } })
  parentUser  = await prisma.user.create({ data: { email: 'parent__iam__@t.com',  passwordHash: hash, role: 'PARENT',  displayName: 'Parent' } })
  teacherUser = await prisma.user.create({ data: { email: 'teacher__iam__@t.com', passwordHash: hash, role: 'TEACHER', displayName: 'Teacher' } })
  unboundUser = await prisma.user.create({ data: { email: 'unbound__iam__@t.com', passwordHash: hash, role: 'UNBOUND', displayName: 'Unbound' } })

  const loginAs = async (email) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'TestPass123' })
    return res.body.token
  }
  adminToken   = await loginAs('admin__iam__@t.com')
  parentToken  = await loginAs('parent__iam__@t.com')
  teacherToken = await loginAs('teacher__iam__@t.com')
  unboundToken = await loginAs('unbound__iam__@t.com')

  // Create test child and bind users (many-to-many)
  testChild = await prisma.child.create({
    data: {
      name: '__iam__child',
      parentBindingCode:  '__iam__parent-code',
      teacherBindingCode: '__iam__teacher-code',
      parents:  { connect: { id: parentUser.id } },
      teachers: { connect: { id: teacherUser.id } }
    }
  })
})

afterAll(async () => {
  const children = await prisma.child.findMany({
    where: { name: { startsWith: '__iam__' } },
    include: { parents: true, teachers: true }
  })
  for (const c of children) {
    await prisma.child.update({
      where: { id: c.id },
      data: {
        parents:  { disconnect: c.parents.map(p => ({ id: p.id })) },
        teachers: { disconnect: c.teachers.map(t => ({ id: t.id })) }
      }
    })
  }
  await prisma.child.deleteMany({ where: { name: { startsWith: '__iam__' } } })
  await prisma.user.deleteMany({ where: { email: { contains: '__iam__' } } })
  await prisma.$disconnect()
})

// ─── REGISTER ─────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: 'newreg__iam__@t.com' } })
  })

  test('new email registers → 201, role defaults to UNBOUND', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'newreg__iam__@t.com', password: 'Pass123456' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('UNBOUND')
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  test('duplicate email → 409', async () => {
    await request(app).post('/api/v1/auth/register')
      .send({ email: 'newreg__iam__@t.com', password: 'Pass123456' })
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'newreg__iam__@t.com', password: 'Pass123456' })
    expect(res.status).toBe(409)
  })

  test('invalid email format → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Pass123456' })
    expect(res.status).toBe(400)
  })

  test('short password → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'short__iam__@t.com', password: '123' })
    expect(res.status).toBe(400)
  })

  test('role ADMIN cannot be self-registered → defaults to UNBOUND', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'newreg__iam__@t.com', password: 'Pass123456', role: 'ADMIN' })
    // role validator rejects ADMIN, so it defaults to UNBOUND from body
    // Either 400 (validation) or 201 with UNBOUND
    expect([201, 400]).toContain(res.status)
    if (res.status === 201) expect(res.body.user.role).toBe('UNBOUND')
  })
})

// ─── LOGIN ────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  test('valid email + password → 200 with token', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'parent__iam__@t.com', password: 'TestPass123' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.role).toBe('PARENT')
  })

  test('wrong password → 401', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'parent__iam__@t.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  test('non-existent email → 401', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'nobody__iam__@t.com', password: 'TestPass123' })
    expect(res.status).toBe(401)
  })

  test('missing fields → 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: '' })
    expect(res.status).toBe(400)
  })
})

// ─── GET /me ──────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  test('valid token → user data with parentOf/teacherOf', async () => {
    const res = await get('/api/v1/auth/me', parentToken)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('parent__iam__@t.com')
    expect(res.body).toHaveProperty('parentOf')
    expect(res.body).toHaveProperty('teacherOf')
    expect(res.body).not.toHaveProperty('passwordHash')
  })

  test('no token → 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401)
  })

  test('invalid token → 401', async () => {
    expect((await request(app).get('/api/v1/auth/me')
      .set('Authorization', 'Bearer badtoken')).status).toBe(401)
  })
})

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
describe('POST /api/v1/auth/forgot-password', () => {
  test('existing email → 200 (with anti-enumeration response)', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'parent__iam__@t.com' })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/若此 Email 已註冊/)
  })

  test('non-existent email → same 200 response (anti-enumeration)', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody__iam__@t.com' })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/若此 Email 已註冊/)
  })

  test('invalid email → 400', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'notanemail' })
    expect(res.status).toBe(400)
  })

  test('sets resetToken in DB for existing user', async () => {
    await request(app).post('/api/v1/auth/forgot-password')
      .send({ email: 'parent__iam__@t.com' })
    const user = await prisma.user.findUnique({ where: { email: 'parent__iam__@t.com' } })
    expect(user.resetToken).toBeTruthy()
    expect(user.resetTokenExpiry).toBeTruthy()
    expect(user.resetTokenExpiry.getTime()).toBeGreaterThan(Date.now())
  })
})

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
describe('POST /api/v1/auth/reset-password', () => {
  let validToken

  beforeEach(async () => {
    // Plant a valid reset token
    const crypto = require('crypto')
    validToken = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({
      where: { email: 'teacher__iam__@t.com' },
      data: {
        resetToken: validToken,
        resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000)
      }
    })
  })

  afterEach(async () => {
    await prisma.user.update({
      where: { email: 'teacher__iam__@t.com' },
      data: { resetToken: null, resetTokenExpiry: null }
    })
  })

  test('valid token + new password → 200, clears token', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: validToken, newPassword: 'NewPass789' })
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { email: 'teacher__iam__@t.com' } })
    expect(user.resetToken).toBeNull()
    expect(user.resetTokenExpiry).toBeNull()
  })

  test('invalid token → 400', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: 'invalid-token', newPassword: 'NewPass789' })
    expect(res.status).toBe(400)
  })

  test('expired token → 400', async () => {
    await prisma.user.update({
      where: { email: 'teacher__iam__@t.com' },
      data: { resetTokenExpiry: new Date(Date.now() - 1000) }  // 1 sec ago
    })
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: validToken, newPassword: 'NewPass789' })
    expect(res.status).toBe(400)
  })

  test('short new password → 400', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ token: validToken, newPassword: '123' })
    expect(res.status).toBe(400)
  })
})

// ─── BIND API ─────────────────────────────────────────────────────────────────
describe('POST /api/v1/children/bind', () => {
  let newUser, newToken

  beforeAll(async () => {
    const hash = await bcrypt.hash('TestPass123', 10)
    newUser = await prisma.user.create({
      data: { email: 'binder__iam__@t.com', passwordHash: hash, role: 'UNBOUND' }
    })
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'binder__iam__@t.com', password: 'TestPass123' })
    newToken = res.body.token
  })

  afterAll(async () => {
    // Disconnect before delete
    await prisma.child.update({
      where: { id: testChild.id },
      data: { parents: { disconnect: { id: newUser.id } } }
    }).catch(() => {})
    await prisma.user.deleteMany({ where: { email: 'binder__iam__@t.com' } })
  })

  test('UNBOUND user binds with parent code → role becomes PARENT', async () => {
    const res = await post('/api/v1/children/bind', newToken)({ bindingCode: '__iam__parent-code' })
    expect(res.status).toBe(200)
    expect(res.body.boundAs).toBe('PARENT')
    expect(res.body.user.role).toBe('PARENT')
    expect(res.body.child.name).toBe('__iam__child')
  })

  test('binding again with same code → 409', async () => {
    const res = await post('/api/v1/children/bind', newToken)({ bindingCode: '__iam__parent-code' })
    expect(res.status).toBe(409)
  })

  test('invalid code → 404', async () => {
    const res = await post('/api/v1/children/bind', newToken)({ bindingCode: 'no-such-code' })
    expect(res.status).toBe(404)
  })

  test('empty code → 400', async () => {
    const res = await post('/api/v1/children/bind', newToken)({ bindingCode: '' })
    expect(res.status).toBe(400)
  })

  test('teacher code binding → role becomes TEACHER', async () => {
    const hash = await bcrypt.hash('TestPass123', 10)
    const newTeacher = await prisma.user.create({
      data: { email: 'teacher2__iam__@t.com', passwordHash: hash, role: 'UNBOUND' }
    })
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'teacher2__iam__@t.com', password: 'TestPass123' })
    const t2Token = loginRes.body.token

    const res = await post('/api/v1/children/bind', t2Token)({ bindingCode: '__iam__teacher-code' })
    expect(res.status).toBe(200)
    expect(res.body.boundAs).toBe('TEACHER')
    expect(res.body.user.role).toBe('TEACHER')

    // Cleanup
    await prisma.child.update({
      where: { id: testChild.id },
      data: { teachers: { disconnect: { id: newTeacher.id } } }
    })
    await prisma.user.delete({ where: { id: newTeacher.id } })
  })
})

// ─── CHILDREN ACCESS CONTROL ──────────────────────────────────────────────────
describe('GET /api/v1/children - multi-tenant isolation', () => {
  test('parent sees only their bound children', async () => {
    const res = await get('/api/v1/children', parentToken)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // All returned children must have this parent in their parents list
    res.body.forEach(c => {
      const parentIds = c.parents.map(p => p.id)
      expect(parentIds).toContain(parentUser.id)
    })
  })

  test('teacher sees only their bound children', async () => {
    const res = await get('/api/v1/children', teacherToken)
    expect(res.status).toBe(200)
    res.body.forEach(c => {
      const teacherIds = c.teachers.map(t => t.id)
      expect(teacherIds).toContain(teacherUser.id)
    })
  })

  test('unbound user sees empty list', async () => {
    const res = await get('/api/v1/children', unboundToken)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })

  test('admin sees all children', async () => {
    const res = await get('/api/v1/children', adminToken)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── CHILD DETAIL - BINDING CODE VISIBILITY ──────────────────────────────────
describe('GET /api/v1/children/:childId - binding code visibility', () => {
  test('admin can see binding codes', async () => {
    const res = await get(`/api/v1/children/${testChild.id}`, adminToken)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('parentBindingCode')
    expect(res.body).toHaveProperty('teacherBindingCode')
  })

  test('parent cannot see binding codes', async () => {
    const res = await get(`/api/v1/children/${testChild.id}`, parentToken)
    expect(res.status).toBe(200)
    expect(res.body.parentBindingCode).toBeUndefined()
    expect(res.body.teacherBindingCode).toBeUndefined()
  })

  test('unrelated user cannot access child data → 403', async () => {
    const res = await get(`/api/v1/children/${testChild.id}`, unboundToken)
    expect(res.status).toBe(403)
  })
})

// ─── ADMIN-ONLY CHILD CREATION ────────────────────────────────────────────────
describe('POST /api/v1/children - admin only', () => {
  let createdId

  afterEach(async () => {
    if (createdId) {
      await prisma.child.delete({ where: { id: createdId } }).catch(() => {})
      createdId = null
    }
  })

  test('admin creates child → 201 with binding codes', async () => {
    const res = await post('/api/v1/children', adminToken)({ name: '__iam__newchild' })
    expect(res.status).toBe(201)
    expect(res.body.bindingCodes).toHaveProperty('parent')
    expect(res.body.bindingCodes).toHaveProperty('teacher')
    expect(res.body.bindingCodes.parent).toBeTruthy()
    createdId = res.body.child.id
  })

  test('parent cannot create child → 403', async () => {
    const res = await post('/api/v1/children', parentToken)({ name: '__iam__try' })
    expect(res.status).toBe(403)
  })

  test('teacher cannot create child → 403', async () => {
    const res = await post('/api/v1/children', teacherToken)({ name: '__iam__try' })
    expect(res.status).toBe(403)
  })
})

// ─── RECORD ACCESS - MANY-TO-MANY GUARD ──────────────────────────────────────
describe('POST /api/v1/records - many-to-many access guard', () => {
  let createdRecordId

  afterEach(async () => {
    if (createdRecordId) {
      await prisma.dailyRecord.delete({ where: { id: createdRecordId } }).catch(() => {})
      createdRecordId = null
    }
  })

  const recordPayload = {
    recordDate: '2025-05-01',
    mood: 'HAPPY',
    diets: [], sleeps: [], bowels: [],
    healths: [{ time: '08:00', temperature: 36.8, symptoms: [] }]
  }

  test('bound parent can create record → 201', async () => {
    const res = await post('/api/v1/records', parentToken)({
      ...recordPayload,
      childId: testChild.id,
      recordDate: '2025-05-01'
    })
    expect(res.status).toBe(201)
    createdRecordId = res.body.recordId
  })

  test('bound teacher can create record → 201', async () => {
    const res = await post('/api/v1/records', teacherToken)({
      ...recordPayload,
      childId: testChild.id,
      recordDate: '2025-05-02'
    })
    expect(res.status).toBe(201)
    createdRecordId = res.body.recordId
  })

  test('unbound user cannot create record → 403', async () => {
    const res = await post('/api/v1/records', unboundToken)({
      ...recordPayload,
      childId: testChild.id,
      recordDate: '2025-05-03'
    })
    expect(res.status).toBe(403)
  })

  test('another parent (unrelated) cannot access → 403', async () => {
    const hash = await bcrypt.hash('x', 10)
    const stranger = await prisma.user.create({
      data: { email: 'stranger__iam__@t.com', passwordHash: hash, role: 'PARENT' }
    })
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'stranger__iam__@t.com', password: 'x' })
    const strangerToken = loginRes.body.token

    const res = await post('/api/v1/records', strangerToken)({
      ...recordPayload,
      childId: testChild.id,
      recordDate: '2025-05-04'
    })
    expect(res.status).toBe(403)

    await prisma.user.delete({ where: { id: stranger.id } })
  })
})

// ─── UNBIND ───────────────────────────────────────────────────────────────────
describe('DELETE /api/v1/children/:childId/unbind', () => {
  let tempUser, tempToken, tempChildId

  beforeAll(async () => {
    const hash = await bcrypt.hash('TestPass123', 10)
    tempUser = await prisma.user.create({
      data: { email: 'unbindtest__iam__@t.com', passwordHash: hash, role: 'PARENT' }
    })
    const tempChild = await prisma.child.create({
      data: {
        name: '__iam__unbindchild',
        parentBindingCode: '__iam__unbind-parent',
        teacherBindingCode: '__iam__unbind-teacher',
        parents: { connect: { id: tempUser.id } }
      }
    })
    tempChildId = tempChild.id
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'unbindtest__iam__@t.com', password: 'TestPass123' })
    tempToken = loginRes.body.token
  })

  afterAll(async () => {
    await prisma.child.deleteMany({ where: { name: '__iam__unbindchild' } })
    await prisma.user.deleteMany({ where: { email: 'unbindtest__iam__@t.com' } })
  })

  test('parent can unbind themselves from child', async () => {
    const res = await request(app)
      .delete(`/api/v1/children/${tempChildId}/unbind`)
      .set('Authorization', `Bearer ${tempToken}`)
    expect(res.status).toBe(200)

    // Role should revert to UNBOUND
    const u = await prisma.user.findUnique({ where: { id: tempUser.id } })
    expect(u.role).toBe('UNBOUND')
  })
})
