/**
 * Prediction Backfill Service
 * One-time migration utilities for historical prediction records.
 * @module services/predictionBackfillService
 */

const PredictionRecord = require('../models/PredictionRecord');
const MigrationState = require('../models/MigrationState');
const logger = require('../config/logger');

const BACKFILL_KEY = '2026-03-27-approved-reason-backfill-v1';

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const isReasonGeneric = (reason = '') => {
  const text = normalizeText(reason).toLowerCase();
  if (!text) return true;

  const genericPhrases = [
    'based on current market conditions',
    'based on available data',
    'market sentiment and trends',
    'the model suggests',
    'insufficient data',
    'high uncertainty'
  ];

  const hasGenericPhrase = genericPhrases.some((phrase) => text.includes(phrase));
  const hasNumericEvidence = /(\d+(?:\.\d+)?\s*%|\$\s*\d|\b\d+\s*(?:days|matches|hours|points|goals|cards)\b)/i.test(text);

  return hasGenericPhrase || !hasNumericEvidence;
};

const toPercent = (value, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Number(parsed.toFixed(2))));
};

const buildReason = (record) => {
  const title = normalizeText(record.marketTitle || record.marketId || 'this market');
  const yesProbability = toPercent(record.aiProbability, record.predictedAnswer === 'YES' ? 60 : 40);
  const noProbability = toPercent(100 - yesProbability);
  const marketProbability = toPercent(record.marketProbabilityAtTime, 50);
  const side = (record.predictedAnswer === 'YES' || record.predictedAnswer === 'NO')
    ? record.predictedAnswer
    : (yesProbability >= 50 ? 'YES' : 'NO');
  const confidence = Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : null;
  const classification = record.marketClassification ? ` in ${record.marketClassification}` : '';
  const edge = Number.isFinite(Number(record.expectedEdgeScore))
    ? ` Expected edge score is ${toPercent(record.expectedEdgeScore)}%.`
    : '';
  const confidenceText = confidence !== null ? ` Confidence is ${toPercent(confidence)}%.` : '';

  return `${title}${classification}: choose ${side} because the model estimates YES at ${yesProbability}% and NO at ${noProbability}% while market-implied probability is ${marketProbability}%.${confidenceText}${edge}`;
};

const runApprovedReasonBackfillOnce = async () => {
  const lockResult = await MigrationState.updateOne(
    { key: BACKFILL_KEY },
    {
      $setOnInsert: {
        key: BACKFILL_KEY,
        state: 'running',
        startedAt: new Date(),
        notes: 'Backfill approved prediction reasons with market-specific summaries.'
      }
    },
    { upsert: true }
  );

  if (!lockResult.upsertedCount) {
    const existing = await MigrationState.findOne({ key: BACKFILL_KEY }).lean();
    logger.info('Approved-reason backfill already recorded; skipping.', {
      key: BACKFILL_KEY,
      state: existing?.state || 'unknown',
      completedAt: existing?.completedAt || null
    });

    return {
      key: BACKFILL_KEY,
      skipped: true,
      reason: 'already-ran'
    };
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const records = await PredictionRecord.find({ status: 'approved' })
      .select('reason marketTitle marketId predictedAnswer aiProbability marketProbabilityAtTime confidence marketClassification expectedEdgeScore')
      .lean();

    scanned = records.length;

    const bulkOps = [];
    for (const record of records) {
      if (!isReasonGeneric(record.reason)) {
        skipped += 1;
        continue;
      }

      const reason = buildReason(record);
      bulkOps.push({
        updateOne: {
          filter: { _id: record._id },
          update: { $set: { reason } }
        }
      });
      updated += 1;
    }

    if (bulkOps.length > 0) {
      await PredictionRecord.bulkWrite(bulkOps, { ordered: false });
    }

    await MigrationState.updateOne(
      { key: BACKFILL_KEY },
      {
        $set: {
          state: 'completed',
          completedAt: new Date(),
          stats: { scanned, updated, skipped }
        }
      }
    );

    logger.info('Approved prediction reason backfill completed', {
      key: BACKFILL_KEY,
      scanned,
      updated,
      skipped
    });

    return {
      key: BACKFILL_KEY,
      migrationSkipped: false,
      scanned,
      updated,
      skipped
    };
  } catch (error) {
    await MigrationState.updateOne(
      { key: BACKFILL_KEY },
      {
        $set: {
          state: 'failed',
          completedAt: new Date(),
          stats: { scanned, updated, skipped },
          notes: `Failed: ${error.message}`
        }
      }
    );

    logger.error('Approved prediction reason backfill failed', {
      key: BACKFILL_KEY,
      error: error.message
    });

    throw error;
  }
};

module.exports = {
  runApprovedReasonBackfillOnce
};
