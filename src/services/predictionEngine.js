/**
 * Prediction Engine Service
 * Core prediction logic that computes all features and generates predictions
 * @module services/predictionEngine
 */

const logger = require('../config/logger');
const CustomError = require('../utils/CustomError');
const polymarketService = require('./polymarketService');
const llmService = require('./llmService');
const whaleFactorService = require('./whaleFactorService');
const timeframeService = require('./timeframeService');
const cacheService = require('./cacheService');

/**
 * Computes all 40+ features for a market
 * @param {Object} marketData - Market data
 * @param {string} option - Option being analyzed
 * @param {string} timeframe - Prediction timeframe
 * @returns {Promise<Object>} Computed features
 */
const computeFeatures = async (marketData, option, timeframe) => {
  logger.info(`Computing features for market ${marketData.marketId}, option: ${option}`);
  
  const startTime = Date.now();
  
  // Initialize features object
  const features = {};
  
  // Basic market metrics
  features.liquidity = marketData.liquidity || 0;
  features.volume24h = marketData.volume24h || marketData.volume || 0;
  features.volume7d = marketData.volume7d || features.volume24h * 7;
  features.volume30d = marketData.volume30d || features.volume24h * 30;
  
  // Fetch whale metrics (with caching)
  const cachedWhale = cacheService.getCachedWhaleFactor(marketData.marketId);
  let whaleMetrics;
  
  if (cachedWhale) {
    whaleMetrics = cachedWhale;
    logger.debug('Using cached whale metrics');
  } else {
    whaleMetrics = await whaleFactorService.calculateWhaleFactor(
      marketData.marketId, 
      marketData
    ).catch(err => {
      logger.warn(`Failed to calculate whale factor: ${err.message}`);
      return whaleFactorService.getDefaultWhaleMetrics();
    });
    
    // Cache whale metrics
    cacheService.cacheWhaleFactor(marketData.marketId, whaleMetrics, 600);
  }
  
  features.whaleFactor = whaleMetrics.whaleFactor;
  features.whaleCount = whaleMetrics.whaleCount;
  features.whaleVolume = whaleMetrics.whaleVolume;
  features.smartMoneyFlow = whaleMetrics.smartMoneyFlow;
  features.smartMoneyDirection = whaleMetrics.smartMoneyDirection;
  
  // Price metrics
  const currentPrices = marketData.currentPrices || marketData.prices || [];
  const optionIndex = marketData.options?.indexOf(option) || 0;
  features.currentPrice = currentPrices[optionIndex] || 0.5;
  
  // Estimate high/low based on volatility
  const volatility = 0.1; // Default 10% volatility
  features.highPrice24h = features.currentPrice * (1 + volatility);
  features.lowPrice24h = features.currentPrice * (1 - volatility);
  features.priceVolatility = volatility;
  
  // Trend metrics (simplified - in production would use historical data)
  features.dailyChange = (Math.random() - 0.5) * 0.2; // -10% to +10%
  features.weeklyChange = features.dailyChange * (1 + Math.random());
  features.monthlyChange = features.weeklyChange * (1 + Math.random());
  features.trendScore = Math.max(0, Math.min(1, 0.5 + features.dailyChange * 2));
  
  // Sentiment (derived from price momentum and whale activity)
  features.sentimentScore = (
    features.trendScore * 0.5 +
    (features.smartMoneyDirection + 1) / 2 * 0.3 +
    features.whaleFactor * 0.2
  );
  
  // Trading activity (estimated based on volume)
  features.tradeCount24h = Math.floor(features.volume24h / 100);
  features.tradeCount7d = Math.floor(features.volume7d / 100);
  features.uniqueTraders24h = Math.floor(features.tradeCount24h * 0.3);
  features.uniqueTraders7d = Math.floor(features.tradeCount7d * 0.3);
  
  // Market depth
  features.bidAskSpread = features.currentPrice * 0.01; // 1% spread
  features.orderBookDepth = Math.floor(features.liquidity / 100);
  
  // Momentum indicators
  features.momentumScore = Math.abs(features.dailyChange) > 0.05 ? 
    Math.min(1, Math.abs(features.dailyChange) * 10) : 0.3;
  features.accelerationScore = features.weeklyChange / (features.dailyChange || 0.01);
  features.accelerationScore = Math.max(-1, Math.min(1, features.accelerationScore));
  
  // Market age and expiry
  const now = new Date();
  const createdDate = marketData.createdAt ? new Date(marketData.createdAt) : now;
  const endDate = marketData.endDate ? new Date(marketData.endDate) : null;
  
  features.marketAge = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
  features.daysUntilExpiry = endDate ? 
    Math.floor((endDate - now) / (1000 * 60 * 60 * 24)) : null;
  
  // Participation metrics
  features.holderCount = features.uniqueTraders7d * 2;
  features.participationRate = Math.min(1, features.uniqueTraders24h / Math.max(1, features.holderCount));
  
  // Concentration metrics
  features.concentrationRatio = Math.min(1, features.whaleVolume / Math.max(1, features.volume24h));
  features.giniCoefficient = features.concentrationRatio * 0.8; // Correlated with concentration
  
  // Social and network effects (simplified)
  features.socialMentions = Math.floor(features.volume24h / 1000);
  features.communityGrowth = (features.uniqueTraders24h - features.uniqueTraders7d / 7) / 
    Math.max(1, features.uniqueTraders7d / 7);
  
  // Risk metrics
  features.liquidityRisk = features.liquidity < 10000 ? 0.8 : 
    features.liquidity < 50000 ? 0.5 : 0.2;
  features.riskScore = (
    features.priceVolatility * 0.4 +
    features.liquidityRisk * 0.3 +
    (1 - features.marketEfficiency) * 0.3
  );
  
  // Efficiency
  features.marketEfficiency = Math.min(1, 
    (features.volume24h / Math.max(1, features.liquidity)) * 0.1
  );
  
  // Correlation (simplified)
  features.categoryCorrelation = 0.6; // Default moderate correlation
  
  // Historical accuracy (placeholder)
  features.historicalAccuracy = 0.65;
  
  // Option-specific metrics
  const optionCount = marketData.options?.length || 2;
  features.optionPopularity = 1 / optionCount; // Equal by default
  features.optionMomentum = features.momentumScore;
  
  // Anomaly detection
  features.anomalyScore = detectAnomalies(features, marketData);
  
  // Timeframe-specific features
  const timeframeFeatures = timeframeService.calculateTimeframeFeatures(marketData, timeframe);
  Object.assign(features, timeframeFeatures);
  
  const computationTime = Date.now() - startTime;
  logger.info(`Features computed in ${computationTime}ms`);
  
  return features;
};

