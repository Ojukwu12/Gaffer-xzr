/**
 * Metrics Routes
 * Defines routes for metrics and monitoring
 * @module routes/metricsRoutes
 */

const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController');
const { requireApiKey } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

/**
 * GET /api/metrics
 * Get application metrics (requires API key)
 */
router.get('/',
  asyncHandler(requireApiKey),
  asyncHandler(metricsController.getMetrics)
);

/**
 * GET /api/metrics/prometheus
 * Get Prometheus-formatted metrics (public for scraping)
 */
router.get('/prometheus',
  asyncHandler(metricsController.getPrometheusMetrics)
);

/**
 * POST /api/metrics/reset
 * Reset metrics (requires API key)
 */
router.post('/reset',
  asyncHandler(requireApiKey),
  asyncHandler(metricsController.resetMetrics)
);

module.exports = router;
