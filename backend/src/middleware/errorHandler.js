const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;

  if (statusCode === 500) {
    logger.error(err.stack || err.message);
  }

  // Prisma unique constraint error
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: '資料已存在，請勿重複建立',
      field: err.meta?.target
    });
  }

  // Prisma not found error
  if (err.code === 'P2025') {
    return res.status(404).json({ error: '資料不存在' });
  }

  res.status(statusCode).json({
    error: err.message || '伺服器內部錯誤',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = { notFound, errorHandler };
