/**
 * Admin Controller
 * Handles administrative operations
 * @module controllers/adminController
 */

const asyncHandler = require('../middlewares/asyncHandler');
const externalDataMonitoringService = require('../services/externalDataMonitoringService');
const { success } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');
const cacheService = require('../services/cacheService');
const llmService = require('../services/llmService');
const emailService = require('../services/emailService');
const webPushService = require('../services/webPushService');
const notificationService = require('../services/notificationService');
const webhookService = require('../services/webhookService');
const predictionModerationService = require('../services/predictionModerationService');
const polymarketService = require('../services/polymarketService');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const Webhook = require('../models/Webhook');

const scheduleApprovedPredictionNotification = (prediction) => {
  const publishAt = prediction?.approvedAt ? new Date(prediction.approvedAt).getTime() : Date.now();
  const delayMs = Math.max(0, publishAt - Date.now());

  setTimeout(async () => {
    try {
      const rawMarket = await polymarketService.fetchMarketById(prediction.marketId);
      const marketData = polymarketService.parseMarket(rawMarket);

      await notificationService.sendPredictionNotification(
        prediction.marketId,
        {
          option: prediction.option,
          confidence: prediction.confidence,
          reason: predictionModerationService.resolveDisplayReason(prediction),
          timeframe: prediction.timeframe
        },
        marketData
      );
    } catch (error) {
      logger.warn(`Delayed approved prediction notification failed for ${prediction.marketId}: ${error.message}`);
    }
  }, delayMs);
};

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
  case 'predictions': {
    const PredictionCache = require('../models/PredictionCache');
    result = await PredictionCache.deleteMany({});
    break;
  }
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
 * Get diagnostics for a specific market's external data
 * GET /api/admin/external-data/:marketId
 */
const getExternalDataDiagnostics = asyncHandler(async (req, res) => {
  const { marketId } = req.params;

  if (!marketId) {
    throw new CustomError('Market ID is required', 400, 'MISSING_MARKET_ID');
  }

  logger.info(`Fetching external data diagnostics for market: ${marketId}`);

  const diagnostics = externalDataMonitoringService.getMarketDiagnostics(marketId);

  if (!diagnostics) {
    throw new CustomError(
      'No diagnostics found for this market. Market may not have been analyzed yet or diagnostics have expired.',
      404,
      'DIAGNOSTICS_NOT_FOUND'
    );
  }

  return success(res, diagnostics);
});

/**
 * Check health of external data sources
 * GET /api/admin/health/external-sources
 */
const checkExternalSourcesHealth = asyncHandler(async (req, res) => {
  logger.info('Running external data source health check');

  const healthStatus = await externalDataMonitoringService.checkExternalSourceHealth();

  return success(res, healthStatus);
});

/**
 * Get external data metrics and statistics
 * GET /api/admin/metrics/external-data
 */
const getExternalDataMetrics = asyncHandler(async (req, res) => {
  logger.info('Fetching external data metrics');

  const metrics = externalDataMonitoringService.getMetrics();

  return success(res, metrics);
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

/**
 * Create webhook
 * POST /api/admin/webhooks
 */
const createWebhook = asyncHandler(async (req, res) => {
  const { url, events, filters, metadata } = req.body;
  
  if (!url) {
    throw new CustomError('Webhook URL is required', 400, 'MISSING_URL');
  }
  
  if (!events || events.length === 0) {
    throw new CustomError('At least one event is required', 400, 'MISSING_EVENTS');
  }
  
  logger.info(`Creating webhook: ${url}`);
  
  const webhook = await Webhook.create({
    url,
    events,
    filters: filters || {},
    metadata: metadata || {},
    isActive: true
  });
  
  return success(res, {
    webhook: {
      id: webhook._id,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      filters: webhook.filters,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt
    }
  }, 201);
});

/**
 * List all webhooks
 * GET /api/admin/webhooks
 */
const listWebhooks = asyncHandler(async (req, res) => {
  const webhooks = await Webhook.find().sort({ createdAt: -1 });
  
  return success(res, {
    webhooks: webhooks.map(w => ({
      id: w._id,
      url: w.url,
      events: w.events,
      filters: w.filters,
      isActive: w.isActive,
      stats: w.stats,
      consecutiveFailures: w.consecutiveFailures,
      lastError: w.lastError,
      metadata: w.metadata,
      createdAt: w.createdAt
    })),
    total: webhooks.length
  });
});

/**
 * Get webhook by ID
 * GET /api/admin/webhooks/:id
 */
const getWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const webhook = await Webhook.findById(id);
  
  if (!webhook) {
    throw new CustomError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
  }
  
  return success(res, {
    webhook: {
      id: webhook._id,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      filters: webhook.filters,
      isActive: webhook.isActive,
      stats: webhook.stats,
      consecutiveFailures: webhook.consecutiveFailures,
      lastError: webhook.lastError,
      metadata: webhook.metadata,
      retryConfig: webhook.retryConfig,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt
    }
  });
});

