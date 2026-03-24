/**
 * Prediction Record Model
 * Stores prediction history for performance tracking
 * @module models/PredictionRecord
 */

const mongoose = require('mongoose');

const predictionRecordSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  marketTitle: {
    type: String,
    trim: true
  },
  marketSlug: {
    type: String,
    default: null,
    trim: true
  },
  polymarketUrl: {
    type: String,
    required: true,
    trim: true
  },
  option: {
    type: String,
    required: true,
    trim: true
  },
  timeframe: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true,
    default: 'daily'
  },
  predictionType: {
    type: String,
    enum: ['option', 'unified'],
    default: 'option'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending',
    index: true
  },
  reviewedBy: {
    type: String,
    default: null,
    trim: true
  },
  reviewNotes: {
    type: String,
    default: '',
    trim: true
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  evaluationMode: {
    type: String,
    enum: ['production', 'paper', 'staging'],
    default: 'production',
    index: true
  },
  predictedAnswer: {
    type: String,
    enum: ['YES', 'NO'],
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  marketProbabilityAtTime: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  aiProbability: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  aiProbabilityHistory: {
    type: [Number],
    default: []
  },
  lastEditedAt: {
    type: Date,
    default: null
  },
  lastEditedBy: {
    type: String,
    default: null,
    trim: true
  },
  marketClassification: {
    type: String,
    enum: ['politics', 'crypto', 'technology', 'global events', 'finance/economy', 'unpredictable/noise', null],
    default: null
  },
  marketPredictabilityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  signalStrengthScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  differenceBetweenMarketProbabilityAndAI: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  mispricingScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  mispricingDirection: {
    type: String,
    enum: ['overpriced', 'underpriced', 'fair', 'unknown', null],
    default: null
  },
  expectedEdgeScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  marketBucket: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  thresholdsUsed: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  votes: {
    totalLikes: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDislikes: {
      type: Number,
      default: 0,
      min: 0
    },
    weightedLikes: {
      type: Number,
      default: 0,
      min: 0
    },
    weightedDislikes: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  reason: {
    type: String,
    default: '',
    trim: true
  },
  predictedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  isResolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  winningOption: {
    type: String,
    default: null
  },
  actualAnswer: {
    type: String,
    enum: ['YES', 'NO', null],
    default: null
  },
  isCorrect: {
    type: Boolean,
    default: null,
    index: true
  },
  finalMarketResult: {
    type: String,
    enum: ['YES', 'NO', 'TRUE', 'FALSE', null],
    default: null
  },
  isAiCorrect: {
    type: Boolean,
    default: null
  },
  expiredAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true,
  collection: 'prediction_records'
});

predictionRecordSchema.index({ predictedAt: -1 });
predictionRecordSchema.index({ marketId: 1, predictedAt: -1 });

module.exports = mongoose.model('PredictionRecord', predictionRecordSchema);
