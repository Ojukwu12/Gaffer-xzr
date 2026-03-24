/**
 * Backwards-compatible Prediction Routes
 * Provides endpoints under `/api/predictions` for older clients/tests
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const predictionController = require('../controllers/predictionController');
const { voteLimiter } = require('../middlewares/rateLimit');
const validateRequest = require('../middlewares/validateRequest');

const router = express.Router();

// GET /api/predictions
router.get('/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.getApprovedPredictions(req, res, next);
  }
);

// GET /api/predictions/approved
router.get('/approved',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('timeframe').optional().isIn(['daily', 'weekly', 'monthly'])
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.getApprovedPredictions(req, res, next);
  }
);

// GET /api/predictions/performance
router.get('/performance',
  [
    query('days').optional().isInt({ min: 1, max: 30 }).toInt(),
    query('mode').optional().isIn(['paper', 'production', 'staging']),
    query('minResolved').optional().isInt({ min: 1 }).toInt(),
    query('minLowerBound').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.getPredictionPerformance(req, res, next);
  }
);

// POST /api/predictions
// Legacy path is intentionally blocked to keep prediction generation private.
router.post('/', (req, res, next) => {
  return predictionController.rejectPublicPredictionGeneration(req, res, next);
});

// GET /api/predictions/:predictionId
router.get('/:predictionId',
  [
    param('predictionId').isMongoId().withMessage('Invalid prediction ID')
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.getApprovedPredictionById(req, res, next);
  }
);

// POST /api/predictions/:predictionId/vote
router.post('/:predictionId/vote',
  voteLimiter,
  [
    param('predictionId').isMongoId().withMessage('Invalid prediction ID'),
    body('voteType').notEmpty().isIn(['like', 'dislike'])
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.votePrediction(req, res, next);
  }
);

// GET /api/predictions/:predictionId/votes
router.get('/:predictionId/votes',
  [
    param('predictionId').isMongoId().withMessage('Invalid prediction ID')
  ],
  validateRequest,
  (req, res, next) => {
    return predictionController.getPredictionVotes(req, res, next);
  }
);

module.exports = router;
