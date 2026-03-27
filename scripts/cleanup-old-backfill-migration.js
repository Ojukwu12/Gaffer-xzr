#!/usr/bin/env node
/**
 * Cleanup script: Remove old backfill migration state to allow v2 backfill to run
 */

const mongoose = require('mongoose');
const config = require('../src/config/env');
const logger = require('../src/config/logger');

const OLD_BACKFILL_KEY = '2026-03-27-approved-reason-backfill-v1';

const cleanup = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    
    const MigrationState = require('../src/models/MigrationState');
    
    const result = await MigrationState.deleteOne({ key: OLD_BACKFILL_KEY });
    
    if (result.deletedCount > 0) {
      logger.info(`✓ Deleted old migration record: ${OLD_BACKFILL_KEY}`);
      logger.info('Old backfill v1 migration cleared. Next deploy will run backfill v2.');
    } else {
      logger.info(`ℹ No old migration record found for key: ${OLD_BACKFILL_KEY}`);
    }
    
    await mongoose.disconnect();
    logger.info('Cleanup completed.');
    process.exit(0);
  } catch (error) {
    logger.error('Cleanup failed:', error);
    process.exit(1);
  }
};

cleanup();
