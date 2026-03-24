/**
 * ML Correction Log Model
 * Stores correction-layer decisions for monitoring and outlier review.
 * @module models/MlCorrectionLog
 */

const mongoose = require('mongoose');

const mlCorrectionLogSchema = new mongoose.Schema({
  marketId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  timeframe: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'unknown'],
    default: 'unknown'
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
  correctedProbability: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  adjustmentAmount: {
    type: Number,
    required: true
  },
  modelConfidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  applied: {
    type: Boolean,
    default: false
  },
  reason: {
    type: String,
    default: 'applied'
  }
}, {
  timestamps: true,
  collection: 'ml_correction_logs'
});

mlCorrectionLogSchema.index({ marketId: 1, createdAt: -1 });
mlCorrectionLogSchema.index({ marketCategory: 1, createdAt: -1 });

module.exports = mongoose.model('MlCorrectionLog', mlCorrectionLogSchema);
