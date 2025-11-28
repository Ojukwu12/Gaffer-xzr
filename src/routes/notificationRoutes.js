/**
 * Notification Routes
 * Defines routes for notification subscription and management
 * @module routes/notificationRoutes
 */

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { strictLimiter, generalLimiter } = require('../middlewares/rateLimit');

/**
 * POST /api/notifications/email/subscribe
 * Subscribe to email notifications
 */
router.post('/email/subscribe',
  strictLimiter,
  [
    body('email')
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('markets')
      .optional()
      .isArray(),
    body('preferences')
      .optional()
      .isObject()
  ],
  notificationController.subscribeEmail
);

/**
 * GET /api/notifications/email/verify
 * Verify email subscription
 */
router.get('/email/verify',
  generalLimiter,
  [
    query('token')
      .notEmpty()
      .withMessage('Verification token is required')
  ],
  notificationController.verifyEmail
);

/**
 * POST /api/notifications/email/unsubscribe
 * Unsubscribe from email notifications
 */
router.post('/email/unsubscribe',
  generalLimiter,
  [
    body('token')
      .optional()
      .isString(),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
  ],
  notificationController.unsubscribeEmail
);

/**
 * POST /api/notifications/push/subscribe
 * Subscribe to push notifications
 */
router.post('/push/subscribe',
  strictLimiter,
  [
    body('subscription')
      .notEmpty()
      .withMessage('Push subscription object is required')
      .isObject(),
    body('subscription.endpoint')
      .notEmpty()
      .withMessage('Subscription endpoint is required'),
    body('subscription.keys')
      .notEmpty()
      .withMessage('Subscription keys are required')
      .isObject(),
    body('subscription.keys.p256dh')
      .notEmpty()
      .withMessage('p256dh key is required'),
    body('subscription.keys.auth')
      .notEmpty()
      .withMessage('Auth key is required'),
    body('markets')
      .optional()
      .isArray(),
    body('preferences')
      .optional()
      .isObject()
  ],
  notificationController.subscribePush
);

/**
 * POST /api/notifications/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/push/unsubscribe',
  generalLimiter,
  [
    body('endpoint')
      .notEmpty()
      .withMessage('Endpoint is required')
  ],
  notificationController.unsubscribePush
);

/**
 * GET /api/notifications/push/vapid-public-key
 * Get VAPID public key for push subscriptions
 */
router.get('/push/vapid-public-key',
  generalLimiter,
  notificationController.getVapidPublicKey
);

/**
 * POST /api/notifications/test
 * Send test notification
 */
router.post('/test',
  strictLimiter,
  [
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail(),
    body('pushSubscription')
      .optional()
      .isObject()
  ],
  notificationController.sendTestNotification
);

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences
 */
router.patch('/preferences',
  generalLimiter,
  [
    body('type')
      .notEmpty()
      .withMessage('Type is required')
      .isIn(['email', 'push']),
    body('identifier')
      .notEmpty()
      .withMessage('Identifier is required'),
    body('preferences')
      .notEmpty()
      .withMessage('Preferences object is required')
      .isObject()
  ],
  notificationController.updatePreferences
);

module.exports = router;
