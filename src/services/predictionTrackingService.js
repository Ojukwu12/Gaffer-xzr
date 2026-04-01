/**
 * Prediction Tracking Service
 * Tracks prediction history and computes 30-day win-rate insights
 * @module services/predictionTrackingService
 */

const PredictionRecord = require('../models/PredictionRecord');
const polymarketService = require('./polymarketService');
const mlCorrectionService = require('./mlCorrectionService');
const mlTrainingDataService = require('./mlTrainingDataService');
const logger = require('../config/logger');
const config = require('../config/env');

const TARGET_WIN_RATE = Number(config.minWinRateLowerBound || 51);

const normalizeYesNo = (value) => {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return 'YES';
  if (['no', 'false', '0'].includes(normalized)) return 'NO';

  return null;
};

const toNumericArray = (values) => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
};

const determineWinningOption = (rawMarket) => {
  const options = rawMarket.outcomes || rawMarket.options || [];
  const prices = toNumericArray(rawMarket.outcome_prices || rawMarket.prices || []);

  if (options.length === prices.length && prices.length > 0) {
    const winnerIndex = prices.findIndex((price) => price >= 0.99);
    if (winnerIndex >= 0) {
      return options[winnerIndex];
    }
  }

  const fallbackWinner =
    rawMarket.winningOutcome ||
    rawMarket.winner ||
    rawMarket.resolution ||
    rawMarket.resolvedOutcome ||
    null;

  return fallbackWinner;
};

const isResolvedMarket = (rawMarket) => {
  return Boolean(
    rawMarket.closed ||
    rawMarket.resolved ||
    rawMarket.isResolved ||
    rawMarket.resolution
  );
};

const evaluateCorrectness = (record, winningOption) => {
  const normalizedWinning = normalizeYesNo(winningOption);
  const normalizedOption = normalizeYesNo(record.option);

  if (!normalizedWinning || !normalizedOption) {
    return null;
  }

  const actualAnswer = normalizedWinning === normalizedOption ? 'YES' : 'NO';
  return {
    actualAnswer,
    isCorrect: actualAnswer === record.predictedAnswer
  };
};

const recordPrediction = async (payload) => {
  const probabilityHistory = Array.isArray(payload.aiProbabilityHistory)
    ? payload.aiProbabilityHistory
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    : [];

  await PredictionRecord.create({
    marketId: payload.marketId,
    marketTitle: payload.marketTitle,
    marketSlug: payload.marketSlug || null,
    polymarketUrl: payload.polymarketUrl,
    option: payload.option,
    timeframe: payload.timeframe,
    predictionType: payload.predictionType || 'option',
    status: payload.status || 'pending',
    evaluationMode: payload.evaluationMode || config.predictionMode || 'production',
    predictedAnswer: payload.predictedAnswer,
    confidence: payload.confidence,
    marketProbabilityAtTime: payload.marketProbabilityAtTime ?? null,
    aiProbability: payload.aiProbability ?? null,
    aiProbabilityHistory: probabilityHistory.length > 0
      ? probabilityHistory
      : (Number.isFinite(payload.aiProbability) ? [payload.aiProbability] : []),
    marketClassification: payload.marketClassification || null,
    marketPredictabilityScore: payload.marketPredictabilityScore ?? null,
    signalStrengthScore: payload.signalStrengthScore ?? null,
    differenceBetweenMarketProbabilityAndAI: payload.differenceBetweenMarketProbabilityAndAI ?? null,
    mispricingScore: payload.mispricingScore ?? null,
    mispricingDirection: payload.mispricingDirection || null,
    expectedEdgeScore: payload.expectedEdgeScore ?? null,
    marketBucket: payload.marketBucket || null,
    thresholdsUsed: payload.thresholdsUsed || null,
    reason: payload.reason,
    dataIssue: payload.dataIssue || null,
    predictedAt: new Date()
  });
};

const computeWilsonLowerBound = (wins, total, z = 1.96) => {
  if (!total || total <= 0) return 0;

  const phat = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return Math.max(0, ((center - margin) / denominator) * 100);
};

