/**
 * Notification Controller
 * Handles notification subscription and management
 * @module controllers/notificationController
 */

const crypto = require('crypto');
const asyncHandler = require('../middlewares/asyncHandler');
const { success } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');
const EmailSubscription = require('../models/EmailSubscription');
const PushSubscription = require('../models/PushSubscription');
const emailService = require('../services/emailService');
const webPushService = require('../services/webPushService');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

/**
 * Subscribe to email notifications
 * POST /api/notifications/email/subscribe
 */
const subscribeEmail = asyncHandler(async (req, res) => {
  const { email, markets, preferences } = req.body;
  
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new CustomError('Valid email address is required', 400, 'INVALID_EMAIL');
  }
  
  logger.info(`Email subscription request: ${email}`);
  
  // Check if subscription already exists
  let subscription = await EmailSubscription.findOne({ email });
  
  const unsubscribeToken = crypto.randomBytes(32).toString('hex');
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  if (subscription) {
    // Update existing subscription
    subscription.markets = markets || subscription.markets;
    subscription.preferences = { ...subscription.preferences, ...preferences };
    subscription.isActive = true;
    subscription.unsubscribeToken = unsubscribeToken;
    await subscription.save();
    
    logger.info(`Updated existing subscription for ${email}`);
  } else {
    // Create new subscription
    subscription = await EmailSubscription.create({
      email,
      markets: markets || [],
      preferences: preferences || {},
      unsubscribeToken,
      verificationToken,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });
    
    logger.info(`Created new subscription for ${email}`);
    
    // Send verification email
    await emailService.sendSubscriptionConfirmationEmail(email, verificationToken)
      .catch(err => {
        logger.error(`Failed to send verification email: ${err.message}`);
      });
  }
  
  return success(res, {
    subscribed: true,
    email,
    verificationRequired: !subscription.isVerified,
    unsubscribeToken
  }, 'Subscription successful', 201);
});

/**
 * Verify email subscription
 * GET /api/notifications/email/verify
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    throw new CustomError('Verification token is required', 400, 'MISSING_TOKEN');
  }
  
  const subscription = await EmailSubscription.findOne({ verificationToken: token });
  
  if (!subscription) {
    throw new CustomError('Invalid verification token', 400, 'INVALID_TOKEN');
  }
  
  subscription.isVerified = true;
  subscription.verificationToken = undefined;
  await subscription.save();
  
  logger.info(`Email verified: ${subscription.email}`);
  
  return success(res, {
    verified: true,
    email: subscription.email
  });
});

/**
 * Unsubscribe from email notifications
 * POST /api/notifications/email/unsubscribe
 */
const unsubscribeEmail = asyncHandler(async (req, res) => {
  const { token, email } = req.body;
  
  if (!token && !email) {
    throw new CustomError('Unsubscribe token or email is required', 400, 'MISSING_PARAMETER');
  }
  
  const query = token ? { unsubscribeToken: token } : { email };
  const subscription = await EmailSubscription.findOne(query);
  
  if (!subscription) {
    throw new CustomError('Subscription not found', 404, 'NOT_FOUND');
  }
  
  subscription.isActive = false;
  await subscription.save();
  
  logger.info(`Email unsubscribed: ${subscription.email}`);
  
  return success(res, {
    unsubscribed: true,
    email: subscription.email
  });
});

/**
 * Subscribe to push notifications
 * POST /api/notifications/push/subscribe
 */
