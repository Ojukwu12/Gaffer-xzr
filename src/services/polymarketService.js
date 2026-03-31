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
    // No Authorization header; Polymarket endpoints used here are public
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

  try {
    const response = await polymarketClient.get(`/markets/${marketId}/traders`, {
      params: { limit }
    });

    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data;
    }
  } catch (error) {
    const status = error?.response?.status;

    // Some upstream deployments do not expose /markets/:id/traders.
    // Fallback to deriving top traders from recent market trades.
    if (![404, 422].includes(status)) {
      logger.warn(`Primary traders endpoint failed for ${marketId}: ${error.message}`);
    } else {
      logger.info(`Traders endpoint unavailable (${status}) for ${marketId}; falling back to trade aggregation`);
    }
  }

  try {
    const trades = await fetchMarketTrades(marketId, { limit: 500, offset: 0 });
    if (!Array.isArray(trades) || trades.length === 0) {
      return [];
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const traderMap = new Map();

    const getTradeTimestamp = (trade) => {
      const raw = trade.createdAt || trade.created_at || trade.timestamp || trade.time || null;
      const parsed = raw ? new Date(raw).getTime() : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };

    const getTradeVolume = (trade) => {
      const explicit = Number(trade.volume || trade.amount || 0);
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
      }

      const size = Number(trade.size || trade.quantity || 0);
      const price = Number(trade.price || trade.rate || 0);
      if (Number.isFinite(size) && Number.isFinite(price) && size > 0 && price > 0) {
        return size * price;
      }

      return 0;
    };

    const extractAddresses = (trade) => {
      const candidates = [
        trade.trader,
        trade.traderAddress,
        trade.address,
        trade.user,
        trade.userAddress,
        trade.wallet,
        trade.walletAddress,
        trade.maker,
        trade.makerAddress,
        trade.taker,
        trade.takerAddress
      ]
        .map((value) => (value ? String(value).trim() : ''))
        .filter((value) => value.length > 0);

      return [...new Set(candidates)];
    };

    for (const trade of trades) {
      const addresses = extractAddresses(trade);
      if (addresses.length === 0) continue;

      const volume = getTradeVolume(trade);
      if (volume <= 0) continue;

      const ts = getTradeTimestamp(trade);
      const isRecent = ts ? (now - ts <= oneDayMs) : false;

      for (const address of addresses) {
        if (!traderMap.has(address)) {
          traderMap.set(address, {
            address,
            volume: 0,
            totalVolume: 0,
            tradeCount: 0,
            trades: 0,
            volume24h: 0
          });
        }

        const entry = traderMap.get(address);
        entry.volume += volume;
        entry.totalVolume += volume;
        entry.tradeCount += 1;
        entry.trades += 1;
        if (isRecent) {
          entry.volume24h += volume;
        }
      }
    }

    return [...traderMap.values()]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, Math.max(1, Number(limit) || 20));
  } catch (fallbackError) {
    logger.warn(`Fallback trade aggregation failed for ${marketId}: ${fallbackError.message}`);
    return [];
  }
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

  try {
    const response = await polymarketClient.get('/markets/trending', {
      params: { limit }
    });

    return response.data || [];
  } catch (error) {
    const status = error?.response?.status;

    // Some upstream deployments validate this route as if it were /markets/:id and return 422.
    // Fallback to a deterministic "trending-like" list from active markets sorted by activity.
    if (status === 422) {
      logger.info('Trending endpoint returned 422; falling back to active markets sorted by volume/liquidity');
      const markets = await fetchMarkets({ closed: false, active: true });

      return (markets || [])
        .slice()
        .sort((a, b) => {
          const volumeA = Number(a.volume24hr || a.volume24h || a.volume || 0);
          const volumeB = Number(b.volume24hr || b.volume24h || b.volume || 0);
          if (volumeB !== volumeA) return volumeB - volumeA;

          const liquidityA = Number(a.liquidity || 0);
          const liquidityB = Number(b.liquidity || 0);
          return liquidityB - liquidityA;
        })
        .slice(0, Math.max(1, Number(limit) || 10));
    }

    throw error;
  }
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

  try {
    const response = await polymarketClient.get('/markets/search', {
      params: { q: query }
    });

    return response.data || [];
  } catch (error) {
    const status = error?.response?.status;

    // Some upstream deployments validate this route as if it were /markets/:id and return 422.
    // Fallback to client-side filtering of active markets so search remains available.
    if (status === 422) {
      logger.info('Search endpoint returned 422; falling back to active markets local filtering');
      const normalizedQuery = String(query || '').trim().toLowerCase();
      if (!normalizedQuery) return [];

      const markets = await fetchMarkets({ closed: false, active: true });

      const getSearchScore = (market) => {
        const title = String(market.question || market.title || '').toLowerCase();
        const description = String(market.description || '').toLowerCase();
        const slug = String(market.slug || market.market_slug || '').toLowerCase();
        const tags = Array.isArray(market.tags)
          ? market.tags.map((t) => String(t).toLowerCase()).join(' ')
          : '';

        if (title.startsWith(normalizedQuery)) return 4;
        if (title.includes(normalizedQuery)) return 3;
        if (slug.includes(normalizedQuery)) return 2;
        if (description.includes(normalizedQuery) || tags.includes(normalizedQuery)) return 1;
        return 0;
      };

      return (markets || [])
        .map((market) => ({ market, score: getSearchScore(market) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;

          const volumeA = Number(a.market.volume24hr || a.market.volume24h || a.market.volume || 0);
          const volumeB = Number(b.market.volume24hr || b.market.volume24h || b.market.volume || 0);
          if (volumeB !== volumeA) return volumeB - volumeA;

          const liquidityA = Number(a.market.liquidity || 0);
          const liquidityB = Number(b.market.liquidity || 0);
          return liquidityB - liquidityA;
        })
        .map((entry) => entry.market)
        .slice(0, 100);
    }

    throw error;
  }
};

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const toNumericArray = (values) => {
  return parseArrayField(values)
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    });
};