const buildConfidenceCalibration = (resolvedRecords) => {
  const bins = [
    { min: 0, max: 59, key: '0-59' },
    { min: 60, max: 69, key: '60-69' },
    { min: 70, max: 79, key: '70-79' },
    { min: 80, max: 89, key: '80-89' },
    { min: 90, max: 100, key: '90-100' }
  ];

  const stats = bins.map((bin) => ({
    ...bin,
    total: 0,
    correct: 0,
    avgConfidence: 0,
    observedWinRate: 0,
    calibrationGap: 0
  }));

  for (const record of resolvedRecords) {
    const confidence = Number(record.confidence || 0);
    const match = stats.find((bin) => confidence >= bin.min && confidence <= bin.max);
    if (!match) continue;
    match.total += 1;
    if (record.isCorrect) match.correct += 1;
    match.avgConfidence += confidence;
  }

  for (const bin of stats) {
    if (bin.total === 0) continue;
    bin.avgConfidence = Number((bin.avgConfidence / bin.total).toFixed(2));
    bin.observedWinRate = Number(((bin.correct / bin.total) * 100).toFixed(2));
    bin.calibrationGap = Number((bin.observedWinRate - bin.avgConfidence).toFixed(2));
  }

  return stats;
};

const buildBucketBreakdown = (resolvedRecords) => {
  const bucketMap = new Map();

  for (const record of resolvedRecords) {
    const bucketKey = record.marketClassification || 'unknown';
    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, {
        bucket: bucketKey,
        total: 0,
        correct: 0,
        avgConfidence: 0,
        avgExpectedEdgeScore: 0,
        winRate: 0
      });
    }

    const bucket = bucketMap.get(bucketKey);
    bucket.total += 1;
    if (record.isCorrect) bucket.correct += 1;
    bucket.avgConfidence += Number(record.confidence || 0);
    bucket.avgExpectedEdgeScore += Number(record.expectedEdgeScore || 0);
  }

  const result = [];
  for (const bucket of bucketMap.values()) {
    bucket.avgConfidence = Number((bucket.avgConfidence / Math.max(1, bucket.total)).toFixed(2));
    bucket.avgExpectedEdgeScore = Number((bucket.avgExpectedEdgeScore / Math.max(1, bucket.total)).toFixed(2));
    bucket.winRate = Number(((bucket.correct / Math.max(1, bucket.total)) * 100).toFixed(2));
    result.push(bucket);
  }

  return result.sort((a, b) => b.winRate - a.winRate);
};