/**
 * Detects anomalies in market data
 * @param {Object} features - Computed features
 * @param {Object} marketData - Market data
 * @returns {number} Anomaly score (0-1)
 */
const detectAnomalies = (features, marketData) => {
  let anomalyScore = 0;
  
  // Check for unusual volume spikes
  if (features.volume24h > features.volume7d / 7 * 3) {
    anomalyScore += 0.3;
  }
  
  // Check for unusual whale activity
  if (features.whaleFactor > 0.8) {
    anomalyScore += 0.2;
  }
  
  // Check for high volatility
  if (features.priceVolatility > 0.2) {
    anomalyScore += 0.2;
  }
  
  // Check for extreme price changes
  if (Math.abs(features.dailyChange) > 0.15) {
    anomalyScore += 0.3;
  }
  
  return Math.min(1, anomalyScore);
};

/**
 * Generates a prediction for a market option
 * @param {string} marketId - Market ID
 * @param {string} option - Option to predict
 * @param {string} timeframe - Prediction timeframe
 * @returns {Promise<Object>} Prediction result
 */
const generatePrediction = async (marketId, option, timeframe = 'daily') => {
  logger.info(`Generating prediction for ${marketId}, option: ${option}, timeframe: ${timeframe}`);
  
  const overallStart = Date.now();
  
  // Validate timeframe
  if (!timeframeService.isValidTimeframe(timeframe)) {
    throw new CustomError(
      `Invalid timeframe: ${timeframe}`,
      400,
      'INVALID_TIMEFRAME'
    );
  }
  
  // Check cache first
  const cached = await cacheService.getPrediction(marketId, option, timeframe);
  if (cached) {
    logger.info('Returning cached prediction');
    return {
      ...cached,
      fromCache: true,
      marketId,
      option,
      timeframe
    };
  }
  
  // Fetch market data
  let marketData = cacheService.getCachedMarket(marketId);
  
  if (!marketData) {
    marketData = await polymarketService.fetchMarketById(marketId);
    marketData = polymarketService.parseMarket(marketData);
    cacheService.cacheMarket(marketId, marketData, 300);
  }
  
  // Validate option
  if (marketData.options && !marketData.options.includes(option)) {
    throw new CustomError(
      `Invalid option: ${option}. Available options: ${marketData.options.join(', ')}`,
      400,
      'INVALID_OPTION'
    );
  }
  
  // Check timeframe availability
  const availableTimeframes = timeframeService.getAvailableTimeframes(marketData);
  if (!availableTimeframes.includes(timeframe)) {
    throw new CustomError(
      `Timeframe ${timeframe} not available for this market. Available: ${availableTimeframes.join(', ')}`,
      400,
      'TIMEFRAME_NOT_AVAILABLE'
    );
  }
  
  // Compute all features
  const features = await computeFeatures(marketData, option, timeframe);
  
  // Generate LLM prediction
  const llmResult = await llmService.generatePrediction(
    marketData,
    option,
    features,
    timeframe
  );
  
  // Construct final prediction object
  const prediction = {
    confidence: llmResult.confidence,
    reason: llmResult.reason,
    features
  };
  
  const totalTime = Date.now() - overallStart;
  
  // Cache the prediction
  await cacheService.setPrediction(
    marketId,
    marketData.title,
    option,
    timeframe,
    prediction,
    300, // 5 minute TTL
    totalTime
  );
  
  logger.info(`Prediction generated in ${totalTime}ms, confidence: ${prediction.confidence}%`);
  
  return {
    ...prediction,
    marketId,
    option,
    timeframe,
    timestamp: new Date().toISOString(),
    fromCache: false,
    computationTime: totalTime
  };
};

/**
 * Generates predictions for all options in a market
 * @param {string} marketId - Market ID
 * @param {string} timeframe - Prediction timeframe
 * @returns {Promise<Array>} Array of predictions
 */
const generateAllOptionsPredictions = async (marketId, timeframe = 'daily') => {
  logger.info(`Generating predictions for all options in market: ${marketId}`);
  
  // Fetch market data
  const marketData = await polymarketService.fetchMarketById(marketId);
  const parsedMarket = polymarketService.parseMarket(marketData);
  
  const options = parsedMarket.options || ['Yes', 'No'];
  
  // Generate predictions for each option
  const predictions = await Promise.all(
    options.map(option => 
      generatePrediction(marketId, option, timeframe).catch(err => {
        logger.error(`Failed to generate prediction for option ${option}: ${err.message}`);
        return null;
      })
    )
  );
  
  return predictions.filter(p => p !== null);
};

module.exports = {
  generatePrediction,
  generateAllOptionsPredictions,
  computeFeatures,
  detectAnomalies
};