/**
 * Update webhook
 * PUT /api/admin/webhooks/:id
 */
const updateWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { url, events, filters, isActive, metadata } = req.body;
  
  const webhook = await Webhook.findById(id);
  
  if (!webhook) {
    throw new CustomError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
  }
  
  if (url) webhook.url = url;
  if (events) webhook.events = events;
  if (filters) webhook.filters = { ...webhook.filters, ...filters };
  if (typeof isActive === 'boolean') webhook.isActive = isActive;
  if (metadata) webhook.metadata = { ...webhook.metadata, ...metadata };
  
  await webhook.save();
  
  logger.info(`Webhook updated: ${id}`);
  
  return success(res, {
    webhook: {
      id: webhook._id,
      url: webhook.url,
      events: webhook.events,
      filters: webhook.filters,
      isActive: webhook.isActive,
      updatedAt: webhook.updatedAt
    }
  });
});

/**
 * Delete webhook
 * DELETE /api/admin/webhooks/:id
 */
const deleteWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const webhook = await Webhook.findByIdAndDelete(id);
  
  if (!webhook) {
    throw new CustomError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
  }
  
  logger.info(`Webhook deleted: ${id}`);
  
  return success(res, {
    deleted: true,
    id
  });
});

/**
 * Test webhook delivery
 * POST /api/admin/webhooks/:id/test
 */
const testWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const webhook = await Webhook.findById(id);
  
  if (!webhook) {
    throw new CustomError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
  }
  
  logger.info(`Testing webhook: ${id}`);
  
  const testPayload = {
    event: 'test.webhook',
    data: {
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
      marketId: 'test-market-123',
      confidence: 85
    },
    timestamp: new Date().toISOString(),
    webhookId: webhook._id
  };
  
  const signature = webhook.generateSignature(testPayload);
  
  try {
    const axios = require('axios');
    const response = await axios.post(webhook.url, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'test.webhook',
        'User-Agent': 'Polyscope-Webhook/1.0'
      },
      timeout: 10000
    });
    
    return success(res, {
      tested: true,
      status: response.status,
      statusText: response.statusText
    });
  } catch (error) {
    throw new CustomError(
      `Webhook test failed: ${error.message}`,
      500,
      'WEBHOOK_TEST_FAILED'
    );
  }
});

/**
 * List predictions for moderation
 * GET /api/admin/predictions
 */
const listPredictions = asyncHandler(async (req, res) => {
  const {
    status,
    marketId,
    timeframe,
    mode,
    limit = 50,
    offset = 0
  } = req.query;

  const result = await predictionModerationService.listPredictions({
    status,
    marketId,
    timeframe,
    evaluationMode: mode,
    limit: Number(limit),
    offset: Number(offset)
  });

  return success(res, {
    total: result.total,
    count: result.items.length,
    predictions: result.items
  });
});

/**
 * List predictions by moderation status
 * GET /api/admin/predictions/status/:status
 */
