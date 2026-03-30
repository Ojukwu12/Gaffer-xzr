/**
 * Environment Configuration Module
 * Loads and validates all environment variables
 * @module config/env
 */

require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:5000',
  frontendUrl: process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000',
  
  // CORS Configuration
  allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  
  // MongoDB Configuration
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/polyscope',
  
  // Polymarket API
  polymarketApiBase: process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com',

  // External Data APIs (sports + financial)
  theSportsDbApiKey: process.env.THESPORTSDB_API_KEY || '3',
  theSportsDbBaseUrl: process.env.THESPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v1/json',
  footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY || '',
  footballDataBaseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
  coinGeckoBaseUrl: process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
  yahooFinanceBaseUrl: process.env.YAHOO_FINANCE_BASE_URL || 'https://query1.finance.yahoo.com',
  
  // External Data APIs (geopolitical + corporate)
  gdeltApiKey: process.env.GDELT_API_KEY || '',
  gdeltBaseUrl: process.env.GDELT_BASE_URL || 'https://api.gdeltproject.org',
  newsApiKey: process.env.NEWS_API_KEY || '',
  earningsApiKey: process.env.EARNINGS_API_KEY || '',
  earningsApiBase: process.env.EARNINGS_API_BASE || 'https://api.example.com/earnings',
  secEdgarApiBase: process.env.SEC_EDGAR_API_BASE || 'https://data.sec.gov/api/xbrl',
  
  externalDataCacheTtl: parseInt(process.env.EXTERNAL_DATA_CACHE_TTL || '900', 10),
  
  // LLM Configuration (Primary: Gemini Pro)
  // Support both LLM_API_KEY and GEMINI_API_KEY for flexibility
  llmApiKey: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '',
  
  // Secondary LLM (fallback for rate limiting)
  secondaryLlmProvider: process.env.SECONDARY_LLM_PROVIDER || '', // 'claude' or 'ollama'
  secondaryLlmApiKey: process.env.SECONDARY_LLM_API_KEY || '',
  secondaryLlmModel: process.env.SECONDARY_LLM_MODEL || 'claude-3-5-sonnet-20241022',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  
  // Email Service Configuration (Brevo API)
  brevo: {
    apiKey: process.env.BREVO_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM_ADDRESS || 'obiefunaokechukwu98@gmail.com',
    emailFromName: process.env.EMAIL_FROM_NAME || 'Polyscope Notifications'
  },
  
  // Web Push Configuration
  // Support both WEB_PUSH_VAPID_* and VAPID_* variable names
  webPush: {
    vapidPublic: process.env.WEB_PUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivate: process.env.WEB_PUSH_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || ''
  },
  
  // Cache Configuration
  cacheTTL: parseInt(process.env.CACHE_TTL || '600', 10),
  
  // Notification Configuration
  notificationThreshold: parseInt(process.env.NOTIFICATION_THRESHOLD || '10', 10),

  // Admin notification targets
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminApprovalAlertEnabled: String(process.env.ADMIN_APPROVAL_ALERT_ENABLED || 'true').toLowerCase() === 'true',

  // Lightweight admin secret header for sensitive admin actions
  adminSecretKey: process.env.ADMIN_SECRET_KEY || '',
  
  // Prediction Engine Configuration
  maxMarketsPerRun: parseInt(process.env.MAX_MARKETS_PER_RUN || '20', 10),
  marketsPerCategory: parseInt(process.env.MARKETS_PER_CATEGORY || '1', 10),
  minLiquidityUsd: parseInt(process.env.MIN_LIQUIDITY_USD || '1000', 10),
  minVolume24hUsd: parseInt(process.env.MIN_VOLUME_24H_USD || '100', 10),
  minPredictabilityScore: parseInt(process.env.MIN_PREDICTABILITY_SCORE || '65', 10),
  minPredictionConfidence: parseInt(process.env.MIN_PREDICTION_CONFIDENCE || '70', 10),
  minProbabilityDifference: parseInt(process.env.MIN_PROBABILITY_DIFFERENCE || '10', 10),
  minExpectedEdgeScore: parseInt(process.env.MIN_EXPECTED_EDGE_SCORE || '55', 10),
  minWinRateLowerBound: parseInt(process.env.MIN_WIN_RATE_LOWER_BOUND || '51', 10),
  predictionMode: process.env.PREDICTION_MODE || 'production',
  readinessMinResolved: parseInt(process.env.READINESS_MIN_RESOLVED || '100', 10),
  readinessWindowDays: parseInt(process.env.READINESS_WINDOW_DAYS || '30', 10),
  readinessMode: process.env.READINESS_MODE || 'paper',
  enforceProductionReadiness: String(process.env.ENFORCE_PRODUCTION_READINESS || 'false').toLowerCase() === 'true',

  // Timing security: jitter job execution and publication windows
  predictionCronJitterMinMs: parseInt(process.env.PREDICTION_CRON_JITTER_MIN_MS || '120000', 10),
  predictionCronJitterMaxMs: parseInt(process.env.PREDICTION_CRON_JITTER_MAX_MS || '600000', 10),
  refreshCronJitterMinMs: parseInt(process.env.REFRESH_CRON_JITTER_MIN_MS || '30000', 10),
  refreshCronJitterMaxMs: parseInt(process.env.REFRESH_CRON_JITTER_MAX_MS || '180000', 10),
  predictionPublishDelayMinMs: parseInt(process.env.PREDICTION_PUBLISH_DELAY_MIN_MS || '120000', 10),
  predictionPublishDelayMaxMs: parseInt(process.env.PREDICTION_PUBLISH_DELAY_MAX_MS || '480000', 10),

  // Internal ML correction layer (post-AI probability adjustment)
  mlCorrectionEnabled: process.env.ML_CORRECTION_ENABLED || 'true',
  mlCorrectionLearningRate: parseFloat(process.env.ML_CORRECTION_LEARNING_RATE || '0.03'),
  mlCorrectionMaxAdjustment: parseInt(process.env.ML_CORRECTION_MAX_ADJUSTMENT || '6', 10),
  mlCorrectionMinSamples: parseInt(process.env.ML_CORRECTION_MIN_SAMPLES || '40', 10),
  mlCorrectionBlendMax: parseFloat(process.env.ML_CORRECTION_BLEND_MAX || '0.35'),
  mlCorrectionModelPath: process.env.ML_CORRECTION_MODEL_PATH || '',
  mlCorrectionConfidenceThreshold: parseFloat(process.env.ML_CORRECTION_CONFIDENCE_THRESHOLD || '0.6'),
  mlCorrectionMinLiquidityUsd: parseInt(process.env.ML_CORRECTION_MIN_LIQUIDITY_USD || '1000', 10),
  mlCorrectionMaxVolatility: parseFloat(process.env.ML_CORRECTION_MAX_VOLATILITY || '0.35'),
  mlCorrectionCategoryModelsEnabled: process.env.ML_CORRECTION_CATEGORY_MODELS_ENABLED || 'true',
  mlCorrectionRetrainEveryN: parseInt(process.env.ML_CORRECTION_RETRAIN_EVERY_N || '20', 10),
  mlCorrectionRetrainWindowDays: parseInt(process.env.ML_CORRECTION_RETRAIN_WINDOW_DAYS || '180', 10),
  mlCorrectionRetrainMaxSamples: parseInt(process.env.ML_CORRECTION_RETRAIN_MAX_SAMPLES || '3000', 10),
  mlCorrectionEpochs: parseInt(process.env.ML_CORRECTION_EPOCHS || '4', 10),
  
  // LLM Rate Limiting & Retry
  llmMaxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3', 10),
  llmRetryDelayMs: parseInt(process.env.LLM_RETRY_DELAY_MS || '1000', 10),
  llmRateLimitThreshold: parseInt(process.env.LLM_RATE_LIMIT_THRESHOLD || '3', 10),

  // Outbound external API rate limiting (minimum interval between provider calls)
  theSportsDbMinIntervalMs: parseInt(process.env.THESPORTSDB_MIN_INTERVAL_MS || '700', 10),
  footballDataMinIntervalMs: parseInt(process.env.FOOTBALL_DATA_MIN_INTERVAL_MS || '500', 10),
  coinGeckoMinIntervalMs: parseInt(process.env.COINGECKO_MIN_INTERVAL_MS || '1200', 10),
  yahooFinanceMinIntervalMs: parseInt(process.env.YAHOO_FINANCE_MIN_INTERVAL_MS || '400', 10),
  gdeltMinIntervalMs: parseInt(process.env.GDELT_MIN_INTERVAL_MS || '600', 10),
  newsApiMinIntervalMs: parseInt(process.env.NEWS_API_MIN_INTERVAL_MS || '800', 10),
  secEdgarMinIntervalMs: parseInt(process.env.SEC_EDGAR_MIN_INTERVAL_MS || '500', 10),
  earningsApiMinIntervalMs: parseInt(process.env.EARNINGS_API_MIN_INTERVAL_MS || '500', 10),

  // Vote integrity and anti-manipulation controls
  voteCooldownMs: parseInt(process.env.VOTE_COOLDOWN_MS || '60000', 10),
  voteReliableSampleSize: parseInt(process.env.VOTE_RELIABLE_SAMPLE_SIZE || '20', 10),
  voteBurstWindowMs: parseInt(process.env.VOTE_BURST_WINDOW_MS || '300000', 10),
  voteBurstThreshold: parseInt(process.env.VOTE_BURST_THRESHOLD || '40', 10),
  voteBurstMaxSingleIpShare: parseFloat(process.env.VOTE_BURST_MAX_SINGLE_IP_SHARE || '0.6'),
  voteNewAccountDays: parseInt(process.env.VOTE_NEW_ACCOUNT_DAYS || '7', 10),
  voteRecentAccountDays: parseInt(process.env.VOTE_RECENT_ACCOUNT_DAYS || '30', 10),
  voteNewAccountWeight: parseFloat(process.env.VOTE_NEW_ACCOUNT_WEIGHT || '0.5'),
  voteRecentAccountWeight: parseFloat(process.env.VOTE_RECENT_ACCOUNT_WEIGHT || '0.8'),
  voteVelocitySpikeWeight: parseFloat(process.env.VOTE_VELOCITY_SPIKE_WEIGHT || '0.7'),
  voteIpConcentrationWeight: parseFloat(process.env.VOTE_IP_CONCENTRATION_WEIGHT || '0.5'),
  voteMinWeight: parseFloat(process.env.VOTE_MIN_WEIGHT || '0.3'),
  
  // Rate Limit Bypass
  devIp: process.env.DEV_IP || '127.0.0.1'
};

/**
 * Validates critical environment variables
 * @throws {Error} If critical env vars are missing
 */
const validateConfig = () => {
  const required = ['MONGODB_URI'];
  const hasLlmKey = Boolean(process.env.LLM_API_KEY || process.env.GEMINI_API_KEY);
  if (!hasLlmKey) {
    required.push('LLM_API_KEY or GEMINI_API_KEY');
  }
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (config.nodeEnv === 'production') {
      // In production we should fail fast to avoid running with invalid configuration
      // Throwing will surface the error during startup and prevent the server from running.
      throw new Error(msg);
    }

    // In non-production environments, warn so developers can still run locally.
    // This helps CI/dev where some secrets may be intentionally absent.
    // eslint-disable-next-line no-console
    console.warn(`Warning: ${msg}`);
  }
};

validateConfig();

module.exports = config;