const normalizeOptionLabels = (options) => {
  return parseArrayField(options)
    .map((option) => String(option).trim())
    .filter((option) => option.length > 0);
};

/**
 * Generates a URL-safe slug from a string
 * @param {string} text - Text to slugify
 * @returns {string} URL-safe slug
 */
const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .slice(0, 100);           // Limit length
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

  const title = rawMarket.question || rawMarket.title;
  const options = normalizeOptionLabels(rawMarket.outcomes || rawMarket.options || ['Yes', 'No']);
  const currentPrices = toNumericArray(rawMarket.outcomePrices || rawMarket.outcome_prices || rawMarket.prices || []);
  
  // Use Gamma slug if available, otherwise generate from title
  // This ensures we always have a slug for Polymarket's /event/ URLs
  const slug = rawMarket.slug || rawMarket.marketSlug || rawMarket.market_slug || generateSlug(title) || null;
  const eventSlug =
    rawMarket.eventSlug ||
    rawMarket.event_slug ||
    (Array.isArray(rawMarket.events) && rawMarket.events[0] && rawMarket.events[0].slug) ||
    null;

  const optionPricePairs = options.map((option, index) => ({
    option,
    price: Number.isFinite(currentPrices[index]) ? currentPrices[index] : null
  }));

  const yesPair = optionPricePairs.find((entry) => entry.option.toLowerCase() === 'yes');
  const noPair = optionPricePairs.find((entry) => entry.option.toLowerCase() === 'no');

  return {
    marketId: rawMarket.conditionId || rawMarket.condition_id || rawMarket.id,
    conditionId: rawMarket.conditionId || rawMarket.condition_id || rawMarket.id,
    title,
    description: rawMarket.description || '',
    options,
    outcomes: options,
    status: rawMarket.closed ? 'closed' : 'active',
    liquidity: rawMarket.liquidity || 0,
    volume: rawMarket.volume || 0,
    volume24h: rawMarket.volume24hr || rawMarket.volume24h || 0,
    categories: rawMarket.tags || rawMarket.categories || [],
    createdAt: rawMarket.created_at || rawMarket.createdAt,
    endDate: rawMarket.end_date_iso || rawMarket.endDate,
    currentPrices,
    outcomePrices: currentPrices,
    yesPrice: yesPair ? yesPair.price : null,
    noPrice: noPair ? noPair.price : null,
    eventSlug,
    image,
    slug,
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

/**
 * Builds a user-facing Polymarket URL for direct betting navigation
 * @param {Object} market - Market object
 * @param {string} market.marketId - Market ID
 * @param {string|null} market.slug - Market slug
 * @param {string|null} market.eventSlug - Event slug
 * @returns {string}
 */
const getMarketUrl = ({ marketId, slug, eventSlug }) => {
  // For many markets, Polymarket's canonical path is event-based.
  if (eventSlug) {
    return `https://polymarket.com/event/${encodeURIComponent(eventSlug)}`;
  }

  if (slug) {
    return `https://polymarket.com/event/${encodeURIComponent(slug)}`;
  }

  return `https://polymarket.com/market/${encodeURIComponent(marketId)}`;
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
  validateMarket,
  getMarketUrl
};
