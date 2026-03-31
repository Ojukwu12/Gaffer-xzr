/**
 * Admin Routes
 * Defines routes for administrative operations
 * @module routes/adminRoutes
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const adminController = require('../controllers/adminController');
const { strictLimiter } = require('../middlewares/rateLimit');
const { requireApiKey, requireAdmin, requireAdminSecretKey } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validateRequest = require('../middlewares/validateRequest');

// Apply authentication and rate limiting to all admin routes
router.use(asyncHandler(requireAdminSecretKey));
router.use(asyncHandler(requireApiKey));
router.use(asyncHandler(requireAdmin));
router.use(strictLimiter);

/**
 * POST /api/admin/cache/clear
 * Clear cache
 */
router.post('/cache/clear',
  [
    body('type')
      .optional()
      .isIn(['all', 'expired', 'predictions'])
  ],
  validateRequest,
  adminController.clearCache
);

/**
 * GET /api/admin/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats',
  adminController.getCacheStats
);

/**
 * POST /api/admin/cache/invalidate/:marketId
 * Invalidate cache for a specific market
 */
router.post('/cache/invalidate/:marketId',
  [
    param('marketId')
      .notEmpty()
      .withMessage('Market ID is required')
  ],
  validateRequest,
  adminController.invalidateMarketCache
);

/**
 * POST /api/admin/cron/run
 * Run cron job manually
 */
router.post('/cron/run',
  [
    body('job')
      .notEmpty()
      .withMessage('Job type is required')
      .isIn(['refresh', 'compute'])
  ],
  validateRequest,
  adminController.runCron
);

/**
 * GET /api/admin/debug
 * Get system debug information
 */
router.get('/debug',
  adminController.getDebugInfo
);

/**
 * POST /api/admin/test/llm
 * Test LLM connection
 */
router.post('/test/llm',
  adminController.testLLM
);

/**
 * POST /api/admin/test/email
 * Test email service
 */
router.post('/test/email',
  [
    body('to')
      .notEmpty()
      .withMessage('Email address is required')
      .isEmail()
      .normalizeEmail()
  ],
  validateRequest,
  adminController.testEmail
);

/**
 * POST /api/admin/test/push-weekly-digest
 * Trigger weekly push digest manually
 */
router.post('/test/push-weekly-digest',
  [
    body('windowDays')
      .optional()
      .isInt({ min: 1, max: 30 })
      .toInt()
  ],
  validateRequest,
  adminController.testWeeklyPushDigest
);

/**
 * POST /api/admin/cleanup/subscriptions
 * Clean up invalid subscriptions
 */
router.post('/cleanup/subscriptions',
  adminController.cleanupSubscriptions
);

/**
 * GET /api/admin/stats/predictions
 * Get prediction statistics
 */
router.get('/stats/predictions',
  adminController.getPredictionStats
);

/**
 * GET /api/admin/stats/notifications
 * Get notification statistics
 */
router.get('/stats/notifications',
  adminController.getNotificationStats
);

/**
 * POST /api/admin/webhooks
 * Create a new webhook
 */
router.post('/webhooks',
  [
    body('url')
      .notEmpty()
      .withMessage('Webhook URL is required')
      .isURL()
      .withMessage('Invalid URL format'),
    body('events')
      .isArray({ min: 1 })
      .withMessage('At least one event is required'),
    body('events.*')
      .isIn(['prediction.created', 'prediction.updated', 'market.trending', 'whale.activity', 'high.confidence'])
      .withMessage('Invalid event type')
  ],
  validateRequest,
  adminController.createWebhook
);

/**
 * GET /api/admin/webhooks
 * List all webhooks
 */
router.get('/webhooks',
  adminController.listWebhooks
);

/**
 * GET /api/admin/webhooks/:id
 * Get webhook by ID
 */
router.get('/webhooks/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid webhook ID')
  ],
  validateRequest,
  adminController.getWebhook
);

