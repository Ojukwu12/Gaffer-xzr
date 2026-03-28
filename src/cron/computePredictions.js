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
const PredictionRecord = require('../models/PredictionRecord');
const cacheService = require('../services/cacheService');
const emailService = require('../services/emailService');
const config = require('../config/env');

/**
 * Main computation function
 */
const computePredictions = async (options = {}) => {
  const runId = options.runId || `predict-${Date.now()}`;
  logger.info(`[computePredictions][${runId}] START`);
  
  const startTime = Date.now();
  const runStartedAt = new Date(startTime);
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
    const fetchedCount = markets.length;
    logger.info(`[computePredictions][${runId}] Fetched ${fetchedCount} active markets from Polymarket`);
    
    // Apply minimum liquidity and volume filters
    markets = markets.filter(m => 
      Number(m.liquidity || 0) >= config.minLiquidityUsd && 
      Number(m.volume24h || m.volume24hr || 0) >= config.minVolume24hUsd
    );
    
    logger.info(
      `[computePredictions][${runId}] After liquidity/volume filter: ${markets.length}/${fetchedCount} ` +
      `(minLiquidity=${config.minLiquidityUsd}, minVolume24h=${config.minVolume24hUsd})`
    );

    if (markets.length === 0) {
      logger.warn(
        `[computePredictions][${runId}] No markets passed liquidity/volume filters. ` +
        'Consider lowering MIN_LIQUIDITY_USD or MIN_VOLUME_24H_USD.'
      );
    }

    // Get recently attempted markets (last 2 hours) to avoid re-predicting same ones immediately
    const twHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentlyAttempted = await PredictionRecord.find({
      predictedAt: { $gte: twHoursAgo }
    }).select('marketId').lean();
    
    const recentMarketIds = new Set(recentlyAttempted.map(r => r.marketId));
    
    // Filter out recently attempted markets to allow market rotation
    const freshMarkets = markets.filter(m => !recentMarketIds.has(m.marketId));
    
    logger.info(
      `[computePredictions][${runId}] After recent-attempt dedup: ${freshMarkets.length}/${markets.length} fresh markets ` +
      `(skipped ${recentMarketIds.size} recently attempted markets)`
    );
    
    // Group fresh markets by category and select top markets per category
    const marketsByCategory = {};
    for (const market of freshMarkets) {
      const category = market.category || 'Other';
      if (!marketsByCategory[category]) {
        marketsByCategory[category] = [];
      }
      marketsByCategory[category].push(market);
    }
    
    // Get top N markets per category (sorted by liquidity, pick multiple for rotation)
    const selectedMarkets = [];
    for (const category in marketsByCategory) {
      const topMarkets = marketsByCategory[category]
        .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
        .slice(0, Math.max(3, config.marketsPerCategory)); // Pick at least top 3 per category
      
      selectedMarkets.push(...topMarkets);
    }
    
    // Limit to configured max markets
    markets = selectedMarkets.slice(0, config.maxMarketsPerRun);
    
    logger.info(
      `[computePredictions][${runId}] Selected ${markets.length} markets across ` +
      `${Object.keys(marketsByCategory).length} categories ` +
      `(rotation picks top 3+ markets per category, maxPerRun=${config.maxMarketsPerRun})`
    );

    if (markets.length === 0) {
      const duration = Date.now() - startTime;
      const emptyResult = {
        success: true,
        processed: 0,
        successful: 0,
        skipped: 0,
        skippedReasons,
        failed: 0,
        expiredCleanup,
        notifications: { email: { sent: 0 }, push: { sent: 0 } },
        duration
      };

      logger.info(`[computePredictions][${runId}] END in ${duration}ms with 0 selected markets.`);
      return emptyResult;
    }
    
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
    const notificationResults = { email: { sent: 0 }, push: { sent: 0 } };
    if (notifications.length > 0) {
      logger.info('Notification dispatch skipped: predictions require admin approval before publishing');
    }

    // Alert admin when new predictions are queued for moderation approval.
    if (config.adminApprovalAlertEnabled && config.adminEmail) {
      try {
        const [newPendingCount, totalPendingCount] = await Promise.all([
          PredictionRecord.countDocuments({
            status: 'pending',
            predictedAt: { $gte: runStartedAt }
          }),
          PredictionRecord.countDocuments({ status: 'pending' })
        ]);

        if (newPendingCount > 0) {
          await emailService.sendAdminApprovalAlert({
            to: config.adminEmail,
            newPendingCount,
            totalPendingCount,
            runId,
            appUrl: process.env.APP_URL || 'http://localhost:5000'
          });

          logger.info(
            `[computePredictions][${runId}] Admin alert sent to ${config.adminEmail} ` +
            `(newPending=${newPendingCount}, totalPending=${totalPendingCount})`
          );
        } else {
          logger.info(`[computePredictions][${runId}] No new pending predictions created; admin alert skipped.`);
        }
      } catch (adminAlertError) {
        logger.warn(`[computePredictions][${runId}] Failed to send admin approval alert: ${adminAlertError.message}`);
      }
    } else {
      logger.info(`[computePredictions][${runId}] Admin approval alert disabled or ADMIN_EMAIL not configured.`);
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
    
    logger.info(`[computePredictions][${runId}] END in ${duration}ms`, result);
    
    return result;
    
  } catch (error) {
    logger.error(`[computePredictions][${runId}] FAILED: ${error.message}`);
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
