/**
 * Compute Predictions Cron Job
 * Computes predictions for active markets and sends notifications
 * @module cron/computePredictions
 */

const { connectDB, closeDB } = require('../config/db');
const logger = require('../config/logger');
const polymarketService = require('../services/polymarketService');
const predictionEngine = require('../services/predictionEngine');
const predictionModerationService = require('../services/predictionModerationService');
const cacheService = require('../services/cacheService');
const config = require('../config/env');

/**
 * Main computation function
 */
const computePredictions = async (options = {}) => {
  logger.info('Starting prediction computation job');
  
  const startTime = Date.now();
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const skippedReasons = {};
  const notifications = [];
  let expiredCleanup = { scanned: 0, expired: 0 };
  
  try {
    // Connect to database if not in server context
    if (!require('mongoose').connection.readyState) {
      await connectDB();
    }

    // Keep lifecycle integrity: move ended markets to expired status with outcomes.
    expiredCleanup = await predictionModerationService.markExpiredPredictions({ limit: 1000 });
    
    // Fetch active markets
    let markets = await polymarketService.fetchMarkets({ closed: false });
    
    // Apply minimum liquidity and volume filters
    markets = markets.filter(m => 
      (m.liquidity || 0) >= config.minLiquidityUsd && 
      (m.volume24h || 0) >= config.minVolume24hUsd
    );
    
    logger.info(`Filtered ${markets.length} markets by minimum liquidity/volume`);
    
    // Group markets by category and select top market per category
    const marketsByCategory = {};
    for (const market of markets) {
      const category = market.category || 'Other';
      if (!marketsByCategory[category]) {
        marketsByCategory[category] = [];
      }
      marketsByCategory[category].push(market);
    }
    
    // Get top market per category (sorted by liquidity)
    const selectedMarkets = [];
    for (const category in marketsByCategory) {
      const topMarket = marketsByCategory[category]
        .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
        .slice(0, config.marketsPerCategory)[0];
      
      if (topMarket) {
        selectedMarkets.push(topMarket);
      }
    }
    
    // Limit to configured max markets
    markets = selectedMarkets.slice(0, config.maxMarketsPerRun);
    
    logger.info(`Selected ${markets.length} markets across ${Object.keys(marketsByCategory).length} categories (max per category: ${config.marketsPerCategory})`);
    
    // Process each market
    for (const market of markets) {
      processedCount++;
      
      try {
        const parsedMarket = polymarketService.parseMarket(market);
        const options = parsedMarket.options || ['Yes', 'No'];
        
        // Generate prediction for first option (daily timeframe only to reduce API load)
        for (const timeframe of ['daily']) {
          try {
            const prediction = await predictionEngine.generatePrediction(
              parsedMarket.marketId,
              options[0],
              timeframe
            );
            
            successCount++;
            logger.info(
              `Prediction computed: ${parsedMarket.marketId} (${timeframe}) - ${prediction.confidence}%`
            );
            
            // Add small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (predError) {
            if (predError.errorCode === 'MARKET_UNPREDICTABLE' || predError.errorCode === 'PREDICTION_FILTERED_OUT') {
              skippedCount++;
              const reasonKey = predError.errorCode === 'MARKET_UNPREDICTABLE' ? 'unpredictable_market' : 'quality_gate_filtered';
              skippedReasons[reasonKey] = (skippedReasons[reasonKey] || 0) + 1;
              logger.info(
                `Prediction skipped for ${parsedMarket.marketId} (${timeframe}): ${predError.message}`,
                predError.details || {}
              );
              continue;
            }

            logger.error(
              `Failed to compute prediction for ${parsedMarket.marketId} (${timeframe}): ${predError.message}`
            );
            failedCount++;
          }
        }
        
      } catch (marketError) {
        logger.error(`Failed to process market: ${marketError.message}`);
        failedCount++;
      }
    }
    
    // Do not auto-publish prediction notifications here.
    // Notifications are triggered only when an admin approves a prediction.
    let notificationResults = { email: { sent: 0 }, push: { sent: 0 } };
    if (notifications.length > 0) {
      logger.info('Notification dispatch skipped: predictions require admin approval before publishing');
    }
    
    // Clear expired cache entries
    await cacheService.clearExpired();
    
    const duration = Date.now() - startTime;
    
    const result = {
      success: true,
      processed: processedCount,
      successful: successCount,
      skipped: skippedCount,
      skippedReasons,
      failed: failedCount,
      expiredCleanup,
      notifications: notificationResults,
      duration
    };
    
    logger.info(`Prediction computation completed in ${duration}ms:`, result);
    
    return result;
    
  } catch (error) {
    logger.error('Prediction computation job failed:', error);
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
      const result = await computePredictions();
      console.log('Computation completed:', result);
      await closeDB();
      process.exit(0);
    } catch (error) {
      console.error('Computation failed:', error);
      await closeDB();
      process.exit(1);
    }
  })();
}

module.exports = computePredictions;
