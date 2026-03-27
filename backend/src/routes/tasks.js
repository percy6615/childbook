const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ✅ v2.2 多對多授權 helper
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

// ─── GET /api/v1/tasks/:taskId ────────────────────────────────────────────────
router.get('/:taskId', async (req, res, next) => {
  try {
    const task = await prisma.uploadTask.findUnique({
      where: { id: req.params.taskId },
      select: {
        id: true, childId: true, imageUrl: true, status: true,
        rawAiData: true, errorMsg: true, retryCount: true,
        createdAt: true, updatedAt: true
      }
    });

    if (!task) return res.status(404).json({ error: '任務不存在' });

    const allowed = await canAccessChild(req.user.id, req.user.role, task.childId);
    if (!allowed) return res.status(403).json({ error: '無權存取此任務' });

    res.json(task);
  } catch (err) { next(err); }
});

// ─── GET /api/v1/tasks ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { childId, status } = req.query;
    if (!childId) return res.status(400).json({ error: 'childId 必填' });

    const allowed = await canAccessChild(req.user.id, req.user.role, childId);
    if (!allowed) return res.status(403).json({ error: '無權存取' });

    const tasks = await prisma.uploadTask.findMany({
      where: { childId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json(tasks);
  } catch (err) { next(err); }
});

module.exports = router;
