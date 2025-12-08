/**
 * Polymarket Service
 * Handles all interactions with Polymarket API
 * @module services/polymarketService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

/**
 * Polymarket API base URL (configurable via env)
 */
const POLYMARKET_API_BASE = config.polymarketApiBase || 'https://gamma-api.polymarket.com';

/**
 * Axios instance for Polymarket API
 */
const polymarketClient = axios.create({
  baseURL: POLYMARKET_API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.polymarketApiKey && { 'Authorization': `Bearer ${config.polymarketApiKey}` })
  }
});

/**
 * Fetches all active markets from Polymarket
 * @param {Object} filters - Optional filters (category, status, etc.)
 * @returns {Promise<Array>} Array of market objects
 */
const fetchMarkets = async (filters = {}) => {
  logger.info('Fetching markets from Polymarket', { filters });
  
  const response = await polymarketClient.get('/markets', {
    params: {
      closed: false,
      active: true,
      ...filters
    }
  });
  
  logger.info(`Fetched ${response.data.length || 0} markets`);
  return response.data;
};

/**
 * Fetches a specific market by ID
 * @param {string} marketId - Market ID (condition_id)
 * @returns {Promise<Object>} Market object
 */
const fetchMarketById = async (marketId) => {
  logger.info(`Fetching market: ${marketId}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}`);
  
  if (!response.data) {
    throw new CustomError('Market not found', 404, 'MARKET_NOT_FOUND');
  }
  
  return response.data;
};

/**
 * Fetches market events/trades
 * @param {string} marketId - Market ID
 * @param {Object} options - Options (limit, offset, etc.)
 * @returns {Promise<Array>} Array of trade events
 */
const fetchMarketTrades = async (marketId, options = {}) => {
  logger.info(`Fetching trades for market: ${marketId}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}/trades`, {
    params: {
      limit: options.limit || 100,
      offset: options.offset || 0
    }
  });
  
  return response.data || [];
};

/**
 * Fetches market order book
 * @param {string} marketId - Market ID
 * @returns {Promise<Object>} Order book data
 */
const fetchOrderBook = async (marketId) => {
  logger.info(`Fetching order book for market: ${marketId}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}/book`);
  
  return response.data || { bids: [], asks: [] };
};

/**
 * Fetches market price history
 * @param {string} marketId - Market ID
 * @param {string} timeframe - Timeframe (1d, 7d, 30d)
 * @returns {Promise<Array>} Price history data
 */
const fetchPriceHistory = async (marketId, timeframe = '7d') => {
  logger.info(`Fetching price history for market: ${marketId}, timeframe: ${timeframe}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}/prices`, {
    params: { interval: timeframe }
  });
  
  return response.data || [];
};

/**
 * Fetches volume statistics for a market
 * @param {string} marketId - Market ID
 * @returns {Promise<Object>} Volume statistics
 */
const fetchVolumeStats = async (marketId) => {
  logger.info(`Fetching volume stats for market: ${marketId}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}/volume`);
  
  return response.data || {
    volume24h: 0,
    volume7d: 0,
    volume30d: 0
  };
};

/**
 * Fetches top traders for a market
 * @param {string} marketId - Market ID
 * @param {number} limit - Number of traders to fetch
 * @returns {Promise<Array>} Array of trader data
 */
const fetchTopTraders = async (marketId, limit = 20) => {
  logger.info(`Fetching top traders for market: ${marketId}`);
  
  const response = await polymarketClient.get(`/markets/${marketId}/traders`, {
    params: { limit }
  });
  
  return response.data || [];
};

/**
 * Fetches trader profile and history
 * @param {string} address - Trader wallet address
 * @returns {Promise<Object>} Trader profile
 */
const fetchTraderProfile = async (address) => {
  logger.info(`Fetching trader profile: ${address}`);
  
  const response = await polymarketClient.get(`/traders/${address}`);
  
  return response.data || null;
};

/**
 * Fetches trending markets
 * @param {number} limit - Number of markets to fetch
 * @returns {Promise<Array>} Array of trending markets
 */
const fetchTrendingMarkets = async (limit = 10) => {
  logger.info('Fetching trending markets');
  
  const response = await polymarketClient.get('/markets/trending', {
    params: { limit }
  });
  
  return response.data || [];
};

/**
 * Fetches markets by category
 * @param {string} category - Category name
 * @returns {Promise<Array>} Array of markets
 */
const fetchMarketsByCategory = async (category) => {
  logger.info(`Fetching markets for category: ${category}`);
  
  return fetchMarkets({ category });
};

/**
 * Searches markets by query
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of matching markets
 */
const searchMarkets = async (query) => {
  logger.info(`Searching markets: ${query}`);
  
  const response = await polymarketClient.get('/markets/search', {
    params: { q: query }
  });
  
  return response.data || [];
};

/**
 * Parses market data into standardized format
 * @param {Object} rawMarket - Raw market data from API
 * @returns {Object} Standardized market object
 */
const parseMarket = (rawMarket) => {
  // Handle image field: use "image" first, fallback to "twitterCardImage", then null
  const image = (rawMarket.image && rawMarket.image.trim()) || 
                (rawMarket.twitterCardImage && rawMarket.twitterCardImage.trim()) || 
                null;

  return {
    marketId: rawMarket.condition_id || rawMarket.id,
    title: rawMarket.question || rawMarket.title,
    description: rawMarket.description || '',
    options: rawMarket.outcomes || rawMarket.options || ['Yes', 'No'],
    status: rawMarket.closed ? 'closed' : 'active',
    liquidity: rawMarket.liquidity || 0,
    volume: rawMarket.volume || 0,
    volume24h: rawMarket.volume24hr || rawMarket.volume24h || 0,
    categories: rawMarket.tags || rawMarket.categories || [],
    createdAt: rawMarket.created_at || rawMarket.createdAt,
    endDate: rawMarket.end_date_iso || rawMarket.endDate,
    currentPrices: rawMarket.outcome_prices || rawMarket.prices || [],
    image,
    slug: rawMarket.slug || null,
    closed: rawMarket.closed || false
  };
};

/**
 * Batch fetch multiple markets
 * @param {Array<string>} marketIds - Array of market IDs
 * @returns {Promise<Array>} Array of market objects
 */
const batchFetchMarkets = async (marketIds) => {
  logger.info(`Batch fetching ${marketIds.length} markets`);
  
  const promises = marketIds.map(id => 
    fetchMarketById(id).catch(err => {
      logger.warn(`Failed to fetch market ${id}: ${err.message}`);
      return null;
    })
  );
  
  const results = await Promise.all(promises);
  return results.filter(m => m !== null);
};

/**
 * Validates market data
 * @param {Object} market - Market object
 * @returns {boolean} True if valid
 */
const validateMarket = (market) => {
  if (!market) return false;
  if (!market.marketId && !market.id) return false;
  if (!market.title && !market.question) return false;
  return true;
};

module.exports = {
  fetchMarkets,
  fetchMarketById,
  fetchMarketTrades,
  fetchOrderBook,
  fetchPriceHistory,
  fetchVolumeStats,
  fetchTopTraders,
  fetchTraderProfile,
  fetchTrendingMarkets,
  fetchMarketsByCategory,
  searchMarkets,
  parseMarket,
  batchFetchMarkets,
  validateMarket
};
