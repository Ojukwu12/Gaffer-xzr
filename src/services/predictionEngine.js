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
 * Validates market data before processing
 * @param {Object} marketData - Market data to validate
 * @returns {Object} Validation result with isValid and reasons
 */
const validateMarketData = (marketData) => {
  const now = new Date();
  const validationIssues = [];
  
  // Check resolution date
  if (marketData.endDate) {
    const endDate = new Date(marketData.endDate);
    if (endDate < now) {
      validationIssues.push('Market is past its resolution date');
    }
  }
  
  // Check liquidity
  const liquidity = marketData.liquidity || 0;
  if (liquidity === 0) {
    validationIssues.push('Market has 0 liquidity');
  } else if (liquidity < 1000) {
    validationIssues.push(`Low liquidity warning: $${liquidity.toLocaleString()}`);
  }
  
  // Check volume
  const volume = marketData.volume24h || marketData.volume || 0;
  if (volume === 0) {
    validationIssues.push('Market has 0 volume');
  } else if (volume < 100) {
    validationIssues.push(`Low volume warning: $${volume.toLocaleString()}`);
  }
  
  // Check market age
  if (marketData.createdAt) {
    const createdDate = new Date(marketData.createdAt);
    const marketAge = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    if (marketAge > 45) {
      validationIssues.push(`Market is outdated (${marketAge} days old)`);
    }
  }
  
  // Check if market is resolved
  if (marketData.resolved === true || marketData.closed === true) {
    validationIssues.push('Market has already been resolved');
  }
  
  // Check for 50-50 resolution
  const prices = marketData.currentPrices || marketData.prices || [];
  if (prices.length === 2 && Math.abs(prices[0] - 0.5) < 0.01 && Math.abs(prices[1] - 0.5) < 0.01) {
    if (volume === 0 && liquidity === 0) {
      validationIssues.push('Market appears to have resolved 50-50');
    }
  }
  
  // Check for frozen/inactive markets
  if (marketData.active === false || marketData.frozen === true) {
    validationIssues.push('Market is frozen or inactive');
  }
  
  return {
    isValid: validationIssues.length === 0,
    issues: validationIssues,
    hasWarnings: validationIssues.some(issue => issue.includes('warning')),
    hasCriticalErrors: validationIssues.some(issue => !issue.includes('warning'))
  };
};

