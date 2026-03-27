const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('./logger');

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false
});

redisConnection.on('connect', () => logger.info('Redis connected'));
redisConnection.on('error', (err) => logger.error('Redis error:', err));

const AI_QUEUE_NAME = 'ai-processing';

const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // attempts: 1 → BullMQ 本身不重試
    // Worker 內部自行決定是否 throw（網路錯誤）or return（其他錯誤）
    // 若要允許網路錯誤重試，可改為 3，但 worker 只在網路錯誤時才 throw
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000  // 第一次重試等 5 秒，第二次 10 秒
    },
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 86400 * 7, count: 50 }
  }
});

module.exports = { aiQueue, redisConnection, AI_QUEUE_NAME };
