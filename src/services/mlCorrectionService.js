/**
 * ML Correction Service
 * Applies guarded probability corrections and continuously retrains from resolved markets.
 * @module services/mlCorrectionService
 */

const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config/env');
const MlTrainingData = require('../models/MlTrainingData');
const MlCorrectionLog = require('../models/MlCorrectionLog');

const DEFAULT_MODEL_PATH = path.join(process.cwd(), 'data', 'ml-correction-model.json');

const CATEGORY_KEYS = [
  'politics',
  'sports',
  'crypto',
  'technology',
  'geopolitics',
  'global events',
  'finance/economy',
  'corporate',
  'unpredictable/noise',
  'unknown'
];

const BASE_FEATURE_KEYS = [
  'bias',
  'aiProbCentered',
  'marketProbCentered',
  'probabilityGap',
  'confidenceNorm',
  'predictabilityNorm',
  'signalStrengthNorm',
  'historicalAccuracyNorm',
  'daysRemainingNorm',
  'liquidityNorm',
  'volatilityNorm'
];

const FEATURE_KEYS = [
  ...BASE_FEATURE_KEYS,
  ...CATEGORY_KEYS.map((category) => `cat:${category}`)
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFinite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sigmoid = (value) => {
  if (value > 40) return 1;
  if (value < -40) return 0;
  return 1 / (1 + Math.exp(-value));
};

const normalizeCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return CATEGORY_KEYS.includes(normalized) ? normalized : 'unknown';
};

const expiryBandToDays = (band) => {
  const normalized = String(band || '').toLowerCase();
  if (normalized === 'very_soon') return 1;
  if (normalized === 'soon') return 7;
  if (normalized === 'mid') return 30;
  if (normalized === 'far') return 90;
  return 14;
};

const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += toFinite(a[i], 0) * toFinite(b[i], 0);
  }
  return sum;
};

const modelState = {
  loaded: false,
  dirty: false,
  saveTimer: null,
  retrainInProgress: false,
  model: null
};

const createDefaultModel = () => ({
  version: 2,
  featureKeys: FEATURE_KEYS,
  weights: new Array(FEATURE_KEYS.length).fill(0),
  sampleCount: 0,
  categoryStats: {},
  categoryModels: {},
  lastRetrainedAt: null,
  cv: {
    globalAccuracy: null,
    globalLogLoss: null
  }
});

const ensureModelDir = (targetPath) => {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getModelPath = () => config.mlCorrectionModelPath || DEFAULT_MODEL_PATH;

const loadModel = () => {
  if (modelState.loaded && modelState.model) {
    return modelState.model;
  }

  const modelPath = getModelPath();
  modelState.loaded = true;

  try {
    if (!fs.existsSync(modelPath)) {
      modelState.model = createDefaultModel();
      return modelState.model;
    }

    const raw = fs.readFileSync(modelPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.weights) || parsed.weights.length !== FEATURE_KEYS.length) {
      modelState.model = createDefaultModel();
      return modelState.model;
    }

    modelState.model = {
      ...createDefaultModel(),
      ...parsed,
      featureKeys: FEATURE_KEYS,
      weights: parsed.weights.map((v) => toFinite(v, 0))
    };
  } catch (error) {
    logger.warn(`Failed to load ML correction model, using default: ${error.message}`);
    modelState.model = createDefaultModel();
  }

  return modelState.model;
};

const persistModel = () => {
  try {
    const model = loadModel();
    const modelPath = getModelPath();
    ensureModelDir(modelPath);
    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf8');
    modelState.dirty = false;
  } catch (error) {
    logger.warn(`Failed to persist ML correction model: ${error.message}`);
  }
};

const schedulePersist = () => {
  modelState.dirty = true;
  if (modelState.saveTimer) return;

  modelState.saveTimer = setTimeout(() => {
    modelState.saveTimer = null;
    if (modelState.dirty) {
      persistModel();
    }
  }, 1500);
};

const isEnabled = () => String(config.mlCorrectionEnabled || 'true').toLowerCase() === 'true';

const maxAdjustmentPoints = () => {
  const cfg = toFinite(config.mlCorrectionMaxAdjustment, 10);
  return clamp(cfg, 1, 20);
};

