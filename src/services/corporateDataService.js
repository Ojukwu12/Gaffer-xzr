/**
 * Corporate Data Service
 * Fetches and scores corporate, earnings, and technology signals.
 * @module services/corporateDataService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const cacheService = require('./cacheService');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildDefaultLayer = (sourceType = 'none') => ({
  applicable: false,
  sourceType,
  scores: {},
  compositeScore: 50,
  signalStrength: 0,
  sourcesUsed: [],
  rawContext: {}
});

const getMarketText = (marketData = {}) => {
  const tags = Array.isArray(marketData.categories) ? marketData.categories.join(' ') : '';
  return `${marketData.title || ''} ${marketData.description || ''} ${tags}`.toLowerCase();
};

const TECH_COMPANIES = [
  'apple',
  'google',
  'microsoft',
  'amazon',
  'meta',
  'nvidia',
  'tesla',
  'openai',
  'intel',
  'amd',
  'ibm'
];

const detectTechCompany = (marketData = {}) => {
  const text = getMarketText(marketData);
  for (const company of TECH_COMPANIES) {
    if (text.includes(company)) return company;
  }
  return null;
};

const extractTickerFromCompany = (companyName = '') => {
  const mapping = {
    apple: 'AAPL',
    google: 'GOOGL',
    microsoft: 'MSFT',
    amazon: 'AMZN',
    meta: 'META',
    nvidia: 'NVDA',
    tesla: 'TSLA',
    openai: 'NVDA',
    intel: 'INTC',
    amd: 'AMD',
    ibm: 'IBM'
  };
  return mapping[companyName?.toLowerCase()] || null;
};

const fetchSECFilings = async (ticker) => {
  if (!ticker || !config.secEdgarApiBase) return null;

  try {
    // SEC EDGAR provides public data without API key
    const client = axios.create({
      baseURL: config.secEdgarApiBase || 'https://data.sec.gov/api/xbrl',
      timeout: 12000,
      headers: {
        'User-Agent': 'Polyscope/1.0'
      }
    });

    const response = await client.get(`/companyfacts/CIK${ticker}.json`).catch(() => null);
    if (!response?.data) return null;

    return response.data;
  } catch (error) {
    logger.debug('SEC EDGAR filing fetch failed', { ticker, error: error.message });
    return null;
  }
};

const fetchEarningsCalendar = async (ticker) => {
  if (!ticker || !config.earningsApiKey) return null;

  try {
    const client = axios.create({
      baseURL: config.earningsApiBase || 'https://api.example.com/earnings',
      timeout: 12000,
      headers: { 'Authorization': `Bearer ${config.earningsApiKey}` }
    });

    const response = await client.get(`/calendar`, {
      params: { ticker, limit: 5 }
    });

    return response.data?.results || [];
  } catch (error) {
    logger.debug('Earnings calendar fetch failed', { ticker, error: error.message });
    return null;
  }
};

const fetchProductReleases = async (companyName) => {
  if (!companyName) return null;

  try {
    const newsUrl = `${companyName} product launch announcement release event`;
    const client = axios.create({
      baseURL: 'https://newsapi.org/v2',
      timeout: 12000
    });

    const response = await client.get('/everything', {
      params: {
        q: newsUrl,
        sortBy: 'publishedAt',
        language: 'en',
        pageSize: 20,
        apiKey: config.newsApiKey
      }
    });

    return response.data?.articles || [];
  } catch (error) {
    logger.debug('Product release news fetch failed', { companyName, error: error.message });
    return null;
  }
};

const computeEarningsSurpriseTrendScore = (filings = null, earningsData = []) => {
  if (!earningsData.length && !filings) return 50;

  if (Array.isArray(earningsData) && earningsData.length > 0) {
    const recentEarnings = earningsData.slice(0, 4);
    let positiveCount = 0;

    for (const earning of recentEarnings) {
      const beat = earning.epsActual > earning.epsEstimate || earning.revenueActual > earning.revenueEstimate;
      if (beat) positiveCount++;
    }

    return clamp(50 + (positiveCount / recentEarnings.length) * 40, 0, 100);
  }

  return 50;
};

const computeRegulatoryRiskScore = (filings = null) => {
  if (!filings) return 50;

  // Analyze filing frequency and type for regulatory concerns
  const filingText = JSON.stringify(filings).toLowerCase();
  let riskFactors = 0;

  const riskKeywords = ['sec investigation', 'regulatory concern', 'fine', 'penalty', 'violation', 'lawsuit', 'settlement'];
  for (const keyword of riskKeywords) {
    if (filingText.includes(keyword)) riskFactors++;
  }

  // Higher risk = lower score
  return clamp(100 - riskFactors * 15, 0, 100);
};

const computeProductMomentumScore = (articles = []) => {
  if (!articles.length) return 50;

  const productKeywords = ['launch', 'release', 'announce', 'new product', 'innovation', 'debut', 'unveiled'];
  let productNews = 0;

  for (const article of articles.slice(0, 15)) {
    const text = String(article.title || '').toLowerCase();
    if (productKeywords.some((kw) => text.includes(kw))) {
      productNews++;
    }
  }

  return clamp(50 + (productNews / articles.length) * 40, 0, 100);
};

const scoreCorporateLayer = (companyName, filings, earningsData, productArticles) => {
  const scores = {
    earningsSurpriseTrendScore: Math.round(computeEarningsSurpriseTrendScore(filings, earningsData)),
    regulatoryRiskScore: Math.round(computeRegulatoryRiskScore(filings)),
    productMomentumScore: Math.round(computeProductMomentumScore(productArticles || []))
  };

  const weighted = (
    toNumber(scores.earningsSurpriseTrendScore, 50) * 0.35 +
    toNumber(scores.regulatoryRiskScore, 50) * 0.3 +
    toNumber(scores.productMomentumScore, 50) * 0.35
  );

  return {
    scores,
    compositeScore: clamp(Math.round(weighted), 0, 100)
  };
};

const getCacheKey = (marketData, companyName) => {
  const marketId = marketData.marketId || marketData.id || 'unknown';
  return `corporate-layer:${marketId}:${companyName || 'unknown'}`;
};

const buildCorporateLayer = async (marketData) => {
  const companyName = detectTechCompany(marketData);
  if (!companyName) {
    return {
      ...buildDefaultLayer('corporate'),
      applicable: false,
      rawContext: {
        reason: 'No recognized technology company detected in market title'
      }
    };
  }

  const ticker = extractTickerFromCompany(companyName);

  const [filings, earningsData, productArticles] = await Promise.all([
    ticker ? fetchSECFilings(ticker) : null,
    ticker ? fetchEarningsCalendar(ticker) : null,
    fetchProductReleases(companyName)
  ]);

  if (!filings && !earningsData && !productArticles) {
    return {
      ...buildDefaultLayer('corporate'),
      applicable: true,
      signalStrength: 0.2,
      rawContext: {
        companyName,
        reason: 'Limited corporate data available'
      }
    };
  }

  const scored = scoreCorporateLayer(companyName, filings, earningsData, productArticles);
  const sourcesUsed = [];
  if (filings) sourcesUsed.push('SEC EDGAR');
  if (earningsData?.length) sourcesUsed.push('Earnings Calendar');
  if (productArticles?.length) sourcesUsed.push('NewsAPI');

  return {
    applicable: true,
    sourceType: 'corporate',
    scores: scored.scores,
    compositeScore: scored.compositeScore,
    signalStrength: sourcesUsed.length >= 2 ? 0.85 : 0.55,
    sourcesUsed,
    rawContext: {
      companyName,
      ticker,
      filingDataAvailable: Boolean(filings),
      earningsDataPoints: earningsData?.length || 0,
      productNewsArticles: productArticles?.length || 0
    }
  };
};

const getCorporateDataLayer = async (marketData = {}) => {
  const companyName = detectTechCompany(marketData);
  const cacheKey = getCacheKey(marketData, companyName);
  const cached = cacheService.getFromMemory(cacheKey);
  if (cached) return cached;

  let layer = buildDefaultLayer();

  try {
    layer = await buildCorporateLayer(marketData);
  } catch (error) {
    logger.warn('Corporate data layer failed, proceeding with neutral scores', {
      marketId: marketData.marketId,
      company: companyName,
      error: error.message
    });
  }

  cacheService.setInMemory(cacheKey, layer, config.externalDataCacheTtl);
  return layer;
};

module.exports = {
  getCorporateDataLayer,
  detectTechCompany,
  extractTickerFromCompany,
  scoreCorporateLayer
};
