/**
 * Admin Routes
 * Defines routes for administrative operations
 * @module routes/adminRoutes
 */

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const adminController = require('../controllers/adminController');
const { strictLimiter } = require('../middlewares/rateLimit');
const { requireApiKey, requireAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validateRequest = require('../middlewares/validateRequest');

// Apply authentication and rate limiting to all admin routes
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

module.exports = router;

