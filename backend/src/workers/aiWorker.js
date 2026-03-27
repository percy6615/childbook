require('dotenv').config();
const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { redisConnection, AI_QUEUE_NAME } = require('../utils/queue');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── 判斷是否為可重試的網路錯誤 ─────────────────────────────────────────────────
// 只有真正的網路問題才重試，永遠不重試 quota/auth/圖片類錯誤
const isNetworkRetryable = (error) => {
  // OpenAI quota exceeded → 立即失敗，絕對不重試
  if (error.status === 429) return false;
  // Auth error → 不重試
  if (error.status === 401) return false;
  // 圖片無法辨識 (model refused) → 不重試
  if (error.status === 400) return false;

  // 只有 502/504 gateway error 或明確的 timeout/network 才重試
  return (
    error.status === 502 ||
    error.status === 504 ||
    error.code === 'ECONNRESET' ||
    error.code === 'ECONNREFUSED' ||
    error.message?.includes('timeout') ||
    error.message?.includes('network')
  );
};

// ─── GPT Prompt ───────────────────────────────────────────────────────────────
const buildPrompt = () => `你是一個幼兒照護紀錄表單解析助理。
請仔細分析這張幼兒家庭聯絡簿（寶寶日誌）的照片，將內容結構化為 JSON 格式。

請嚴格依照以下 JSON 結構回傳，所有欄位若無法辨識則填 null，不要加入任何說明文字，只輸出純 JSON：

{
  "recordDate": "YYYY-MM-DD 或 null",
  "dropOffTime": "HH:mm 或 null",
  "pickUpTime": "HH:mm 或 null",
  "mood": "HAPPY|STABLE|ANGRY|CRYING|OTHER 或 null",
  "homeBowel": true 或 false,
  "homeEatingNotes": "家中飲食備註文字 或 null",
  "notesTeacher": "老師備註文字 或 null",
  "notesParent": "家長備註文字 或 null",
  "diets": [{ "time": "HH:mm", "type": "MILK 或 SOLID", "volumeCc": 數字或null, "items": "文字或null" }],
  "sleeps": [{ "startTime": "HH:mm", "endTime": "HH:mm或null", "quality": "GOOD|NORMAL|POOR或null" }],
  "bowels": [{ "time": "HH:mm", "quality": "NORMAL|HARD|WATERY|OTHER" }],
  "healths": [{ "time": "HH:mm", "temperature": 數字或null, "symptoms": ["症狀1"] }]
}

表單欄位對照參考：
- 情緒/心情：○快樂=HAPPY, ○穩定=STABLE, ○生氣=ANGRY, ○哭鬧=CRYING
- 喝奶：記錄時間與CC數
- 副食品/吃飯：記錄時間與食物內容
- 睡眠：記錄開始與結束時間
- 排便：記錄時間與性狀（○正常=NORMAL, ○偏硬=HARD, ○水便=WATERY）
- 體溫：℃ 數值
- 托送/接送時間：上托嬰中心與離開時間`;

// ─── 解析 GPT 回傳 ────────────────────────────────────────────────────────────
const parseGptResponse = (content) => {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
};

// ─── 取得圖片內容 ─────────────────────────────────────────────────────────────
const getImageContent = (imageUrl) => {
  if (imageUrl.startsWith('http://localhost') || imageUrl.startsWith('http://127.0.0.1')) {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filename = imageUrl.split('/').pop();
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file not found: ${filePath}`);
    }
    const base64 = fs.readFileSync(filePath).toString('base64');
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' }
    };
  }
  return {
    type: 'image_url',
    image_url: { url: imageUrl, detail: 'high' }
  };
};

// ─── Worker 主體 ──────────────────────────────────────────────────────────────
const worker = new Worker(AI_QUEUE_NAME, async (job) => {
  const { taskId, imageUrl } = job.data;
  const attemptNum = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts || 1; // 預設改為 1，避免意外重試

  logger.info(`[Worker] Task ${taskId} — attempt ${attemptNum}/${maxAttempts}`);

  // 標記為處理中
  await prisma.uploadTask.update({
    where: { id: taskId },
    data: { status: 'PROCESSING' }
  });

  try {
    const imageContent = getImageContent(imageUrl);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          imageContent
        ]
      }]
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) throw new Error('GPT returned empty response');

    const parsed = parseGptResponse(rawContent);

    await prisma.uploadTask.update({
      where: { id: taskId },
      data: { status: 'REVIEW_NEEDED', rawAiData: parsed, retryCount: job.attemptsMade }
    });

    logger.info(`[Worker] Task ${taskId} → REVIEW_NEEDED`);
    return { taskId, status: 'REVIEW_NEEDED' };

  } catch (error) {
    logger.error(`[Worker] Task ${taskId} error: ${error.status || error.code} - ${error.message}`);

    const canRetry = isNetworkRetryable(error);
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    if (!canRetry || isLastAttempt) {
      // ✅ 標記失敗後 return（不 throw）→ BullMQ 不會重試
      let friendlyError = error.message;
      if (error.status === 429) friendlyError = 'OpenAI API 額度已用完，請稍後再試';
      if (error.status === 401) friendlyError = 'OpenAI API 金鑰無效';
      if (error.message?.includes('JSON')) friendlyError = '圖片無法辨識為表單格式，請改用手動填寫';

      await prisma.uploadTask.update({
        where: { id: taskId },
        data: { status: 'FAILED', errorMsg: friendlyError, retryCount: job.attemptsMade }
      });

      logger.warn(`[Worker] Task ${taskId} → FAILED (no retry): ${friendlyError}`);
      return { taskId, status: 'FAILED' }; // ← return 而非 throw，BullMQ 不重試

    } else {
      // ✅ 可重試的網路錯誤：更新狀態後 throw 讓 BullMQ 重試
      await prisma.uploadTask.update({
        where: { id: taskId },
        data: {
          status: 'PENDING',
          errorMsg: `第 ${attemptNum} 次嘗試失敗，將自動重試: ${error.message}`,
          retryCount: job.attemptsMade
        }
      });

      logger.warn(`[Worker] Task ${taskId} → retrying (attempt ${attemptNum})`);
      throw error; // ← 只有網路錯誤才 throw 讓 BullMQ 重試
    }
  }
}, {
  connection: redisConnection,
  concurrency: 2, // 降低並發，減少同時打 OpenAI 的請求數
});

worker.on('completed', (job, result) => {
  logger.info(`[Worker] Job ${job.id} done: ${JSON.stringify(result)}`);
});

worker.on('failed', (job, err) => {
  // 只有真正被 BullMQ 重試耗盡才會到這裡（網路錯誤 retry 失敗）
  logger.error(`[Worker] Job ${job?.id} exhausted retries: ${err.message}`);
});

worker.on('error', (err) => {
  logger.error(`[Worker] Worker error: ${err.message}`);
});

logger.info(`🤖 AI Worker started [queue: ${AI_QUEUE_NAME}]`);

process.on('SIGTERM', async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = worker;
