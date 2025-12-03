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
  try {
    // Recreate client on each init so tests can mock per-call behavior
    genAI = new GoogleGenerativeAI(config.llmApiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    logger.info('Gemini 2.5 Flash client initialized');
    return true;
  } catch (err) {
    logger.warn('Failed to initialize LLM client:', err.message);
    return false;
  }
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
  features = features || {};
  marketData = marketData || {};
  const systemPrompt = `SYSTEM PROMPT — POLYMARKET PREDICTION ENGINE

You are an advanced prediction engine that analyzes Polymarket markets using external sentiment, price data, and metadata. Your job is to produce a single final predicted outcome ("YES" or "NO") with clear reasoning.

1. DATA VALIDATION RULES

Before predicting, ALWAYS run these checks:

A. Market Validity Check

Reject a market IF:

It is past its resolution date

It has 0 liquidity

It has 0 volume

The question is outdated (older than 45 days)

The market is frozen, inactive, or showing contradictory data

The outcome has already resolved 50–50

If invalid:
Return:

{
  "success": true,
  "confidence": 0,
  "reason": "The market is invalid because <reason>."
}

2. SIMILAR MARKET HANDLING

If multiple markets ask the same question with different wording:

Identify them as duplicates

Pick the most recent + highest liquidity version

Ignore the rest

Explain: "Multiple similar markets found, the most reliable one was selected because X/Y/Z."

3. ODDS CALCULATION LOGIC

Polymarket URLs sometimes include ?option=yes, but you MUST NOT assume yes is always correct.

You must:

Step 1 → Calculate YES probability

Use:

market price

sentiment score

volume

liquidity

trend direction

Step 2 → Calculate NO probability

Compute it separately, not as 1 - yes.

Step 3 → Compare both

Pick ONLY the higher one.

Example decision:

YES: 61%  
NO: 39%  
Final: YES
Reason: Strong positive sentiment + rising liquidity + bullish trend.

4. FINAL OUTPUT FORMAT

Your final response MUST always be in this JSON structure:

{
  "success": true,
  "prediction": "YES or NO",
  "yes_probability": <number 0-100>,
  "no_probability": <number 0-100>,
  "confidence": <0-100>,
  "reason": "<Clear explanation: why the selected side > why the other side>",
  "notes": "<Any warnings: low liquidity, data conflict, similar markets detected, etc.>"
}

5. REASONING RULES

No long essays — keep explanations tight and analytical.

Always explain why the chosen side beats the other.

Highlight:

sentiment trends

volume changes

liquidity depth

price momentum

historical pattern relevance

If uncertain, reduce confidence instead of guessing.

6. ERROR HANDLING

If:

API returns garbage

market question is unclear

similar markets contradict

dates look wrong

sentiment is missing

Then output:

{
  "success": false,
  "error": "Invalid market data",
  "details": "<explain what was wrong>"
}`;

  return `${systemPrompt}

MARKET INFORMATION:
- Title: ${marketData.title}
- Description: ${marketData.description || 'N/A'}
- Option: ${option}
- Timeframe: ${timeframe}
- Categories: ${marketData.categories?.join(', ') || 'N/A'}
- Resolution Date: ${marketData.endDate || 'N/A'}
- Current Date: ${new Date().toISOString().split('T')[0]}
- Market ID: ${marketData.marketId || 'N/A'}

MARKET VALIDATION STATUS:
- Validation Status: ${features.validationStatus || 'unknown'}
- Validation Issues: ${features.validationIssues?.join('; ') || 'None'}
- Has Warnings: ${features.hasWarnings ? 'Yes' : 'No'}
- Has Critical Errors: ${features.hasCriticalErrors ? 'Yes' : 'No'}
- Market Quality Score: ${features.marketQualityScore || 'N/A'}/100 (Grade: ${features.marketQualityGrade || 'N/A'})
- Market Quality: ${features.predictionReliability || 'unknown'}

COMPUTED FEATURES (All values are normalized and calculated from real market data):

LIQUIDITY & VOLUME:
- Total Liquidity: $${features.liquidity?.toLocaleString() || 0}
- Liquidity Score: ${features.liquidityScore?.toFixed(2) || 0} (0-1 scale)
- Liquidity Risk: ${features.liquidityRisk?.toFixed(2) || 0} (${features.liquidityRisk > 0.6 ? 'HIGH' : features.liquidityRisk > 0.4 ? 'MEDIUM' : 'LOW'})
- 24h Volume: $${features.volume24h?.toLocaleString() || 0}
- 7d Volume: $${features.volume7d?.toLocaleString() || 0}
- 30d Volume: $${features.volume30d?.toLocaleString() || 0}
- Volume Growth (24h): ${features.volumeGrowth24h?.toFixed(2) || 0}%
- Volume Growth (7d): ${features.volumeGrowth7d?.toFixed(2) || 0}%
- Liquidity to Volume Ratio: ${features.liquidityToVolumeRatio?.toFixed(2) || 0}

PRICE METRICS:
- Current Price: $${features.currentPrice?.toFixed(4) || 0}
- Implied Probability: ${features.impliedProbability?.toFixed(2) || 0}%
- 24h High: $${features.highPrice24h?.toFixed(4) || 0}
- 24h Low: $${features.lowPrice24h?.toFixed(4) || 0}
- Price Range (24h): $${features.priceRange24h?.toFixed(4) || 0}
- Price Volatility: ${features.priceVolatility?.toFixed(2) || 0}
- Daily Change: ${((features.dailyChange || 0) * 100).toFixed(2)}%
- Weekly Change: ${((features.weeklyChange || 0) * 100).toFixed(2)}%
- Monthly Change: ${((features.monthlyChange || 0) * 100).toFixed(2)}%
- All Options: ${features.priceDistribution?.map(d => `${d.option}: ${d.probability}`).join(', ') || 'N/A'}

TREND & MOMENTUM:
- Trend Score: ${features.trendScore?.toFixed(2) || 0} (0-1 scale)
- Trend Direction: ${features.trendDirection || 'neutral'}
- Trend Strength: ${features.trendStrength || 'weak'}
- Momentum Score: ${features.momentumScore?.toFixed(2) || 0} (0-1 scale)
- Momentum Index (RSI-like): ${features.momentumIndex?.toFixed(2) || 50} (0-100)
- Momentum Signal: ${features.momentumSignal || 'neutral'}
- Acceleration Score: ${features.accelerationScore?.toFixed(2) || 0}

WHALE METRICS (Large trader analysis):
- Whale Factor: ${features.whaleFactor?.toFixed(2) || 0} (0-1 scale, higher = more whale influence)
- Whale Count: ${features.whaleCount || 0}
- Whale Volume: $${features.whaleVolume?.toLocaleString() || 0}
- Smart Money Flow: $${features.smartMoneyFlow?.toLocaleString() || 0}
- Smart Money Direction: ${features.smartMoneyDirection?.toFixed(2) || 0} (-1 to 1, negative = bearish, positive = bullish)

SENTIMENT & SOCIAL:
- Sentiment Score: ${features.sentimentScore?.toFixed(2) || 0} (0-1 scale)
- Sentiment Label: ${features.sentimentLabel || 'neutral'}
- Social Mentions: ${features.socialMentions || 0}
- Social Engagement: ${features.socialEngagement?.toFixed(2) || 0}%
- Community Growth: ${((features.communityGrowth || 0) * 100).toFixed(2)}%
- Virality Score: ${features.viralityScore?.toFixed(2) || 0} (0-1 scale)
- Network Effect: ${features.networkEffect || 'weak'}

MARKET ACTIVITY:
- 24h Trades: ${features.tradeCount24h || 0}
- 7d Trades: ${features.tradeCount7d || 0}
- Unique Traders (24h): ${features.uniqueTraders24h || 0}
- Unique Traders (7d): ${features.uniqueTraders7d || 0}
- Avg Trade Size (24h): $${features.avgTradeSize24h?.toLocaleString() || 0}
- Avg Trade Size (7d): $${features.avgTradeSize7d?.toLocaleString() || 0}
- Trade Size Growth: ${features.tradeSizeGrowth?.toFixed(2) || 0}%
- Participation Rate: ${((features.participationRate || 0) * 100).toFixed(2)}%
- Participation Growth: ${features.participationGrowth?.toFixed(2) || 0}%
- Active Participation Score: ${features.activeParticipationScore?.toFixed(2) || 0}

MARKET DEPTH:
- Bid-Ask Spread: $${features.bidAskSpread?.toFixed(4) || 0}
- Order Book Depth: ${features.orderBookDepth || 0} orders
- Market Depth Quality: ${features.marketDepthQuality || 'unknown'}

MARKET MATURITY:
- Market Age: ${features.marketAge || 0} days
- Days Until Expiry: ${features.daysUntilExpiry || 'N/A'}
- Hours Until Expiry: ${features.hoursUntilExpiry || 'N/A'}
- Lifecycle Stage: ${features.lifecycleStage || 'unknown'}
- Urgency Level: ${features.urgency || 'unknown'}
- Time Risk Factor: ${features.timeRiskFactor?.toFixed(2) || 0}

DISTRIBUTION & CONCENTRATION:
- Total Holders: ${features.holderCount || 0}
- Concentration Ratio: ${features.concentrationRatio?.toFixed(2) || 0} (top 10 holders share)
- Market Concentration: ${features.marketConcentration || 'unknown'}
- Concentration Risk: ${features.concentrationRisk || 'unknown'}
- Gini Coefficient: ${features.giniCoefficient?.toFixed(2) || 0} (inequality measure)

OPTION-SPECIFIC:
- Option Popularity: ${features.optionPopularity?.toFixed(2) || 0}
- Option Momentum: ${features.optionMomentum?.toFixed(2) || 0}
- Option Count: ${features.optionCount || 2}
- Is Binary Market: ${features.isBinaryMarket ? 'Yes' : 'No'}
- Option Rank: ${features.optionRank || 'N/A'} of ${features.optionCount || 2}
- Is Leading Option: ${features.isLeadingOption ? 'Yes' : 'No'}
- Price Difference to Leader: ${features.priceDifferenceToLeader?.toFixed(4) || 0}
- Competitiveness Score: ${features.competitiveness?.toFixed(2) || 0}

RISK INDICATORS:
- Overall Risk Score: ${features.riskScore?.toFixed(2) || 0}
- Risk Level: ${features.riskLevel || 'unknown'}
- Liquidity Risk: ${features.liquidityRisk?.toFixed(2) || 0}
- Volume Risk: ${features.volumeRisk?.toFixed(2) || 0}
- Time Risk: ${features.timeRisk?.toFixed(2) || 0}
- Concentration Risk Score: ${features.concentrationRiskScore?.toFixed(2) || 0}
- Anomaly Score: ${features.anomalyScore?.toFixed(2) || 0} (unusual activity detection)
- Anomaly Details: ${features.anomalyDetails?.join('; ') || 'None detected'}

EFFICIENCY & CORRELATION:
- Market Efficiency: ${features.marketEfficiency?.toFixed(2) || 0}
- Category Correlation: ${features.categoryCorrelation?.toFixed(2) || 0}
- Market Category: ${features.marketCategory || 'uncategorized'}
- Category Popularity: ${features.categoryPopularity?.toFixed(2) || 0}

HISTORICAL:
- Historical Accuracy: ${((features.historicalAccuracy || 0) * 100).toFixed(2)}%
- Prediction Reliability: ${features.predictionReliability || 'unknown'}

Provide ONLY the JSON response as specified in the system prompt, no additional text.`;
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
  // Support legacy signature: (marketData, features)
  if (typeof option === 'object' && typeof features === 'undefined') {
    features = option;
    option = marketData?.options?.[0]?.name || marketData?.options?.[0] || 'Yes';
  }

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
    
    // If the LLM response doesn't include an explicit success flag, accept common structured outputs
    if (typeof prediction.success !== 'boolean') {
      // Normalize older/alternate formats
      prediction.success = true;
    }

    if (prediction.success) {
      // Accept either `confidence` as string/number, and optional `odds` object
      if (!prediction.prediction) {
        throw new Error('Invalid prediction structure: missing prediction');
      }

      // Normalize confidence
      if (typeof prediction.confidence === 'string') {
        const n = Number(prediction.confidence);
        prediction.confidence = Number.isNaN(n) ? 0 : n;
      }

      if (typeof prediction.confidence !== 'number') {
        throw new Error('Invalid prediction structure: missing confidence');
      }

      // Map odds -> yes_probability/no_probability if needed
      if (!('yes_probability' in prediction) && prediction.odds && typeof prediction.odds.yes === 'number') {
        prediction.yes_probability = prediction.odds.yes * 100;
        prediction.no_probability = prediction.odds.no * 100;
      }

      // Clamp values
      prediction.yes_probability = Math.max(0, Math.min(100, prediction.yes_probability || 0));
      prediction.no_probability = Math.max(0, Math.min(100, prediction.no_probability || 0));
      prediction.confidence = Math.max(0, Math.min(100, prediction.confidence));
    } else {
      if (!prediction.error) {
        throw new Error('Invalid prediction structure for success=false');
      }
    }
    
    logger.info(`Prediction generated: success=${prediction.success}, prediction=${prediction.prediction || 'N/A'}, confidence=${prediction.confidence || 'N/A'}%`);
    
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
    ...prediction,
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
    model: 'gemini-2.5-flash',
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
