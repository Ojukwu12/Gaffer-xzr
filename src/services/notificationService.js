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

module.exports = {
  sendPredictionNotification,
  sendEmailNotifications,
  sendPushNotifications,
  sendTestNotification,
  sendBulkNotifications,
  cleanupSubscriptions
};
