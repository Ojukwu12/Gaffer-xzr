/**
 * Web Push Service
 * Handles Web Push notifications
 * @module services/webPushService
 */

const webpush = require('web-push');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

/**
 * Initialize Web Push with VAPID keys
 */
const initializeWebPush = () => {
  if (!config.webPush.vapidPublic || !config.webPush.vapidPrivate) {
    logger.warn('Web Push VAPID keys not configured');
    return false;
  }
  
  const subject = config.webPush.subject && config.webPush.subject.trim().length > 0
    ? config.webPush.subject
    : ('mailto:' + (config.brevo.emailFrom || 'admin@polyscope.com'));

  webpush.setVapidDetails(
    subject,
    config.webPush.vapidPublic,
    config.webPush.vapidPrivate
  );
  
  logger.info('Web Push initialized');
  return true;
};

/**
 * Sends a push notification
 * @param {Object} subscription - Push subscription object
 * @param {Object} payload - Notification payload
 * @returns {Promise<Object>}
 */
const sendPushNotification = async (subscription, payload) => {
  if (!initializeWebPush()) {
    throw new CustomError('Web Push not configured', 500, 'WEBPUSH_NOT_CONFIGURED');
  }
  
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    }
  };
  
  const payloadString = JSON.stringify(payload);
  
  logger.info(`Sending push notification to ${subscription.endpoint.substring(0, 50)}...`);
  
  const result = await webpush.sendNotification(pushSubscription, payloadString);
  
  logger.info('Push notification sent successfully');
  
  return result;
};

/**
 * Sends prediction alert via push
 * @param {Object} subscription - Push subscription object
 * @param {Object} prediction - Prediction data
 * @param {Object} market - Market data
 * @returns {Promise<Object>}
 */
const sendPredictionPush = async (subscription, prediction, market) => {
  const polymarketService = require('./polymarketService');
  const marketUrl = polymarketService.getMarketUrl({
    marketId: market.marketId,
    slug: market.slug || null,
    eventSlug: market.eventSlug || null
  });
  
  const payload = {
    title: '🎯 Polyscope Alert',
    body: `${market.title}: ${prediction.confidence}% confidence for ${prediction.option}`,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: `prediction-${market.marketId}`,
    data: {
      marketId: market.marketId,
      option: prediction.option,
      confidence: prediction.confidence,
      reason: prediction.reason,
      timeframe: prediction.timeframe,
      url: marketUrl
    },
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    requireInteraction: false,
    timestamp: Date.now()
  };
  
  return sendPushNotification(subscription, payload);
};

/**
 * Sends a test push notification
 * @param {Object} subscription - Push subscription object
 * @returns {Promise<Object>}
 */
const sendTestPush = async (subscription) => {
  const payload = {
    title: '👋 Welcome to Polyscope',
    body: 'Your push notifications are set up and ready to receive predictions!',
    icon: '/icon.png',
    badge: '/badge.png',
    tag: 'welcome',
    timestamp: Date.now()
  };
  
  return sendPushNotification(subscription, payload);
};

/**
 * Sends market alert push notification
 * @param {Object} subscription - Push subscription object
 * @param {string} message - Alert message
 * @param {Object} data - Additional data
 * @returns {Promise<Object>}
 */
const sendMarketAlertPush = async (subscription, message, data = {}) => {
  const payload = {
    title: '📊 Market Alert',
    body: message,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: 'market-alert',
    data: {
      ...data,
      timestamp: Date.now()
    },
    timestamp: Date.now()
  };
  
  return sendPushNotification(subscription, payload);
};

/**
 * Sends market resolution push notification
 * @param {Object} subscription - Push subscription object
 * @param {Object} resolution - Resolution payload
 * @returns {Promise<Object>}
 */
const sendMarketResolvedPush = async (subscription, resolution) => {
  const payload = {
    title: '✅ Market Resolved',
    body: `${resolution.marketTitle}: Final result ${resolution.finalResult || 'resolved'}`,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: `resolved-${resolution.marketId}`,
    data: {
      marketId: resolution.marketId,
      finalResult: resolution.finalResult || null,
      url: resolution.url || 'https://polymarket.com',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View Market'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    timestamp: Date.now()
  };

  return sendPushNotification(subscription, payload);
};

/**
 * Sends weekly digest push notification
 * @param {Object} subscription - Push subscription object
 * @param {Object} digest - Digest metrics payload
 * @returns {Promise<Object>}
 */
const sendWeeklyDigestPush = async (subscription, digest) => {
  const payload = {
    title: '📈 Weekly Polyscope Digest',
    body: `${digest.windowDays}d: ${digest.winRate}% win rate (${digest.correct}/${digest.resolved} correct)`,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: `weekly-digest-${digest.windowDays}`,
    data: {
      type: 'weekly-digest',
      windowDays: digest.windowDays,
      resolved: digest.resolved,
      correct: digest.correct,
      winRate: digest.winRate,
      url: digest.url || 'https://polymarket.com',
      timestamp: Date.now()
    },
    timestamp: Date.now()
  };

  return sendPushNotification(subscription, payload);
};

/**
 * Validates push subscription object
 * @param {Object} subscription - Subscription to validate
 * @returns {boolean}
 */
const validateSubscription = (subscription) => {
  if (!subscription || !subscription.endpoint) {
    return false;
  }
  
  if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return false;
  }
  
  return true;
};

/**
 * Tests if Web Push is properly configured
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(config.webPush.vapidPublic && config.webPush.vapidPrivate);
};

/**
 * Gets VAPID public key
 * @returns {string|null}
 */
const getVapidPublicKey = () => {
  return config.webPush.vapidPublic || null;
};

module.exports = {
  sendPushNotification,
  sendPredictionPush,
  sendTestPush,
  sendMarketAlertPush,
  sendMarketResolvedPush,
  sendWeeklyDigestPush,
  validateSubscription,
  isConfigured,
  getVapidPublicKey,
  initializeWebPush
};
