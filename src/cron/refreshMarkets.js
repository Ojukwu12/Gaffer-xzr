/**
 * Refresh Markets Cron Job
 * Fetches latest markets from Polymarket and updates cache
 * @module cron/refreshMarkets
 */

const { connectDB, closeDB } = require('../config/db');
const logger = require('../config/logger');
const polymarketService = require('../services/polymarketService');
const cacheService = require('../services/cacheService');

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
 * Main refresh function
 */
const refreshMarkets = async () => {
  const runId = `refresh-${Date.now()}`;
  logger.info(`[refreshMarkets][${runId}] START`);
  
  const startTime = Date.now();
  let fetchedCount = 0;
  let cachedCount = 0;
  
  try {
    // Connect to database if not in server context
    if (!require('mongoose').connection.readyState) {
      await connectDB();
    }
    
    // Fetch active markets
    let markets = await polymarketService.fetchMarkets({ closed: false });
    fetchedCount = markets.length;
    
    logger.info(`Fetched ${fetchedCount} active markets`);
    
    // Parse and filter out expired markets
    let parsedMarkets = markets.map(m => polymarketService.parseMarket(m));
    parsedMarkets = filterExpiredMarkets(parsedMarkets);
    
    logger.info(`After filtering expired markets: ${parsedMarkets.length} valid markets`);
    
    // Cache each market
    for (const market of parsedMarkets) {
      cacheService.cacheMarket(market.marketId, market, 600);
      cachedCount++;
    }
    
    // Cache market list
    cacheService.cacheMarketList('all:all:all:all:50:0', parsedMarkets.slice(0, 50), 300);
    
    // Fetch and cache trending markets
    let trendingMarkets = await polymarketService.fetchTrendingMarkets(20).catch(err => {
      const status = err?.response?.status;
      if (status === 422) {
        logger.info(`[refreshMarkets][${runId}] Trending endpoint returned 422; skipping trending cache.`);
      } else {
        logger.warn(`[refreshMarkets][${runId}] Failed to fetch trending markets: ${err.message}`);
      }
      return [];
    });
    
    if (trendingMarkets.length > 0) {
      let parsedTrending = trendingMarkets.map(m => polymarketService.parseMarket(m));
      parsedTrending = filterExpiredMarkets(parsedTrending).slice(0, 10);
      cacheService.cacheMarketList('trending', parsedTrending, 180);
      logger.info(`[refreshMarkets][${runId}] Cached ${parsedTrending.length} trending markets (after filtering expired)`);
    }
    
    const duration = Date.now() - startTime;
    
    logger.info(`[refreshMarkets][${runId}] END in ${duration}ms: ${cachedCount} markets cached (fetched=${fetchedCount})`);
    
    return {
      success: true,
      fetched: fetchedCount,
      cached: cachedCount,
      duration
    };
    
  } catch (error) {
    logger.error(`[refreshMarkets][${runId}] FAILED: ${error.message}`);
    throw error;
  }
};

/**
 * Run as standalone script
 */
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      const result = await refreshMarkets();
      console.log('Refresh completed:', result);
      await closeDB();
      process.exit(0);
    } catch (error) {
      console.error('Refresh failed:', error);
      await closeDB();
      process.exit(1);
    }
  })();
}

module.exports = refreshMarkets;