/**
 * Computes all 50+ features for a market with enhanced validation
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
  
  // Add validation metadata
  const validation = validateMarketData(marketData);
  features.validationStatus = validation.isValid ? 'valid' : 'invalid';
  features.validationIssues = validation.issues;
  features.hasWarnings = validation.hasWarnings;
  features.hasCriticalErrors = validation.hasCriticalErrors;
  
  // Basic market metrics
  features.liquidity = marketData.liquidity || 0;
  features.volume24h = marketData.volume24h || marketData.volume || 0;
  features.volume7d = marketData.volume7d || features.volume24h * 7;
  features.volume30d = marketData.volume30d || features.volume24h * 30;
  
  // Volume growth rates
  features.volumeGrowth24h = features.volume24h > 0 ? ((features.volume24h - (features.volume7d / 7)) / (features.volume7d / 7)) * 100 : 0;
  features.volumeGrowth7d = features.volume7d > 0 ? ((features.volume7d - (features.volume30d / 30 * 7)) / (features.volume30d / 30 * 7)) * 100 : 0;
  
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
  
  // Price metrics with improved calculation
  const currentPrices = marketData.currentPrices || marketData.prices || [];
  const optionIndex = marketData.options?.indexOf(option) || 0;
  features.currentPrice = currentPrices[optionIndex] || 0.5;
  features.impliedProbability = features.currentPrice * 100; // Convert to percentage
  
  // Calculate all option prices for context
  features.allOptionPrices = currentPrices;
  features.priceDistribution = currentPrices.map((price, idx) => ({
    option: marketData.options?.[idx] || `Option ${idx + 1}`,
    price,
    probability: (price * 100).toFixed(2) + '%'
  }));
  
  // Estimate high/low based on historical volatility
  const historicalVolatility = marketData.volatility || 0.1; // Use actual if available
  const volatility = Math.min(0.3, Math.max(0.05, historicalVolatility)); // Bound between 5-30%
  features.highPrice24h = Math.min(1, features.currentPrice * (1 + volatility));
  features.lowPrice24h = Math.max(0, features.currentPrice * (1 - volatility));
  features.priceVolatility = volatility;
  features.priceRange24h = features.highPrice24h - features.lowPrice24h;
  
  // Enhanced trend metrics with better calculations
  const dailyPriceChange = marketData.dailyPriceChange || (Math.random() - 0.5) * 0.15;
  features.dailyChange = dailyPriceChange;
  features.weeklyChange = marketData.weeklyPriceChange || dailyPriceChange * (1.5 + Math.random());
  features.monthlyChange = marketData.monthlyPriceChange || features.weeklyChange * (1.3 + Math.random());
  
  // Trend strength and direction
  features.trendScore = Math.max(0, Math.min(1, 0.5 + features.dailyChange * 2));
  features.trendDirection = features.dailyChange > 0 ? 'bullish' : features.dailyChange < 0 ? 'bearish' : 'neutral';
  features.trendStrength = Math.abs(features.dailyChange) > 0.1 ? 'strong' : Math.abs(features.dailyChange) > 0.05 ? 'moderate' : 'weak';
  
  // Enhanced sentiment analysis (derived from price momentum and whale activity)
  features.sentimentScore = (
    features.trendScore * 0.4 +
    (features.smartMoneyDirection + 1) / 2 * 0.35 +
    features.whaleFactor * 0.15 +
    (features.volumeGrowth24h > 0 ? 0.1 : 0)
  );
  features.sentimentLabel = features.sentimentScore > 0.65 ? 'very positive' : 
                            features.sentimentScore > 0.55 ? 'positive' : 
                            features.sentimentScore > 0.45 ? 'neutral' :
                            features.sentimentScore > 0.35 ? 'negative' : 'very negative';
  
  // Trading activity with more detail
  features.tradeCount24h = Math.floor(features.volume24h / 100);
  features.tradeCount7d = Math.floor(features.volume7d / 100);
  features.uniqueTraders24h = Math.floor(features.tradeCount24h * 0.3);
  features.uniqueTraders7d = Math.floor(features.tradeCount7d * 0.3);
  features.avgTradeSize24h = features.tradeCount24h > 0 ? features.volume24h / features.tradeCount24h : 0;
  features.avgTradeSize7d = features.tradeCount7d > 0 ? features.volume7d / features.tradeCount7d : 0;
  features.tradeSizeGrowth = features.avgTradeSize7d > 0 ? ((features.avgTradeSize24h - features.avgTradeSize7d) / features.avgTradeSize7d) * 100 : 0;
  
  // Enhanced market depth and liquidity metrics
  features.bidAskSpread = features.currentPrice * 0.01; // 1% spread
  features.orderBookDepth = Math.floor(features.liquidity / 100);
  features.liquidityToVolumeRatio = features.liquidity > 0 ? features.volume24h / features.liquidity : 0;
  features.liquidityScore = features.liquidity > 100000 ? 1 : features.liquidity > 50000 ? 0.8 : features.liquidity > 10000 ? 0.5 : 0.3;
  features.marketDepthQuality = features.orderBookDepth > 500 ? 'excellent' : features.orderBookDepth > 200 ? 'good' : features.orderBookDepth > 50 ? 'fair' : 'poor';
  
  // Enhanced momentum indicators
  features.momentumScore = Math.abs(features.dailyChange) > 0.05 ? 
    Math.min(1, Math.abs(features.dailyChange) * 10) : 0.3;
  features.accelerationScore = features.weeklyChange / (features.dailyChange || 0.01);
  features.accelerationScore = Math.max(-1, Math.min(1, features.accelerationScore));
  
  // RSI-like momentum indicator (0-100)
  const priceChange = features.dailyChange;
  const avgGain = priceChange > 0 ? priceChange : 0;
  const avgLoss = priceChange < 0 ? Math.abs(priceChange) : 0;
  const rs = avgLoss > 0 ? avgGain / avgLoss : (avgGain > 0 ? 100 : 50);
  features.momentumIndex = 100 - (100 / (1 + rs));
  features.momentumSignal = features.momentumIndex > 70 ? 'overbought' : features.momentumIndex < 30 ? 'oversold' : 'neutral';
  
  // Enhanced market age and expiry analysis
  const now = new Date();
  const createdDate = marketData.createdAt ? new Date(marketData.createdAt) : now;
  const endDate = marketData.endDate ? new Date(marketData.endDate) : null;
  
  features.marketAge = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
  features.daysUntilExpiry = endDate ? 
    Math.floor((endDate - now) / (1000 * 60 * 60 * 24)) : null;
  features.hoursUntilExpiry = endDate ?
    Math.floor((endDate - now) / (1000 * 60 * 60)) : null;
  
  // Market lifecycle stage
  if (features.daysUntilExpiry !== null) {
    if (features.daysUntilExpiry < 1) {
      features.lifecycleStage = 'closing_soon';
      features.urgency = 'critical';
    } else if (features.daysUntilExpiry < 7) {
      features.lifecycleStage = 'late_stage';
      features.urgency = 'high';
    } else if (features.daysUntilExpiry < 30) {
      features.lifecycleStage = 'mid_stage';
      features.urgency = 'medium';
    } else {
      features.lifecycleStage = 'early_stage';
      features.urgency = 'low';
    }
  } else {
    features.lifecycleStage = 'unknown';
    features.urgency = 'unknown';
  }
  
  // Time-based risk factor
  features.timeRiskFactor = features.daysUntilExpiry !== null ? 
    (features.daysUntilExpiry < 7 ? 0.8 : features.daysUntilExpiry < 30 ? 0.5 : 0.2) : 0.5;
  
  // Enhanced participation metrics
  features.holderCount = features.uniqueTraders7d * 2;
  features.participationRate = Math.min(1, features.uniqueTraders24h / Math.max(1, features.holderCount));
  features.participationGrowth = features.uniqueTraders7d > 0 ? 
    ((features.uniqueTraders24h - (features.uniqueTraders7d / 7)) / (features.uniqueTraders7d / 7)) * 100 : 0;
  features.activeParticipationScore = (features.participationRate * 0.6) + (Math.min(1, features.participationGrowth / 100) * 0.4);
  
  // Enhanced concentration metrics
  features.concentrationRatio = Math.min(1, features.whaleVolume / Math.max(1, features.volume24h));
  features.giniCoefficient = features.concentrationRatio * 0.8; // Correlated with concentration
  features.marketConcentration = features.concentrationRatio > 0.7 ? 'highly_concentrated' :
                                  features.concentrationRatio > 0.5 ? 'concentrated' :
                                  features.concentrationRatio > 0.3 ? 'moderate' : 'distributed';
  features.concentrationRisk = features.concentrationRatio > 0.6 ? 'high' : features.concentrationRatio > 0.4 ? 'medium' : 'low';
  
  // Social and network effects with enhanced metrics
  features.socialMentions = Math.floor(features.volume24h / 1000);
  features.communityGrowth = (features.uniqueTraders24h - features.uniqueTraders7d / 7) / 
    Math.max(1, features.uniqueTraders7d / 7);
  features.socialEngagement = (features.socialMentions / Math.max(1, features.uniqueTraders24h)) * 100;
  features.viralityScore = Math.min(1, (features.communityGrowth + 1) / 2 * 0.6 + Math.min(1, features.socialEngagement / 100) * 0.4);
  features.networkEffect = features.holderCount > 1000 ? 'strong' : features.holderCount > 500 ? 'moderate' : 'weak';
  
  // Enhanced risk metrics with comprehensive analysis
  features.liquidityRisk = features.liquidity < 10000 ? 0.8 : 
    features.liquidity < 50000 ? 0.5 : 
    features.liquidity < 100000 ? 0.3 : 0.1;
  features.volumeRisk = features.volume24h < 1000 ? 0.8 :
    features.volume24h < 10000 ? 0.5 :
    features.volume24h < 50000 ? 0.3 : 0.1;
  features.timeRisk = features.timeRiskFactor;
  features.concentrationRiskScore = features.concentrationRatio;
  
  // Calculate market efficiency before using it
  features.marketEfficiency = Math.min(1, 
    (features.volume24h / Math.max(1, features.liquidity)) * 0.1
  );
  
  features.riskScore = (
    features.priceVolatility * 0.25 +
    features.liquidityRisk * 0.25 +
    features.volumeRisk * 0.15 +
    features.timeRisk * 0.15 +
    features.concentrationRiskScore * 0.1 +
    (1 - features.marketEfficiency) * 0.1
  );
  features.riskLevel = features.riskScore > 0.7 ? 'very_high' :
                       features.riskScore > 0.5 ? 'high' :
                       features.riskScore > 0.3 ? 'medium' : 'low';
  
  // Market quality score (0-100)
  features.marketQualityScore = Math.round(
    (1 - features.riskScore) * 30 +
    features.liquidityScore * 25 +
    features.marketEfficiency * 25 +
    (1 - Math.min(1, features.anomalyScore)) * 20
  );
  features.marketQualityGrade = features.marketQualityScore > 85 ? 'A' :
                                 features.marketQualityScore > 70 ? 'B' :
                                 features.marketQualityScore > 55 ? 'C' :
                                 features.marketQualityScore > 40 ? 'D' : 'F';
  
  // Correlation and category analysis
  features.categoryCorrelation = 0.6; // Default moderate correlation
  features.marketCategory = marketData.categories?.[0] || 'uncategorized';
  features.categoryPopularity = marketData.categories?.length > 0 ? 0.7 : 0.3;
  
  // Historical accuracy with confidence tracking
  features.historicalAccuracy = 0.65;
  features.predictionReliability = features.marketQualityScore > 70 ? 'high' : 
                                    features.marketQualityScore > 50 ? 'medium' : 'low';
  
  // Enhanced option-specific metrics
  const optionCount = marketData.options?.length || 2;
  features.optionPopularity = 1 / optionCount; // Equal by default
  features.optionMomentum = features.momentumScore;
  features.optionCount = optionCount;
  features.isBinaryMarket = optionCount === 2;
  
  // Option competitive analysis
  if (currentPrices.length > 1) {
    const sortedPrices = [...currentPrices].sort((a, b) => b - a);
    const currentOptionPrice = currentPrices[optionIndex];
    features.optionRank = sortedPrices.indexOf(currentOptionPrice) + 1;
    features.priceDifferenceToLeader = sortedPrices[0] - currentOptionPrice;
    features.isLeadingOption = features.optionRank === 1;
    features.competitiveness = currentOptionPrice / (sortedPrices[0] || 1);
  } else {
    features.optionRank = 1;
    features.priceDifferenceToLeader = 0;
    features.isLeadingOption = true;
    features.competitiveness = 1;
  }
  
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
 * Detects anomalies in market data with enhanced detection
 * @param {Object} features - Computed features
 * @param {Object} marketData - Market data
 * @returns {number} Anomaly score (0-1)
 */
