/**
 * LLM Service
 * Handles interactions with Google Gemini Pro API
 * @module services/llmService
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

/**
 * Initialize Gemini AI client
 */
let genAI = null;
let model = null;

const initializeClient = () => {
  if (!config.llmApiKey) {
    logger.warn('LLM API key not configured');
    return false;
  }
  
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.llmApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    logger.info('Gemini 2.5 Flash client initialized');
  }
  
  return true;
};

/**
 * Generates the prediction prompt for the LLM
 * @param {Object} marketData - Market information
 * @param {string} option - Option being predicted
 * @param {Object} features - Computed features
 * @param {string} timeframe - Prediction timeframe
 * @returns {string} Formatted prompt
 */
const generatePrompt = (marketData, option, features, timeframe) => {
  return `You are an expert prediction market analyst specializing in Polymarket outcomes. Analyze the following market and provide a confidence score for the "${option}" option.

MARKET INFORMATION:
- Title: ${marketData.title}
- Description: ${marketData.description || 'N/A'}
- Option: ${option}
- Timeframe: ${timeframe}
- Categories: ${marketData.categories?.join(', ') || 'N/A'}

COMPUTED FEATURES (All values are normalized and calculated from real market data):

LIQUIDITY & VOLUME:
- Total Liquidity: $${features.liquidity?.toLocaleString() || 0}
- 24h Volume: $${features.volume24h?.toLocaleString() || 0}
- 7d Volume: $${features.volume7d?.toLocaleString() || 0}
- 30d Volume: $${features.volume30d?.toLocaleString() || 0}

WHALE METRICS (Large trader analysis):
- Whale Factor: ${features.whaleFactor?.toFixed(2) || 0} (0-1 scale, higher = more whale influence)
- Whale Count: ${features.whaleCount || 0}
- Whale Volume: $${features.whaleVolume?.toLocaleString() || 0}
- Smart Money Flow: $${features.smartMoneyFlow?.toLocaleString() || 0}
- Smart Money Direction: ${features.smartMoneyDirection?.toFixed(2) || 0} (-1 to 1, negative = bearish, positive = bullish)

TREND & MOMENTUM:
- Trend Score: ${features.trendScore?.toFixed(2) || 0} (0-1 scale)
- Daily Change: ${((features.dailyChange || 0) * 100).toFixed(2)}%
- Weekly Change: ${((features.weeklyChange || 0) * 100).toFixed(2)}%
- Monthly Change: ${((features.monthlyChange || 0) * 100).toFixed(2)}%
- Momentum Score: ${features.momentumScore?.toFixed(2) || 0} (0-1 scale)
- Acceleration Score: ${features.accelerationScore?.toFixed(2) || 0}

MARKET ACTIVITY:
- 24h Trades: ${features.tradeCount24h || 0}
- 7d Trades: ${features.tradeCount7d || 0}
- Unique Traders (24h): ${features.uniqueTraders24h || 0}
- Unique Traders (7d): ${features.uniqueTraders7d || 0}
- Participation Rate: ${((features.participationRate || 0) * 100).toFixed(2)}%

PRICE METRICS:
- Current Price: $${features.currentPrice?.toFixed(4) || 0}
- 24h High: $${features.highPrice24h?.toFixed(4) || 0}
- 24h Low: $${features.lowPrice24h?.toFixed(4) || 0}
- Price Volatility: ${features.priceVolatility?.toFixed(2) || 0}

MARKET DEPTH:
- Bid-Ask Spread: $${features.bidAskSpread?.toFixed(4) || 0}
- Order Book Depth: ${features.orderBookDepth || 0} orders

MARKET MATURITY:
- Market Age: ${features.marketAge || 0} days
- Days Until Expiry: ${features.daysUntilExpiry || 'N/A'}

DISTRIBUTION & CONCENTRATION:
- Total Holders: ${features.holderCount || 0}
- Concentration Ratio: ${features.concentrationRatio?.toFixed(2) || 0} (top 10 holders share)
- Gini Coefficient: ${features.giniCoefficient?.toFixed(2) || 0} (inequality measure)

SENTIMENT & SOCIAL:
- Sentiment Score: ${features.sentimentScore?.toFixed(2) || 0} (0-1 scale)
- Social Mentions: ${features.socialMentions || 0}
- Community Growth: ${((features.communityGrowth || 0) * 100).toFixed(2)}%

OPTION-SPECIFIC:
- Option Popularity: ${features.optionPopularity?.toFixed(2) || 0}
- Option Momentum: ${features.optionMomentum?.toFixed(2) || 0}

RISK INDICATORS:
- Overall Risk Score: ${features.riskScore?.toFixed(2) || 0}
- Liquidity Risk: ${features.liquidityRisk?.toFixed(2) || 0}
- Anomaly Score: ${features.anomalyScore?.toFixed(2) || 0} (unusual activity detection)

EFFICIENCY & CORRELATION:
- Market Efficiency: ${features.marketEfficiency?.toFixed(2) || 0}
- Category Correlation: ${features.categoryCorrelation?.toFixed(2) || 0}

HISTORICAL:
- Historical Accuracy: ${((features.historicalAccuracy || 0) * 100).toFixed(2)}%

TASK:
Based on ALL the features above, provide your analysis in the following EXACT JSON format. Do not include any additional text, explanations, or markdown formatting - ONLY the JSON object:

{
  "confidence": <number between 0-100>,
  "reason": "<concise 1-2 sentence explanation focusing on the most important factors>"
}

The confidence should represent the probability that the "${option}" option will occur. Consider:
1. Whale factor and smart money direction
2. Price momentum and trends
3. Volume and liquidity patterns
4. Market sentiment and social signals
5. Historical patterns and anomalies
6. Market efficiency and risk indicators

Provide ONLY the JSON response, no additional text.`;
};

