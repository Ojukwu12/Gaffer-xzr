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
    'high uncertainty',
    'market currently prices',
    'sentiment data reinforcing',
    'prevailing market and sentiment indicators collectively lean',
    'collectively lean towards'
  ];

  const hasGenericPhrase = genericPhrases.some((phrase) => normalized.includes(phrase));
  const hasNumericEvidence = /(\d+(?:\.\d+)?\s*%|\$\s*\d|\b\d+\s*(?:days|matches|hours|points|goals|cards)\b)/i.test(reason);
  const hasTokenAnchor = (anchors.tokens || []).some((token) => normalized.includes(token));
  const hasEntityAnchor = (anchors.entities || []).some((entity) => normalized.includes(entity.toLowerCase()));
  const hasAnchor = hasTokenAnchor || hasEntityAnchor;

  return hasGenericPhrase || !hasNumericEvidence || !hasAnchor;
};

const formatCount = (value, suffix = '') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric).toLocaleString()}${suffix}`;
};

const getExternalLayer = (features = {}) => features.externalDataLayer || {};

const formatScore = (value, fallback = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return `${Math.round(numeric)}%`;
};

const buildSportReason = ({ title, selected, optionContext, features }) => {
  const scores = features.externalDataScores || {};
  const rawContext = getExternalLayer(features).rawContext || {};
  const sportsSignals = [];

  const teamForm = formatScore(scores.teamFormScore);
  if (teamForm) sportsSignals.push(`team form ${teamForm}`);

  const injuryImpact = formatScore(scores.injuryImpactScore);
  if (injuryImpact) sportsSignals.push(`injury impact ${injuryImpact}`);

  const fixturesScore = formatScore(scores.fixturesScore);
  if (fixturesScore) sportsSignals.push(`fixture load ${fixturesScore}`);

  const homeAway = formatScore(scores.homeAwayPerformanceScore);
  if (homeAway) sportsSignals.push(`home/away performance ${homeAway}`);

  if (Number.isFinite(Number(rawContext.matchesAnalyzed))) {
    sportsSignals.push(`${Math.round(Number(rawContext.matchesAnalyzed))} recent matches analyzed`);
  }

  if (Number.isFinite(Number(rawContext.fixturesAnalyzed))) {
    sportsSignals.push(`${Math.round(Number(rawContext.fixturesAnalyzed))} upcoming fixtures checked`);
  }

  if (Number.isFinite(Number(rawContext.injuriesConsidered)) && Number(rawContext.injuriesConsidered) > 0) {
    sportsSignals.push(`${Math.round(Number(rawContext.injuriesConsidered))} injuries considered`);
  }

  const evidence = sportsSignals.length > 0 ? sportsSignals.slice(0, 4).join(', ') : 'recent form and availability signals';
  return `${title}: ${selected} is the current lean${optionContext} because the team evidence is stronger on ${evidence}. The market price is only a secondary check here.`;
};

const buildFinancialReason = ({ title, selected, optionContext, features }) => {
  const scores = features.externalDataScores || {};
  const signals = [];

  const trendScore = formatScore(scores.trendScore);
  if (trendScore) signals.push(`trend ${trendScore}`);

  const momentumScore = formatScore(scores.priceMomentumScore);
  if (momentumScore) signals.push(`momentum ${momentumScore}`);

  const volatilityScore = formatScore(scores.volatilityScore);
  if (volatilityScore) signals.push(`volatility ${volatilityScore}`);

  const volumeStrength = formatScore(scores.volumeStrengthScore);
  if (volumeStrength) signals.push(`volume strength ${volumeStrength}`);

  const price24h = Number.isFinite(Number(scores.priceChange24h)) ? `${Number(scores.priceChange24h).toFixed(2)}% 24h` : null;
  const price7d = Number.isFinite(Number(scores.priceChange7d)) ? `${Number(scores.priceChange7d).toFixed(2)}% 7d` : null;
  if (price24h) signals.push(price24h);
  if (price7d) signals.push(price7d);

  const evidence = signals.length > 0 ? signals.slice(0, 4).join(', ') : 'trend, momentum, and volatility';
  return `${title}: ${selected} is the current lean${optionContext} because the financial evidence favors ${evidence}. The market price is only supporting context, not the main driver.`;
};

const buildPoliticsReason = ({ title, selected, optionContext, features }) => {
  const scores = features.externalDataScores || {};
  const signals = [];

  const polling = formatScore(scores.pollingMomentumScore);
  if (polling) signals.push(`polling momentum ${polling}`);

  const narrative = formatScore(scores.narrativeShiftScore);
  if (narrative) signals.push(`narrative shift ${narrative}`);

  const diplomacy = formatScore(scores.diplomaticProgressScore);
  if (diplomacy) signals.push(`diplomatic progress ${diplomacy}`);

  const evidence = signals.length > 0 ? signals.slice(0, 3).join(', ') : 'polling, narrative, and event signals';
  return `${title}: ${selected} is the current lean${optionContext} because the political evidence is stronger on ${evidence}. The market price is secondary to the underlying data.`;
};

const buildCorporateReason = ({ title, selected, optionContext, features }) => {
  const scores = features.externalDataScores || {};
  const signals = [];

  const earnings = formatScore(scores.earningsSurpriseTrendScore);
  if (earnings) signals.push(`earnings surprise ${earnings}`);

  const product = formatScore(scores.productMomentumScore);
  if (product) signals.push(`product momentum ${product}`);

  const evidence = signals.length > 0 ? signals.slice(0, 2).join(', ') : 'earnings and product news';
  return `${title}: ${selected} is the current lean${optionContext} because the company evidence is stronger on ${evidence}. The market quote is a check, not the thesis.`;
};

const buildNoiseReason = ({ title, selected, optionContext, features }) => {
  const signals = [];
  if (features.trendDirection) signals.push(`trend ${normalizeText(features.trendDirection)}`);
  if (features.sentimentLabel) signals.push(`sentiment ${normalizeText(features.sentimentLabel)}`);
  if (Number.isFinite(Number(features.externalDataCompositeScore))) {
    signals.push(`external data ${toPercent(features.externalDataCompositeScore)}%`);
  }
  if (Number.isFinite(Number(features.priceVolatility))) {
    signals.push(`volatility ${Math.round(Number(features.priceVolatility) * 100)}%`);
  }

  const evidence = signals.length > 0 ? signals.slice(0, 3).join(', ') : 'the limited usable signals available';
  return `This market is highly volatile and can change quickly. ${title}: ${selected} is still the current lean${optionContext} because ${evidence}. Recheck it as soon as new information lands.`;
};

const buildCategoryReason = ({ title, selected, optionContext, features }) => {
  const category = normalizeText(features.marketClassification || '').toLowerCase();

  if (category === 'sports') {
    return buildSportReason({ title, selected, optionContext, features });
  }

  if (category === 'finance/economy' || category === 'crypto') {
    return buildFinancialReason({ title, selected, optionContext, features });
  }

  if (category === 'politics' || category === 'geopolitics' || category === 'global events') {
    return buildPoliticsReason({ title, selected, optionContext, features });
  }

  if (category === 'technology' || category === 'corporate') {
    return buildCorporateReason({ title, selected, optionContext, features });
  }

  if (category === 'unpredictable/noise') {
    return buildNoiseReason({ title, selected, optionContext, features });
  }

  return null;
};

const collectEvidenceSignals = (features = {}) => {
  const signals = [];

  if (features.externalDataSourceType) {
    signals.push(normalizeText(features.externalDataSourceType));
  }

  if (Number.isFinite(Number(features.externalDataCompositeScore))) {
    signals.push(`external data score ${toPercent(features.externalDataCompositeScore)}%`);
  }

  if (features.trendDirection) {
    const trendScore = Number.isFinite(Number(features.trendScore))
      ? ` (${Math.round(Number(features.trendScore) * 100)}%)`
      : '';
    signals.push(`trend ${normalizeText(features.trendDirection)}${trendScore}`);
  }

  if (features.sentimentLabel) {
    const sentimentScore = Number.isFinite(Number(features.sentimentScore))
      ? ` (${Math.round(Number(features.sentimentScore) * 100)}%)`
      : '';
    signals.push(`sentiment ${normalizeText(features.sentimentLabel)}${sentimentScore}`);
  }

  const volumeLabel = formatCount(features.volume24h, ' in 24h');
  if (volumeLabel) signals.push(`volume ${volumeLabel}`);

  const liquidityLabel = formatCount(features.liquidity, ' liquidity');
  if (liquidityLabel) signals.push(liquidityLabel);

  if (Number.isFinite(Number(features.volumeGrowth24h))) {
    signals.push(`24h volume growth ${Math.round(Number(features.volumeGrowth24h))}%`);
  }

  if (Number.isFinite(Number(features.whaleFactor))) {
    signals.push(`whale factor ${Math.round(Number(features.whaleFactor) * 100)}%`);
  }

  if (Array.isArray(features.anomalyDetails) && features.anomalyDetails.length > 0) {
    signals.push(normalizeText(features.anomalyDetails[0]));
  }

  return signals.filter(Boolean).slice(0, 4);
};

const buildMarketSpecificReason = ({ prediction = {}, marketData = {}, option = '', features = {} }) => {
  const title = normalizeText(marketData.title || marketData.question || 'this market');
  const selected = String(prediction.prediction || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';
  const classification = normalizeText(features.marketClassification || '').toLowerCase();
  const marketPrice = Number.isFinite(Number(features.impliedProbability))
    ? `The market is pricing it at ${toPercent(features.impliedProbability)}%, which is secondary to the underlying evidence.`
    : 'The market price is secondary to the underlying evidence.';
  const optionLabel = normalizeText(option);
  const optionContext = optionLabel && !['yes', 'no'].includes(optionLabel.toLowerCase())
    ? ` for ${optionLabel}`
    : '';

  const categoryReason = buildCategoryReason({ title, selected, optionContext, features });
  if (categoryReason) {
    return [
      categoryReason,
      marketPrice,
      classification === 'unpredictable/noise'
        ? 'The view should be revisited as soon as new data changes the setup.'
        : 'The view can still change if the underlying evidence shifts.'
    ].join(' ');
  }

  const evidenceSignals = collectEvidenceSignals(features);
  const evidenceText = evidenceSignals.length > 0
    ? evidenceSignals.join(', ')
    : 'the strongest available real-world and market signals';

  return [
    classification === 'unpredictable/noise'
      ? 'This market is highly volatile and can flip quickly when new information arrives.'
      : null,
    `${title}: ${selected} is the current lean${optionContext} because ${evidenceText}.`,
    marketPrice,
    classification === 'unpredictable/noise'
      ? 'The view should be revisited as soon as new data changes the setup.'
      : 'The view can still change if the underlying evidence shifts.'
  ].filter(Boolean).join(' ');
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

Prefer concrete evidence over market price. Use numeric signals when they help, but do not force percentage-heavy wording.

If the market is unpredictable/noise, start with a brief volatility disclaimer.

Use market price as secondary context, not the main argument.

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
