const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeChildAccess } = require('../middleware/auth');
const { aiQueue } = require('../utils/queue');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Multer Configuration ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|heic/;
  const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowedTypes.test(file.mimetype.replace('image/', ''));
  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('僅支援 JPEG、PNG、WebP、HEIC 格式'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '10')) * 1024 * 1024
  }
});

router.use(authenticate);

// ─── POST /api/v1/uploads ─────────────────────────────────────────────────────
// Submit image for AI processing
router.post('/', upload.single('image'), authorizeChildAccess, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片檔案' });
    }

    const { childId } = req.body;
    if (!childId) return res.status(400).json({ error: 'childId 必填' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    // Create task in DB
    const task = await prisma.uploadTask.create({
      data: {
        childId,
        imageUrl,
        status: 'PENDING'
      }
    });

    // Enqueue AI job
    await aiQueue.add('process-form', {
      taskId: task.id,
      imageUrl,
      childId
    }, {
      jobId: task.id  // deduplicate by taskId
    });

    logger.info(`Task ${task.id} enqueued for AI processing`);

    res.status(202).json({
      message: '圖片已上傳，AI 辨識處理中',
      taskId: task.id,
      status: 'PENDING'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