/**
 * PUT /api/admin/webhooks/:id
 * Update webhook
 */
router.put('/webhooks/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid webhook ID'),
    body('url')
      .optional()
      .isURL()
      .withMessage('Invalid URL format'),
    body('events')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one event is required'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
  ],
  validateRequest,
  adminController.updateWebhook
);

/**
 * DELETE /api/admin/webhooks/:id
 * Delete webhook
 */
router.delete('/webhooks/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid webhook ID')
  ],
  validateRequest,
  adminController.deleteWebhook
);

/**
 * POST /api/admin/webhooks/:id/test
 * Test webhook delivery
 */
router.post('/webhooks/:id/test',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid webhook ID')
  ],
  validateRequest,
  adminController.testWebhook
);

/**
 * GET /api/admin/predictions
 * List predictions for moderation workflow
 */
router.get('/predictions',
  adminController.listPredictions
);

/**
 * GET /api/admin/predictions/status/:status
 * List predictions by moderation status (pending or approved)
 */
router.get('/predictions/status/:status',
  [
    param('status')
      .isIn(['pending', 'approved'])
      .withMessage('Status must be pending or approved'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .toInt()
  ],
  validateRequest,
  adminController.listPredictionsByStatus
);

/**
 * POST /api/admin/predictions/:id/approve
 * Approve a prediction
 */
router.post('/predictions/:id/approve',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID'),
    body('reviewNotes')
      .optional()
      .isString()
      .isLength({ max: 1000 })
  ],
  validateRequest,
  adminController.approvePrediction
);

/**
 * POST /api/admin/predictions/:id/reject
 * Reject a prediction
 */
router.post('/predictions/:id/reject',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID'),
    body('reviewNotes')
      .optional()
      .isString()
      .isLength({ max: 1000 })
  ],
  validateRequest,
  adminController.rejectPrediction
);

/**
 * PATCH /api/admin/predictions/:id/probability
 * Edit AI probability and keep full edit history
 */
router.patch('/predictions/:id/probability',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID'),
    body('aiProbability')
      .notEmpty()
      .withMessage('aiProbability is required')
      .isFloat({ min: 0, max: 100 })
      .withMessage('aiProbability must be between 0 and 100')
  ],
  validateRequest,
  adminController.editPredictionProbability
);

/**
 * PATCH /api/admin/predictions/:id/approved/probability
 * Edit AI probability only when prediction is approved
 */
router.patch('/predictions/:id/approved/probability',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID'),
    body('aiProbability')
      .notEmpty()
      .withMessage('aiProbability is required')
      .isFloat({ min: 0, max: 100 })
      .withMessage('aiProbability must be between 0 and 100')
  ],
  validateRequest,
  adminController.editApprovedPredictionProbability
);

/**
 * DELETE /api/admin/predictions/:id/pending
 * Delete a pending prediction
 */
router.delete('/predictions/:id/pending',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID')
  ],
  validateRequest,
  adminController.deletePendingPrediction
);

/**
 * DELETE /api/admin/predictions/:id/approved
 * Delete an approved prediction
 */
router.delete('/predictions/:id/approved',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid prediction ID')
  ],
  validateRequest,
  adminController.deleteApprovedPrediction
);

/**
   * GET /api/admin/external-data/:marketId
   * Get external data diagnostics for a specific market
   */
router.get('/external-data/:marketId',
  [
    param('marketId')
      .notEmpty()
      .withMessage('Market ID is required')
  ],
  validateRequest,
  adminController.getExternalDataDiagnostics
);

/**
   * GET /api/admin/health/external-sources
   * Check health status of external data providers
   */
router.get('/health/external-sources',
  adminController.checkExternalSourcesHealth
);

/**
   * GET /api/admin/metrics/external-data
   * Get external data performance metrics and statistics
   */
router.get('/metrics/external-data',
  adminController.getExternalDataMetrics
);

module.exports = router;

