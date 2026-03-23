/**
 * Prediction Moderation Service
 * Handles pending/approved/rejected workflow, edits, voting, and expiry lifecycle
 * @module services/predictionModerationService
 */

const crypto = require('crypto');
const PredictionRecord = require('../models/PredictionRecord');
const PredictionVote = require('../models/PredictionVote');
const polymarketService = require('./polymarketService');
const logger = require('../config/logger');

const clampProbability = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
};

const normalizeYesNo = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return 'YES';
  if (['no', 'false', '0'].includes(normalized)) return 'NO';
  return null;
};

const formatProbabilityStatement = (marketProbabilityAtTime, aiProbability) => {
  const marketProb = Number(marketProbabilityAtTime || 0).toFixed(2);
  const modelProb = Number(aiProbability || 0).toFixed(2);
  return `The market shows ${marketProb}%, but our model estimates the real probability is ${modelProb}%.`;
};

const resolveDisplayReason = (record) => {
  const baseStatement = formatProbabilityStatement(record.marketProbabilityAtTime, record.aiProbability);
  if (!record.reason) return baseStatement;
  return `${baseStatement} ${record.reason}`;
};

const findLatestApprovedPrediction = async ({ marketId, option, timeframe = 'daily', predictionType = 'option' }) => {
  const query = {
    marketId,
    timeframe,
    predictionType,
    status: 'approved'
  };

  if (option) {
    query.option = option;
  }

  return PredictionRecord.findOne(query).sort({ approvedAt: -1, updatedAt: -1 });
};

const findApprovedPredictionsForMarket = async ({ marketId, timeframe = 'daily' }) => {
  return PredictionRecord.find({
    marketId,
    timeframe,
    predictionType: 'option',
    status: 'approved'
  }).sort({ approvedAt: -1, updatedAt: -1 });
};

const listPredictions = async ({ status, limit = 50, offset = 0, marketId, evaluationMode, timeframe }) => {
  const query = {};
  if (status) query.status = status;
  if (marketId) query.marketId = marketId;
  if (evaluationMode) query.evaluationMode = evaluationMode;
  if (timeframe) query.timeframe = timeframe;

  const [items, total] = await Promise.all([
    PredictionRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(Math.max(0, Number(offset) || 0))
      .limit(Math.max(1, Math.min(200, Number(limit) || 50))),
    PredictionRecord.countDocuments(query)
  ]);

  return { items, total };
};

const approvePrediction = async ({ predictionId, reviewedBy, reviewNotes = '' }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  record.status = 'approved';
  record.reviewedBy = reviewedBy || 'admin';
  record.reviewNotes = reviewNotes;
  record.approvedAt = new Date();

  await record.save();
  return record;
};

const rejectPrediction = async ({ predictionId, reviewedBy, reviewNotes = '' }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  record.status = 'rejected';
  record.reviewedBy = reviewedBy || 'admin';
  record.reviewNotes = reviewNotes;
  record.rejectedAt = new Date();

  await record.save();
  return record;
};

const editAiProbability = async ({ predictionId, aiProbability, editedBy }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  const normalized = clampProbability(aiProbability);
  if (normalized === null) {
    throw new Error('Invalid aiProbability value');
  }

  record.aiProbability = normalized;
  record.aiProbabilityHistory = Array.isArray(record.aiProbabilityHistory)
    ? [...record.aiProbabilityHistory, normalized]
    : [normalized];
  record.lastEditedAt = new Date();
  record.lastEditedBy = editedBy || 'admin';
  record.predictedAnswer = normalized >= 50 ? 'YES' : 'NO';

  if (Number.isFinite(record.marketProbabilityAtTime)) {
    record.differenceBetweenMarketProbabilityAndAI = Number(
      Math.abs(record.marketProbabilityAtTime - normalized).toFixed(2)
    );
  }

  await record.save();
  return record;
};

const buildDeviceHash = ({ deviceId, ipAddress, userAgent }) => {
  const raw = deviceId && String(deviceId).trim().length > 0
    ? `device:${String(deviceId).trim()}`
    : `network:${ipAddress || 'unknown'}:${userAgent || 'unknown'}`;

  return crypto.createHash('sha256').update(raw).digest('hex');
};

