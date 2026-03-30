/**
 * Notification Service
 * Orchestrates email and push notifications
 * @module services/notificationService
 */

const logger = require('../config/logger');
const config = require('../config/env');
const EmailSubscription = require('../models/EmailSubscription');
const PushSubscription = require('../models/PushSubscription');
const emailService = require('./emailService');
const webPushService = require('./webPushService');
const webhookService = require('./webhookService');
const metricsService = require('./metricsService');

const toYesNo = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (['YES', 'TRUE', '1'].includes(normalized)) return 'YES';
  if (['NO', 'FALSE', '0'].includes(normalized)) return 'NO';
  return normalized;
};

/**
 * Sends notification for a prediction
 * @param {string} marketId - Market ID
 * @param {Object} prediction - Prediction data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>} Notification results
 */
const sendPredictionNotification = async (marketId, prediction, marketData) => {
  logger.info(`Sending notifications for market: ${marketId}`);
  
  // Check if confidence meets threshold
  if (prediction.confidence < config.notificationThreshold) {
    logger.info(`Prediction confidence ${prediction.confidence}% below threshold ${config.notificationThreshold}%`);
    return {
      sent: false,
      reason: 'Below confidence threshold'
    };
  }
  
  const results = {
    email: {
      sent: 0,
      failed: 0,
      errors: []
    },
    push: {
      sent: 0,
      failed: 0,
      errors: []
    }
  };
  
  // Send email notifications
  const emailResults = await sendEmailNotifications(marketId, prediction, marketData);
  results.email = emailResults;
  
  // Send push notifications
  const pushResults = await sendPushNotifications(marketId, prediction, marketData);
  results.push = pushResults;
  
  logger.info(`Notifications sent: Email=${results.email.sent}, Push=${results.push.sent}`);
  
  // Trigger webhooks for high confidence predictions
  if (prediction.confidence >= 80) {
    try {
      await webhookService.triggerHighConfidenceWebhook(prediction, marketData);
    } catch (error) {
      logger.error('High confidence webhook failed:', error.message);
    }
  }
  
  // Trigger general prediction webhook
  try {
    await webhookService.triggerPredictionWebhook(prediction, marketData);
  } catch (error) {
    logger.error('Prediction webhook failed:', error.message);
  }
  
  return results;
};

/**
 * Sends email notifications to subscribers
 * @param {string} marketId - Market ID
 * @param {Object} prediction - Prediction data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>}
 */
const sendEmailNotifications = async (marketId, prediction, marketData) => {
  const results = {
    sent: 0,
    failed: 0,
    errors: []
  };
  
  // Find active email subscriptions for this market
  const subscriptions = await EmailSubscription.findActiveByMarket(marketId);
  
  logger.info(`Found ${subscriptions.length} email subscriptions for market ${marketId}`);
  
  for (const subscription of subscriptions) {
    // Check if subscription can receive notification
    if (!subscription.canReceiveNotification()) {
      logger.debug(`Skipping email ${subscription.email}: cannot receive notification`);
      continue;
    }
    
    // Check confidence threshold
    if (prediction.confidence < subscription.preferences.minConfidence) {
      logger.debug(`Skipping email ${subscription.email}: below confidence threshold`);
      continue;
    }
    
    // Send email
    await emailService.sendPredictionEmail(
      subscription.email,
      prediction,
      marketData
    ).then(() => {
      results.sent++;
      metricsService.recordNotification('email', true);
      return subscription.incrementNotificationCount();
    }).catch(err => {
      results.failed++;
      metricsService.recordNotification('email', false);
      results.errors.push({
        email: subscription.email,
        error: err.message
      });
      logger.error(`Failed to send email to ${subscription.email}: ${err.message}`);
    });
  }
  
  return results;
};

/**
 * Sends push notifications to subscribers
 * @param {string} marketId - Market ID
 * @param {Object} prediction - Prediction data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>}
 */
