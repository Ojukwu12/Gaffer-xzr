/**
 * User Model
 * Stores user information and preferences
 * @module models/User
 */

const mongoose = require('mongoose');

/**
 * User Schema
 */
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  
  preferences: {
    // Markets the user is interested in
    watchedMarkets: [{
      type: String,
      trim: true
    }],
    
    // Notification frequency
    notificationFrequency: {
      type: String,
      enum: ['immediate', 'daily', 'weekly'],
      default: 'daily'
    },
    
    // Categories of interest
    categories: [{
      type: String,
      trim: true
    }],
    
    // Minimum confidence threshold for notifications
    confidenceThreshold: {
      type: Number,
      min: 0,
      max: 100,
      default: 70
    }
  },
  
  // Subscription status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Last notification sent
  lastNotificationSent: {
    type: Date,
    default: null
  },
  
  // User metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    signupSource: String
  }
}, {
  timestamps: true,
  collection: 'users'
});

/**
 * Indexes for better query performance
 */
userSchema.index({ isActive: 1 });
userSchema.index({ 'preferences.watchedMarkets': 1 });
userSchema.index({ createdAt: -1 });

/**
 * Instance method to check if user should receive notification
 * @returns {boolean}
 */
userSchema.methods.shouldReceiveNotification = function() {
  if (!this.isActive) return false;
  if (!this.lastNotificationSent) return true;
  
  const now = new Date();
  const lastSent = new Date(this.lastNotificationSent);
  const hoursSinceLastNotification = (now - lastSent) / (1000 * 60 * 60);
  
  switch (this.preferences.notificationFrequency) {
    case 'immediate':
      return true;
    case 'daily':
      return hoursSinceLastNotification >= 24;
    case 'weekly':
      return hoursSinceLastNotification >= 168;
    default:
      return false;
  }
};

/**
 * Static method to find users watching a specific market
 * @param {string} marketId - Market ID
 * @returns {Promise<Array>}
 */
userSchema.statics.findByWatchedMarket = function(marketId) {
  return this.find({
    isActive: true,
    'preferences.watchedMarkets': marketId
  });
};

module.exports = mongoose.model('User', userSchema);
