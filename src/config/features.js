/**
 * Feature Configuration Module
 * Defines all 40+ market features used in predictions
 * @module config/features
 */

/**
 * Complete list of features computed for each market prediction
 * These features are used by the LLM to make informed predictions
 */
const FEATURE_DEFINITIONS = {
  // Liquidity & Volume Metrics
  liquidity: {
    description: 'Total liquidity available in the market',
    type: 'number',
    unit: 'USD'
  },
  volume24h: {
    description: '24-hour trading volume',
    type: 'number',
    unit: 'USD'
  },
  volume7d: {
    description: '7-day trading volume',
    type: 'number',
    unit: 'USD'
  },
  volume30d: {
    description: '30-day trading volume',
    type: 'number',
    unit: 'USD'
  },
  
  // Whale Metrics
  whaleFactor: {
    description: 'Influence of large traders (0-1)',
    type: 'number',
    unit: 'score'
  },
  whaleCount: {
    description: 'Number of whale traders active',
    type: 'number',
    unit: 'count'
  },
  whaleVolume: {
    description: 'Volume attributed to whales',
    type: 'number',
    unit: 'USD'
  },
  
  // Trend Metrics
  trendScore: {
    description: 'Overall trend direction (0-1)',
    type: 'number',
    unit: 'score'
  },
  dailyChange: {
    description: '24-hour price change',
    type: 'number',
    unit: 'percentage'
  },
  weeklyChange: {
    description: '7-day price change',
    type: 'number',
    unit: 'percentage'
  },
  monthlyChange: {
    description: '30-day price change',
    type: 'number',
    unit: 'percentage'
  },
  
  // Sentiment Metrics
  sentimentScore: {
    description: 'Market sentiment analysis (0-1)',
    type: 'number',
    unit: 'score'
  },
  
  // Trading Activity
  tradeCount24h: {
    description: 'Number of trades in 24h',
    type: 'number',
    unit: 'count'
  },
  tradeCount7d: {
    description: 'Number of trades in 7d',
    type: 'number',
    unit: 'count'
  },
  uniqueTraders24h: {
    description: 'Unique traders in 24h',
    type: 'number',
    unit: 'count'
  },
  uniqueTraders7d: {
    description: 'Unique traders in 7d',
    type: 'number',
    unit: 'count'
  },
  
  // Price Metrics
  currentPrice: {
    description: 'Current option price',
    type: 'number',
    unit: 'USD'
  },
  highPrice24h: {
    description: '24h high price',
    type: 'number',
    unit: 'USD'
  },
  lowPrice24h: {
    description: '24h low price',
    type: 'number',
    unit: 'USD'
  },
  priceVolatility: {
    description: 'Price volatility measure',
    type: 'number',
    unit: 'score'
  },
  
  // Market Depth
  bidAskSpread: {
    description: 'Current bid-ask spread',
    type: 'number',
    unit: 'USD'
  },
  orderBookDepth: {
    description: 'Total orders in book',
    type: 'number',
    unit: 'count'
  },
  
  // Momentum Indicators
  momentumScore: {
    description: 'Price momentum indicator (0-1)',
    type: 'number',
    unit: 'score'
  },
  accelerationScore: {
    description: 'Rate of change in momentum',
    type: 'number',
    unit: 'score'
  },
  
  // Market Age & Maturity
  marketAge: {
    description: 'Days since market creation',
    type: 'number',
    unit: 'days'
  },
  daysUntilExpiry: {
    description: 'Days until market closes',
    type: 'number',
    unit: 'days'
  },
  
  // Participation Metrics
  participationRate: {
    description: 'Active traders vs total holders',
    type: 'number',
    unit: 'percentage'
  },
  holderCount: {
    description: 'Total unique position holders',
    type: 'number',
    unit: 'count'
  },
  
  // Concentration Metrics
  concentrationRatio: {
    description: 'Top 10 holders share (0-1)',
    type: 'number',
    unit: 'score'
  },
  giniCoefficient: {
    description: 'Position distribution inequality',
    type: 'number',
    unit: 'score'
  },
  
  // Network Effects
  socialMentions: {
    description: 'Social media mention count',
    type: 'number',
    unit: 'count'
  },
  communityGrowth: {
    description: 'Rate of new participants',
    type: 'number',
    unit: 'percentage'
  },
  
  // Risk Metrics
  riskScore: {
    description: 'Overall risk assessment (0-1)',
    type: 'number',
    unit: 'score'
  },
  liquidityRisk: {
    description: 'Risk from low liquidity (0-1)',
    type: 'number',
    unit: 'score'
  },
  
  // Efficiency Metrics
  marketEfficiency: {
    description: 'Price discovery efficiency (0-1)',
    type: 'number',
    unit: 'score'
  },
  
  // Correlation Metrics
  categoryCorrelation: {
    description: 'Correlation with category avg',
    type: 'number',
    unit: 'score'
  },
  
  // Historical Performance
  historicalAccuracy: {
    description: 'Past prediction accuracy',
    type: 'number',
    unit: 'percentage'
  },
  
  // Option-Specific
  optionPopularity: {
    description: 'Relative popularity of option',
    type: 'number',
    unit: 'score'
  },
  optionMomentum: {
    description: 'Option-specific momentum',
    type: 'number',
    unit: 'score'
  },
  
  // Smart Money Indicators
  smartMoneyFlow: {
    description: 'Flow from profitable traders',
    type: 'number',
    unit: 'USD'
  },
  smartMoneyDirection: {
    description: 'Direction of smart money (-1 to 1)',
    type: 'number',
    unit: 'score'
  },
  
  // Anomaly Detection
  anomalyScore: {
    description: 'Unusual activity detection (0-1)',
    type: 'number',
    unit: 'score'
  }
};

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false
};

/**
 * Timeframe configurations
 */
const TIMEFRAMES = {
  daily: {
    label: 'Daily',
    hours: 24,
    enabled: true
  },
  weekly: {
    label: 'Weekly',
    hours: 168,
    enabled: true
  },
  monthly: {
    label: 'Monthly',
    hours: 720,
    enabled: true
  }
};

/**
 * Whale trader thresholds
 */
const WHALE_THRESHOLDS = {
  minVolumeUSD: 10000, // Minimum volume to be considered a whale
  minTradeCount: 10, // Minimum trades to be considered
  profitabilityWeight: 0.4, // Weight of profitability in whale score
  volumeWeight: 0.3, // Weight of volume
  frequencyWeight: 0.3 // Weight of trading frequency
};

module.exports = {
  FEATURE_DEFINITIONS,
  RATE_LIMIT_CONFIG,
  TIMEFRAMES,
  WHALE_THRESHOLDS
};
