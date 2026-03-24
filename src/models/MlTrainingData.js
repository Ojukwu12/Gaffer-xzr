/**
 * ML Training Data Model
 * Stores resolved market snapshots for internal ML correction learning.
 * @module models/MlTrainingData
 */

const mongoose = require('mongoose');

const mlTrainingDataSchema = new mongoose.Schema({
  predictionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PredictionRecord',
    required: true,
    unique: true,
    index: true
  },
  marketId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  marketCategory: {
    type: String,
    default: 'unknown',
    trim: true,
    index: true
  },
  externalAiProbability: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  mlCorrectedProbability: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  finalOutcome: {
    type: String,
    enum: ['YES', 'NO'],
    required: true,
    index: true
  },
  predictionTimestamp: {
    type: Date,
    required: true,
    index: true
  },
  timeRemainingSummary: {
    type: String,
    default: 'unknown'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  signalSummary: {
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
    mispricingScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    liquidityBand: {
      type: String,
      enum: ['high', 'medium', 'low', 'unknown'],
      default: 'unknown'
    },
    volatilityBand: {
      type: String,
      enum: ['high', 'medium', 'low', 'unknown'],
      default: 'unknown'
    },
    suspiciousSignals: {
      type: [String],
      default: []
    }
  },
  isPredictionCorrect: {
    type: Boolean,
    default: null
  },
  source: {
    type: String,
    enum: ['expiry_cleanup', 'performance_sync'],
    required: true,
    default: 'expiry_cleanup'
  }
}, {
  timestamps: true,
  collection: 'ml_training_data'
});

mlTrainingDataSchema.index({ marketId: 1, predictionTimestamp: -1 });
mlTrainingDataSchema.index({ finalOutcome: 1, marketCategory: 1 });

module.exports = mongoose.model('MlTrainingData', mlTrainingDataSchema);
