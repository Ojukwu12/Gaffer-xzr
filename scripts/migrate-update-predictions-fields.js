#!/usr/bin/env node
/**
 * Migration: Update all pending and approved predictions with latest fields
 * - Ensures all predictions have correct marketSlug and polymarketUrl
 * - Populates missing fields from market data
 * - Runs on deployment to backfill data
 */

const mongoose = require('mongoose');
const config = require('../src/config/env');
const logger = require('../src/config/logger');
const polymarketService = require('../src/services/polymarketService');

const MIGRATION_KEY = '2026-03-30-update-predictions-fields-v1';

const migrate = async () => {
  try {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('Starting prediction fields migration');
    logger.info('═══════════════════════════════════════════════════════════');
    
    await mongoose.connect(config.mongoUri);
    logger.info('✓ Connected to MongoDB');
    
    const MigrationState = require('../src/models/MigrationState');
    const PredictionRecord = require('../src/models/PredictionRecord');
    
    // Check if already migrated
    const existing = await MigrationState.findOne({ key: MIGRATION_KEY });
    if (existing && existing.status === 'completed') {
      logger.info(`✓ Migration already completed on ${existing.completedAt}`);
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Record migration start
    await MigrationState.updateOne(
      { key: MIGRATION_KEY },
      {
        key: MIGRATION_KEY,
        status: 'in_progress',
        startedAt: new Date(),
        migrationName: 'Update Predictions Fields v1'
      },
      { upsert: true }
    );
    logger.info('Recording migration start...');
    
    // Fetch all pending and approved predictions
    const predictions = await PredictionRecord.find({
      status: { $in: ['pending', 'approved'] }
    }).lean();
    
    logger.info(`Found ${predictions.length} predictions to update`);
    
    if (predictions.length === 0) {
      logger.info('No predictions to update');
      await MigrationState.updateOne(
        { key: MIGRATION_KEY },
        {
          status: 'completed',
          completedAt: new Date(),
          recordsUpdated: 0
        }
      );
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Group predictions by market ID for efficient batch fetching
    const marketIds = [...new Set(predictions.map(p => p.marketId))];
    logger.info(`Fetching data for ${marketIds.length} unique markets`);
    
    const marketDataMap = {};
    let marketsFetched = 0;
    let marketsFailed = 0;
    
    // Fetch market data from Polymarket
    for (const marketId of marketIds) {
      try {
        const rawMarket = await polymarketService.fetchMarketById(marketId);
        const parsedMarket = polymarketService.parseMarket(rawMarket);
        marketDataMap[marketId] = parsedMarket;
        marketsFetched++;
        
        if (marketsFetched % 10 === 0) {
          logger.info(`  Fetched ${marketsFetched}/${marketIds.length} markets`);
        }
      } catch (error) {
        logger.warn(`Failed to fetch market ${marketId}: ${error.message}`);
        marketsFailed++;
      }
    }
    
    logger.info(`✓ Fetched market data: ${marketsFetched} succeeded, ${marketsFailed} failed`);
    
    // Update predictions
    let updated = 0;
    let skipped = 0;
    const errors = [];
    
    for (const prediction of predictions) {
      try {
        const marketData = marketDataMap[prediction.marketId];
        
        if (!marketData) {
          logger.warn(`No market data for prediction ${prediction._id}, skipping`);
          skipped++;
          continue;
        }
        
        // Build update object with all necessary fields
        const updates = {
          marketSlug: marketData.slug,
          polymarketUrl: polymarketService.getMarketUrl({
            marketId: prediction.marketId,
            slug: marketData.slug
          }),
          marketTitle: marketData.title || prediction.marketTitle,
          // Ensure other critical fields are present
          ...(prediction.updatedAt ? {} : { updatedAt: new Date() })
        };
        
        // Only update if something changed
        if (
          prediction.marketSlug !== updates.marketSlug ||
          prediction.polymarketUrl !== updates.polymarketUrl
        ) {
          await PredictionRecord.updateOne(
            { _id: prediction._id },
            { $set: updates }
          );
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error(`Failed to update prediction ${prediction._id}: ${error.message}`);
        errors.push({
          predictionId: prediction._id.toString(),
          error: error.message
        });
      }
    }
    
    logger.info(`✓ Updated ${updated} predictions, skipped ${skipped} (no changes)`);
    
    if (errors.length > 0) {
      logger.warn(`⚠ ${errors.length} errors encountered:`);
      errors.slice(0, 5).forEach(err => {
        logger.warn(`  - ${err.predictionId}: ${err.error}`);
      });
    }
    
    // Record migration completion
    await MigrationState.updateOne(
      { key: MIGRATION_KEY },
      {
        status: 'completed',
        completedAt: new Date(),
        recordsUpdated: updated,
        recordsSkipped: skipped,
        recordsFailed: errors.length,
        details: {
          totalPredictions: predictions.length,
          uniqueMarkets: marketIds.length,
          marketsFetched,
          marketsFailed,
          errors: errors.slice(0, 10) // Store first 10 errors
        }
      }
    );
    
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('✓ Migration completed successfully');
    logger.info(`  • Total predictions: ${predictions.length}`);
    logger.info(`  • Updated: ${updated}`);
    logger.info(`  • Skipped: ${skipped}`);
    logger.info(`  • Failed: ${errors.length}`);
    logger.info('═══════════════════════════════════════════════════════════');
    
    await mongoose.disconnect();
    process.exit(updated > 0 || errors.length === 0 ? 0 : 1);
  } catch (error) {
    logger.error('Migration failed:', error);
    
    // Record failure
    try {
      const MigrationState = require('../src/models/MigrationState');
      await MigrationState.updateOne(
        { key: MIGRATION_KEY },
        {
          status: 'failed',
          failedAt: new Date(),
          error: error.message
        }
      );
    } catch (e) {
      logger.error('Failed to record migration failure:', e);
    }
    
    process.exit(1);
  }
};

// Run migration
migrate();