const sendPushNotifications = async (marketId, prediction, marketData) => {
  const results = {
    sent: 0,
    failed: 0,
    errors: []
  };
  
  // Find active push subscriptions for this market
  const subscriptions = await PushSubscription.findActiveByMarket(marketId);
  
  logger.info(`Found ${subscriptions.length} push subscriptions for market ${marketId}`);
  
  for (const subscription of subscriptions) {
    // Check if subscription can receive notification
    if (!subscription.canReceiveNotification()) {
      logger.debug(`Skipping push subscription: cannot receive notification`);
      continue;
    }
    
    // Check confidence threshold
    if (prediction.confidence < subscription.preferences.minConfidence) {
      logger.debug(`Skipping push subscription: below confidence threshold`);
      continue;
    }
    
    // Send push notification
    await webPushService.sendPredictionPush(
      subscription.subscription,
      prediction,
      marketData
    ).then(() => {
      results.sent++;
      metricsService.recordNotification('push', true);
      return subscription.incrementNotificationCount();
    }).catch(err => {
      results.failed++;
      metricsService.recordNotification('push', false);
      results.errors.push({
        endpoint: subscription.subscription.endpoint,
        error: err.message
      });
      
      // Record failure
      subscription.recordFailure(err.message);
      
      logger.error(`Failed to send push notification: ${err.message}`);
    });
  }
  
  return results;
};

/**
 * Sends test notification to a user
 * @param {string} email - Email address (optional)
 * @param {Object} pushSubscription - Push subscription (optional)
 * @returns {Promise<Object>}
 */
const sendTestNotification = async (email = null, pushSubscription = null) => {
  const results = {
    email: null,
    push: null
  };
  
  if (email) {
    const testMarket = {
      marketId: 'test',
      title: 'Test Market'
    };
    
    const testPrediction = {
      confidence: 85,
      reason: 'This is a test notification',
      option: 'Yes',
      timeframe: 'daily',
      features: {
        liquidity: 100000,
        volume24h: 50000,
        whaleFactor: 0.7,
        trendScore: 0.8,
        dailyChange: 0.05,
        sentimentScore: 0.75
      }
    };
    
    results.email = await emailService.sendPredictionEmail(
      email,
      testPrediction,
      testMarket
    ).catch(err => ({ error: err.message }));
  }
  
  if (pushSubscription) {
    results.push = await webPushService.sendTestPush(
      pushSubscription
    ).catch(err => ({ error: err.message }));
  }
  
  return results;
};

/**
 * Sends bulk notifications for multiple markets
 * @param {Array} notificationData - Array of {marketId, prediction, marketData}
 * @returns {Promise<Object>}
 */
const sendBulkNotifications = async (notificationData) => {
  logger.info(`Sending bulk notifications for ${notificationData.length} markets`);
  
  const results = await Promise.all(
    notificationData.map(data =>
      sendPredictionNotification(data.marketId, data.prediction, data.marketData)
        .catch(err => {
          logger.error(`Failed to send notification for ${data.marketId}: ${err.message}`);
          return { error: err.message };
        })
    )
  );
  
  const summary = results.reduce((acc, result) => {
    if (result.email) {
      acc.totalEmailSent += result.email.sent || 0;
      acc.totalEmailFailed += result.email.failed || 0;
    }
    if (result.push) {
      acc.totalPushSent += result.push.sent || 0;
      acc.totalPushFailed += result.push.failed || 0;
    }
    return acc;
  }, {
    totalEmailSent: 0,
    totalEmailFailed: 0,
    totalPushSent: 0,
    totalPushFailed: 0
  });
  
  logger.info('Bulk notifications complete:', summary);
  
  return {
    results,
    summary
  };
};

/**
 * Cleans up expired and invalid subscriptions
 * @returns {Promise<Object>}
 */
const cleanupSubscriptions = async () => {
  logger.info('Cleaning up subscriptions');
  
  // Clean up invalid push subscriptions
  const pushCleanup = await PushSubscription.cleanupInvalidSubscriptions();
  
  // Clean up inactive email subscriptions (older than 90 days)
  const emailCleanup = await EmailSubscription.deleteMany({
    isActive: false,
    updatedAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
  });
  
  logger.info(`Cleanup complete: ${pushCleanup.deletedCount} push, ${emailCleanup.deletedCount} email`);
  
  return {
    push: pushCleanup.deletedCount,
    email: emailCleanup.deletedCount
  };
};

