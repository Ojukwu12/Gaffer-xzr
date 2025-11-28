/**
 * Webhook Model
 * Stores webhook registrations for external integrations
 * @module models/Webhook
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Webhook Schema
 */
const webhookSchema = new mongoose.Schema({
  // Webhook URL
  url: {
    type: String,
    required: [true, 'Webhook URL is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid webhook URL'
    }
  },
  
  // Secret for signature verification
  secret: {
    type: String,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  // Events to subscribe to
  events: [{
    type: String,
    enum: [
      'prediction.created',
      'prediction.updated',
      'market.trending',
      'whale.activity',
      'high.confidence'
    ]
  }],
  
  // Filters
  filters: {
    minConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 70
    },
    markets: [{
      type: String,
      trim: true
    }],
    categories: [{
      type: String,
      trim: true
    }]
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Retry configuration
  retryConfig: {
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },
    retryDelay: {
      type: Number,
      default: 5000,
      min: 1000
    }
  },
  
  // Statistics
  stats: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    lastDelivery: {
      type: Date,
      default: null
    },
    lastSuccess: {
      type: Date,
      default: null
    },
    lastFailure: {
      type: Date,
      default: null
    }
  },
  
  // Error tracking
  consecutiveFailures: {
    type: Number,
    default: 0
  },
  
  lastError: {
    type: String,
    default: null
  },
  
  // Metadata
  metadata: {
    name: String,
    description: String,
    owner: String,
    tags: [String]
  }
}, {
  timestamps: true,
  collection: 'webhooks'
});

/**
 * Indexes
 */
webhookSchema.index({ isActive: 1 });
webhookSchema.index({ events: 1 });
webhookSchema.index({ 'filters.markets': 1 });
webhookSchema.index({ createdAt: -1 });

/**
 * Generates HMAC signature for webhook payload
 * @param {Object} payload - Webhook payload
 * @returns {string} Signature
 */
webhookSchema.methods.generateSignature = function(payload) {
  return crypto
    .createHmac('sha256', this.secret)
    .update(JSON.stringify(payload))
    .digest('hex');
};

/**
 * Records successful delivery
 */
webhookSchema.methods.recordSuccess = function() {
  this.stats.totalDeliveries += 1;
  this.stats.successfulDeliveries += 1;
  this.stats.lastDelivery = new Date();
  this.stats.lastSuccess = new Date();
  this.consecutiveFailures = 0;
  return this.save();
};

/**
 * Records failed delivery
 * @param {string} errorMessage - Error message
 */
webhookSchema.methods.recordFailure = function(errorMessage) {
  this.stats.totalDeliveries += 1;
  this.stats.failedDeliveries += 1;
  this.stats.lastDelivery = new Date();
  this.stats.lastFailure = new Date();
  this.lastError = errorMessage;
  this.consecutiveFailures += 1;
  
  // Disable webhook after 10 consecutive failures
  if (this.consecutiveFailures >= 10) {
    this.isActive = false;
  }
  
  return this.save();
};

/**
 * Checks if webhook should receive event
 * @param {string} event - Event type
 * @param {Object} data - Event data
 * @returns {boolean}
 */
webhookSchema.methods.shouldReceiveEvent = function(event, data) {
  if (!this.isActive) return false;
  if (!this.events.includes(event)) return false;
  
  // Check confidence filter
  if (data.confidence && data.confidence < this.filters.minConfidence) {
    return false;
  }
  
  // Check market filter
  if (this.filters.markets.length > 0 && data.marketId) {
    if (!this.filters.markets.includes(data.marketId)) {
      return false;
    }
  }
  
  return true;
};

module.exports = mongoose.model('Webhook', webhookSchema);
