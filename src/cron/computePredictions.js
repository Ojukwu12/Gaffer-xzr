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
const notificationService = require('../services/notificationService');
const predictionTrackingService = require('../services/predictionTrackingService');
const config = require('../config/env');

const deriveMarketCategory = (market = {}) => {
  const tagValue = Array.isArray(market.tags) && market.tags.length > 0
    ? (typeof market.tags[0] === 'string' ? market.tags[0] : market.tags[0]?.name)
    : null;
  const categoryValue = Array.isArray(market.categories) && market.categories.length > 0
    ? market.categories[0]
    : null;

  const candidates = [
    market.category,
    market.marketCategory,
    market.categorySlug,
    categoryValue,
    tagValue
  ];

  const normalized = candidates
    .map((value) => String(value || '').trim().toLowerCase())
    .find((value) => value.length > 0);

  return normalized || 'other';
};

const normalizePredictionAnswerFromOption = (option = '') => {
  const normalized = String(option || '').trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return 'YES';
  if (['no', 'false', '0'].includes(normalized)) return 'NO';
  return 'YES';
};

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
  const skippedCount = 0;
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

    // Send push notifications for newly resolved markets (if any)
    if (expiredCleanup && Array.isArray(expiredCleanup.resolvedPredictions) && expiredCleanup.resolvedPredictions.length > 0) {
      try {
        const resolvedPush = await notificationService.sendMarketResolvedPushNotifications(
          expiredCleanup.resolvedPredictions
        );
        logger.info(
          `[computePredictions][${runId}] Resolved market push notifications: ` +
          `sent=${resolvedPush.sent}, failed=${resolvedPush.failed}, markets=${resolvedPush.markets}`
        );
      } catch (resolvedPushError) {
        logger.warn(`[computePredictions][${runId}] Failed sending resolved market pushes: ${resolvedPushError.message}`);
      }
    }
    
    // Fetch active markets (optionally capped by env)
    const marketFetchFilters = { closed: false };
    if (Number(config.marketFetchLimit) > 0) {
      marketFetchFilters.limit = Number(config.marketFetchLimit);
    }

    let markets = await polymarketService.fetchMarkets(marketFetchFilters);
    const fetchedCount = markets.length;
    logger.info(
      `[computePredictions][${runId}] Fetched ${fetchedCount} active markets from Polymarket ` +
      `(fetchLimit=${Number(config.marketFetchLimit) > 0 ? config.marketFetchLimit : 'provider_default'})`
    );
    
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
      const category = deriveMarketCategory(market);
      if (!marketsByCategory[category]) {
        marketsByCategory[category] = [];
      }
      marketsByCategory[category].push(market);
    }

    const categoryCount = Object.keys(marketsByCategory).length;
    const perCategoryLimit = Math.max(1, Number(config.marketsPerCategory) || 1);

    // When category diversity is low, avoid under-selecting by falling back to global top-liquidity picks.
    if (categoryCount <= 1) {
      markets = freshMarkets
        .slice()
        .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
        .slice(0, Number(config.maxMarketsPerRun) || 20);
    } else {
      const selectedMarkets = [];
      for (const category in marketsByCategory) {
        const topMarkets = marketsByCategory[category]
          .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
          .slice(0, perCategoryLimit);

        selectedMarkets.push(...topMarkets);
      }

      // Limit to configured max markets
      markets = selectedMarkets.slice(0, Number(config.maxMarketsPerRun) || 20);
    }
    
    logger.info(
      `[computePredictions][${runId}] Selected ${markets.length} markets across ` +
      `${categoryCount} categories ` +
      `(perCategory=${config.marketsPerCategory}, maxPerRun=${config.maxMarketsPerRun})`
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
              const issueCode = predError.errorCode;
              const reasonKey = predError.errorCode === 'MARKET_UNPREDICTABLE' ? 'unpredictable_market' : 'quality_gate_filtered';
              skippedReasons[reasonKey] = (skippedReasons[reasonKey] || 0) + 1;

              const issueDetails = predError.details || {};
              const polymarketUrl = parsedMarket.polymarketUrl || polymarketService.getMarketUrl({
                marketId: parsedMarket.marketId,
                slug: parsedMarket.slug || null,
                eventSlug: parsedMarket.eventSlug || null
              });

              const impliedProbability = Number(parsedMarket.yesPrice ?? parsedMarket.currentPrice ?? 50);
              const normalizedImpliedProbability = Number.isFinite(impliedProbability)
                ? Math.max(0, Math.min(100, impliedProbability))
                : null;

              const placeholderConfidence = Number(issueDetails.confidenceScore);
              const predictionConfidence = Number.isFinite(placeholderConfidence)
                ? Math.max(0, Math.min(100, placeholderConfidence))
                : 0;

              await predictionTrackingService.recordPrediction({
                marketId: parsedMarket.marketId,
                marketTitle: parsedMarket.title,
                marketSlug: parsedMarket.slug || null,
                polymarketUrl,
                option: options[0],
                timeframe,
                predictionType: 'option',
                status: 'pending',
                evaluationMode: config.predictionMode,
                predictedAnswer: normalizePredictionAnswerFromOption(options[0]),
                confidence: predictionConfidence,
                marketProbabilityAtTime: normalizedImpliedProbability,
                aiProbability: null,
                marketClassification: issueDetails.marketClassification || null,
                marketPredictabilityScore: issueDetails.marketPredictabilityScore ?? null,
                signalStrengthScore: issueDetails.signalStrengthScore ?? null,
                differenceBetweenMarketProbabilityAndAI: issueDetails.differenceBetweenMarketProbabilityAndAI ?? null,
                mispricingScore: issueDetails.mispricingScore ?? null,
                mispricingDirection: issueDetails.mispricingDirection || 'unknown',
                expectedEdgeScore: issueDetails.expectedEdgeScore ?? null,
                marketBucket: issueDetails.marketBucket || null,
                thresholdsUsed: issueDetails.thresholds || null,
                reason: `Data issue: ${predError.message}`,
                dataIssue: {
                  code: issueCode,
                  note: predError.message,
                  details: issueDetails
                }
              });

              successCount++;
              logger.info(
                `Prediction queued with dataIssue for ${parsedMarket.marketId} (${timeframe}): ${predError.message}`,
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
