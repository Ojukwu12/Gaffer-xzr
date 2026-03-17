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
  }
}, {
  timestamps: true,
  collection: 'prediction_records'
});

predictionRecordSchema.index({ predictedAt: -1 });
predictionRecordSchema.index({ marketId: 1, predictedAt: -1 });

module.exports = mongoose.model('PredictionRecord', predictionRecordSchema);