const getVoteStats = async (predictionId) => {
  const grouped = await PredictionVote.aggregate([
    { $match: { predictionId } },
    { $group: { _id: '$voteType', count: { $sum: 1 } } }
  ]);

  const totals = grouped.reduce((acc, item) => {
    if (item._id === 'like') acc.totalLikes = item.count;
    if (item._id === 'dislike') acc.totalDislikes = item.count;
    return acc;
  }, { totalLikes: 0, totalDislikes: 0 });

  await PredictionRecord.findByIdAndUpdate(predictionId, {
    $set: {
      'votes.totalLikes': totals.totalLikes,
      'votes.totalDislikes': totals.totalDislikes
    }
  });

  return totals;
};

const castVote = async ({ predictionId, voteType, deviceId, ipAddress, userAgent }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  const deviceHash = buildDeviceHash({ deviceId, ipAddress, userAgent });

  const existingVote = await PredictionVote.findOne({ predictionId, deviceHash });

  if (existingVote) {
    if (existingVote.voteType !== voteType) {
      existingVote.voteType = voteType;
      await existingVote.save();
    }
  } else {
    await PredictionVote.create({ predictionId, deviceHash, voteType });
  }

  const totals = await getVoteStats(record._id);
  return {
    predictionId: record._id,
    voteType,
    ...totals
  };
};

const isMarketExpired = (market) => {
  if (!market) return false;
  if (market.closed || market.resolved || market.isResolved) return true;

  const endDateRaw = market.end_date_iso || market.endDate || market.end_date || null;
  if (!endDateRaw) return false;

  const endDate = new Date(endDateRaw);
  if (Number.isNaN(endDate.getTime())) return false;

  return endDate <= new Date();
};

const determineFinalResult = (market) => {
  const outcomes = market.outcomes || market.options || [];
  const prices = (market.outcome_prices || market.prices || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (outcomes.length === prices.length && prices.length > 0) {
    const winnerIdx = prices.findIndex((price) => price >= 0.99);
    if (winnerIdx >= 0) {
      return normalizeYesNo(outcomes[winnerIdx]) || outcomes[winnerIdx];
    }
  }

  const fallback = market.winningOutcome || market.winner || market.resolution || market.resolvedOutcome || null;
  return normalizeYesNo(fallback) || fallback;
};

const markExpiredPredictions = async ({ limit = 500 } = {}) => {
  const candidates = await PredictionRecord.find({
    status: { $in: ['pending', 'approved', 'rejected'] },
    expiredAt: null
  }).limit(limit);

  if (candidates.length === 0) {
    return { scanned: 0, expired: 0 };
  }

  const byMarket = new Map();
  const uniqueMarketIds = [...new Set(candidates.map((item) => item.marketId))];

  await Promise.all(uniqueMarketIds.map(async (marketId) => {
    try {
      const raw = await polymarketService.fetchMarketById(marketId);
      byMarket.set(marketId, raw);
    } catch (error) {
      logger.warn(`Failed to fetch market ${marketId} during expiry cleanup: ${error.message}`);
    }
  }));

  let expiredCount = 0;

  for (const record of candidates) {
    const market = byMarket.get(record.marketId);
    if (!isMarketExpired(market)) continue;

    const finalResult = determineFinalResult(market);
    const normalizedFinal = normalizeYesNo(finalResult);
    const normalizedPrediction = normalizeYesNo(record.predictedAnswer);

    record.status = 'expired';
    record.expiredAt = new Date();
    record.isResolved = true;
    record.resolvedAt = new Date();
    record.finalMarketResult = normalizedFinal || (finalResult ? String(finalResult).toUpperCase() : null);

    if (normalizedFinal && normalizedPrediction) {
      record.isAiCorrect = normalizedFinal === normalizedPrediction;
      record.actualAnswer = normalizedFinal;
      record.isCorrect = normalizedFinal === normalizedPrediction;
    }

    await record.save();
    expiredCount++;
  }

  return {
    scanned: candidates.length,
    expired: expiredCount
  };
};

module.exports = {
  findLatestApprovedPrediction,
  findApprovedPredictionsForMarket,
  listPredictions,
  approvePrediction,
  rejectPrediction,
  editAiProbability,
  castVote,
  getVoteStats,
  formatProbabilityStatement,
  resolveDisplayReason,
  markExpiredPredictions
};
