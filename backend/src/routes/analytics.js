const express = require('express');
const { query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeChildAccess } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── Helper: Calculate sleep duration in minutes ──────────────────────────────
const calcSleepMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return end > start ? end - start : 0;
};

// ─── GET /api/v1/analytics/:childId/basic ────────────────────────────────────
// Level 1: Basic visualization - milk volume trend, sleep duration, temperature
router.get('/:childId/basic', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('days').optional().isInt({ min: 7, max: 365 })
], authorizeChildAccess, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { childId } = req.params;
    const days = parseInt(req.query.days || '30');
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(endDate.getTime() - days * 86400000);

    const records = await prisma.dailyRecord.findMany({
      where: {
        childId,
        recordDate: { gte: startDate, lte: endDate }
      },
      include: { diets: true, sleeps: true, healths: true },
      orderBy: { recordDate: 'asc' }
    });

    // Build daily series
    const dailySeries = records.map(r => {
      const dateStr = r.recordDate.toISOString().split('T')[0];

      // Milk: sum of MILK volumeCc
      const totalMilkCc = r.diets
        .filter(d => d.type === 'MILK')
        .reduce((sum, d) => sum + (d.volumeCc || 0), 0);

      // Sleep: sum of durations
      const totalSleepMin = r.sleeps
        .reduce((sum, s) => sum + calcSleepMinutes(s.startTime, s.endTime), 0);

      // Temperature: latest
      const tempReadings = r.healths
        .filter(h => h.temperature != null)
        .map(h => ({ time: h.time, temp: h.temperature }));

      const latestTemp = tempReadings.length > 0
        ? tempReadings[tempReadings.length - 1].temp
        : null;

      return {
        date: dateStr,
        mood: r.mood,
        totalMilkCc,
        totalSleepMin,
        sleepHours: parseFloat((totalSleepMin / 60).toFixed(1)),
        latestTemp,
        tempReadings,
        solidMeals: r.diets.filter(d => d.type === 'SOLID').length,
        bowelCount: 0 // filled below
      };
    });

    // Add bowel counts
    const bowelCounts = await prisma.bowelRecord.groupBy({
      by: ['recordId'],
      _count: { _all: true },
      where: { record: { childId, recordDate: { gte: startDate, lte: endDate } } }
    });

    const bowelMap = new Map(bowelCounts.map(b => [b.recordId, b._count._all]));
    records.forEach((r, i) => {
      dailySeries[i].bowelCount = bowelMap.get(r.id) || 0;
    });

    // Aggregation summary
    const summary = {
      avgMilkCc: dailySeries.length
        ? Math.round(dailySeries.reduce((s, d) => s + d.totalMilkCc, 0) / dailySeries.length)
        : 0,
      avgSleepHours: dailySeries.length
        ? parseFloat((dailySeries.reduce((s, d) => s + d.sleepHours, 0) / dailySeries.length).toFixed(1))
        : 0,
      avgTemp: (() => {
        const temps = dailySeries.filter(d => d.latestTemp != null).map(d => d.latestTemp);
        return temps.length ? parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null;
      })()
    };

    res.json({ childId, period: { startDate, endDate }, summary, dailySeries });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/analytics/:childId/correlation ──────────────────────────────
