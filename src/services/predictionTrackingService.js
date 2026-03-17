/**
 * Prediction Tracking Service
 * Tracks prediction history and computes 30-day win-rate insights
 * @module services/predictionTrackingService
 */

const PredictionRecord = require('../models/PredictionRecord');
const polymarketService = require('./polymarketService');
const logger = require('../config/logger');

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
  await PredictionRecord.create({
    marketId: payload.marketId,
    marketTitle: payload.marketTitle,
    marketSlug: payload.marketSlug || null,
    polymarketUrl: payload.polymarketUrl,
    option: payload.option,
    timeframe: payload.timeframe,
    predictionType: payload.predictionType || 'option',
    predictedAnswer: payload.predictedAnswer,
    confidence: payload.confidence,
    reason: payload.reason,
    predictedAt: new Date()
  });
};

const getPredictionPerformance = async (days = 30) => {
  const windowDays = Math.min(30, Math.max(1, Number(days) || 30));
  const cutoffDate = new Date(Date.now() - (windowDays * 24 * 60 * 60 * 1000));

  const records = await PredictionRecord.find({
    predictedAt: { $gte: cutoffDate }
  }).sort({ predictedAt: -1 });

  if (records.length === 0) {
    return {
      windowDays,
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

    const payload = {
      id: record._id,
      marketId: record.marketId,
      marketTitle: record.marketTitle,
      option: record.option,
      predictedAnswer: record.predictedAnswer,
      actualAnswer: correctness.actualAnswer,
      confidence: record.confidence,
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

  return {
    windowDays,
    summary: {
      totalPredictions: records.length,
      resolvedPredictions: resolvedCount,
      pendingPredictions: pendingPredictions.length,
      correctPredictions: correctPredictions.length,
      incorrectPredictions: incorrectPredictions.length,
      winRate
    },
    correctPredictions,
    incorrectPredictions,
    pendingPredictions
  };
};

module.exports = {
  recordPrediction,
  getPredictionPerformance
};
