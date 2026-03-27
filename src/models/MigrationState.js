/**
 * Migration State Model
 * Tracks one-time data backfill/migration jobs.
 * @module models/MigrationState
 */

const mongoose = require('mongoose');

const migrationStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  state: {
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  stats: {
    scanned: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  collection: 'migration_states'
});

module.exports = mongoose.model('MigrationState', migrationStateSchema);