// Level 2: Correlation analysis
router.get('/:childId/correlation', authorizeChildAccess, async (req, res, next) => {
  try {
    const { childId } = req.params;
    const days = parseInt(req.query.days || '60');
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86400000);

    const records = await prisma.dailyRecord.findMany({
      where: { childId, recordDate: { gte: startDate, lte: endDate } },
      include: { diets: true, sleeps: true, bowels: true },
      orderBy: { recordDate: 'asc' }
    });

    // Correlation 1: Food items vs bowel quality
    const foodBowelCorrelation = records
      .filter(r => r.diets.some(d => d.type === 'SOLID') && r.bowels.length > 0)
      .map(r => {
        const solidItems = r.diets
          .filter(d => d.type === 'SOLID' && d.items)
          .map(d => d.items.split(/[、,，\s]+/).filter(Boolean))
          .flat();

        const bowelQualities = r.bowels.map(b => b.quality);
        const hasAbnormal = bowelQualities.some(q => q !== 'NORMAL');

        return {
          date: r.recordDate.toISOString().split('T')[0],
          foodItems: solidItems,
          bowelQualities,
          hasAbnormalBowel: hasAbnormal
        };
      });

    // Food item frequency with abnormal bowel
    const foodAbnormalMap = {};
    foodBowelCorrelation.forEach(({ foodItems, hasAbnormalBowel }) => {
      foodItems.forEach(item => {
        if (!foodAbnormalMap[item]) foodAbnormalMap[item] = { count: 0, abnormalCount: 0 };
        foodAbnormalMap[item].count++;
        if (hasAbnormalBowel) foodAbnormalMap[item].abnormalCount++;
      });
    });

    const foodAbnormalRisk = Object.entries(foodAbnormalMap)
      .filter(([_, v]) => v.count >= 2)
      .map(([food, v]) => ({
        food,
        occurrences: v.count,
        abnormalRate: parseFloat((v.abnormalCount / v.count).toFixed(2))
      }))
      .sort((a, b) => b.abnormalRate - a.abnormalRate)
      .slice(0, 10);

    // Correlation 2: Evening milk vs sleep quality
    const milkSleepCorrelation = records
      .filter(r => r.diets.some(d => d.type === 'MILK') && r.sleeps.length > 0)
      .map(r => {
        const eveningMilk = r.diets
          .filter(d => d.type === 'MILK' && d.time >= '18:00')
          .reduce((sum, d) => sum + (d.volumeCc || 0), 0);

        const totalSleepMin = r.sleeps
          .reduce((sum, s) => sum + calcSleepMinutes(s.startTime, s.endTime), 0);

        const sleepQualities = r.sleeps.map(s => s.quality).filter(Boolean);
        const goodSleep = sleepQualities.some(q => q === 'GOOD');

        return {
          date: r.recordDate.toISOString().split('T')[0],
          eveningMilkCc: eveningMilk,
          totalSleepMin,
          sleepHours: parseFloat((totalSleepMin / 60).toFixed(1)),
          goodSleep
        };
      });

    res.json({
      childId,
      period: { startDate, endDate, days },
      foodBowelCorrelation: {
        rawData: foodBowelCorrelation.slice(-30),
        riskItems: foodAbnormalRisk
      },
      milkSleepCorrelation: {
        data: milkSleepCorrelation
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/analytics/:childId/alerts ───────────────────────────────────
// Level 3: Alert system for dashboard
router.get('/:childId/alerts', authorizeChildAccess, async (req, res, next) => {
  try {
    const { childId } = req.params;

    // Get last 7 days of records
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRecords = await prisma.dailyRecord.findMany({
      where: { childId, recordDate: { gte: sevenDaysAgo } },
      include: { healths: true, bowels: true, sleeps: true },
      orderBy: { recordDate: 'desc' }
    });

    const alerts = [];

    // Alert 1: Consecutive fever (temperature >= 37.5 for 3+ days)
    const daysWithFever = recentRecords.filter(r =>
      r.healths.some(h => h.temperature != null && h.temperature >= 37.5)
    );

    if (daysWithFever.length >= 3) {
      const maxTemp = Math.max(...daysWithFever.flatMap(r =>
        r.healths.filter(h => h.temperature != null).map(h => h.temperature)
      ));
      alerts.push({
        type: 'HEALTH',
        level: 'RED',
        title: '持續發燒警示',
        message: `連續 ${daysWithFever.length} 天有發燒紀錄，最高體溫 ${maxTemp}°C`,
        icon: '🌡️',
        triggeredAt: new Date().toISOString()
      });
    }

    // Alert 2: Abnormal bowel for 3+ consecutive days
    const daysWithAbnormalBowel = recentRecords.filter(r =>
      r.bowels.some(b => b.quality !== 'NORMAL')
    );

    if (daysWithAbnormalBowel.length >= 3) {
      const qualities = daysWithAbnormalBowel.flatMap(r => r.bowels.map(b => b.quality));
      const mostCommon = qualities.sort((a, b) =>
        qualities.filter(v => v === b).length - qualities.filter(v => v === a).length
      )[0];

      const qualityLabel = { HARD: '偏硬', WATERY: '水便', OTHER: '異常' }[mostCommon] || '異常';
      alerts.push({
        type: 'DIGESTIVE',
        level: 'YELLOW',
        title: '腸胃健康注意',
        message: `連續 ${daysWithAbnormalBowel.length} 天排便異常（${qualityLabel}），請多加關注`,
        icon: '🏥',
        triggeredAt: new Date().toISOString()
      });
    }

    // Alert 3: Poor sleep trend (3+ days poor sleep or avg < 8 hours)
    const sleepData = recentRecords.map(r => {
      const totalMin = r.sleeps.reduce((sum, s) => sum + calcSleepMinutes(s.startTime, s.endTime), 0);
      const hasPoor = r.sleeps.some(s => s.quality === 'POOR');
      return { date: r.recordDate, totalMin, hasPoor };
    }).filter(d => d.totalMin > 0);

    const poorSleepDays = sleepData.filter(d => d.hasPoor || d.totalMin < 480);
    if (poorSleepDays.length >= 3) {
      const avgSleep = sleepData.reduce((s, d) => s + d.totalMin, 0) / sleepData.length;
      alerts.push({
        type: 'SLEEP',
        level: 'YELLOW',
        title: '睡眠品質關注',
        message: `近 ${poorSleepDays.length} 天睡眠品質不佳，平均睡眠 ${(avgSleep / 60).toFixed(1)} 小時`,
        icon: '😴',
        triggeredAt: new Date().toISOString()
      });
    }

    // Alert 4: Consistent negative mood (ANGRY or CRYING for 2+ days)
    const negativeMoodDays = recentRecords.filter(r =>
      r.mood === 'ANGRY' || r.mood === 'CRYING'
    );

    if (negativeMoodDays.length >= 2) {
      alerts.push({
        type: 'EMOTIONAL',
        level: 'YELLOW',
        title: '情緒狀態關注',
        message: `近 ${negativeMoodDays.length} 天情緒狀態（哭鬧/生氣），建議多關心寶寶`,
        icon: '💛',
        triggeredAt: new Date().toISOString()
      });
    }

    // Stats summary for dashboard
    const last7DaysStats = {
      recordCount: recentRecords.length,
      avgMilkCc: (() => {
        // Would need diet data - skipping for alert endpoint
        return null;
      })(),
      alertCount: alerts.length,
      redAlerts: alerts.filter(a => a.level === 'RED').length,
      yellowAlerts: alerts.filter(a => a.level === 'YELLOW').length
    };

    res.json({
      childId,
      checkedAt: new Date().toISOString(),
      alerts,
      stats: last7DaysStats
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
