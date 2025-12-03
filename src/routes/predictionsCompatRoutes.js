/**
 * Backwards-compatible Prediction Routes
 * Provides endpoints under `/api/predictions` for older clients/tests
 */

const express = require('express');
const { body } = require('express-validator');
const predictionController = require('../controllers/predictionController');

const router = express.Router();

// POST /api/predictions
// Accepts a batch payload `{ markets: [...] }`. If payload is invalid, controller will return 400.
router.post('/',
  [
    body('markets').optional().isArray()
  ],
  (req, res, next) => {
    // Delegate to batchPredict which validates the markets array
    return predictionController.batchPredict(req, res, next);
  }
);

// GET /api/predictions/:marketId
// Map to the same logic as GET /api/markets/:id/predict but retain param name
router.get('/:marketId', (req, res, next) => {
  // Move param into `id` so controller can read it
  req.params.id = req.params.marketId;
  return predictionController.getPrediction(req, res, next);
});

module.exports = router;
