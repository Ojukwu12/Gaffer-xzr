/**
 * Prediction Moderation Service
 * Handles pending/approved/rejected workflow, edits, voting, and expiry lifecycle
 * @module services/predictionModerationService
 */

const crypto = require('crypto');
const PredictionRecord = require('../models/PredictionRecord');
const PredictionVote = require('../models/PredictionVote');
const User = require('../models/User');
const polymarketService = require('./polymarketService');
const mlCorrectionService = require('./mlCorrectionService');
const mlTrainingDataService = require('./mlTrainingDataService');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

const VOTE_COOLDOWN_MS = Number(config.voteCooldownMs || 60000);
const VOTE_RELIABLE_SAMPLE_SIZE = Number(config.voteReliableSampleSize || 20);
const VOTE_BURST_WINDOW_MS = Number(config.voteBurstWindowMs || 300000);
const VOTE_BURST_THRESHOLD = Number(config.voteBurstThreshold || 40);
const VOTE_BURST_MAX_SINGLE_IP_SHARE = Number(config.voteBurstMaxSingleIpShare || 0.6);
const VOTE_NEW_ACCOUNT_DAYS = Number(config.voteNewAccountDays || 7);
const VOTE_RECENT_ACCOUNT_DAYS = Number(config.voteRecentAccountDays || 30);
const VOTE_NEW_ACCOUNT_WEIGHT = Number(config.voteNewAccountWeight || 0.5);
const VOTE_RECENT_ACCOUNT_WEIGHT = Number(config.voteRecentAccountWeight || 0.8);
const VOTE_VELOCITY_SPIKE_WEIGHT = Number(config.voteVelocitySpikeWeight || 0.7);
const VOTE_IP_CONCENTRATION_WEIGHT = Number(config.voteIpConcentrationWeight || 0.5);
const VOTE_MIN_WEIGHT = Number(config.voteMinWeight || 0.3);
const PUBLISH_DELAY_MIN_MS = Number(config.predictionPublishDelayMinMs || 120000);
const PUBLISH_DELAY_MAX_MS = Number(config.predictionPublishDelayMaxMs || 480000);

