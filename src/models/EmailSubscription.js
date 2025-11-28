/**
 * Email Subscription Model
 * Manages email subscription data
 * @module models/EmailSubscription
 */

const mongoose = require('mongoose');

/**
 * Email Subscription Schema
 */
const emailSubscriptionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
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
    frequency: {
      type: String,
      enum: ['immediate', 'daily', 'weekly'],
      default: 'daily'
    },
    
    // Minimum confidence to trigger notification
    minConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 70
    },
    
    // Maximum notifications per day
    maxNotificationsPerDay: {
      type: Number,
      min: 1,
      max: 50,
      default: 10
    },
    
    // Categories to subscribe to
    categories: [{
      type: String,
      trim: true
    }],
    
    // Include feature data in emails
    includeFeatures: {
      type: Boolean,
      default: false
    }
  },
  
  // Subscription status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  
  verificationToken: {
    type: String,
    select: false
  },
  
  // Unsubscribe token
  unsubscribeToken: {
    type: String,
    required: true,
    unique: true
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
  
  // Metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    source: String
  }
}, {
  timestamps: true,
  collection: 'email_subscriptions'
});

/**
 * Indexes
 */
emailSubscriptionSchema.index({ isActive: 1, isVerified: 1 });
emailSubscriptionSchema.index({ 'markets.marketId': 1 });
emailSubscriptionSchema.index({ createdAt: -1 });

/**
 * Pre-save hook to reset daily notification count
 */
emailSubscriptionSchema.pre('save', function(next) {
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
emailSubscriptionSchema.methods.canReceiveNotification = function() {
  if (!this.isActive || !this.isVerified) return false;
  
  // Check daily limit
  if (this.notificationCount.today >= this.preferences.maxNotificationsPerDay) {
    return false;
  }
  
  // Check frequency preference
  if (!this.lastNotificationSent) return true;
  
  const now = new Date();
  const lastSent = new Date(this.lastNotificationSent);
  const hoursSinceLastNotification = (now - lastSent) / (1000 * 60 * 60);
  
  switch (this.preferences.frequency) {
    case 'immediate':
      return hoursSinceLastNotification >= 0.5; // At least 30 minutes between notifications
    case 'daily':
      return hoursSinceLastNotification >= 24;
    case 'weekly':
      return hoursSinceLastNotification >= 168;
    default:
      return false;
  }
};

/**
 * Instance method to increment notification count
 */
emailSubscriptionSchema.methods.incrementNotificationCount = function() {
  this.notificationCount.today += 1;
  this.notificationCount.total += 1;
  this.lastNotificationSent = new Date();
  return this.save();
};

/**
 * Static method to find active subscriptions for a market
 * @param {string} marketId - Market ID
 * @returns {Promise<Array>}
 */
emailSubscriptionSchema.statics.findActiveByMarket = function(marketId) {
  return this.find({
    isActive: true,
    isVerified: true,
    'markets.marketId': marketId
  });
};

module.exports = mongoose.model('EmailSubscription', emailSubscriptionSchema);
