/**
 * Prediction Controller
 * Handles prediction-related HTTP requests
 * @module controllers/predictionController
 */

const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');
const predictionEngine = require('../services/predictionEngine');
const polymarketService = require('../services/polymarketService');
const timeframeService = require('../services/timeframeService');
const metricsService = require('../services/metricsService');
const predictionTrackingService = require('../services/predictionTrackingService');
const logger = require('../config/logger');

/**
 * Generate unified prediction for a market (single YES/NO answer)
 * GET /api/markets/:id/predict-unified
 */
const getUnifiedPrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { timeframe = 'daily' } = req.query;
  
  if (!timeframeService.isValidTimeframe(timeframe)) {
    throw new CustomError(
      `Invalid timeframe. Valid options: ${timeframeService.getEnabledTimeframes().join(', ')}`,
      400,
      'INVALID_TIMEFRAME'
    );
  }
  
  logger.info(`Generating unified prediction for market ${id}, timeframe: ${timeframe}`);
  
  const prediction = await predictionEngine.generateUnifiedPrediction(id, timeframe);
  
  // Track metrics
  metricsService.recordPrediction(prediction, false);
  
  return success(res, prediction);
});

/**
 * Generate prediction for a market option
 * GET /api/markets/:id/predict
 */
const getPrediction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { option, timeframe = 'daily' } = req.query;
  
  if (!option) {
    throw new CustomError('Option parameter is required', 400, 'MISSING_OPTION');
  }
  
  if (!timeframeService.isValidTimeframe(timeframe)) {
    throw new CustomError(
      `Invalid timeframe. Valid options: ${timeframeService.getEnabledTimeframes().join(', ')}`,
      400,
      'INVALID_TIMEFRAME'
    );
  }
  
  logger.info(`Generating prediction for market ${id}, option: ${option}, timeframe: ${timeframe}`);
  
  const prediction = await predictionEngine.generatePrediction(id, option, timeframe);
  
  // Track metrics
  const fromCache = prediction.cached || false;
  metricsService.recordPrediction(prediction, fromCache);
  
  return success(res, prediction);
});

/**
 * Generate predictions for all options in a market
 * GET /api/markets/:id/predict-all
 */
const getAllPredictions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { timeframe = 'daily' } = req.query;
  
  if (!timeframeService.isValidTimeframe(timeframe)) {
    throw new CustomError(
      `Invalid timeframe. Valid options: ${timeframeService.getEnabledTimeframes().join(', ')}`,
      400,
      'INVALID_TIMEFRAME'
    );
  }
  
  logger.info(`Generating all predictions for market ${id}, timeframe: ${timeframe}`);
  
  const predictions = await predictionEngine.generateAllOptionsPredictions(id, timeframe);
  
  return success(res, {
    marketId: id,
    timeframe,
    predictions
  });
});

/**
 * Get prediction features only (without LLM call)
 * GET /api/markets/:id/features
 */
const getFeatures = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { option, timeframe = 'daily' } = req.query;
  
  if (!option) {
    throw new CustomError('Option parameter is required', 400, 'MISSING_OPTION');
  }
  
  logger.info(`Computing features for market ${id}, option: ${option}`);
  
  // Fetch market data
  const marketData = await polymarketService.fetchMarketById(id);
  const parsedMarket = polymarketService.parseMarket(marketData);
  
  // Compute features
  const features = await predictionEngine.computeFeatures(parsedMarket, option, timeframe);
  
  return success(res, {
    marketId: id,
    option,
    timeframe,
    features
  });
});

/**
 * Get cached predictions for a market
 * GET /api/markets/:id/cache
 */
const getCachedPredictions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.info(`Fetching cached predictions for market ${id}`);
  
  const PredictionCache = require('../models/PredictionCache');
  
  const cachedPredictions = await PredictionCache.find({
    marketId: id,
    expiresAt: { $gt: new Date() }
  }).select('-__v').sort({ createdAt: -1 });
  
  return success(res, {
    marketId: id,
    count: cachedPredictions.length,
    predictions: cachedPredictions
  });
});

/**
 * Batch predict multiple markets
 * POST /api/predictions/batch
 */
const batchPredict = asyncHandler(async (req, res) => {
  const { markets, timeframe = 'daily' } = req.body;
  
  if (!markets || !Array.isArray(markets) || markets.length === 0) {
    throw new CustomError('Markets array is required', 400, 'INVALID_REQUEST');
  }
  
  if (markets.length > 10) {
    throw new CustomError('Maximum 10 markets per batch request', 400, 'BATCH_LIMIT_EXCEEDED');
  }
  
  logger.info(`Batch prediction for ${markets.length} markets`);
  
  const results = await Promise.all(
    markets.map(({ marketId, option }) =>
      predictionEngine.generatePrediction(marketId, option, timeframe)
        .catch(err => ({
          marketId,
          option,
          error: err.message
        }))
    )
  );
  
  return success(res, {
    timeframe,
    results
  });
});

/**
 * Get frontend-friendly prediction performance for last month max
 * GET /api/predictions/performance
 */
const getPredictionPerformance = asyncHandler(async (req, res) => {
  const requestedDays = Number(req.query.days) || 30;
  const days = Math.min(30, Math.max(1, requestedDays));

  logger.info(`Fetching prediction performance for last ${days} day(s)`);

  const performance = await predictionTrackingService.getPredictionPerformance(days);

  return success(res, performance);
});

module.exports = {
  getPrediction,
  getUnifiedPrediction,
  getAllPredictions,
  getFeatures,
  getCachedPredictions,
  batchPredict,
  getPredictionPerformance
};
