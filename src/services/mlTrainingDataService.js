/**
 * ML Training Data Service
 * Persists resolved prediction snapshots for correction-model training.
 * @module services/mlTrainingDataService
 */

const MlTrainingData = require('../models/MlTrainingData');

const normalizeOutcome = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'YES' || normalized === 'TRUE') return 'YES';
  if (normalized === 'NO' || normalized === 'FALSE') return 'NO';
  return null;
};

const toFinite = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveExternalAiProbability = (record) => {
  const history = Array.isArray(record.aiProbabilityHistory) ? record.aiProbabilityHistory : [];
  if (history.length > 0 && Number.isFinite(Number(history[0]))) {
    return Number(history[0]);
  }
  return Number(record.aiProbability);
};

const resolveTimeRemainingSummary = (record) => {
  const expiryBand = record.marketBucket?.expiryBand;
  if (expiryBand) return String(expiryBand);
  return 'unknown';
};

const buildTrainingEntry = (record, source = 'expiry_cleanup') => {
  const outcome = normalizeOutcome(record.actualAnswer || record.finalMarketResult);
  if (!outcome) return null;

  const externalAiProbability = resolveExternalAiProbability(record);
  const mlCorrectedProbability = toFinite(record.aiProbability, null);

  if (!Number.isFinite(externalAiProbability) || !Number.isFinite(mlCorrectedProbability)) {
    return null;
  }

  return {
    predictionId: record._id,
    marketId: record.marketId,
    marketCategory: record.marketClassification || 'unknown',
    externalAiProbability,
    mlCorrectedProbability,
    finalOutcome: outcome,
    predictionTimestamp: record.predictedAt || record.createdAt || new Date(),
    timeRemainingSummary: resolveTimeRemainingSummary(record),
    confidence: toFinite(record.confidence, 0),
    signalSummary: {
      marketPredictabilityScore: toFinite(record.marketPredictabilityScore),
      signalStrengthScore: toFinite(record.signalStrengthScore),
      mispricingScore: toFinite(record.mispricingScore),
      liquidityBand: record.marketBucket?.liquidityBand || 'unknown',
      volatilityBand: record.marketBucket?.volatilityBand || 'unknown',
      liquidityUsd: toFinite(record.features?.liquidity),
      volatility: toFinite(record.features?.priceVolatility),
      suspiciousSignals: Array.isArray(record.features?.suspiciousSignals)
        ? record.features.suspiciousSignals.slice(0, 10)
        : []
    },
    isPredictionCorrect: typeof record.isCorrect === 'boolean' ? record.isCorrect : null,
    source
  };
};

const storeTrainingEntry = async (record, source = 'expiry_cleanup') => {
  const entry = buildTrainingEntry(record, source);
  if (!entry) {
    return { stored: false, reason: 'insufficient_data' };
  }

  const existing = await MlTrainingData.findOne({ predictionId: entry.predictionId }).select('_id');
  if (existing) {
    return { stored: false, reason: 'already_exists' };
  }

  await MlTrainingData.create(entry);
  return { stored: true, predictionId: entry.predictionId };
};

module.exports = {
  buildTrainingEntry,
  storeTrainingEntry
};
