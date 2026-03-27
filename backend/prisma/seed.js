const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database (v2.2)...')

  const hash = await bcrypt.hash('Test1234', 12)

  // ── Users ─────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@childbook.app' },
    update: {},
    create: { email: 'admin@childbook.app', passwordHash: hash, role: 'ADMIN', displayName: '系統管理員' }
  })

  const parent1 = await prisma.user.upsert({
    where: { email: 'parent@childbook.app' },
    update: {},
    create: { email: 'parent@childbook.app', passwordHash: hash, role: 'PARENT', displayName: '王爸爸' }
  })

  const teacher1 = await prisma.user.upsert({
    where: { email: 'teacher@childbook.app' },
    update: {},
    create: { email: 'teacher@childbook.app', passwordHash: hash, role: 'TEACHER', displayName: '陳老師' }
  })

  // UNBOUND user（尚未綁定）
  await prisma.user.upsert({
    where: { email: 'newuser@childbook.app' },
    update: {},
    create: { email: 'newuser@childbook.app', passwordHash: hash, role: 'UNBOUND', displayName: '新用戶' }
  })

  // ── Children (Admin 建立，系統自動產生綁定碼) ────────────────────────────
  let child1 = await prisma.child.findFirst({ where: { name: '王小明' } })
  if (!child1) {
    child1 = await prisma.child.create({
      data: {
        name: '王小明',
        birthDate: new Date('2023-06-15'),
        gender: 'M',
        // 讓 seed 使用固定綁定碼方便測試
        parentBindingCode:  'parent-bind-xiaoming',
        teacherBindingCode: 'teacher-bind-xiaoming',
        // 直接建立多對多關聯
        parents:  { connect: { id: parent1.id } },
        teachers: { connect: { id: teacher1.id } }
      }
    })
  }

  let child2 = await prisma.child.findFirst({ where: { name: '王小花' } })
  if (!child2) {
    child2 = await prisma.child.create({
      data: {
        name: '王小花',
        birthDate: new Date('2024-02-20'),
        gender: 'F',
        parentBindingCode:  'parent-bind-xiaohua',
        teacherBindingCode: 'teacher-bind-xiaohua',
        parents:  { connect: { id: parent1.id } },
        teachers: { connect: { id: teacher1.id } }
      }
    })
  }

  // ── 近 7 天 DailyRecord（王小明）────────────────────────────────────────
  const today = new Date()
  const moods = ['HAPPY','STABLE','HAPPY','CRYING','STABLE','HAPPY','STABLE']

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateOnly = new Date(date.toISOString().split('T')[0])
    const temp = parseFloat((36.5 + Math.random() * 1.5).toFixed(1))

    try {
      await prisma.dailyRecord.create({
        data: {
          childId: child1.id,
          recordDate: dateOnly,
          dropOffTime: '08:00',
          pickUpTime: '17:00',
          mood: moods[i % moods.length],
          homeBowel: i % 2 === 0,
          notesTeacher: '今日狀況紀錄',
          entryMode: 'MANUAL',
          diets: {
            create: [
              { time: '10:00', type: 'MILK', volumeCc: 150 + (i * 10) },
              { time: '12:00', type: 'SOLID', items: '米糊、紅蘿蔔、豬肉' },
              { time: '15:00', type: 'MILK', volumeCc: 120 }
            ]
          },
          sleeps: { create: [{ startTime: '13:00', endTime: '14:30', quality: i % 3 === 0 ? 'POOR' : 'GOOD' }] },
          bowels: { create: [{ time: '11:30', quality: i % 4 === 0 ? 'WATERY' : 'NORMAL' }] },
          healths: { create: [{ time: '08:05', temperature: temp, symptoms: temp >= 37.5 ? ['發燒'] : [] }] }
        }
      })
    } catch { /* 可能已存在 */ }
  }

  console.log('\n✅ Seed 完成！')
  console.log('\n📋 測試帳號（密碼均為 Test1234）：')
  console.log('  ADMIN:   admin@childbook.app')
  console.log('  PARENT:  parent@childbook.app')
  console.log('  TEACHER: teacher@childbook.app')
  console.log('  UNBOUND: newuser@childbook.app')
  console.log('\n🔑 測試綁定碼：')
  console.log('  王小明 家長碼: parent-bind-xiaoming')
  console.log('  王小明 教師碼: teacher-bind-xiaoming')
  console.log('  王小花 家長碼: parent-bind-xiaohua')
  console.log('  王小花 教師碼: teacher-bind-xiaohua')
}

main().catch(console.error).finally(() => prisma.$disconnect())
