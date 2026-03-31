/**
 * LLM Service
 * Handles interactions with Google Gemini Pro API
 * @module services/llmService
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');
const secondaryLlmService = require('./secondaryLlmService');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const STOPWORDS = new Set([
  'will', 'the', 'and', 'for', 'with', 'before', 'after', 'this', 'that', 'from', 'into', 'have', 'has', 'had',
  'over', 'under', 'about', 'into', 'your', 'their', 'there', 'what', 'when', 'where', 'market', 'option', 'match'
]);

const toPercent = (value, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Number(parsed.toFixed(2)), 0, 100);
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const extractReasonAnchors = (marketData = {}, option = '') => {
  const title = normalizeText(marketData.title || marketData.question || '');
  const optionValue = normalizeText(option);

  const keywordTokens = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  const uniqueTokens = [...new Set(keywordTokens)].slice(0, 8);

  const entities = title
    .split(/\s+/)
    .filter((token) => /[A-Z]/.test(token) || /^[A-Z0-9]{2,}$/.test(token))
    .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
    .filter((token) => token.length >= 2)
    .slice(0, 6);

  return {
    title,
    option: optionValue,
    tokens: uniqueTokens,
    entities
  };
};

const reasonLooksGeneric = (reason = '', anchors = { tokens: [], entities: [] }) => {
  const normalized = normalizeText(reason).toLowerCase();
  if (!normalized) return true;

  const genericPhrases = [
    'based on current market conditions',
    'based on available data',
    'market sentiment and trends',
    'given the current trend',
    'insufficient data',
    'the model suggests',
    'high uncertainty'
  ];

  const hasGenericPhrase = genericPhrases.some((phrase) => normalized.includes(phrase));
  const hasNumericEvidence = /(\d+(?:\.\d+)?\s*%|\$\s*\d|\b\d+\s*(?:days|matches|hours|points|goals|cards)\b)/i.test(reason);
  const hasTokenAnchor = (anchors.tokens || []).some((token) => normalized.includes(token));
  const hasEntityAnchor = (anchors.entities || []).some((entity) => normalized.includes(entity.toLowerCase()));
  const hasAnchor = hasTokenAnchor || hasEntityAnchor;

  return hasGenericPhrase || !hasNumericEvidence || !hasAnchor;
};

const buildMarketSpecificReason = ({ prediction = {}, marketData = {}, option = '', features = {} }) => {
  const title = normalizeText(marketData.title || marketData.question || 'this market');
  const selected = String(prediction.prediction || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';
  const yesProbability = toPercent(prediction.yes_probability, toPercent(prediction.confidence, 50));
  const noProbability = toPercent(prediction.no_probability, toPercent(100 - yesProbability, 50));
  const selectedProbability = selected === 'YES' ? yesProbability : noProbability;
  const altProbability = selected === 'YES' ? noProbability : yesProbability;

  const signalParts = [];

  if (Number.isFinite(Number(features.impliedProbability))) {
    signalParts.push(`market-implied probability is ${toPercent(features.impliedProbability)}%`);
  }
  if (Number.isFinite(Number(features.volume24h))) {
    signalParts.push(`24h volume is $${Math.round(Number(features.volume24h)).toLocaleString()}`);
  }
  if (Number.isFinite(Number(features.liquidity))) {
    signalParts.push(`liquidity is $${Math.round(Number(features.liquidity)).toLocaleString()}`);
  }
  if (features.trendDirection) {
    signalParts.push(`trend is ${features.trendDirection}`);
  }
  if (features.sentimentLabel) {
    signalParts.push(`sentiment is ${features.sentimentLabel}`);
  }
  if (Number.isFinite(Number(features.whaleFactor))) {
    signalParts.push(`whale factor is ${Math.round(Number(features.whaleFactor) * 100)}%`);
  }
  if (Number.isFinite(Number(features.externalDataCompositeScore))) {
    signalParts.push(`external score is ${toPercent(features.externalDataCompositeScore)}%`);
  }

  const advantage = selectedProbability - altProbability;
  const reasonText = advantage > 30 
    ? `${selected} is significantly more likely with a ${advantage.toFixed(1)} point advantage.`
    : advantage > 15
      ? `${selected} has a meaningful advantage at ${advantage.toFixed(1)} points over the alternative.`
      : `${selected} edges out the alternative with ${advantage.toFixed(1)} point higher probability.`;

  const topSignals = signalParts.slice(0, 3).join(', ');
  const classification = features.marketClassification ? ` (${features.marketClassification})` : '';
  const optionLabel = normalizeText(option) || 'selected option';

  return `${title}${classification}: choose ${selected} for ${optionLabel} because the model estimates ${selected} at ${selectedProbability}%. ${reasonText} This call is supported by ${topSignals || 'the strongest available market and model signals for this specific market'}.`;
};

const ensureMarketSpecificReason = ({ reason, prediction, marketData, option, features }) => {
  const anchors = extractReasonAnchors(marketData, option);

  if (!reasonLooksGeneric(reason, anchors)) {
    return normalizeText(reason);
  }

  return buildMarketSpecificReason({ prediction, marketData, option, features });
};

/**
 * Initialize Gemini AI client
 */
