/**
 * Push Subscription Model
 * Manages Web Push notification subscriptions
 * @module models/PushSubscription
 */

const mongoose = require('mongoose');

/**
 * Push Subscription Schema
 */
const pushSubscriptionSchema = new mongoose.Schema({
  // Web Push subscription object
  subscription: {
    endpoint: {
      type: String,
      required: [true, 'Push endpoint is required'],
      unique: true
    },
    keys: {
      p256dh: {
        type: String,
        required: [true, 'P256DH key is required']
      },
      auth: {
        type: String,
        required: [true, 'Auth key is required']
      }
    }
  },
  
  // Markets to receive notifications for
  markets: [{
    marketId: {
      type: String,
      required: true,
      trim: true
    },
    marketTitle: {
      type: String,
      trim: true
    },
    subscribedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Notification preferences
  preferences: {
    // Minimum confidence to trigger notification
    minConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 75
    },
    
    // Maximum notifications per day
    maxNotificationsPerDay: {
      type: Number,
      min: 1,
      max: 50,
      default: 20
    },
    
    // Categories to subscribe to
    categories: [{
      type: String,
      trim: true
    }],
    
    // Notify on significant changes
    notifyOnChange: {
      type: Boolean,
      default: true
    },

    // Notify when subscribed markets resolve
    notifyOnResolution: {
      type: Boolean,
      default: true
    },

    // Send a weekly performance digest push
    notifyWeeklyDigest: {
      type: Boolean,
      default: true
    },
    
    // Minimum change percentage to notify
    minChangePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 5
    }
  },
  
  // Subscription status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Notification tracking
  notificationCount: {
    today: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    },
    lastReset: {
      type: Date,
      default: Date.now
    }
  },
  
  lastNotificationSent: {
    type: Date,
    default: null
  },
  
  // Error tracking for failed push attempts
  failureCount: {
    type: Number,
    default: 0
  },
  
  lastFailure: {
    type: Date,
    default: null
  },
  
  lastError: {
    type: String,
    default: null
  },
  
  // Device/browser information
  device: {
    userAgent: String,
    browser: String,
    os: String,
    deviceType: String
  },
  
  // Metadata
  metadata: {
    ipAddress: String,
    source: String
  }
}, {
  timestamps: true,
  collection: 'push_subscriptions'
});

/**
 * Indexes
 */
pushSubscriptionSchema.index({ isActive: 1 });
pushSubscriptionSchema.index({ 'markets.marketId': 1 });
pushSubscriptionSchema.index({ failureCount: 1 });
pushSubscriptionSchema.index({ createdAt: -1 });

/**
 * Pre-save hook to reset daily notification count
 */
pushSubscriptionSchema.pre('save', function(next) {
  const now = new Date();
  const lastReset = new Date(this.notificationCount.lastReset);
  const hoursSinceReset = (now - lastReset) / (1000 * 60 * 60);
  
  // Reset daily count if more than 24 hours have passed
  if (hoursSinceReset >= 24) {
    this.notificationCount.today = 0;
    this.notificationCount.lastReset = now;
  }
  
  next();
});

/**
 * Instance method to check if subscription can receive notification
 * @returns {boolean}
 */
pushSubscriptionSchema.methods.canReceiveNotification = function() {
  if (!this.isActive) return false;
  
  // Disable if too many failures (indicates invalid subscription)
  if (this.failureCount >= 5) return false;
  
  // Check daily limit
  if (this.notificationCount.today >= this.preferences.maxNotificationsPerDay) {
    return false;
  }
  
  // Allow notification if none sent yet
  if (!this.lastNotificationSent) return true;
  
  // Minimum 5 minutes between push notifications
  const now = new Date();
  const lastSent = new Date(this.lastNotificationSent);
  const minutesSinceLastNotification = (now - lastSent) / (1000 * 60);
  
  return minutesSinceLastNotification >= 5;
};

/**
 * Instance method to increment notification count
 */
pushSubscriptionSchema.methods.incrementNotificationCount = function() {
  this.notificationCount.today += 1;
  this.notificationCount.total += 1;
  this.lastNotificationSent = new Date();
  return this.save();
};

/**
 * Instance method to record a failed push attempt
 * @param {string} errorMessage - Error message
 */
pushSubscriptionSchema.methods.recordFailure = function(errorMessage) {
  this.failureCount += 1;
  this.lastFailure = new Date();
  this.lastError = errorMessage;
  
  // Deactivate if too many failures
  if (this.failureCount >= 5) {
    this.isActive = false;
  }
  
  return this.save();
};

/**
 * Instance method to reset failure count
 */
pushSubscriptionSchema.methods.resetFailures = function() {
  this.failureCount = 0;
  this.lastFailure = null;
  this.lastError = null;
  return this.save();
};

/**
 * Static method to find active subscriptions for a market
 * @param {string} marketId - Market ID
 * @returns {Promise<Array>}
 */
pushSubscriptionSchema.statics.findActiveByMarket = function(marketId) {
  return this.find({
    isActive: true,
    failureCount: { $lt: 5 },
    $or: [
      { 'markets.marketId': marketId },
      { markets: { $size: 0 } },
      { markets: { $exists: false } }
    ]
  });
};

/**
 * Static method to clean up invalid subscriptions
 * @returns {Promise<Object>}
 */
pushSubscriptionSchema.statics.cleanupInvalidSubscriptions = function() {
  return this.deleteMany({
    $or: [
      { failureCount: { $gte: 10 } },
      { isActive: false, updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    ]
  });
};

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
