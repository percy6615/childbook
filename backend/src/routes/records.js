const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeChildAccess } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── Helper: 建立子紀錄的 nested create ──────────────────────────────────────
const buildSubRecords = ({ diets, sleeps, bowels, healths }) => ({
  diets:   { create: (diets   || []).map(d => ({ time: d.time, type: d.type, volumeCc: d.volumeCc, items: d.items })) },
  sleeps:  { create: (sleeps  || []).map(s => ({ startTime: s.startTime, endTime: s.endTime, quality: s.quality })) },
  bowels:  { create: (bowels  || []).map(b => ({ time: b.time, quality: b.quality })) },
  healths: { create: (healths || []).map(h => ({ time: h.time, temperature: h.temperature, symptoms: h.symptoms || [] })) }
});

const RECORD_INCLUDE = {
  diets: true, sleeps: true, bowels: true, healths: true,
  child: { select: { id: true, name: true } },
  task:  { select: { id: true, status: true, imageUrl: true } }
};

/**
 * v2.2 授權helper：查詢 child 的 parents/teachers 陣列（多對多）
 * 回傳 true 表示有權限
 */
const canAccessChild = async (userId, role, childId) => {
  if (role === 'ADMIN') return true;
  if (role === 'UNBOUND') return false;

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      parents:  { select: { id: true } },
      teachers: { select: { id: true } }
    }
  });
  if (!child) return false;

  if (role === 'PARENT')  return child.parents.some(p => p.id === userId);
  if (role === 'TEACHER') return child.teachers.some(t => t.id === userId);
  return false;
};

// ─── POST /api/v1/records ─────────────────────────────────────────────────────
// 模式一：手動新增
router.post('/', [
  body('childId').isUUID().withMessage('childId 格式錯誤'),
  body('recordDate').isISO8601().withMessage('日期格式錯誤'),
  body('mood').optional().isIn(['HAPPY', 'STABLE', 'ANGRY', 'CRYING', 'OTHER']),
  body('diets').optional().isArray(),
  body('sleeps').optional().isArray(),
  body('bowels').optional().isArray(),
  body('healths').optional().isArray()
], authorizeChildAccess, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      childId, recordDate, dropOffTime, pickUpTime, mood,
      homeBowel, homeEatingNotes, notesTeacher, notesParent,
      diets, sleeps, bowels, healths
    } = req.body;

    // 教師限制：僅可填寫近三日
    if (req.user.role === 'TEACHER') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 3);
      if (new Date(recordDate) < cutoff) {
        return res.status(403).json({ error: '教師僅可填寫近三日的紀錄' });
      }
    }

    const record = await prisma.dailyRecord.create({
      data: {
        childId, recordDate: new Date(recordDate),
        dropOffTime, pickUpTime, mood,
        homeBowel: homeBowel ?? false,
        homeEatingNotes, notesTeacher, notesParent,
        entryMode: 'MANUAL',
        ...buildSubRecords({ diets, sleeps, bowels, healths })
      },
      include: RECORD_INCLUDE
    });

    res.status(201).json({ message: '紀錄建立成功', recordId: record.id, entryMode: 'MANUAL', record });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/records/confirm ─────────────────────────────────────────────
// 模式二：AI 覆核確認
router.post('/confirm', [
  body('taskId').isUUID().withMessage('taskId 格式錯誤'),
  body('childId').isUUID(),
  body('recordDate').isISO8601()
], authorizeChildAccess, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      taskId, childId, recordDate, dropOffTime, pickUpTime, mood,
      homeBowel, homeEatingNotes, notesTeacher, notesParent,
      diets, sleeps, bowels, healths
    } = req.body;

    const task = await prisma.uploadTask.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ error: '任務不存在' });
    if (task.childId !== childId) return res.status(403).json({ error: '任務與幼童不符' });
    if (task.status !== 'REVIEW_NEEDED') {
      return res.status(409).json({ error: `任務狀態為 ${task.status}，無法確認` });
    }

    const [record] = await prisma.$transaction([
      prisma.dailyRecord.create({
        data: {
          childId, recordDate: new Date(recordDate),
          dropOffTime, pickUpTime, mood,
          homeBowel: homeBowel ?? false,
          homeEatingNotes, notesTeacher, notesParent,
          entryMode: 'AI_ASSISTED',
          taskId,
          ...buildSubRecords({ diets, sleeps, bowels, healths })
        },
        include: RECORD_INCLUDE
      }),
      prisma.uploadTask.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' }
      })
    ]);

    res.status(201).json({ message: '紀錄確認完成', recordId: record.id, entryMode: 'AI_ASSISTED', record });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/records ──────────────────────────────────────────────────────
