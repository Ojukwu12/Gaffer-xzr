/**
 * Prediction Vote Model
 * Stores one like/dislike vote per device fingerprint for each prediction
 * @module models/PredictionVote
 */

const mongoose = require('mongoose');

const predictionVoteSchema = new mongoose.Schema({
  predictionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PredictionRecord',
    required: true,
    index: true
  },
  deviceHash: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  voteType: {
    type: String,
    enum: ['like', 'dislike'],
    required: true
  }
}, {
  timestamps: true,
  collection: 'prediction_votes'
});

predictionVoteSchema.index({ predictionId: 1, deviceHash: 1 }, { unique: true });
predictionVoteSchema.index({ predictionId: 1, voteType: 1 });

module.exports = mongoose.model('PredictionVote', predictionVoteSchema);
