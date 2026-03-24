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
  // User ID (optional, for authenticated votes)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  deviceHash: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  ipHash: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  voteType: {
    type: String,
    enum: ['like', 'dislike'],
    required: true
  },
  // Vote weight multiplier (1.0 = normal, <1.0 = reduced due to suspicion/new account)
  weight: {
    type: Number,
    default: 1.0,
    min: 0.1,
    max: 1.0
  },
  // Flags indicating why weight was reduced
  suspicionFlags: [{
    type: String,
    enum: ['ip_concentration', 'velocity_spike', 'new_account', 'account_age']
  }],
  // Account age in days when vote was cast (for tracking)
  accountAgeDays: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'prediction_votes'
});

// Enforce one-vote-per-user-per-prediction (via userId when available)
predictionVoteSchema.index({ predictionId: 1, userId: 1 }, { 
  unique: true, 
  sparse: true 
});
// Also keep device-based uniqueness for anonymous votes
predictionVoteSchema.index({ predictionId: 1, deviceHash: 1 }, { 
  unique: true,
  partialFilterExpression: { userId: { $exists: false } }
});
predictionVoteSchema.index({ predictionId: 1, voteType: 1 });
predictionVoteSchema.index({ predictionId: 1, createdAt: -1 });
predictionVoteSchema.index({ predictionId: 1, ipHash: 1, createdAt: -1 });
predictionVoteSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('PredictionVote', predictionVoteSchema);