/**
 * Sends push notifications for recently resolved markets
 * @param {Array} resolvedPredictions - Resolved prediction records from expiry cleanup
 * @returns {Promise<Object>}
 */
const sendMarketResolvedPushNotifications = async (resolvedPredictions = []) => {
  if (!Array.isArray(resolvedPredictions) || resolvedPredictions.length === 0) {
    return { sent: 0, failed: 0, markets: 0 };
  }

  const results = { sent: 0, failed: 0, markets: 0 };
  const byMarket = new Map();

  for (const item of resolvedPredictions) {
    if (!item || !item.marketId) continue;
    if (!byMarket.has(item.marketId)) {
      byMarket.set(item.marketId, item);
    }
  }

  for (const [marketId, item] of byMarket.entries()) {
    results.markets++;

    const subscriptions = await PushSubscription.findActiveByMarket(marketId);

    for (const subscription of subscriptions) {
      // Default behavior: notify on resolution unless explicitly disabled
      if (subscription.preferences && subscription.preferences.notifyOnResolution === false) {
        continue;
      }

      if (!subscription.canReceiveNotification()) {
        continue;
      }

      try {
        await webPushService.sendMarketResolvedPush(subscription.subscription, {
          marketId,
          marketTitle: item.marketTitle || `Market ${marketId}`,
          finalResult: toYesNo(item.actualAnswer || item.finalMarketResult) || 'resolved',
          url: item.polymarketUrl || 'https://polymarket.com'
        });

        await subscription.incrementNotificationCount();
        metricsService.recordNotification('push', true);
        results.sent++;
      } catch (err) {
        metricsService.recordNotification('push', false);
        await subscription.recordFailure(err.message);
        results.failed++;
        logger.warn(`Resolved market push failed for ${marketId}: ${err.message}`);
      }
    }
  }

  return results;
};

/**
 * Sends weekly push digest to subscribers who opted in
 * @param {Object} options - digest options
 * @returns {Promise<Object>}
 */
const sendWeeklyPushDigest = async (options = {}) => {
  const windowDays = Number(options.windowDays || 7);
  const predictionTrackingService = require('./predictionTrackingService');
  const performance = await predictionTrackingService.getPredictionPerformance(windowDays);

  const resolved = Number(performance?.summary?.resolvedPredictions || 0);
  const correct = Number(performance?.summary?.correctPredictions || 0);
  const winRate = Number(performance?.summary?.winRate || 0);

  const subscriptions = await PushSubscription.find({
    isActive: true,
    failureCount: { $lt: 5 }
  });

  const results = { sent: 0, failed: 0, checked: subscriptions.length };

  for (const subscription of subscriptions) {
    // Default behavior: send weekly digest unless explicitly disabled
    if (subscription.preferences && subscription.preferences.notifyWeeklyDigest === false) {
      continue;
    }

    if (!subscription.canReceiveNotification()) {
      continue;
    }

    try {
      await webPushService.sendWeeklyDigestPush(subscription.subscription, {
        windowDays,
        resolved,
        correct,
        winRate,
        url: 'https://polymarket.com'
      });

      await subscription.incrementNotificationCount();
      metricsService.recordNotification('push', true);
      results.sent++;
    } catch (err) {
      metricsService.recordNotification('push', false);
      await subscription.recordFailure(err.message);
      results.failed++;
      logger.warn(`Weekly digest push failed: ${err.message}`);
    }
  }

  return results;
};

module.exports = {
  sendPredictionNotification,
  sendEmailNotifications,
  sendPushNotifications,
  sendMarketResolvedPushNotifications,
  sendWeeklyPushDigest,
  sendTestNotification,
  sendBulkNotifications,
  cleanupSubscriptions
};