/**
 * Calls the LLM to generate a prediction
 * @param {Object} marketData - Market information
 * @param {string} option - Option being predicted
 * @param {Object} features - Computed features
 * @param {string} timeframe - Prediction timeframe
 * @returns {Promise<Object>} Prediction result with confidence and reason
 */
const generatePrediction = async (marketData, option, features, timeframe) => {
  if (!initializeClient()) {
    throw new CustomError('LLM service not configured', 500, 'LLM_NOT_CONFIGURED');
  }
  
  const prompt = generatePrompt(marketData, option, features, timeframe);
  
  logger.info(`Generating prediction for market ${marketData.marketId}, option: ${option}`);
  
  const startTime = Date.now();
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  const computationTime = Date.now() - startTime;
  
  logger.info(`LLM response received in ${computationTime}ms`);
  
  // Parse JSON response
  let prediction;
  try {
    // Extract JSON from response (in case LLM adds extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    prediction = JSON.parse(jsonMatch[0]);
    
    // Validate response structure
    if (typeof prediction.confidence !== 'number' || !prediction.reason) {
      throw new Error('Invalid prediction structure');
    }
    
    // Ensure confidence is within bounds
    prediction.confidence = Math.max(0, Math.min(100, prediction.confidence));
    
    logger.info(`Prediction generated: confidence=${prediction.confidence}%`);
    
  } catch (parseError) {
    logger.error('Failed to parse LLM response:', { error: parseError.message, response: text });
    throw new CustomError(
      'Failed to parse LLM response',
      500,
      'LLM_PARSE_ERROR',
      { rawResponse: text.substring(0, 500) }
    );
  }
  
  return {
    confidence: prediction.confidence,
    reason: prediction.reason,
    computationTime
  };
};

/**
 * Tests the LLM connection
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  if (!initializeClient()) {
    return false;
  }
  
  const testPrompt = 'Respond with only the word "OK" if you receive this message.';
  const result = await model.generateContent(testPrompt);
  const response = await result.response;
  const text = response.text();
  
  logger.info('LLM connection test:', { response: text });
  return text.toLowerCase().includes('ok');
};

/**
 * Gets model information
 * @returns {Object}
 */
const getModelInfo = () => {
  return {
    provider: 'Google',
    model: 'gemini-1.5-flash',
    configured: !!config.llmApiKey,
    initialized: !!model
  };
};

module.exports = {
  generatePrediction,
  testConnection,
  getModelInfo,
  initializeClient
};
