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
const predictionTrackingService = require('../services/predictionTrackingService');
const predictionModerationService = require('../services/predictionModerationService');
const logger = require('../config/logger');

/**
 * Get approved unified prediction for a market (single YES/NO answer)
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
  
  logger.info(`Fetching approved unified prediction for market ${id}, timeframe: ${timeframe}`);

  const prediction = await predictionModerationService.findLatestApprovedPrediction({
    marketId: id,
    timeframe,
    predictionType: 'unified'
  });

  if (!prediction) {
    throw new CustomError('No approved prediction available for this market yet', 404, 'PREDICTION_PENDING_REVIEW');
  }
  
  return success(res, {
    id: prediction._id,
    marketId: prediction.marketId,
    option: prediction.option,
    timeframe: prediction.timeframe,
    status: prediction.status,
    marketProbabilityAtTime: prediction.marketProbabilityAtTime,
    aiProbability: prediction.aiProbability,
    confidenceScore: prediction.confidence,
    statement: predictionModerationService.formatProbabilityStatement(
      prediction.marketProbabilityAtTime,
      prediction.aiProbability
    ),
    reason: predictionModerationService.resolveDisplayReason(prediction),
    totalLikes: prediction.votes?.totalLikes || 0,
    totalDislikes: prediction.votes?.totalDislikes || 0,
    approvedAt: prediction.approvedAt,
    updatedAt: prediction.updatedAt
  });
});

/**
 * Get approved prediction for a market option
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
  
  logger.info(`Fetching approved prediction for market ${id}, option: ${option}, timeframe: ${timeframe}`);

  const prediction = await predictionModerationService.findLatestApprovedPrediction({
    marketId: id,
    option,
    timeframe,
    predictionType: 'option'
  });

  if (!prediction) {
    throw new CustomError('No approved prediction available for this market option yet', 404, 'PREDICTION_PENDING_REVIEW');
  }
  
  return success(res, {
    id: prediction._id,
    marketId: prediction.marketId,
    option: prediction.option,
    timeframe: prediction.timeframe,
    status: prediction.status,
    marketProbabilityAtTime: prediction.marketProbabilityAtTime,
    aiProbability: prediction.aiProbability,
    confidenceScore: prediction.confidence,
    statement: predictionModerationService.formatProbabilityStatement(
      prediction.marketProbabilityAtTime,
      prediction.aiProbability
    ),
    reason: predictionModerationService.resolveDisplayReason(prediction),
    totalLikes: prediction.votes?.totalLikes || 0,
    totalDislikes: prediction.votes?.totalDislikes || 0,
    approvedAt: prediction.approvedAt,
    updatedAt: prediction.updatedAt
  });
});

/**
 * Get approved predictions for all options in a market
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
  
  logger.info(`Fetching approved predictions for market ${id}, timeframe: ${timeframe}`);

  const predictions = await predictionModerationService.findApprovedPredictionsForMarket({
    marketId: id,
    timeframe
  });
  
  return success(res, {
    marketId: id,
    timeframe,
    predictions: predictions.map((prediction) => ({
      id: prediction._id,
      option: prediction.option,
      status: prediction.status,
      marketProbabilityAtTime: prediction.marketProbabilityAtTime,
      aiProbability: prediction.aiProbability,
      confidenceScore: prediction.confidence,
      statement: predictionModerationService.formatProbabilityStatement(
        prediction.marketProbabilityAtTime,
        prediction.aiProbability
      ),
      reason: predictionModerationService.resolveDisplayReason(prediction),
      totalLikes: prediction.votes?.totalLikes || 0,
      totalDislikes: prediction.votes?.totalDislikes || 0,
      approvedAt: prediction.approvedAt,
      updatedAt: prediction.updatedAt
    }))
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
  
  logger.info(`Fetching approved predictions for market ${id}`);

  const PredictionRecord = require('../models/PredictionRecord');

  const approvedPredictions = await PredictionRecord.find({
    marketId: id,
    status: 'approved'
  }).select('-__v').sort({ approvedAt: -1, updatedAt: -1 });
  
  return success(res, {
    marketId: id,
    count: approvedPredictions.length,
    predictions: approvedPredictions
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
    status: 'pending',
    message: 'Predictions generated and saved for admin review. Only approved predictions are publicly visible.',
    results
  });
});

/**
 * Get approved predictions feed
 * GET /api/predictions/approved
 */
