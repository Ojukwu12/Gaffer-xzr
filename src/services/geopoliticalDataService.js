/**
 * Geopolitical Data Service
 * Fetches and scores political, election, and global event signals.
 * @module services/geopoliticalDataService
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

const POLITICS_KEYWORDS = [
  'election',
  'vote',
  'senate',
  'president',
  'prime minister',
  'congress',
  'ballot',
  'campaign',
  'incumbent',
  'candidate',
  'parliament',
  'government',
  'polling',
  'debate'
];

const GEOPOLITICS_KEYWORDS = [
  'war',
  'ceasefire',
  'treaty',
  'summit',
  'conflict',
  'invasion',
  'sanctions',
  'diplomacy',
  'border',
  'tensions',
  'agreement'
];

const detectCategory = (marketData = {}) => {
  const text = getMarketText(marketData);
  if (POLITICS_KEYWORDS.some((kw) => text.includes(kw))) return 'politics';
  if (GEOPOLITICS_KEYWORDS.some((kw) => text.includes(kw))) return 'geopolitics';
  return null;
};

const fetchGDELTEvents = async () => {
  if (!config.gdeltApiKey) return null;

  try {
    const client = axios.create({
      baseURL: config.gdeltBaseUrl || 'https://api.gdeltproject.org',
      timeout: 12000,
      headers: { 'Authorization': `Bearer ${config.gdeltApiKey}` }
    });

    const response = await client.get('/events', {
      params: {
        limit: 100,
        sort: 'date',
        format: 'json'
      }
    });

    return response.data?.events || [];
  } catch (error) {
    logger.debug('GDELT events fetch failed', { error: error.message });
    return null;
  }
};

const fetchNewsArticles = async (query) => {
  if (!config.newsApiKey || !query) return null;

  try {
    const client = axios.create({
      baseURL: 'https://newsapi.org/v2',
      timeout: 12000
    });

    const response = await client.get('/everything', {
      params: {
        q: query,
        sortBy: 'publishedAt',
        language: 'en',
        pageSize: 50,
        apiKey: config.newsApiKey
      }
    });

    return response.data?.articles || [];
  } catch (error) {
    logger.debug('NewsAPI fetch failed', { error: error.message });
    return null;
  }
};

const computePoliticalMomentumScore = (articles = []) => {
  if (!articles.length) return 50;

  // Simple heuristic: analyze sentiment in titles
  let positiveCount = 0;
  for (const article of articles.slice(0, 20)) {
    const title = String(article.title || '').toLowerCase();
    if (title.includes('support') || title.includes('lead') || title.includes('poll') || title.includes('strong')) {
      positiveCount++;
    }
  }

  return clamp(50 + (positiveCount / articles.length) * 30, 0, 100);
};

const computeNarrativeShiftScore = (articles = []) => {
  if (!articles.length) return 50;

  // Measure narrative shift by analyzing temporal clustering of similar themes
  const recentArticles = articles.slice(0, 10);
  const olderArticles = articles.slice(10, 20);

  const keywordMatch = (a, b) => {
    const aWords = new Set(String(a.title || '').split(/\s+/));
    const bWords = new Set(String(b.title || '').split(/\s+/));
    const intersection = [...aWords].filter((w) => bWords.has(w));
    return intersection.length / Math.max(aWords.size, bWords.size);
  };

  let similarity = 0;
  if (recentArticles.length > 0 && olderArticles.length > 0) {
    similarity = (keywordMatch(recentArticles[0], olderArticles[0]) +
      keywordMatch(recentArticles[0], olderArticles[Math.min(5, olderArticles.length - 1)])) / 2;
  }

  // High similarity = low shift. Low similarity = narrative shift.
  return clamp(50 + (1 - similarity) * 50, 0, 100);
};

const computeConflictEscalationScore = (events = []) => {
  if (!events.length) return 50;

  // Analyze event severity and frequency for escalation signals
  const severityKeywords = ['attack', 'casualties', 'offensive', 'missile', 'strike', 'bombing', 'invasion'];
  let escalationCount = 0;
  let recentEventCount = 0;

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const event of events.slice(0, 30)) {
    const eventDate = event.date ? new Date(event.date).getTime() : 0;
    if (eventDate > thirtyDaysAgo) {
      recentEventCount++;
      const eventText = String(event.description || event.title || '').toLowerCase();
      if (severityKeywords.some((kw) => eventText.includes(kw))) {
        escalationCount++;
      }
    }
  }

  if (recentEventCount === 0) return 50;
  return clamp(50 + (escalationCount / recentEventCount) * 40, 0, 100);
};

const computeDiplomaticProgressScore = (articles = []) => {
  if (!articles.length) return 50;

  const diplomaticKeywords = ['agreement', 'talks', 'negotiate', 'peace', 'settlement', 'treaty', 'accord'];
  let diplomaticArticles = 0;

  for (const article of articles.slice(0, 20)) {
    const text = String(article.title || '').toLowerCase();
    if (diplomaticKeywords.some((kw) => text.includes(kw))) {
      diplomaticArticles++;
    }
  }

  return clamp(50 + (diplomaticArticles / articles.length) * 40, 0, 100);
};

const scoreGeopoliticalLayer = (events = [], articles = []) => {
  const scores = {
    conflictEscalationScore: Math.round(computeConflictEscalationScore(events)),
    diplomaticProgressScore: Math.round(computeDiplomaticProgressScore(articles)),
    narrativeShiftScore: Math.round(computeNarrativeShiftScore(articles))
  };

  const weighted = (
    toNumber(scores.conflictEscalationScore, 50) * 0.4 +
    toNumber(scores.diplomaticProgressScore, 50) * 0.35 +
    toNumber(scores.narrativeShiftScore, 50) * 0.25
  );

  return {
    scores,
    compositeScore: clamp(Math.round(weighted), 0, 100)
  };
};

const scorePoliticsLayer = (articles = []) => {
  const scores = {
    pollingMomentumScore: Math.round(computePoliticalMomentumScore(articles)),
    narrativeShiftScore: Math.round(computeNarrativeShiftScore(articles))
  };

  const weighted = (
    toNumber(scores.pollingMomentumScore, 50) * 0.6 +
    toNumber(scores.narrativeShiftScore, 50) * 0.4
  );

  return {
    scores,
    compositeScore: clamp(Math.round(weighted), 0, 100)
  };
};

const getCacheKey = (marketData, category) => {
  const marketId = marketData.marketId || marketData.id || 'unknown';
  return `geopolitical-layer:${marketId}:${category}`;
};

const buildPoliticsLayer = async (marketData) => {
  const query = String(marketData.title || '').split(/\s+/).slice(0, 5).join(' ');
  const articles = await fetchNewsArticles(query);

  if (!articles || articles.length === 0) {
    return {
      ...buildDefaultLayer('politics'),
      applicable: true,
      signalStrength: 0.2,
      rawContext: {
        reason: 'No news articles found for this market'
      }
    };
  }

  const scored = scorePoliticsLayer(articles);

  return {
    applicable: true,
    sourceType: 'politics',
    scores: scored.scores,
    compositeScore: scored.compositeScore,
    signalStrength: articles.length >= 20 ? 0.85 : articles.length >= 10 ? 0.65 : 0.4,
    sourcesUsed: ['NewsAPI'],
    rawContext: {
      articlesAnalyzed: articles.length,
      topStories: articles.slice(0, 3).map((a) => ({
        title: a.title,
        source: a.source?.name
      }))
    }
  };
};

const buildGeopoliticalLayer = async (marketData) => {
  const [events, articles] = await Promise.all([
    fetchGDELTEvents(),
    fetchNewsArticles(String(marketData.title || '').split(/\s+/).slice(0, 5).join(' '))
  ]);

  if ((!events || events.length === 0) && (!articles || articles.length === 0)) {
    return {
      ...buildDefaultLayer('geopolitics'),
      applicable: true,
      signalStrength: 0.2,
      rawContext: {
        reason: 'No geopolitical events or articles found'
      }
    };
  }

  const scored = scoreGeopoliticalLayer(events || [], articles || []);

  return {
    applicable: true,
    sourceType: 'geopolitics',
    scores: scored.scores,
    compositeScore: scored.compositeScore,
    signalStrength: (events?.length || 0) >= 10 && (articles?.length || 0) >= 10 ? 0.9 : 0.55,
    sourcesUsed: [events?.length ? 'GDELT' : null, articles?.length ? 'NewsAPI' : null].filter(Boolean),
    rawContext: {
      eventsAnalyzed: events?.length || 0,
      articlesAnalyzed: articles?.length || 0
    }
  };
};

const getGeopoliticalDataLayer = async (marketData = {}, marketClassification = 'politics') => {
  const category = detectCategory(marketData) || marketClassification;
  const cacheKey = getCacheKey(marketData, category);
  const cached = cacheService.getFromMemory(cacheKey);
  if (cached) return cached;

  let layer = buildDefaultLayer();

  try {
    if (category === 'politics') {
      layer = await buildPoliticsLayer(marketData);
    } else if (category === 'geopolitics') {
      layer = await buildGeopoliticalLayer(marketData);
    }
  } catch (error) {
    logger.warn('Geopolitical data layer failed, proceeding with neutral scores', {
      marketId: marketData.marketId,
      category,
      error: error.message
    });
  }

  cacheService.setInMemory(cacheKey, layer, config.externalDataCacheTtl);
  return layer;
};

module.exports = {
  getGeopoliticalDataLayer,
  detectCategory,
  scorePoliticsLayer,
  scoreGeopoliticalLayer
};