const minConfidenceThreshold = () => {
  const cfg = toFinite(config.mlCorrectionConfidenceThreshold, 0.6);
  return clamp(cfg, 0, 1);
};

const minSamples = () => Math.max(5, toFinite(config.mlCorrectionMinSamples, 40));
const learningRate = () => clamp(toFinite(config.mlCorrectionLearningRate, 0.03), 0.0001, 0.5);
const maxBlend = () => clamp(toFinite(config.mlCorrectionBlendMax, 0.35), 0, 1);
const retrainEveryN = () => Math.max(5, toFinite(config.mlCorrectionRetrainEveryN, 20));
const retrainWindowDays = () => Math.max(7, toFinite(config.mlCorrectionRetrainWindowDays, 180));
const categoryModelsEnabled = () => String(config.mlCorrectionCategoryModelsEnabled || 'true').toLowerCase() === 'true';

const marketIsUnusual = (context = {}) => {
  const liquidity = toFinite(context.liquidity, NaN);
  const volatility = toFinite(context.priceVolatility, NaN);
  const suspicious = Boolean(context.isSuspiciousMarket || context.suspiciousSignals?.length);

  const minLiquidity = Math.max(0, toFinite(config.mlCorrectionMinLiquidityUsd, 1000));
  const maxVolatility = clamp(toFinite(config.mlCorrectionMaxVolatility, 0.35), 0, 5);

  const lowLiquidity = Number.isFinite(liquidity) && liquidity > 0 && liquidity < minLiquidity;
  const highVolatility = Number.isFinite(volatility) && volatility > maxVolatility;

  return {
    shouldIgnore: lowLiquidity || highVolatility || suspicious,
    lowLiquidity,
    highVolatility,
    suspicious
  };
};

const buildFeatureMap = (context = {}) => {
  const aiProbability = clamp(toFinite(context.aiProbability, 50), 0, 100);
  const marketProbability = clamp(toFinite(context.marketProbability, 50), 0, 100);
  const confidence = clamp(toFinite(context.confidence, 50), 0, 100);
  const predictability = clamp(toFinite(context.marketPredictabilityScore, 50), 0, 100);
  const signalStrength = clamp(toFinite(context.signalStrengthScore, 50), 0, 100);
  const historicalAccuracy = clamp(toFinite(context.historicalAccuracy, 0.6), 0, 1);
  const liquidity = Math.max(0, toFinite(context.liquidity, 0));
  const volatility = Math.max(0, toFinite(context.priceVolatility, 0.1));

  const daysRemaining = Number.isFinite(Number(context.daysUntilExpiry))
    ? Number(context.daysUntilExpiry)
    : expiryBandToDays(context.expiryBand);

  const category = normalizeCategory(context.marketClassification);

  const map = {
    bias: 1,
    aiProbCentered: (aiProbability - 50) / 50,
    marketProbCentered: (marketProbability - 50) / 50,
    probabilityGap: (aiProbability - marketProbability) / 100,
    confidenceNorm: confidence / 100,
    predictabilityNorm: predictability / 100,
    signalStrengthNorm: signalStrength / 100,
    historicalAccuracyNorm: historicalAccuracy,
    daysRemainingNorm: clamp(daysRemaining / 90, 0, 1),
    liquidityNorm: clamp(liquidity / 100000, 0, 1),
    volatilityNorm: clamp(volatility / 0.5, 0, 1)
  };

  for (const cat of CATEGORY_KEYS) {
    map[`cat:${cat}`] = cat === category ? 1 : 0;
  }

  return { map, category };
};

const mapToVector = (featureMap) => FEATURE_KEYS.map((key) => toFinite(featureMap[key], 0));

const getCategoryModelWeights = (model, category) => {
  if (!categoryModelsEnabled()) return null;
  const categoryModel = model.categoryModels?.[category];
  if (!categoryModel || !Array.isArray(categoryModel.weights)) return null;
  if (categoryModel.weights.length !== FEATURE_KEYS.length) return null;
  if (toFinite(categoryModel.sampleCount, 0) < 10) return null;
  return categoryModel.weights;
};