const getRandomDelayMs = (minMs, maxMs) => {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

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

const normalizeDisplayText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const humanizeIssueLabel = (value = '') => normalizeDisplayText(String(value).replace(/[_-]+/g, ' '));

const summarizeIssueValue = (value, depth = 0) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return normalizeDisplayText(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => summarizeIssueValue(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value !== 'object' || depth > 2) return '';

  const nestedMessages = Array.isArray(value.issues)
    ? value.issues
      .map((item) => summarizeIssueValue(item, depth + 1))
      .filter(Boolean)
    : [];

  if (nestedMessages.length > 0) {
    return nestedMessages.slice(0, 3).join('; ');
  }

  const directMessage = normalizeDisplayText(
    value.message || value.summary || value.note || value.reason || ''
  );
  if (directMessage) return directMessage;

  if (value.type) return humanizeIssueLabel(value.type);
  if (value.severity) return `${humanizeIssueLabel(value.severity)} issue`;

  return '';
};

const resolveAdminIssue = (record) => {
  const issueText = summarizeIssueValue(record?.dataIssue);
  if (issueText) return issueText;

  if (record?.marketClassification === 'unpredictable/noise') {
    return 'This market is highly volatile and should be reviewed carefully before approval.';
  }

  return null;
};

const toAdminPredictionPayload = (record) => {
  const baseRecord = typeof record?.toObject === 'function'
    ? record.toObject()
    : { ...(record || {}) };
  const { dataIssue, ...safeRecord } = baseRecord;

  return {
    ...safeRecord,
    issue: resolveAdminIssue(record)
  };
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
    status: 'approved',
    approvedAt: { $lte: new Date() }
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
    status: 'approved',
    approvedAt: { $lte: new Date() }
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

const listPredictionsByStatus = async ({ status, limit = 50, offset = 0, marketId, evaluationMode, timeframe }) => {
  if (!['pending', 'approved'].includes(status)) {
    throw new CustomError('Status must be pending or approved', 400, 'INVALID_PREDICTION_STATUS');
  }

  return listPredictions({
    status,
    limit,
    offset,
    marketId,
    evaluationMode,
    timeframe
  });
};

const approvePrediction = async ({ predictionId, reviewedBy, reviewNotes = '' }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  const publicationDelayMs = getRandomDelayMs(PUBLISH_DELAY_MIN_MS, PUBLISH_DELAY_MAX_MS);

  record.status = 'approved';
  record.reviewedBy = reviewedBy || 'admin';
  record.reviewNotes = reviewNotes;
  record.approvedAt = new Date(Date.now() + publicationDelayMs);

  await record.save();

  return {
    record,
    publicationDelayMs
  };
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

const editApprovedAiProbability = async ({ predictionId, aiProbability, editedBy }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  if (record.status !== 'approved') {
    throw new CustomError('Only approved predictions can be edited with this endpoint', 400, 'PREDICTION_NOT_APPROVED');
  }

  return editAiProbability({ predictionId, aiProbability, editedBy });
};

const deletePredictionByStatus = async ({ predictionId, status }) => {
  if (!['pending', 'approved'].includes(status)) {
    throw new CustomError('Status must be pending or approved', 400, 'INVALID_PREDICTION_STATUS');
  }

  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  if (record.status !== status) {
    throw new CustomError(
      `Prediction status mismatch. Expected ${status}, found ${record.status}.`,
      400,
      'PREDICTION_STATUS_MISMATCH'
    );
  }

  await PredictionVote.deleteMany({ predictionId: record._id });
  await PredictionRecord.deleteOne({ _id: record._id });

  return {
    id: record._id,
    marketId: record.marketId,
    status: record.status
  };
};

const hashRawValue = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const buildDeviceHash = ({ deviceId, ipAddress, userAgent }) => {
  const raw = deviceId && String(deviceId).trim().length > 0
    ? `device:${String(deviceId).trim()}`
    : `network:${ipAddress || 'unknown'}:${userAgent || 'unknown'}`;

  return hashRawValue(raw);
};

const buildIpHash = (ipAddress) => hashRawValue(`ip:${ipAddress || 'unknown'}`);

const clampWeight = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(VOTE_MIN_WEIGHT, Math.min(1, numeric));
};

const getAccountAgeDays = (user) => {
  if (!user?.createdAt) return 0;
  const createdAt = new Date(user.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return 0;
  return Math.max(0, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
};

const resolveUser = async (userId) => {
  if (!userId) return null;
  try {
    return await User.findById(userId).select('_id createdAt role').lean();
  } catch {
    return null;
  }
};

const buildCrowdSummary = ({ totalLikes = 0, totalDislikes = 0, weightedLikes = 0, weightedDislikes = 0 }) => {
  // Use weighted totals if available, otherwise fall back to unweighted
  const likes = weightedLikes > 0 ? weightedLikes : totalLikes;
  const dislikes = weightedDislikes > 0 ? weightedDislikes : totalDislikes;
  
  const sampleSize = totalLikes + totalDislikes;
  const weightedSampleSize = likes + dislikes;
  const leadingOption = likes >= dislikes ? 'like' : 'dislike';
  const leadingCount = leadingOption === 'like' ? likes : dislikes;
  const isSampleReliable = sampleSize >= VOTE_RELIABLE_SAMPLE_SIZE;
  const leadingPercent = weightedSampleSize > 0 && isSampleReliable
    ? Math.round((leadingCount / weightedSampleSize) * 100)
    : null;

  return {
    leadingOption,
    leadingPercent,
    sampleSize,
    weightedSampleSize: Math.round(weightedSampleSize * 10) / 10,
    isSampleReliable
  };
};

const detectVoteManipulation = async (predictionId) => {
  const since = new Date(Date.now() - VOTE_BURST_WINDOW_MS);

  const [recentVoteCount, topIpBucket] = await Promise.all([
    PredictionVote.countDocuments({ predictionId, createdAt: { $gte: since } }),
    PredictionVote.aggregate([
      { $match: { predictionId, createdAt: { $gte: since } } },
      { $group: { _id: '$ipHash', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ])
  ]);

  const topIpCount = topIpBucket?.[0]?.count || 0;
  const topIpShare = recentVoteCount > 0 ? topIpCount / recentVoteCount : 0;
  const isVelocitySpike = recentVoteCount >= VOTE_BURST_THRESHOLD;
  const isIpConcentrated = recentVoteCount >= 10 && topIpShare >= VOTE_BURST_MAX_SINGLE_IP_SHARE;

  const flags = [];
  if (isVelocitySpike) flags.push('velocity_spike');
  if (isIpConcentrated) flags.push('ip_concentration');

  return {
    suspicious: flags.length > 0,
    flags,
    recentVoteCount,
    topIpShare: Number(topIpShare.toFixed(2))
  };
};

const calculateVoteWeight = async ({ predictionId, ipHash, user }) => {
  let weight = 1;
  const suspicionFlags = [];

  const accountAgeDays = getAccountAgeDays(user);

  if (user && user.role !== 'admin') {
    if (accountAgeDays < VOTE_NEW_ACCOUNT_DAYS) {
      weight = Math.min(weight, VOTE_NEW_ACCOUNT_WEIGHT);
      suspicionFlags.push('new_account', 'account_age');
    } else if (accountAgeDays < VOTE_RECENT_ACCOUNT_DAYS) {
      weight = Math.min(weight, VOTE_RECENT_ACCOUNT_WEIGHT);
      suspicionFlags.push('account_age');
    }
  }

  const since = new Date(Date.now() - VOTE_BURST_WINDOW_MS);
  const [recentVoteCount, sameIpCount] = await Promise.all([
    PredictionVote.countDocuments({ predictionId, createdAt: { $gte: since } }),
    PredictionVote.countDocuments({ predictionId, ipHash, createdAt: { $gte: since } })
  ]);

  const topIpShare = recentVoteCount > 0 ? sameIpCount / recentVoteCount : 0;

  if (recentVoteCount >= VOTE_BURST_THRESHOLD) {
    weight = Math.min(weight, VOTE_VELOCITY_SPIKE_WEIGHT);
    suspicionFlags.push('velocity_spike');
  }

  if (recentVoteCount >= 10 && topIpShare >= VOTE_BURST_MAX_SINGLE_IP_SHARE) {
    weight = Math.min(weight, VOTE_IP_CONCENTRATION_WEIGHT);
    suspicionFlags.push('ip_concentration');
  }

  return {
    weight: clampWeight(weight),
    suspicionFlags: [...new Set(suspicionFlags)],
    accountAgeDays
  };
};

const getVoteStats = async (predictionId) => {
  // Get unweighted vote stats
  const grouped = await PredictionVote.aggregate([
    { $match: { predictionId } },
    { $group: { _id: '$voteType', count: { $sum: 1 } } }
  ]);

  const totals = grouped.reduce((acc, item) => {
    if (item._id === 'like') acc.totalLikes = item.count;
    if (item._id === 'dislike') acc.totalDislikes = item.count;
    return acc;
  }, { totalLikes: 0, totalDislikes: 0 });

  // Get weighted vote stats
  const weightedGrouped = await PredictionVote.aggregate([
    { $match: { predictionId } },
    { 
      $group: { 
        _id: '$voteType', 
        weightedCount: { $sum: '$weight' } 
      } 
    }
  ]);

  const weighted = weightedGrouped.reduce((acc, item) => {
    if (item._id === 'like') acc.weightedLikes = item.weightedCount;
    if (item._id === 'dislike') acc.weightedDislikes = item.weightedCount;
    return acc;
  }, { weightedLikes: 0, weightedDislikes: 0 });

  await PredictionRecord.findByIdAndUpdate(predictionId, {
    $set: {
      'votes.totalLikes': totals.totalLikes,
      'votes.totalDislikes': totals.totalDislikes,
      'votes.weightedLikes': Number((weighted.weightedLikes || 0).toFixed(3)),
      'votes.weightedDislikes': Number((weighted.weightedDislikes || 0).toFixed(3))
    }
  });

  return { ...totals, ...weighted };
};

const castVote = async ({ predictionId, voteType, deviceId, ipAddress, userAgent, userId = null }) => {
  const record = await PredictionRecord.findById(predictionId);
  if (!record) return null;

  const deviceHash = buildDeviceHash({ deviceId, ipAddress, userAgent });
  const ipHash = buildIpHash(ipAddress);
  const user = await resolveUser(userId);

  const selector = user?._id
    ? { predictionId, userId: user._id }
    : { predictionId, deviceHash };

  const existingVote = await PredictionVote.findOne(selector);
  const voteWeight = await calculateVoteWeight({ predictionId: record._id, ipHash, user });

  if (existingVote) {
    const lastUpdatedAt = existingVote.updatedAt ? new Date(existingVote.updatedAt).getTime() : 0;
    const canChangeVoteAt = lastUpdatedAt + VOTE_COOLDOWN_MS;

    if (existingVote.voteType !== voteType && Date.now() < canChangeVoteAt) {
      throw new CustomError('Please wait before changing your vote', 429, 'VOTE_COOLDOWN_ACTIVE');
    }

    if (existingVote.voteType !== voteType || existingVote.ipHash !== ipHash) {
      existingVote.voteType = voteType;
      existingVote.ipHash = ipHash;
      existingVote.weight = voteWeight.weight;
      existingVote.suspicionFlags = voteWeight.suspicionFlags;
      existingVote.accountAgeDays = voteWeight.accountAgeDays;
      if (user?._id) {
        existingVote.userId = user._id;
      }
      await existingVote.save();
    }
  } else {
    await PredictionVote.create({
      predictionId,
      userId: user?._id,
      deviceHash,
      ipHash,
      voteType,
      weight: voteWeight.weight,
      suspicionFlags: voteWeight.suspicionFlags,
      accountAgeDays: voteWeight.accountAgeDays
    });
  }

  const totals = await getVoteStats(record._id);
  const crowd = buildCrowdSummary(totals);
  const integrity = await detectVoteManipulation(record._id);

  return {
    predictionId: record._id,
    voteType,
    weightApplied: voteWeight.weight,
    ...totals,
    crowd,
    integrity
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
    return { scanned: 0, expired: 0, resolvedPredictions: [] };
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
  const resolvedPredictions = [];

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

    resolvedPredictions.push({
      id: record._id,
      marketId: record.marketId,
      marketTitle: record.marketTitle,
      polymarketUrl: record.polymarketUrl || null,
      predictedAnswer: record.predictedAnswer || null,
      actualAnswer: record.actualAnswer || null,
      finalMarketResult: record.finalMarketResult || null,
      isCorrect: typeof record.isCorrect === 'boolean' ? record.isCorrect : null,
      resolvedAt: record.resolvedAt || record.expiredAt || new Date()
    });

    if (record.actualAnswer && typeof record.aiProbability === 'number') {
      try {
        await mlTrainingDataService.storeTrainingEntry(record, 'expiry_cleanup');
      } catch (error) {
        logger.warn(`ML training data storage skipped for ${record._id}: ${error.message}`);
      }

      setImmediate(() => {
        try {
          mlCorrectionService.trainFromResolvedPrediction(record);
        } catch (error) {
          logger.warn(`ML correction training skipped for ${record._id}: ${error.message}`);
        }
      });
    }

    expiredCount++;
  }

  return {
    scanned: candidates.length,
    expired: expiredCount,
    resolvedPredictions
  };
};

module.exports = {
  findLatestApprovedPrediction,
  findApprovedPredictionsForMarket,
  listPredictions,
  listPredictionsByStatus,
  approvePrediction,
  rejectPrediction,
  editAiProbability,
  editApprovedAiProbability,
  deletePredictionByStatus,
  castVote,
  getVoteStats,
  buildCrowdSummary,
  formatProbabilityStatement,
  resolveDisplayReason,
  resolveAdminIssue,
  toAdminPredictionPayload,
  markExpiredPredictions
};