let genAI = null;
let model = null;
let rateLimitErrors = 0;
let useSecondaryLLM = false;

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
 * Generates the prediction prompt for the LLM (OPTIMIZED - minimal format to reduce tokens)
 * @param {Object} marketData - Market information
 * @param {string} option - Option being predicted
 * @param {Object} features - Computed features
 * @param {string} timeframe - Prediction timeframe
 * @returns {string} Formatted prompt
 */
const generatePrompt = (marketData, option, features, timeframe) => {
  features = features || {};
  marketData = marketData || {};
  const systemPrompt = `You are a Polymarket prediction engine. Analyze market data and return a JSON prediction.

OUTPUT FORMAT (JSON only):
{
  "success": true,
  "prediction": "YES|NO",
  "confidence": 0-100,
  "marketClassification": "politics|crypto|technology|global events|finance/economy|unpredictable/noise",
  "marketPredictabilityScore": 0-100,
  "signalStrengthScore": 0-100,
  "mispricingScore": 0-100,
  "reason": "2-3 sentence explanation"
}

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
  "marketClassification": "politics|crypto|technology|global events|finance/economy|unpredictable/noise",
  "marketPredictabilityScore": <0-100>,
  "signalStrengthScore": <0-100>,
  "mispricingScore": <0-100>,
  "reason": "<Clear explanation: why the selected side > why the other side>",
  "notes": "<Any warnings: low liquidity, data conflict, similar markets detected, etc.>"
}

5. REASONING RULES

No long essays — keep explanations tight and analytical.

Always explain why the chosen side beats the other.

Reason MUST be market-specific. Name the actual subject (team/country/company/event) from the market title.

Reason MUST cite at least two numeric signals from provided metrics (percentages, liquidity, volume, trend/sentiment scores).

Do NOT output generic template language that could fit any market.

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

MARKET: ${marketData.title || 'Unknown'}
OPTION: ${option}
TIMEFRAME: ${timeframe}

CRITICAL METRICS:
- Liquidity: $${(features.liquidity || 0).toLocaleString()}
- Volume 24h: $${(features.volume24h || 0).toLocaleString()}
- Current Price: ${((features.currentPrice || 0) * 100).toFixed(1)}% (${features.impliedProbability?.toFixed(1) || 0}% probability)
- Trend: ${features.trendDirection || 'neutral'} (${((features.trendScore || 0) * 100).toFixed(0)}%)
- Sentiment: ${features.sentimentLabel || 'neutral'} (${((features.sentimentScore || 0) * 100).toFixed(0)}%)
- Volatility: ${((features.priceVolatility || 0) * 100).toFixed(1)}%
- Risk Level: ${features.riskLevel || 'unknown'}

KEY SIGNALS:
- Whale Factor: ${((features.whaleFactor || 0) * 100).toFixed(0)}%
- Smart Money: ${features.smartMoneyDirection?.toFixed(2) || 0} (bullish=+1, bearish=-1)
- Volume Growth: ${features.volumeGrowth24h?.toFixed(0) || 0}%
- Days to Expiry: ${features.daysUntilExpiry || 'N/A'}
- Anomalies: ${features.anomalyDetails?.slice(0, 2).join('; ') || 'None'}
- Market Classification (pre-computed): ${features.marketClassification || 'unknown'}
- Predictability Score (pre-computed): ${features.marketPredictabilityScore || 0}%
- Signal Strength Score (pre-computed): ${features.signalStrengthScore || 0}%
- External Data Source: ${features.externalDataSourceType || 'none'}
- External Composite Score: ${features.externalDataCompositeScore ?? 50}%
- External Signal Strength: ${(Number(features.externalDataSignalStrength || 0) * 100).toFixed(0)}%
- External Scores JSON: ${JSON.stringify(features.externalDataScores || {})}

ANALYSIS:
1. Is the market valid? (Check liquidity ${features.liquidity}, volume ${features.volume24h}, expiry ${features.daysUntilExpiry})
2. What does price action suggest? (Current: ${((features.currentPrice || 0) * 100).toFixed(0)}%, Trend: ${features.trendDirection})
3. Are smart traders buying or selling? (Whales: ${((features.whaleFactor || 0) * 100).toFixed(0)}%, Smart Money: ${((features.smartMoneyDirection || 0) * 100).toFixed(0)}%)
4. What's the confidence? (Base on data quality, not sentiment alone)
5. Is the market probably mispriced vs current market probability (${features.impliedProbability?.toFixed(2) || 0}%)?

Provide ONLY valid JSON response.`;
};

