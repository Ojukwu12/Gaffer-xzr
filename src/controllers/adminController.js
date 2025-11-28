/**
 * Admin Controller
 * Handles administrative operations
 * @module controllers/adminController
 */

const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');
const cacheService = require('../services/cacheService');
const llmService = require('../services/llmService');
const emailService = require('../services/emailService');
const webPushService = require('../services/webPushService');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');
const mongoose = require('mongoose');

/**
 * Clear cache
 * POST /api/admin/cache/clear
 */
const clearCache = asyncHandler(async (req, res) => {
  const { type = 'all' } = req.body;
  
  logger.info(`Clearing cache: ${type}`);
  
  let result;
  
  switch (type) {
    case 'all':
      result = await cacheService.clearAll();
      break;
    case 'expired':
      result = await cacheService.clearExpired();
      break;
    case 'predictions':
      const PredictionCache = require('../models/PredictionCache');
      result = await PredictionCache.deleteMany({});
      break;
    default:
      throw new CustomError('Invalid cache type', 400, 'INVALID_TYPE');
  }
  
  return success(res, {
    cleared: true,
    type,
    ...result
  });
});

/**
 * Run cron job manually
 * POST /api/admin/cron/run
 */
const runCron = asyncHandler(async (req, res) => {
  const { job } = req.body;
  
  if (!job || !['refresh', 'compute'].includes(job)) {
    throw new CustomError('Invalid job. Must be "refresh" or "compute"', 400, 'INVALID_JOB');
  }
  
  logger.info(`Running cron job: ${job}`);
  
  let result;
  
  if (job === 'refresh') {
    const refreshMarkets = require('../cron/refreshMarkets');
    result = await refreshMarkets();
  } else if (job === 'compute') {
    const computePredictions = require('../cron/computePredictions');
    result = await computePredictions();
  }
  
  return success(res, {
    job,
    executed: true,
    result
  });
});

/**
 * Get system debug information
 * GET /api/admin/debug
 */
const getDebugInfo = asyncHandler(async (req, res) => {
  logger.info('Fetching debug information');
  
  // Cache statistics
  const cacheStats = await cacheService.getStats();
  
  // Database stats
  const dbStats = {
    connected: mongoose.connection.readyState === 1,
    name: mongoose.connection.name,
    host: mongoose.connection.host
  };
  
  // Model counts
  const User = require('../models/User');
  const EmailSubscription = require('../models/EmailSubscription');
  const PushSubscription = require('../models/PushSubscription');
  const PredictionCache = require('../models/PredictionCache');
  
  const modelCounts = {
    users: await User.countDocuments(),
    emailSubscriptions: await EmailSubscription.countDocuments(),
    pushSubscriptions: await PushSubscription.countDocuments(),
    predictionCache: await PredictionCache.countDocuments()
  };
  
  // Service status
  const services = {
    llm: {
      configured: llmService.getModelInfo().configured,
      model: llmService.getModelInfo().model
    },
    email: {
      configured: emailService.initializeTransporter()
    },
    webPush: {
      configured: webPushService.isConfigured()
    }
  };
  
  // System info
  const systemInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    env: process.env.NODE_ENV
  };
  
  return success(res, {
    timestamp: new Date().toISOString(),
    database: dbStats,
    cache: cacheStats,
    modelCounts,
    services,
    system: systemInfo
  });
});

/**
 * Get cache statistics
 * GET /api/admin/cache/stats
 */
const getCacheStats = asyncHandler(async (req, res) => {
  const stats = await cacheService.getStats();
  
  return success(res, stats);
});

/**
 * Invalidate market cache
 * POST /api/admin/cache/invalidate/:marketId
 */
const invalidateMarketCache = asyncHandler(async (req, res) => {
  const { marketId } = req.params;
  
  logger.info(`Invalidating cache for market: ${marketId}`);
  
  await cacheService.invalidateMarket(marketId);
  
  return success(res, {
    invalidated: true,
    marketId
  });
});

/**
 * Test LLM connection
 * POST /api/admin/test/llm
 */
const testLLM = asyncHandler(async (req, res) => {
  logger.info('Testing LLM connection');
  
  const connected = await llmService.testConnection();
  const modelInfo = llmService.getModelInfo();
  
  return success(res, {
    connected,
    ...modelInfo
  });
});

/**
 * Test email service
 * POST /api/admin/test/email
 */
const testEmail = asyncHandler(async (req, res) => {
  const { to } = req.body;
  
  if (!to) {
    throw new CustomError('Email address is required', 400, 'MISSING_EMAIL');
  }
  
  logger.info(`Testing email service: ${to}`);
  
  await emailService.sendEmail({
    to,
    subject: 'Polyscope Test Email',
    text: 'This is a test email from Polyscope.',
    html: '<p>This is a test email from <strong>Polyscope</strong>.</p>'
  });
  
  return success(res, {
    sent: true,
    to
  });
});

/**
 * Clean up subscriptions
 * POST /api/admin/cleanup/subscriptions
 */
const cleanupSubscriptions = asyncHandler(async (req, res) => {
  logger.info('Cleaning up subscriptions');
  
  const result = await notificationService.cleanupSubscriptions();
  
  return success(res, {
    cleaned: true,
    ...result
  });
});

/**
 * Get prediction statistics
 * GET /api/admin/stats/predictions
 */
const getPredictionStats = asyncHandler(async (req, res) => {
  const PredictionCache = require('../models/PredictionCache');
  
  const stats = await PredictionCache.aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { expiresAt: { $gt: new Date() } } },
          { $count: 'count' }
        ],
        byTimeframe: [
          { $group: { _id: '$timeframe', count: { $sum: 1 } } }
        ],
        avgConfidence: [
          { $group: { _id: null, avg: { $avg: '$prediction.confidence' } } }
        ],
        topMarkets: [
          { $group: { _id: '$marketId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);
  
  return success(res, stats[0]);
});

/**
 * Get notification statistics
 * GET /api/admin/stats/notifications
 */
const getNotificationStats = asyncHandler(async (req, res) => {
  const EmailSubscription = require('../models/EmailSubscription');
  const PushSubscription = require('../models/PushSubscription');
  
  const emailStats = await EmailSubscription.aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { isActive: true, isVerified: true } },
          { $count: 'count' }
        ],
        totalNotificationsSent: [
          { $group: { _id: null, total: { $sum: '$notificationCount.total' } } }
        ]
      }
    }
  ]);
  
  const pushStats = await PushSubscription.aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { isActive: true, failureCount: { $lt: 5 } } },
          { $count: 'count' }
        ],
        totalNotificationsSent: [
          { $group: { _id: null, total: { $sum: '$notificationCount.total' } } }
        ]
      }
    }
  ]);
  
  return success(res, {
    email: emailStats[0],
    push: pushStats[0]
  });
});

module.exports = {
  clearCache,
  runCron,
  getDebugInfo,
  getCacheStats,
  invalidateMarketCache,
  testLLM,
  testEmail,
  cleanupSubscriptions,
  getPredictionStats,
  getNotificationStats
};