const listPredictionsByStatus = asyncHandler(async (req, res) => {
  const { status } = req.params;
  const {
    marketId,
    timeframe,
    mode,
    limit = 50,
    offset = 0
  } = req.query;

  const result = await predictionModerationService.listPredictionsByStatus({
    status,
    marketId,
    timeframe,
    evaluationMode: mode,
    limit: Number(limit),
    offset: Number(offset)
  });

  return success(res, {
    status,
    total: result.total,
    count: result.items.length,
    predictions: result.items
  });
});

/**
 * Approve pending/rejected prediction
 * POST /api/admin/predictions/:id/approve
 */
const approvePrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewNotes = '' } = req.body;
  const reviewedBy = req.user?.email || req.user?.id || 'admin';

  const approvalResult = await predictionModerationService.approvePrediction({
    predictionId: id,
    reviewedBy,
    reviewNotes
  });

  const prediction = approvalResult?.record || null;

  if (!prediction) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  scheduleApprovedPredictionNotification(prediction);

  return success(res, {
    approved: true,
    prediction,
    publication: {
      scheduled: true,
      delayMs: approvalResult?.publicationDelayMs || 0
    }
  });
});

/**
 * Reject prediction
 * POST /api/admin/predictions/:id/reject
 */
const rejectPrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewNotes = '' } = req.body;
  const reviewedBy = req.user?.email || req.user?.id || 'admin';

  const prediction = await predictionModerationService.rejectPrediction({
    predictionId: id,
    reviewedBy,
    reviewNotes
  });

  if (!prediction) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    rejected: true,
    prediction
  });
});

/**
 * Edit AI probability (before or after approval)
 * PATCH /api/admin/predictions/:id/probability
 */
const editPredictionProbability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { aiProbability } = req.body;
  const editedBy = req.user?.email || req.user?.id || 'admin';

  if (!Number.isFinite(Number(aiProbability))) {
    throw new CustomError('aiProbability must be a number from 0 to 100', 400, 'INVALID_AI_PROBABILITY');
  }

  const prediction = await predictionModerationService.editAiProbability({
    predictionId: id,
    aiProbability: Number(aiProbability),
    editedBy
  });

  if (!prediction) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    updated: true,
    prediction
  });
});

/**
 * Edit AI probability for approved predictions only
 * PATCH /api/admin/predictions/:id/approved/probability
 */
const editApprovedPredictionProbability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { aiProbability } = req.body;
  const editedBy = req.user?.email || req.user?.id || 'admin';

  if (!Number.isFinite(Number(aiProbability))) {
    throw new CustomError('aiProbability must be a number from 0 to 100', 400, 'INVALID_AI_PROBABILITY');
  }

  const prediction = await predictionModerationService.editApprovedAiProbability({
    predictionId: id,
    aiProbability: Number(aiProbability),
    editedBy
  });

  if (!prediction) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    updated: true,
    prediction
  });
});

/**
 * Delete a pending prediction
 * DELETE /api/admin/predictions/:id/pending
 */
const deletePendingPrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await predictionModerationService.deletePredictionByStatus({
    predictionId: id,
    status: 'pending'
  });

  if (!deleted) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    deleted: true,
    prediction: deleted
  });
});

/**
 * Delete an approved prediction
 * DELETE /api/admin/predictions/:id/approved
 */
const deleteApprovedPrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await predictionModerationService.deletePredictionByStatus({
    predictionId: id,
    status: 'approved'
  });

  if (!deleted) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    deleted: true,
    prediction: deleted
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
  getExternalDataDiagnostics,
  checkExternalSourcesHealth,
  getExternalDataMetrics,
  getPredictionStats,
  getNotificationStats,
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  listPredictions,
  listPredictionsByStatus,
  approvePrediction,
  rejectPrediction,
  editPredictionProbability,
  editApprovedPredictionProbability,
  deletePendingPrediction,
  deleteApprovedPrediction
};