/**
 * Calls the LLM to generate a prediction
 * @param {Object} marketData - Market information
 * @param {string} option - Option being predicted
 * @param {Object} features - Computed features
 * @param {string} timeframe - Prediction timeframe
 * @param {number} retryCount - Internal retry counter
 * @returns {Promise<Object>} Prediction result with confidence and reason
 */
const generatePrediction = async (marketData, option, features, timeframe, retryCount = 0) => {
  // Support legacy signature: (marketData, features)
  if (typeof option === 'object' && typeof features === 'undefined') {
    features = option;
    option = marketData?.options?.[0]?.name || marketData?.options?.[0] || 'Yes';
  }

  if (!initializeClient()) {
    throw new CustomError('LLM service not configured', 500, 'LLM_NOT_CONFIGURED');
  }

  const prompt = generatePrompt(marketData, option, features, timeframe);
  
  logger.info(`Generating prediction for market ${marketData.marketId}, option: ${option}${retryCount > 0 ? ` (retry ${retryCount})` : ''}${useSecondaryLLM ? ' [using secondary LLM]' : ''}`);
  
  const startTime = Date.now();
  
  try {
    let text;
    
    // Use secondary LLM if primary (Gemini) is rate-limited
    if (useSecondaryLLM) {
      logger.info(`Switching to secondary LLM (${config.secondaryLlmProvider}) due to Gemini rate limiting`);
      try {
        text = await secondaryLlmService.generateSecondaryPrediction(prompt);
      } catch (secondaryError) {
        logger.warn('Secondary LLM failed, fallback to Gemini', {
          message: secondaryError?.message,
          status: secondaryError?.statusCode || secondaryError?.status || null,
          code: secondaryError?.errorCode || null,
          details: secondaryError?.details || null
        });
        // Fallback to Gemini anyway
        useSecondaryLLM = false;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
      }
    } else {
      // Primary: Use Gemini
      const result = await model.generateContent(prompt);
      const response = await result.response;
      text = response.text();
    }
    
    const computationTime = Date.now() - startTime;
    
    logger.info(`LLM response received in ${computationTime}ms`);
    
    // Reset rate limit counter on success
    rateLimitErrors = 0;
  
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

        // Backfill missing yes/no probabilities with the most conservative available signal.
        const parsedYes = Number(prediction.yes_probability);
        const parsedNo = Number(prediction.no_probability);

        if (!Number.isFinite(parsedYes) && Number.isFinite(parsedNo)) {
          prediction.yes_probability = 100 - parsedNo;
          prediction.no_probability = parsedNo;
        } else if (Number.isFinite(parsedYes) && !Number.isFinite(parsedNo)) {
          prediction.no_probability = 100 - parsedYes;
          prediction.yes_probability = parsedYes;
        } else if (!Number.isFinite(parsedYes) && !Number.isFinite(parsedNo)) {
          const direction = String(prediction.prediction || '').toUpperCase();
          const confidence = clamp(Number(prediction.confidence) || 50, 0, 100);

          if (direction === 'YES') {
            prediction.yes_probability = confidence;
            prediction.no_probability = 100 - confidence;
          } else if (direction === 'NO') {
            prediction.yes_probability = 100 - confidence;
            prediction.no_probability = confidence;
          } else {
            const implied = clamp(Number(features?.impliedProbability) || 50, 0, 100);
            prediction.yes_probability = implied;
            prediction.no_probability = 100 - implied;
          }
        }

        // Clamp values
        prediction.yes_probability = Math.max(0, Math.min(100, prediction.yes_probability || 0));
        prediction.no_probability = Math.max(0, Math.min(100, prediction.no_probability || 0));
        prediction.confidence = Math.max(0, Math.min(100, prediction.confidence));

        prediction.reason = ensureMarketSpecificReason({
          reason: prediction.reason,
          prediction,
          marketData,
          option,
          features
        });

        // Normalize optional quality fields if present.
        if (prediction.marketPredictabilityScore !== undefined) {
          prediction.marketPredictabilityScore = clamp(Number(prediction.marketPredictabilityScore) || 0, 0, 100);
        }
        if (prediction.signalStrengthScore !== undefined) {
          prediction.signalStrengthScore = clamp(Number(prediction.signalStrengthScore) || 0, 0, 100);
        }
        if (prediction.mispricingScore !== undefined) {
          prediction.mispricingScore = clamp(Number(prediction.mispricingScore) || 0, 0, 100);
        }
      } else {
        if (!prediction.error) {
          throw new Error('Invalid prediction structure for success=false');
        }
      }
    
      logger.info(`Prediction generated: success=${prediction.success}, prediction=${prediction.prediction || 'N/A'}, confidence=${prediction.confidence || 'N/A'}%`);
    
      return {
        ...prediction,
        computationTime
      };
    
    } catch (parseError) {
      logger.error('Failed to parse LLM response:', { error: parseError.message, response: text });
      throw new CustomError(
        'Failed to parse LLM response',
        500,
        'LLM_PARSE_ERROR',
        { rawResponse: text.substring(0, 500) }
      );
    }
  } catch (error) {
    // Check for rate limit error (429 Too Many Requests)
    const is429 = error?.status === 429 || 
                  error?.message?.includes('429') || 
                  error?.message?.includes('rate_limit') ||
                  error?.message?.includes('RESOURCE_EXHAUSTED');
    
    if (is429) {
      rateLimitErrors++;
      logger.warn(`Rate limit error (${rateLimitErrors}/${config.llmRateLimitThreshold}). Market: ${marketData.marketId}`, {
        retryCount,
        error: error.message
      });
      
      // Switch to secondary LLM if threshold exceeded
      if (rateLimitErrors >= config.llmRateLimitThreshold) {
        logger.error('Rate limit threshold exceeded. Switching to secondary LLM if available.');
        useSecondaryLLM = true;
      }
      
      // Retry with exponential backoff
      if (retryCount < config.llmMaxRetries) {
        const delayMs = config.llmRetryDelayMs * Math.pow(2, retryCount);
        logger.info(`Retrying in ${delayMs}ms (attempt ${retryCount + 1}/${config.llmMaxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return generatePrediction(marketData, option, features, timeframe, retryCount + 1);
      } else {
        logger.error('Max retries exceeded due to rate limiting');
        throw new CustomError('Max retries exceeded due to rate limiting', 429, 'LLM_RATE_LIMITED');
      }
    }
    
    // For non-rate-limit errors, log and throw immediately
    logger.error(`LLM prediction error: ${error.message}`, { marketId: marketData.marketId });
    throw error;
  }
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