router.get('/', [
  query('childId').isUUID().withMessage('childId 格式錯誤'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { childId, startDate, endDate } = req.query;
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '30');

    // ✅ v2.2 多對多授權
    const allowed = await canAccessChild(req.user.id, req.user.role, childId);
    if (!allowed) return res.status(403).json({ error: '無權存取此幼童的紀錄' });

    const where = {
      childId,
      ...(startDate || endDate ? {
        recordDate: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate   ? { lte: new Date(endDate)   } : {})
        }
      } : {})
    };

    const [records, total] = await Promise.all([
      prisma.dailyRecord.findMany({
        where,
        include: RECORD_INCLUDE,
        orderBy: { recordDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.dailyRecord.count({ where })
    ]);

    res.json({
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/records/:recordId ───────────────────────────────────────────
router.get('/:recordId', async (req, res, next) => {
  try {
    const record = await prisma.dailyRecord.findUnique({
      where: { id: req.params.recordId },
      include: RECORD_INCLUDE
    });

    if (!record) return res.status(404).json({ error: '紀錄不存在' });

    // ✅ v2.2 多對多授權
    const allowed = await canAccessChild(req.user.id, req.user.role, record.childId);
    if (!allowed) return res.status(403).json({ error: '無權存取此紀錄' });

    res.json(record);
  } catch (err) { next(err); }
});

// ─── PUT /api/v1/records/:recordId ────────────────────────────────────────────
router.put('/:recordId', async (req, res, next) => {
  try {
    const existing = await prisma.dailyRecord.findUnique({
      where: { id: req.params.recordId }
    });
    if (!existing) return res.status(404).json({ error: '紀錄不存在' });

    // ✅ v2.2 多對多授權
    const allowed = await canAccessChild(req.user.id, req.user.role, existing.childId);
    if (!allowed) return res.status(403).json({ error: '無權修改此紀錄' });

    // 教師限制：僅可修改近三日
    if (req.user.role === 'TEACHER') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 3);
      if (existing.recordDate < cutoff) {
        return res.status(403).json({ error: '教師僅可修改近三日的紀錄' });
      }
    }

    const {
      dropOffTime, pickUpTime, mood, homeBowel, homeEatingNotes,
      notesTeacher, notesParent, diets, sleeps, bowels, healths
    } = req.body;

    const record = await prisma.$transaction(async (tx) => {
      await tx.dietRecord.deleteMany(  { where: { recordId: req.params.recordId } });
      await tx.sleepRecord.deleteMany( { where: { recordId: req.params.recordId } });
      await tx.bowelRecord.deleteMany( { where: { recordId: req.params.recordId } });
      await tx.healthRecord.deleteMany({ where: { recordId: req.params.recordId } });

      return tx.dailyRecord.update({
        where: { id: req.params.recordId },
        data: {
          dropOffTime, pickUpTime, mood,
          homeBowel: homeBowel ?? existing.homeBowel,
          homeEatingNotes, notesTeacher, notesParent,
          ...buildSubRecords({ diets, sleeps, bowels, healths })
        },
        include: RECORD_INCLUDE
      });
    });

    res.json({ message: '紀錄更新成功', record });
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/records/:recordId ────────────────────────────────────────
router.delete('/:recordId', async (req, res, next) => {
  try {
    const existing = await prisma.dailyRecord.findUnique({
      where: { id: req.params.recordId }
    });
    if (!existing) return res.status(404).json({ error: '紀錄不存在' });

    // ✅ v2.2 多對多授權（教師無法刪除）
    if (req.user.role === 'TEACHER') {
      return res.status(403).json({ error: '教師無法刪除紀錄' });
    }
    const allowed = await canAccessChild(req.user.id, req.user.role, existing.childId);
    if (!allowed) return res.status(403).json({ error: '無權刪除此紀錄' });

    await prisma.dailyRecord.delete({ where: { id: req.params.recordId } });
    res.json({ message: '紀錄已刪除' });
  } catch (err) { next(err); }
});

module.exports = router;
