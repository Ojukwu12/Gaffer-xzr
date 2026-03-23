/**
 * Market Controller
 * Handles market-related HTTP requests
 * @module controllers/marketController
 */

const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');
const polymarketService = require('../services/polymarketService');
const timeframeService = require('../services/timeframeService');
const cacheService = require('../services/cacheService');
const predictionModerationService = require('../services/predictionModerationService');
const logger = require('../config/logger');

/**
 * Filters out expired markets
 * @param {Array} markets - Array of market objects
 * @returns {Array} Filtered markets with non-expired only
 */
const filterExpiredMarkets = (markets) => {
  const now = new Date();
  return markets.filter(market => {
    if (!market.endDate) {
      return true; // Keep markets without end date
    }
    const endDate = new Date(market.endDate);
    return endDate > now; // Only keep markets that haven't expired
  });
};

/**
 * Get all markets
 * GET /api/markets
 */
const getMarkets = asyncHandler(async (req, res) => {
  const { category, timeframe, status, limit = 50, offset = 0 } = req.query;
  
  logger.info('Fetching markets', { category, timeframe, status, limit, offset });
  
  // Check cache first
  const cacheKey = `all:${category || 'all'}:${timeframe || 'all'}:${status || 'all'}:${limit}:${offset}`;
  const cached = cacheService.getCachedMarketList(cacheKey);
  
  if (cached) {
    logger.info('Returning cached market list');
    return success(res, cached, 'Markets retrieved from cache');
  }
  
  // Fetch markets from Polymarket
  const filters = {
    ...(category && { category }),
    ...(status && { closed: status === 'closed' })
  };
  
  let markets = await polymarketService.fetchMarkets(filters);
  
  // Parse markets
  markets = markets.map(m => polymarketService.parseMarket(m));
  
  // Filter out expired markets
  markets = filterExpiredMarkets(markets);
  
  // Filter by timeframe if specified
  if (timeframe && timeframeService.isValidTimeframe(timeframe)) {
    markets = timeframeService.filterMarketsByTimeframe(markets, timeframe);
  }
  
  // Apply pagination
  const total = markets.length;
  markets = markets.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  // Enrich with timeframe information
  markets = markets.map(m => ({
    ...m,
    availableTimeframes: timeframeService.getAvailableTimeframes(m),
    optimalTimeframe: timeframeService.getOptimalTimeframe(m)
  }));
  
  // Cache the result
  cacheService.cacheMarketList(cacheKey, markets, 300);
  
  return success(res, {
    markets,
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total
    }
  });
});

/**
 * Get single market by ID
 * GET /api/markets/:id
 */
const getMarketById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.info(`Fetching market: ${id}`);
  
  // Check cache first
  let marketData = cacheService.getCachedMarket(id);
  
  if (!marketData) {
    // Fetch from Polymarket
    const rawMarket = await polymarketService.fetchMarketById(id);
    marketData = polymarketService.parseMarket(rawMarket);
    
    // Cache it
    cacheService.cacheMarket(id, marketData, 600);
  }
  
  // Enrich with timeframe data
  const enrichedMarket = timeframeService.enrichMarketWithTimeframes(marketData);
  
  // Include only approved predictions for public responses.
  const predictions = {};
  const PredictionRecord = require('../models/PredictionRecord');
  const approvedPredictions = await PredictionRecord.find({
    marketId: id,
    status: 'approved'
  }).sort({ approvedAt: -1, updatedAt: -1 });

  for (const approved of approvedPredictions) {
    if (!predictions[approved.option]) predictions[approved.option] = {};
    if (!predictions[approved.option][approved.timeframe]) {
      predictions[approved.option][approved.timeframe] = {
        confidenceScore: approved.confidence,
        marketProbabilityAtTime: approved.marketProbabilityAtTime,
        aiProbability: approved.aiProbability,
        statement: predictionModerationService.formatProbabilityStatement(
          approved.marketProbabilityAtTime,
          approved.aiProbability
        ),
        reason: predictionModerationService.resolveDisplayReason(approved),
        status: approved.status,
        approvedAt: approved.approvedAt
      };
    }
  }
  
  return success(res, {
    ...enrichedMarket,
    cachedPredictions: predictions
  });
});

/**
 * Search markets
 * GET /api/markets/search
 */
const searchMarkets = asyncHandler(async (req, res) => {
  const { q, limit = 20 } = req.query;
  
  if (!q || q.trim().length < 2) {
    throw new CustomError('Search query must be at least 2 characters', 400, 'INVALID_QUERY');
  }
  
  logger.info(`Searching markets: ${q}`);
  
  let markets = await polymarketService.searchMarkets(q);
  
  // Parse, filter expired, and limit results
  markets = markets
    .map(m => polymarketService.parseMarket(m))
    .filter(m => filterExpiredMarkets([m]).length > 0)
    .slice(0, parseInt(limit));
  
  return success(res, { markets, query: q });
});

/**
 * Get markets by category
 * GET /api/markets/category/:category
 */
const getMarketsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { limit = 50 } = req.query;
  
  logger.info(`Fetching markets for category: ${category}`);
  
  // Check cache
  const cacheKey = `category:${category}:${limit}`;
  const cached = cacheService.getCachedMarketList(cacheKey);
  
  if (cached) {
    return success(res, cached);
  }
  
  let markets = await polymarketService.fetchMarketsByCategory(category);
  
  markets = markets
    .map(m => polymarketService.parseMarket(m))
    .filter(m => filterExpiredMarkets([m]).length > 0)
    .slice(0, parseInt(limit));
  
  // Cache result
  cacheService.cacheMarketList(cacheKey, markets, 300);
  
  return success(res, { markets, category });
});

/**
 * Get trending markets
 * GET /api/markets/trending
 */
const getTrendingMarkets = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  logger.info('Fetching trending markets');
  
  // Check cache
  const cached = cacheService.getCachedMarketList('trending');
  
  if (cached) {
    return success(res, cached);
  }
  try {
    // Primary: use Polymarket trending endpoint
    let markets = await polymarketService.fetchTrendingMarkets(parseInt(limit) * 2); // Fetch extra to account for filtering
    
    markets = markets
      .map(m => polymarketService.parseMarket(m))
      .filter(m => filterExpiredMarkets([m]).length > 0)
      .slice(0, parseInt(limit));
    
    // Cache result
    cacheService.cacheMarketList('trending', markets, 180); // 3 minutes
    
    return success(res, { markets });
  } catch (err) {
    // Fallback: compute trending from active markets without requiring API key
    logger.warn('Trending endpoint failed, falling back to computed trending', { error: err.message });
    
    let markets = await polymarketService.fetchMarkets({ closed: false, active: true });
    
    markets = markets
      .map(m => polymarketService.parseMarket(m))
      .filter(m => filterExpiredMarkets([m]).length > 0);
    
    // Sort by 24h volume (desc), then liquidity (desc) as secondary signal
    markets.sort((a, b) => {
      const vA = Number(a.volume24h || 0);
      const vB = Number(b.volume24h || 0);
      if (vB !== vA) return vB - vA;
      const lA = Number(a.liquidity || 0);
      const lB = Number(b.liquidity || 0);
      return lB - lA;
    });
    
    markets = markets.slice(0, parseInt(limit));
    
    cacheService.cacheMarketList('trending', markets, 180);
    return success(res, { markets, fallback: true });
  }
});

module.exports = {
  getMarkets,
  getMarketById,
  searchMarkets,
  getMarketsByCategory,
  getTrendingMarkets
};
