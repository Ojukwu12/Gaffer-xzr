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
 * Main refresh function
 */
const refreshMarkets = async () => {
  logger.info('Starting market refresh job');
  
  const startTime = Date.now();
  let fetchedCount = 0;
  let cachedCount = 0;
  
  try {
    // Connect to database if not in server context
    if (!require('mongoose').connection.readyState) {
      await connectDB();
    }
    
    // Fetch active markets
    const markets = await polymarketService.fetchMarkets({ closed: false });
    fetchedCount = markets.length;
    
    logger.info(`Fetched ${fetchedCount} active markets`);
    
    // Cache each market
    for (const market of markets) {
      const parsedMarket = polymarketService.parseMarket(market);
      cacheService.cacheMarket(parsedMarket.marketId, parsedMarket, 600);
      cachedCount++;
    }
    
    // Cache market list
    const parsedMarkets = markets.map(m => polymarketService.parseMarket(m));
    cacheService.cacheMarketList('all:all:all:all:50:0', parsedMarkets.slice(0, 50), 300);
    
    // Fetch and cache trending markets
    const trendingMarkets = await polymarketService.fetchTrendingMarkets(10).catch(err => {
      logger.warn(`Failed to fetch trending markets: ${err.message}`);
      return [];
    });
    
    if (trendingMarkets.length > 0) {
      const parsedTrending = trendingMarkets.map(m => polymarketService.parseMarket(m));
      cacheService.cacheMarketList('trending', parsedTrending, 180);
      logger.info(`Cached ${parsedTrending.length} trending markets`);
    }
    
    const duration = Date.now() - startTime;
    
    logger.info(`Market refresh completed in ${duration}ms: ${cachedCount} markets cached`);
    
    return {
      success: true,
      fetched: fetchedCount,
      cached: cachedCount,
      duration
    };
    
  } catch (error) {
    logger.error('Market refresh job failed:', error);
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