const getApprovedPredictions = asyncHandler(async (req, res) => {
  const { marketId, limit = 50, offset = 0, timeframe, mode } = req.query;

  const result = await predictionModerationService.listPredictions({
    status: 'approved',
    marketId,
    timeframe,
    limit: Number(limit),
    offset: Number(offset),
    evaluationMode: mode
  });

  return success(res, {
    total: result.total,
    count: result.items.length,
    predictions: result.items.map((prediction) => ({
      id: prediction._id,
      marketId: prediction.marketId,
      marketTitle: prediction.marketTitle,
      option: prediction.option,
      timeframe: prediction.timeframe,
      status: prediction.status,
      marketProbabilityAtTime: prediction.marketProbabilityAtTime,
      aiProbability: prediction.aiProbability,
      confidenceScore: prediction.confidence,
      statement: predictionModerationService.formatProbabilityStatement(
        prediction.marketProbabilityAtTime,
        prediction.aiProbability
      ),
      reason: predictionModerationService.resolveDisplayReason(prediction),
      totalLikes: prediction.votes?.totalLikes || 0,
      totalDislikes: prediction.votes?.totalDislikes || 0,
      approvedAt: prediction.approvedAt,
      updatedAt: prediction.updatedAt
    }))
  });
});

/**
 * Cast a like/dislike vote for prediction
 * POST /api/predictions/:predictionId/vote
 */
const votePrediction = asyncHandler(async (req, res) => {
  const { predictionId } = req.params;
  const { voteType, deviceId } = req.body;

  if (!['like', 'dislike'].includes(voteType)) {
    throw new CustomError('voteType must be like or dislike', 400, 'INVALID_VOTE_TYPE');
  }

  const vote = await predictionModerationService.castVote({
    predictionId,
    voteType,
    deviceId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  if (!vote) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    predictionId: vote.predictionId,
    voteType: vote.voteType,
    totalLikes: vote.totalLikes,
    totalDislikes: vote.totalDislikes
  });
});

/**
 * Get votes for prediction
 * GET /api/predictions/:predictionId/votes
 */
const getPredictionVotes = asyncHandler(async (req, res) => {
  const { predictionId } = req.params;
  const PredictionRecord = require('../models/PredictionRecord');

  const prediction = await PredictionRecord.findById(predictionId).select('votes');
  if (!prediction) {
    throw new CustomError('Prediction not found', 404, 'PREDICTION_NOT_FOUND');
  }

  return success(res, {
    predictionId,
    totalLikes: prediction.votes?.totalLikes || 0,
    totalDislikes: prediction.votes?.totalDislikes || 0
  });
});

/**
 * Get frontend-friendly prediction performance for last month max
 * GET /api/predictions/performance
 */
const getPredictionPerformance = asyncHandler(async (req, res) => {
  const requestedDays = Number(req.query.days) || 30;
  const days = Math.min(30, Math.max(1, requestedDays));
  const evaluationMode = req.query.mode;

  logger.info(`Fetching prediction performance for last ${days} day(s), mode=${evaluationMode || 'all'}`);

  const performance = await predictionTrackingService.getPredictionPerformance(days, {
    evaluationMode
  });

  const readiness = await predictionTrackingService.getProductionReadiness({
    days,
    evaluationMode: evaluationMode || 'paper',
    minResolved: Number(req.query.minResolved) || undefined,
    minLowerBound: Number(req.query.minLowerBound) || undefined
  });

  return success(res, {
    performance,
    readiness
  });
});

module.exports = {
  getPrediction,
  getUnifiedPrediction,
  getAllPredictions,
  getFeatures,
  getCachedPredictions,
  batchPredict,
  getPredictionPerformance,
  getApprovedPredictions,
  votePrediction,
  getPredictionVotes
};