const getPredictionPerformance = async (days = 30, options = {}) => {
  const windowDays = Math.min(30, Math.max(1, Number(days) || 30));
  const cutoffDate = new Date(Date.now() - (windowDays * 24 * 60 * 60 * 1000));
  const evaluationMode = options.evaluationMode || null;

  const query = {
    predictedAt: { $gte: cutoffDate }
  };

  if (evaluationMode) {
    query.evaluationMode = evaluationMode;
  }

  const records = await PredictionRecord.find(query).sort({ predictedAt: -1 });

  if (records.length === 0) {
    return {
      windowDays,
      evaluationMode: evaluationMode || 'all',
      summary: {
        totalPredictions: 0,
        resolvedPredictions: 0,
        pendingPredictions: 0,
        correctPredictions: 0,
        incorrectPredictions: 0,
        winRate: 0
      },
      correctPredictions: [],
      incorrectPredictions: [],
      pendingPredictions: []
    };
  }

  const uniqueMarketIds = [...new Set(records.map((record) => record.marketId))];
  const marketSnapshots = new Map();

  await Promise.all(uniqueMarketIds.map(async (marketId) => {
    try {
      const market = await polymarketService.fetchMarketById(marketId);
      marketSnapshots.set(marketId, market);
    } catch (error) {
      logger.warn(`Failed to refresh market ${marketId} for performance tracking: ${error.message}`);
    }
  }));

  const updates = [];
  const correctPredictions = [];
  const incorrectPredictions = [];
  const pendingPredictions = [];

  for (const record of records) {
    const marketSnapshot = marketSnapshots.get(record.marketId);

    if (!marketSnapshot || !isResolvedMarket(marketSnapshot)) {
      pendingPredictions.push({
        id: record._id,
        marketId: record.marketId,
        marketTitle: record.marketTitle,
        option: record.option,
        predictedAnswer: record.predictedAnswer,
        confidence: record.confidence,
        predictedAt: record.predictedAt,
        polymarketUrl: record.polymarketUrl
      });
      continue;
    }

    const winningOption = determineWinningOption(marketSnapshot);
    const correctness = evaluateCorrectness(record, winningOption);

    if (!correctness) {
      pendingPredictions.push({
        id: record._id,
        marketId: record.marketId,
        marketTitle: record.marketTitle,
        option: record.option,
        predictedAnswer: record.predictedAnswer,
        confidence: record.confidence,
        predictedAt: record.predictedAt,
        polymarketUrl: record.polymarketUrl
      });
      continue;
    }

    updates.push({
      updateOne: {
        filter: { _id: record._id },
        update: {
          $set: {
            isResolved: true,
            resolvedAt: new Date(),
            winningOption,
            actualAnswer: correctness.actualAnswer,
            isCorrect: correctness.isCorrect
          }
        }
      }
    });

    const resolvedRecord = {
      ...record.toObject(),
      actualAnswer: correctness.actualAnswer,
      isCorrect: correctness.isCorrect
    };

    try {
      await mlTrainingDataService.storeTrainingEntry(resolvedRecord, 'performance_sync');
    } catch (error) {
      logger.warn(`ML training data storage skipped for ${record._id}: ${error.message}`);
    }

    setImmediate(() => {
      try {
        mlCorrectionService.trainFromResolvedPrediction(resolvedRecord);
      } catch (error) {
        logger.warn(`ML correction training skipped for ${record._id}: ${error.message}`);
      }
    });

    const payload = {
      id: record._id,
      marketId: record.marketId,
      marketTitle: record.marketTitle,
      option: record.option,
      predictedAnswer: record.predictedAnswer,
      actualAnswer: correctness.actualAnswer,
      isCorrect: correctness.isCorrect,
      confidence: record.confidence,
      marketClassification: record.marketClassification || null,
      expectedEdgeScore: record.expectedEdgeScore ?? null,
      predictedAt: record.predictedAt,
      resolvedAt: new Date(),
      winningOption,
      polymarketUrl: record.polymarketUrl
    };

    if (correctness.isCorrect) {
      correctPredictions.push(payload);
    } else {
      incorrectPredictions.push(payload);
    }
  }

  if (updates.length > 0) {
    await PredictionRecord.bulkWrite(updates);
  }

  const resolvedCount = correctPredictions.length + incorrectPredictions.length;
  const winRate = resolvedCount > 0
    ? Number(((correctPredictions.length / resolvedCount) * 100).toFixed(2))
    : 0;

  const resolvedRecords = [...correctPredictions, ...incorrectPredictions];
  const wilsonLowerBound = Number(computeWilsonLowerBound(correctPredictions.length, resolvedCount).toFixed(2));
  const targetMet = wilsonLowerBound >= TARGET_WIN_RATE;
  const confidenceCalibration = buildConfidenceCalibration(resolvedRecords);
  const categoryBreakdown = buildBucketBreakdown(resolvedRecords);

  return {
    windowDays,
    evaluationMode: evaluationMode || 'all',
    scoreDefinition: {
      denominator: 'resolved_predictions_only',
      numerator: 'correct_resolved_predictions',
      binaryOutcomes: true,
      metric: 'win_rate',
      targetLowerBound: TARGET_WIN_RATE
    },
    summary: {
      totalPredictions: records.length,
      resolvedPredictions: resolvedCount,
      pendingPredictions: pendingPredictions.length,
      correctPredictions: correctPredictions.length,
      incorrectPredictions: incorrectPredictions.length,
      winRate,
      wilsonLowerBound,
      targetMet
    },
    confidenceInterval: {
      method: 'wilson_95',
      lowerBound: wilsonLowerBound,
      target: TARGET_WIN_RATE,
      targetMet
    },
    calibration: {
      bins: confidenceCalibration
    },
    breakdowns: {
      byCategory: categoryBreakdown
    },
    correctPredictions,
    incorrectPredictions,
    pendingPredictions
  };
};

const getProductionReadiness = async ({
  days = 30,
  evaluationMode = 'paper',
  minResolved = config.readinessMinResolved || 100,
  minLowerBound = config.minWinRateLowerBound || 51
} = {}) => {
  const performance = await getPredictionPerformance(days, { evaluationMode });
  const resolvedPredictions = Number(performance?.summary?.resolvedPredictions || 0);
  const wilsonLowerBound = Number(performance?.summary?.wilsonLowerBound || 0);
  const pointWinRate = Number(performance?.summary?.winRate || 0);

  const enoughSamples = resolvedPredictions >= Number(minResolved);
  const passesLowerBound = wilsonLowerBound >= Number(minLowerBound);
  const ready = enoughSamples && passesLowerBound;

  const reasons = [];
  if (!enoughSamples) {
    reasons.push(`Need at least ${minResolved} resolved predictions in ${evaluationMode} mode (currently ${resolvedPredictions}).`);
  }
  if (!passesLowerBound) {
    reasons.push(`Wilson 95% lower bound ${wilsonLowerBound}% is below target ${minLowerBound}%.`);
  }

  return {
    ready,
    checks: {
      evaluationMode,
      windowDays: Math.min(30, Math.max(1, Number(days) || 30)),
      minResolved: Number(minResolved),
      minLowerBound: Number(minLowerBound),
      resolvedPredictions,
      pointWinRate,
      wilsonLowerBound,
      enoughSamples,
      passesLowerBound
    },
    reasons,
    performance
  };
};

module.exports = {
  recordPrediction,
  getPredictionPerformance,
  getProductionReadiness
};