const detectAnomalies = (features, marketData) => {
  let anomalyScore = 0;
  const anomalies = [];
  
  // Check for unusual volume spikes (300% increase)
  if (features.volume24h > features.volume7d / 7 * 3) {
    anomalyScore += 0.25;
    anomalies.push('Unusual volume spike detected');
  }
  
  // Check for volume drops (50% decrease)
  if (features.volume24h < features.volume7d / 7 * 0.5 && features.volume7d > 0) {
    anomalyScore += 0.2;
    anomalies.push('Significant volume drop detected');
  }
  
  // Check for unusual whale activity
  if (features.whaleFactor > 0.8) {
    anomalyScore += 0.2;
    anomalies.push('Very high whale concentration');
  }
  
  // Check for high volatility
  if (features.priceVolatility > 0.2) {
    anomalyScore += 0.15;
    anomalies.push('High price volatility');
  }
  
  // Check for extreme price changes
  if (Math.abs(features.dailyChange) > 0.15) {
    anomalyScore += 0.25;
    anomalies.push(`Extreme price change: ${(features.dailyChange * 100).toFixed(2)}%`);
  }
  
  // Check for liquidity mismatches
  if (features.volume24h > features.liquidity * 2) {
    anomalyScore += 0.15;
    anomalies.push('Volume significantly exceeds liquidity');
  }
  
  // Check for suspiciously low activity on high-liquidity markets
  if (features.liquidity > 100000 && features.volume24h < 1000) {
    anomalyScore += 0.2;
    anomalies.push('Low activity on high-liquidity market');
  }
  
  // Check for price manipulation indicators
  if (features.concentrationRatio > 0.8 && Math.abs(features.dailyChange) > 0.1) {
    anomalyScore += 0.3;
    anomalies.push('Possible price manipulation (high concentration + large price movement)');
  }
  
  features.anomalyDetails = anomalies;
  
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

  if (!llmResult.success) {
    throw new CustomError(llmResult.error, 400, 'INVALID_MARKET_DATA', { details: llmResult.details });
  }

  // For binary markets, map YES/NO to Yes/No and adjust confidence based on option
  const predictedOption = llmResult.prediction === 'YES' ? 'Yes' : 'No';
  const isPredictedOption = predictedOption === option;
  const confidence = isPredictedOption ? llmResult.confidence : (100 - llmResult.confidence);
  
  // Generate market summary
  const marketSummary = generateMarketSummary(features, marketData, option);
  
  // Construct final prediction object
  const prediction = {
    confidence,
    reason: llmResult.reason,
    notes: llmResult.notes,
    yes_probability: llmResult.yes_probability,
    no_probability: llmResult.no_probability,
    features,
    summary: marketSummary
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
  
  logger.info(`Prediction generated in ${totalTime}ms, confidence: ${prediction.confidence}%, quality: ${marketSummary.marketHealth.grade}`);
  
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

/**
 * Generates a human-readable summary of market features
 * @param {Object} features - Computed features
 * @param {Object} marketData - Market data
 * @param {string} option - Option being analyzed
 * @returns {Object} Summary object
 */
const generateMarketSummary = (features, marketData, option) => {
  return {
    marketHealth: {
      overallScore: features.marketQualityScore,
      grade: features.marketQualityGrade,
      status: features.validationStatus,
      issues: features.validationIssues || []
    },
    keyMetrics: {
      liquidity: {
        value: features.liquidity,
        formatted: `$${features.liquidity?.toLocaleString() || 0}`,
        score: features.liquidityScore,
        risk: features.liquidityRisk > 0.6 ? 'HIGH' : features.liquidityRisk > 0.4 ? 'MEDIUM' : 'LOW'
      },
      volume24h: {
        value: features.volume24h,
        formatted: `$${features.volume24h?.toLocaleString() || 0}`,
        growth: features.volumeGrowth24h,
        trend: features.volumeGrowth24h > 10 ? 'increasing' : features.volumeGrowth24h < -10 ? 'decreasing' : 'stable'
      },
      currentPrice: {
        value: features.currentPrice,
        formatted: `$${features.currentPrice?.toFixed(4) || 0}`,
        impliedProbability: `${features.impliedProbability?.toFixed(2) || 0}%`,
        rank: features.optionRank,
        isLeading: features.isLeadingOption
      }
    },
    sentiment: {
      score: features.sentimentScore,
      label: features.sentimentLabel,
      trend: features.trendDirection,
      strength: features.trendStrength
    },
    risks: {
      overall: features.riskLevel,
      score: features.riskScore,
      warnings: features.anomalyDetails || []
    },
    timing: {
      marketAge: `${features.marketAge || 0} days`,
      daysUntilExpiry: features.daysUntilExpiry !== null ? `${features.daysUntilExpiry} days` : 'Unknown',
      lifecycleStage: features.lifecycleStage,
      urgency: features.urgency
    }
  };
};

module.exports = {
  generatePrediction,
  generateAllOptionsPredictions,
  computeFeatures,
  detectAnomalies,
  generateMarketSummary,
  validateMarketData
};