const getCategoryAccuracy = (marketClassification) => {
  const model = loadModel();
  const category = normalizeCategory(marketClassification);
  const stats = model.categoryStats?.[category];

  if (!stats || !stats.total) return 0.6;
  return clamp(stats.correct / stats.total, 0, 1);
};

const computeModelConfidence = ({ modelProbability, aiProbability, sampleCount, context }) => {
  const distance = Math.abs(modelProbability - aiProbability) / 100;
  const maturity = clamp(sampleCount / minSamples(), 0, 1);
  const contextQuality = clamp(
    (toFinite(context.marketPredictabilityScore, 50) / 100) * 0.4 +
    (toFinite(context.signalStrengthScore, 50) / 100) * 0.4 +
    (toFinite(context.confidence, 50) / 100) * 0.2,
    0,
    1
  );

  // Higher confidence when model is mature and context quality is strong.
  const confidence = clamp((maturity * 0.55) + (contextQuality * 0.35) + (distance * 0.1), 0, 1);
  return confidence;
};

const logCorrectionDecision = async ({
  marketId,
  timeframe,
  marketCategory,
  externalAiProbability,
  correctedProbability,
  adjustmentAmount,
  modelConfidence,
  applied,
  reason
}) => {
  try {
    await MlCorrectionLog.create({
      marketId,
      timeframe: timeframe || 'unknown',
      marketCategory: normalizeCategory(marketCategory),
      externalAiProbability: clamp(toFinite(externalAiProbability, 50), 0, 100),
      correctedProbability: clamp(toFinite(correctedProbability, 50), 0, 100),
      adjustmentAmount: toFinite(adjustmentAmount, 0),
      modelConfidence: clamp(toFinite(modelConfidence, 0), 0, 1),
      applied: Boolean(applied),
      reason: reason || 'applied'
    });
  } catch (error) {
    logger.warn(`Failed to write ML correction log: ${error.message}`);
  }
};

const applyCorrection = (context = {}) => {
  const aiProbability = clamp(toFinite(context.aiProbability, 50), 0, 100);

  if (!isEnabled()) {
    return {
      correctedProbability: aiProbability,
      adjustment: 0,
      modelProbability: aiProbability,
      modelConfidence: 0,
      applied: false,
      reason: 'disabled'
    };
  }

  const unusual = marketIsUnusual(context);
  if (unusual.shouldIgnore) {
    const reason = unusual.suspicious
      ? 'ignored_suspicious'
      : (unusual.lowLiquidity ? 'ignored_low_liquidity' : 'ignored_high_volatility');

    return {
      correctedProbability: aiProbability,
      adjustment: 0,
      modelProbability: aiProbability,
      modelConfidence: 0,
      applied: false,
      reason
    };
  }

  const model = loadModel();
  const { map, category } = buildFeatureMap(context);
  const vector = mapToVector(map);

  const categoryWeights = getCategoryModelWeights(model, category);
  const weights = categoryWeights || model.weights;
  const modelProbability = sigmoid(dot(weights, vector)) * 100;

  const confidence = computeModelConfidence({
    modelProbability,
    aiProbability,
    sampleCount: toFinite(model.sampleCount, 0),
    context
  });

  if (confidence < minConfidenceThreshold()) {
    return {
      correctedProbability: aiProbability,
      adjustment: 0,
      modelProbability: Number(modelProbability.toFixed(2)),
      modelConfidence: Number(confidence.toFixed(4)),
      applied: false,
      reason: 'below_confidence_threshold',
      category
    };
  }

  const blend = clamp((toFinite(model.sampleCount, 0) / minSamples()) * maxBlend(), 0, maxBlend());
  const blended = aiProbability + ((modelProbability - aiProbability) * blend);

  const maxAdj = maxAdjustmentPoints();
  const bounded = clamp(blended, aiProbability - maxAdj, aiProbability + maxAdj);
  const correctedProbability = clamp(bounded, 0, 100);

  return {
    correctedProbability: Number(correctedProbability.toFixed(2)),
    adjustment: Number((correctedProbability - aiProbability).toFixed(2)),
    modelProbability: Number(modelProbability.toFixed(2)),
    modelConfidence: Number(confidence.toFixed(4)),
    applied: true,
    reason: 'applied',
    category
  };
};

const randomShuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const extractTrainingSample = (row) => {
  const outcome = String(row.finalOutcome || '').toUpperCase();
  if (!['YES', 'NO'].includes(outcome)) return null;

  const unusual = marketIsUnusual({
    liquidity: row.signalSummary?.liquidityUsd,
    priceVolatility: row.signalSummary?.volatility,
    suspiciousSignals: row.signalSummary?.suspiciousSignals
  });

  if (unusual.shouldIgnore) return null;

  const context = {
    aiProbability: row.externalAiProbability,
    marketProbability: row.externalAiProbability,
    confidence: row.confidence,
    marketPredictabilityScore: row.signalSummary?.marketPredictabilityScore,
    signalStrengthScore: row.signalSummary?.signalStrengthScore,
    marketClassification: row.marketCategory,
    historicalAccuracy: getCategoryAccuracy(row.marketCategory),
    expiryBand: row.timeRemainingSummary,
    liquidity: row.signalSummary?.liquidityUsd,
    priceVolatility: row.signalSummary?.volatility
  };

  const { map, category } = buildFeatureMap(context);
  return {
    category,
    vector: mapToVector(map),
    label: outcome === 'YES' ? 1 : 0,
    id: String(row._id)
  };
};

const trainWeightsWithSamples = (weights, samples, epochs = 3) => {
  const lr = learningRate();
  const trained = [...weights];

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const shuffled = randomShuffle(samples);
    for (const sample of shuffled) {
      const p = sigmoid(dot(trained, sample.vector));
      const err = p - sample.label;
      for (let i = 0; i < trained.length; i += 1) {
        trained[i] = trained[i] - (lr * err * sample.vector[i]);
      }
    }
  }

  return trained;
};

const evaluateWeights = (weights, samples) => {
  if (!samples.length) return { accuracy: 0, logLoss: Infinity };

  let correct = 0;
  let totalLoss = 0;

  for (const sample of samples) {
    const p = clamp(sigmoid(dot(weights, sample.vector)), 1e-6, 1 - 1e-6);
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === sample.label) correct += 1;
    totalLoss += -(sample.label * Math.log(p) + (1 - sample.label) * Math.log(1 - p));
  }

  return {
    accuracy: correct / samples.length,
    logLoss: totalLoss / samples.length
  };
};

const buildCrossValidationSplit = (samples) => {
  const shuffled = randomShuffle(samples);
  const testSize = Math.max(1, Math.floor(shuffled.length * 0.2));
  const test = shuffled.slice(0, testSize);
  const train = shuffled.slice(testSize);
  return { train, test };
};

const retrainFromRecentTrainingData = async () => {
  if (!isEnabled()) {
    return { retrained: false, reason: 'disabled' };
  }

  if (modelState.retrainInProgress) {
    return { retrained: false, reason: 'already_running' };
  }

  modelState.retrainInProgress = true;

  try {
    const since = new Date(Date.now() - (retrainWindowDays() * 24 * 60 * 60 * 1000));
    const rows = await MlTrainingData.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(Math.max(200, toFinite(config.mlCorrectionRetrainMaxSamples, 3000)))
      .lean();

    const samples = rows
      .map((row) => extractTrainingSample(row))
      .filter(Boolean);

    if (samples.length < minSamples()) {
      return { retrained: false, reason: 'insufficient_samples', sampleCount: samples.length };
    }

    const { train, test } = buildCrossValidationSplit(samples);
    if (!train.length || !test.length) {
      return { retrained: false, reason: 'invalid_split' };
    }

    const model = loadModel();
    const candidateWeights = trainWeightsWithSamples(model.weights, train, Math.max(2, toFinite(config.mlCorrectionEpochs, 4)));
    const candidateEval = evaluateWeights(candidateWeights, test);
    const currentEval = evaluateWeights(model.weights, test);

    const improves = candidateEval.logLoss <= currentEval.logLoss || candidateEval.accuracy >= currentEval.accuracy;
    if (!improves) {
      return {
        retrained: false,
        reason: 'no_cv_improvement',
        currentEval,
        candidateEval
      };
    }

    model.weights = candidateWeights;
    model.sampleCount = samples.length;
    model.lastRetrainedAt = new Date().toISOString();
    model.cv = {
      globalAccuracy: Number(candidateEval.accuracy.toFixed(4)),
      globalLogLoss: Number(candidateEval.logLoss.toFixed(6))
    };

    // Optional category-specific models.
    if (categoryModelsEnabled()) {
      const byCategory = new Map();
      for (const sample of train) {
        if (!byCategory.has(sample.category)) byCategory.set(sample.category, []);
        byCategory.get(sample.category).push(sample);
      }

      for (const [category, categorySamples] of byCategory.entries()) {
        if (categorySamples.length < 30) continue;
        const candidate = trainWeightsWithSamples(model.weights, categorySamples, 3);
        model.categoryModels[category] = {
          weights: candidate,
          sampleCount: categorySamples.length,
          updatedAt: new Date().toISOString()
        };
      }
    }

    // Refresh category accuracy stats.
    const categoryStats = {};
    for (const row of rows) {
      const category = normalizeCategory(row.marketCategory);
      if (!categoryStats[category]) categoryStats[category] = { total: 0, correct: 0 };
      categoryStats[category].total += 1;
      if (row.isPredictionCorrect === true) categoryStats[category].correct += 1;
    }
    model.categoryStats = categoryStats;

    schedulePersist();

    return {
      retrained: true,
      sampleCount: samples.length,
      cv: model.cv
    };
  } catch (error) {
    logger.warn(`ML retraining failed: ${error.message}`);
    return { retrained: false, reason: 'error', error: error.message };
  } finally {
    modelState.retrainInProgress = false;
  }
};

