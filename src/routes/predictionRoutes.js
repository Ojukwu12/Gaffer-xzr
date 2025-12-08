/**
 * Prediction Routes
 * Defines routes for prediction-related endpoints
 * @module routes/predictionRoutes
 */

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const predictionController = require('../controllers/predictionController');
const { predictionLimiter } = require('../middlewares/rateLimit');

// Apply prediction-specific rate limiting
router.use(predictionLimiter);

/**
 * GET /api/markets/:id/predict-unified
 * Generate unified prediction (single YES/NO answer) for a market
 */
router.get('/:id/predict-unified',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  predictionController.getUnifiedPrediction
);

/**
 * GET /api/markets/:id/predict
 * Generate prediction for a specific option
 */
router.get('/:id/predict',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim(),
    query('option').notEmpty().withMessage('Option is required').trim(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  predictionController.getPrediction
);

/**
 * GET /api/markets/:id/predict-all
 * Generate predictions for all options
 */
router.get('/:id/predict-all',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  predictionController.getAllPredictions
);

/**
 * GET /api/markets/:id/features
 * Get computed features without LLM prediction
 */
router.get('/:id/features',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim(),
    query('option').notEmpty().withMessage('Option is required').trim(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  predictionController.getFeatures
);

/**
 * GET /api/markets/:id/cache
 * Get cached predictions for a market
 */
router.get('/:id/cache',
  [
    param('id').notEmpty().withMessage('Market ID is required').trim()
  ],
  predictionController.getCachedPredictions
);

/**
 * POST /api/predictions/batch
 * Batch predict multiple markets
 */
router.post('/batch',
  [
    body('markets')
      .isArray({ min: 1, max: 10 })
      .withMessage('Markets array is required (max 10)'),
    body('markets.*.marketId')
      .notEmpty()
      .withMessage('Market ID is required'),
    body('markets.*.option')
      .notEmpty()
      .withMessage('Option is required'),
    body('timeframe')
      .optional()
      .isIn(['daily', 'weekly', 'monthly'])
  ],
  predictionController.batchPredict
);

module.exports = router;
