#!/usr/bin/env node
/**
 * Migration: Backfill Polymarket links for all predictions and caches
 * - Updates ALL prediction records (any status) with canonical event links
 * - Updates PredictionCache prediction.polymarketUrl links
 * - Populates/repairs marketSlug from fetched market data when available
 */

const mongoose = require('mongoose');
const config = require('../src/config/env');
const logger = require('../src/config/logger');
const polymarketService = require('../src/services/polymarketService');

const MIGRATION_KEY = '2026-03-30-polymarket-links-backfill-v2';

const buildEventUrlFromSlug = (slug) => {
  if (!slug) return null;
  return `https://polymarket.com/event/${encodeURIComponent(slug)}`;
};

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
        migrationName: 'Polymarket Links Backfill v2'
      },
      { upsert: true }
    );
    logger.info('Recording migration start...');
    
    // Fetch all predictions (all statuses)
    const predictions = await PredictionRecord.find({}).lean();
    const PredictionCache = require('../src/models/PredictionCache');
    const cachedPredictions = await PredictionCache.find({}).lean();
    
    logger.info(`Found ${predictions.length} prediction records and ${cachedPredictions.length} cached predictions to evaluate`);
    
    if (predictions.length === 0 && cachedPredictions.length === 0) {
      logger.info('No prediction links to update');
      await MigrationState.updateOne(
        { key: MIGRATION_KEY },
        {
          status: 'completed',
          completedAt: new Date(),
          recordsUpdated: 0,
          cacheUpdated: 0
        }
      );
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Group all encountered market IDs for efficient batch fetching
    const marketIds = [...new Set([
      ...predictions.map((p) => p.marketId),
      ...cachedPredictions.map((c) => c.marketId)
    ].filter(Boolean))];
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
    
    // Update prediction records
    let updated = 0;
    let skipped = 0;
    let cacheUpdated = 0;
    let cacheSkipped = 0;
    const errors = [];

    const buildLink = ({ marketId, recordSlug, marketData }) => {
      if (marketData) {
        return polymarketService.getMarketUrl({
          marketId,
          slug: marketData.slug,
          eventSlug: marketData.eventSlug || null
        });
      }

      const fallbackEventUrl = buildEventUrlFromSlug(recordSlug);
      if (fallbackEventUrl) return fallbackEventUrl;

      return polymarketService.getMarketUrl({ marketId, slug: null, eventSlug: null });
    };
    
    for (const prediction of predictions) {
      try {
        const marketData = marketDataMap[prediction.marketId];
        
        if (!marketData) {
          logger.warn(`No market data for prediction ${prediction._id}, skipping`);
          skipped++;
          continue;
        }
        
        const bestSlug = (marketData && (marketData.eventSlug || marketData.slug)) || prediction.marketSlug || null;

        const updates = {
          marketSlug: bestSlug,
          polymarketUrl: buildLink({
            marketId: prediction.marketId,
            recordSlug: prediction.marketSlug,
            marketData
          }),
          marketTitle: (marketData && marketData.title) || prediction.marketTitle
        };
        
        // Only update if something changed
        if (prediction.marketSlug !== updates.marketSlug || prediction.polymarketUrl !== updates.polymarketUrl) {
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

    // Update cached predictions links
    for (const cacheEntry of cachedPredictions) {
      try {
        const predictionPayload = cacheEntry.prediction || {};
        const marketData = marketDataMap[cacheEntry.marketId] || null;
        const cacheSlug = null;

        const nextUrl = buildLink({
          marketId: cacheEntry.marketId,
          recordSlug: cacheSlug,
          marketData
        });

        if (predictionPayload.polymarketUrl !== nextUrl) {
          await PredictionCache.updateOne(
            { _id: cacheEntry._id },
            { $set: { 'prediction.polymarketUrl': nextUrl } }
          );
          cacheUpdated++;
        } else {
          cacheSkipped++;
        }
      } catch (error) {
        logger.error(`Failed to update cached prediction ${cacheEntry._id}: ${error.message}`);
        errors.push({
          predictionId: cacheEntry._id.toString(),
          error: error.message
        });
      }
    }
    
    logger.info(`✓ Updated ${updated} predictions, skipped ${skipped} (no changes)`);
    logger.info(`✓ Updated ${cacheUpdated} cached predictions, skipped ${cacheSkipped} (no changes)`);
    
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
        cacheUpdated,
        recordsSkipped: skipped,
        cacheSkipped,
        recordsFailed: errors.length,
        details: {
          totalPredictions: predictions.length,
          totalCachedPredictions: cachedPredictions.length,
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
    logger.info(`  • Total cached predictions: ${cachedPredictions.length}`);
    logger.info(`  • Updated: ${updated}`);
    logger.info(`  • Cache updated: ${cacheUpdated}`);
    logger.info(`  • Skipped: ${skipped}`);
    logger.info(`  • Cache skipped: ${cacheSkipped}`);
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