const trainFromResolvedPrediction = (record = {}) => {
  if (!isEnabled()) return { trained: false, reason: 'disabled' };

  const model = loadModel();
  const outcome = String(record.actualAnswer || record.finalMarketResult || '').toUpperCase();
  if (!['YES', 'NO'].includes(outcome)) {
    return { trained: false, reason: 'missing_outcome' };
  }

  const unusual = marketIsUnusual({
    liquidity: record.features?.liquidity || record.marketBucket?.liquidityUsd,
    priceVolatility: record.features?.priceVolatility,
    suspiciousSignals: record.signalSummary?.suspiciousSignals
  });

  if (unusual.shouldIgnore) {
    return { trained: false, reason: 'unusual_market' };
  }

  const context = {
    aiProbability: record.aiProbability,
    marketProbability: record.marketProbabilityAtTime,
    confidence: record.confidence,
    marketPredictabilityScore: record.marketPredictabilityScore,
    signalStrengthScore: record.signalStrengthScore,
    marketClassification: record.marketClassification,
    daysUntilExpiry: record.features?.daysUntilExpiry,
    expiryBand: record.marketBucket?.expiryBand,
    historicalAccuracy: getCategoryAccuracy(record.marketClassification),
    liquidity: record.features?.liquidity,
    priceVolatility: record.features?.priceVolatility
  };

  const { map, category } = buildFeatureMap(context);
  const vector = mapToVector(map);
  const label = outcome === 'YES' ? 1 : 0;

  const p = sigmoid(dot(model.weights, vector));
  const err = p - label;
  const lr = learningRate();

  for (let i = 0; i < model.weights.length; i += 1) {
    model.weights[i] = model.weights[i] - (lr * err * vector[i]);
  }

  model.sampleCount = toFinite(model.sampleCount, 0) + 1;
  if (!model.categoryStats[category]) {
    model.categoryStats[category] = { total: 0, correct: 0 };
  }
  model.categoryStats[category].total += 1;
  if (record.isCorrect === true) {
    model.categoryStats[category].correct += 1;
  }

  schedulePersist();

  // Periodic background retraining with CV from recent resolved samples.
  if (model.sampleCount % retrainEveryN() === 0) {
    setImmediate(() => {
      retrainFromRecentTrainingData().catch((error) => {
        logger.warn(`Background ML retraining failed: ${error.message}`);
      });
    });
  }

  return {
    trained: true,
    sampleCount: model.sampleCount,
    category
  };
};

module.exports = {
  applyCorrection,
  trainFromResolvedPrediction,
  getCategoryAccuracy,
  retrainFromRecentTrainingData,
  logCorrectionDecision,
  loadModel
};
