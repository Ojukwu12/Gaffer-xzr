/**
 * Prediction Cache Model
 * Stores cached prediction results
 * @module models/PredictionCache
 */

const mongoose = require('mongoose');

/**
 * Prediction Cache Schema
 */
const predictionCacheSchema = new mongoose.Schema({
  // Market identification
  marketId: {
    type: String,
    required: [true, 'Market ID is required'],
    trim: true,
    index: true
  },
  
  marketTitle: {
    type: String,
    trim: true
  },
  
  // Option being predicted
  option: {
    type: String,
    required: [true, 'Option is required'],
    trim: true
  },
  
  // Timeframe for prediction
  timeframe: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: [true, 'Timeframe is required'],
    default: 'daily'
  },
  
  // Prediction results
  prediction: {
    answer: {
      type: String,
      enum: ['YES', 'NO']
    },

    confidence: {
      type: Number,
      required: [true, 'Confidence is required'],
      min: 0,
      max: 100
    },
    
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true
    },

    yes_probability: Number,
    no_probability: Number,
    notes: String,
    summary: mongoose.Schema.Types.Mixed,
    polymarketUrl: String,
    timestamp: String,
    
    // All computed features (40+)
    features: {
      // Liquidity & Volume
      liquidity: Number,
      volume24h: Number,
      volume7d: Number,
      volume30d: Number,
      
      // Whale Metrics
      whaleFactor: Number,
      whaleCount: Number,
      whaleVolume: Number,
      
      // Trend Metrics
      trendScore: Number,
      dailyChange: Number,
      weeklyChange: Number,
      monthlyChange: Number,
      
      // Sentiment
      sentimentScore: Number,
      
      // Trading Activity
      tradeCount24h: Number,
      tradeCount7d: Number,
      uniqueTraders24h: Number,
      uniqueTraders7d: Number,
      
      // Price Metrics
      currentPrice: Number,
      highPrice24h: Number,
      lowPrice24h: Number,
      priceVolatility: Number,
      
      // Market Depth
      bidAskSpread: Number,
      orderBookDepth: Number,
      
      // Momentum
      momentumScore: Number,
      accelerationScore: Number,
      
      // Market Age
      marketAge: Number,
      daysUntilExpiry: Number,
      
      // Participation
      participationRate: Number,
      holderCount: Number,
      
      // Concentration
      concentrationRatio: Number,
      giniCoefficient: Number,
      
      // Network Effects
      socialMentions: Number,
      communityGrowth: Number,
      
      // Risk
      riskScore: Number,
      liquidityRisk: Number,
      
      // Efficiency
      marketEfficiency: Number,
      
      // Correlation
      categoryCorrelation: Number,
      
      // Historical
      historicalAccuracy: Number,
      
      // Option-Specific
      optionPopularity: Number,
      optionMomentum: Number,
      
      // Smart Money
      smartMoneyFlow: Number,
      smartMoneyDirection: Number,
      
      // Anomaly
      anomalyScore: Number
    }
  },
  
  // Cache metadata
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // TTL and expiration
  expiresAt: {
    type: Date,
    required: true
  },
  
  // Hit tracking
  hitCount: {
    type: Number,
    default: 0
  },
  
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  
  // Computation metadata
  computationTime: {
    type: Number, // milliseconds
    default: 0
  },
  
  llmModel: {
    type: String,
    default: 'gemini-1.5-flash'
  },
  
  // Version for cache invalidation
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  collection: 'prediction_cache'
});

/**
 * Compound indexes for efficient querying
 */
predictionCacheSchema.index({ marketId: 1, option: 1, timeframe: 1 });
predictionCacheSchema.index({ createdAt: -1 });

/**
 * TTL index to automatically delete expired documents
 */
predictionCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Static method to generate cache key
 * @param {string} marketId - Market ID
 * @param {string} option - Option name
 * @param {string} timeframe - Timeframe
 * @returns {string} Cache key
 */
predictionCacheSchema.statics.generateCacheKey = function(marketId, option, timeframe) {
  return `prediction:${marketId}:${option}:${timeframe}`;
};

/**
 * Static method to get cached prediction
 * @param {string} marketId - Market ID
 * @param {string} option - Option name
 * @param {string} timeframe - Timeframe
 * @returns {Promise<Object|null>}
 */
predictionCacheSchema.statics.getCached = async function(marketId, option, timeframe) {
  const cacheKey = this.generateCacheKey(marketId, option, timeframe);
  
  const cached = await this.findOne({
    cacheKey,
    expiresAt: { $gt: new Date() }
  });
  
  if (cached) {
    // Update hit count and last accessed
    cached.hitCount += 1;
    cached.lastAccessed = new Date();
    await cached.save();
  }
  
  return cached;
};

/**
 * Static method to set cached prediction
 * @param {string} marketId - Market ID
 * @param {string} marketTitle - Market title
 * @param {string} option - Option name
 * @param {string} timeframe - Timeframe
 * @param {Object} prediction - Prediction data
 * @param {number} ttlSeconds - TTL in seconds
 * @param {number} computationTime - Computation time in ms
 * @returns {Promise<Object>}
 */
predictionCacheSchema.statics.setCached = async function(
  marketId, 
  marketTitle, 
  option, 
  timeframe, 
  prediction, 
  ttlSeconds = 300,
  computationTime = 0
) {
  const cacheKey = this.generateCacheKey(marketId, option, timeframe);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  
  return this.findOneAndUpdate(
    { cacheKey },
    {
      marketId,
      marketTitle,
      option,
      timeframe,
      prediction,
      expiresAt,
      computationTime,
      cacheKey,
      lastAccessed: new Date()
    },
    { upsert: true, new: true }
  );
};

/**
 * Static method to invalidate cache for a market
 * @param {string} marketId - Market ID
 * @returns {Promise<Object>}
 */
predictionCacheSchema.statics.invalidateMarket = function(marketId) {
  return this.deleteMany({ marketId });
};

/**
 * Static method to clear all expired cache entries
 * @returns {Promise<Object>}
 */
predictionCacheSchema.statics.clearExpired = function() {
  return this.deleteMany({ expiresAt: { $lt: new Date() } });
};

/**
 * Static method to get cache statistics
 * @returns {Promise<Object>}
 */
predictionCacheSchema.statics.getStats = async function() {
  const total = await this.countDocuments();
  const active = await this.countDocuments({ expiresAt: { $gt: new Date() } });
  const expired = total - active;
  
  const hitStats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalHits: { $sum: '$hitCount' },
        avgHits: { $avg: '$hitCount' },
        maxHits: { $max: '$hitCount' }
      }
    }
  ]);
  
  return {
    total,
    active,
    expired,
    hits: hitStats[0] || { totalHits: 0, avgHits: 0, maxHits: 0 }
  };
};

module.exports = mongoose.model('PredictionCache', predictionCacheSchema);
