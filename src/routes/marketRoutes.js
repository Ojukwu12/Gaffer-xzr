/**
 * Market Routes
 * Defines routes for market-related endpoints
 * @module routes/marketRoutes
 */

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const marketController = require('../controllers/marketController');
const { generalLimiter } = require('../middlewares/rateLimit');
const validateRequest = require('../middlewares/validateRequest');

// Apply rate limiting to all routes
router.use(generalLimiter);

/**
 * GET /api/markets
 * Get all markets with optional filters
 */
router.get('/',
  [
    query('category').optional().isString().trim(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly']),
    query('status').optional().isIn(['active', 'closed']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validateRequest,
  marketController.getMarkets
);

/**
 * GET /api/markets/search
 * Search markets by query
 */
router.get('/search',
  [
    query('q').notEmpty().withMessage('Search query is required').trim(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
  ],
  validateRequest,
  marketController.searchMarkets
);

/**
 * GET /api/markets/trending
 * Get trending markets
 */
router.get('/trending',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
  ],
  validateRequest,
  marketController.getTrendingMarkets
);

/**
 * GET /api/markets/category/:category
 * Get markets by category
 */
router.get('/category/:category',
  [
    param('category').notEmpty().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  validateRequest,
  marketController.getMarketsByCategory
);

/**
 * GET /api/markets/:id
 * Get single market by ID
 */
router.get('/:id',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim()
  ],
  validateRequest,
  marketController.getMarketById
);

module.exports = router;