const subscribePush = asyncHandler(async (req, res) => {
  const { subscription, markets, preferences } = req.body;
  
  if (!subscription || !webPushService.validateSubscription(subscription)) {
    throw new CustomError('Valid push subscription object is required', 400, 'INVALID_SUBSCRIPTION');
  }
  
  logger.info(`Push subscription request: ${subscription.endpoint.substring(0, 50)}...`);
  
  // Check if subscription already exists
  let pushSub = await PushSubscription.findOne({ 'subscription.endpoint': subscription.endpoint });
  
  if (pushSub) {
    // Update existing subscription
    pushSub.subscription = subscription;
    pushSub.markets = markets || pushSub.markets;
    pushSub.preferences = { ...pushSub.preferences, ...preferences };
    pushSub.isActive = true;
    pushSub.failureCount = 0; // Reset failures
    await pushSub.save();
    
    logger.info('Updated existing push subscription');
  } else {
    // Create new subscription
    pushSub = await PushSubscription.create({
      subscription,
      markets: markets || [],
      preferences: preferences || {},
      device: {
        userAgent: req.get('user-agent')
      },
      metadata: {
        ipAddress: req.ip
      }
    });
    
    logger.info('Created new push subscription');
  }
  
  // Send test notification
  await webPushService.sendTestPush(subscription).catch(err => {
    logger.warn(`Failed to send test push: ${err.message}`);
  });
  
  return success(res, {
    subscribed: true,
    endpoint: subscription.endpoint
  }, 'Push subscription successful', 201);
});

/**
 * Unsubscribe from push notifications
 * POST /api/notifications/push/unsubscribe
 */
const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  
  if (!endpoint) {
    throw new CustomError('Endpoint is required', 400, 'MISSING_ENDPOINT');
  }
  
  const subscription = await PushSubscription.findOne({ 'subscription.endpoint': endpoint });
  
  if (!subscription) {
    throw new CustomError('Subscription not found', 404, 'NOT_FOUND');
  }
  
  subscription.isActive = false;
  await subscription.save();
  
  logger.info(`Push unsubscribed: ${endpoint.substring(0, 50)}...`);
  
  return success(res, {
    unsubscribed: true
  });
});

/**
 * Get VAPID public key
 * GET /api/notifications/push/vapid-public-key
 */
const getVapidPublicKey = asyncHandler(async (req, res) => {
  const publicKey = webPushService.getVapidPublicKey();
  
  if (!publicKey) {
    throw new CustomError('Web Push not configured', 500, 'WEBPUSH_NOT_CONFIGURED');
  }
  
  return success(res, {
    publicKey
  });
});

/**
 * Send test notification
 * POST /api/notifications/test
 */
const sendTestNotification = asyncHandler(async (req, res) => {
  const { email, pushSubscription } = req.body;
  
  if (!email && !pushSubscription) {
    throw new CustomError('Email or push subscription is required', 400, 'MISSING_PARAMETER');
  }
  
  logger.info('Sending test notification');
  
  const results = await notificationService.sendTestNotification(email, pushSubscription);
  
  return success(res, results);
});

/**
 * Update subscription preferences
 * PATCH /api/notifications/preferences
 */
const updatePreferences = asyncHandler(async (req, res) => {
  const { type, identifier, preferences } = req.body;
  
  if (!type || !identifier || !preferences) {
    throw new CustomError('Type, identifier, and preferences are required', 400, 'MISSING_PARAMETERS');
  }
  
  let subscription;
  
  if (type === 'email') {
    subscription = await EmailSubscription.findOne({ email: identifier });
  } else if (type === 'push') {
    subscription = await PushSubscription.findOne({ 'subscription.endpoint': identifier });
  } else {
    throw new CustomError('Invalid type. Must be "email" or "push"', 400, 'INVALID_TYPE');
  }
  
  if (!subscription) {
    throw new CustomError('Subscription not found', 404, 'NOT_FOUND');
  }
  
  subscription.preferences = { ...subscription.preferences, ...preferences };
  await subscription.save();
  
  logger.info(`Updated preferences for ${type}: ${identifier}`);
  
  return success(res, {
    updated: true,
    preferences: subscription.preferences
  });
});

module.exports = {
  subscribeEmail,
  verifyEmail,
  unsubscribeEmail,
  subscribePush,
  unsubscribePush,
  getVapidPublicKey,
  sendTestNotification,
  updatePreferences
};
