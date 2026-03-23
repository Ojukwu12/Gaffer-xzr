/**
 * External Data Service
 * Fetches and scores external signals (sports/financial/political/corporate) for the prediction engine.
 * @module services/externalDataService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const cacheService = require('./cacheService');
const geopoliticalDataService = require('./geopoliticalDataService');
const corporateDataService = require('./corporateDataService');
const externalDataMonitoringService = require('./externalDataMonitoringService');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SPORTS_KEYWORDS = [
  'football',
  'soccer',
  'nba',
  'basketball',
  'nfl',
  'mlb',
  'baseball',
  'tennis',
  'fifa',
  'champions league',
  'premier league',
  'laliga',
  'serie a',
  'bundesliga',
  'ufc',
  'boxing'
];

const CRYPTO_SYMBOL_TO_COINGECKO = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  xrp: 'ripple',
  ada: 'cardano',
  bnb: 'binancecoin'
};

const COMMON_STOCK_TICKERS = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'GOOG',
  'AMZN',
  'NVDA',
  'TSLA',
  'META',
  'SPY',
  'QQQ',
  'DXY'
];

const buildDefaultLayer = (sourceType = 'none') => ({
  applicable: false,
  sourceType,
  scores: {},
  compositeScore: 50,
  signalStrength: 0,
  sourcesUsed: [],
  rawContext: {}
});

const mapClassificationToSourceType = (classification = '') => {
  const value = String(classification || '').toLowerCase();

  if (value === 'sports') return 'sports';
  if (value === 'crypto' || value === 'finance/economy') return 'financial';
  if (value === 'politics' || value === 'geopolitics') return 'geopolitical';
  if (value === 'corporate' || value === 'technology') return 'corporate';

  return 'unknown';
};

const getMarketText = (marketData = {}) => {
  const tags = Array.isArray(marketData.categories) ? marketData.categories.join(' ') : '';
  return `${marketData.title || ''} ${marketData.description || ''} ${tags}`.toLowerCase();
};

const looksLikeSportsMarket = (marketData = {}) => {
  const text = getMarketText(marketData);
  return SPORTS_KEYWORDS.some((kw) => text.includes(kw));
};

const extractTeamsFromMarket = (marketData = {}) => {
  const title = String(marketData.title || '').replace(/\s+/g, ' ').trim();
  const cleanTeamName = (value) => String(value || '')
    .replace(/\s*[-|:,].*$/, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();

  const vsMatch = title.match(/(.+?)\s+(?:vs\.?|v\.?|against)\s+(.+?)(?:\?|$| by | on | in )/i);
  if (vsMatch) {
    return {
      teamA: cleanTeamName(vsMatch[1]),
      teamB: cleanTeamName(vsMatch[2])
    };
  }

  const willMatch = title.match(/will\s+(.+?)\s+(?:beat|defeat|win against|win vs|win over)\s+(.+?)(?:\?|$| by | on | in )/i);
  if (willMatch) {
    return {
      teamA: cleanTeamName(willMatch[1]),
      teamB: cleanTeamName(willMatch[2])
    };
  }

  return { teamA: null, teamB: null };
};

const detectSportType = (marketData = {}) => {
  const text = getMarketText(marketData);
  if (text.includes('nba') || text.includes('basketball')) return 'basketball';
  if (text.includes('nfl') || text.includes('american football')) return 'american-football';
  if (text.includes('tennis')) return 'tennis';
  if (text.includes('baseball') || text.includes('mlb')) return 'baseball';
  return 'soccer';
};

const coerceRecentMatches = (matches = []) => {
  return (matches || []).slice(0, 5).map((m) => ({
    isWin: Boolean(m.isWin),
    isDraw: Boolean(m.isDraw),
    goalsFor: toNumber(m.goalsFor),
    goalsAgainst: toNumber(m.goalsAgainst),
    isHome: Boolean(m.isHome)
  }));
};

const summarizeTeamPerformance = (recentMatches = []) => {
  const matches = coerceRecentMatches(recentMatches);
  if (!matches.length) {
    return {
      wins: 0,
      draws: 0,
      losses: 0,
      avgGoalsFor: 0,
      homeWinRate: 0.5,
      awayWinRate: 0.5,
      formScore: 50,
      scoringTrendScore: 50,
      homeAwayPerformanceScore: 50
    };
  }

  const wins = matches.filter((m) => m.isWin).length;
  const draws = matches.filter((m) => m.isDraw).length;
  const losses = Math.max(0, matches.length - wins - draws);
  const avgGoalsFor = matches.reduce((sum, m) => sum + m.goalsFor, 0) / matches.length;

  const homeMatches = matches.filter((m) => m.isHome);
  const awayMatches = matches.filter((m) => !m.isHome);
  const homeWinRate = homeMatches.length ? homeMatches.filter((m) => m.isWin).length / homeMatches.length : 0.5;
  const awayWinRate = awayMatches.length ? awayMatches.filter((m) => m.isWin).length / awayMatches.length : 0.5;

  const points = wins * 3 + draws;
  const formScore = clamp((points / 15) * 100, 0, 100);
  const scoringTrendScore = clamp((avgGoalsFor / 3) * 100, 0, 100);
  const homeAwayPerformanceScore = clamp(((homeWinRate + awayWinRate) / 2) * 100, 0, 100);

  return {
    wins,
    draws,
    losses,
    avgGoalsFor,
    homeWinRate,
    awayWinRate,
    formScore,
    scoringTrendScore,
    homeAwayPerformanceScore
  };
};

const computeHeadToHeadScore = (headToHeadMatches = []) => {
  if (!headToHeadMatches.length) return 50;
  const wins = headToHeadMatches.filter((m) => m.teamAResult === 'win').length;
  const draws = headToHeadMatches.filter((m) => m.teamAResult === 'draw').length;
  const points = wins * 3 + draws;
  const maxPoints = headToHeadMatches.length * 3;
  return clamp((points / Math.max(1, maxPoints)) * 100, 0, 100);
};

const computeInjuryImpactScore = (injuredPlayersCount = 0) => {
  return clamp(100 - (toNumber(injuredPlayersCount) * 12), 20, 100);
};

const computeSportsCompositeScore = (scores = {}) => {
  const weighted = (
    toNumber(scores.teamFormScore, 50) * 0.25 +
    toNumber(scores.headToHeadScore, 50) * 0.18 +
    toNumber(scores.injuryImpactScore, 60) * 0.17 +
    toNumber(scores.scoringTrendScore, 50) * 0.18 +
    toNumber(scores.homeAwayPerformanceScore, 50) * 0.12 +
    toNumber(scores.fixturesScore, 50) * 0.1
  );

  return clamp(Math.round(weighted), 0, 100);
};

const computeFinancialCompositeScore = (scores = {}) => {
  const weighted = (
    toNumber(scores.trendScore, 50) * 0.3 +
    toNumber(scores.priceMomentumScore, 50) * 0.3 +
    toNumber(scores.volumeStrengthScore, 50) * 0.2 +
    toNumber(scores.volatilityScore, 50) * 0.15 +
    toNumber(scores.sentimentScore, 50) * 0.05
  );

  return clamp(Math.round(weighted), 0, 100);
};

const getCacheKey = (marketData, classification) => {
  const marketId = marketData.marketId || marketData.id || 'unknown';
  return `external-layer:${marketId}:${classification}`;
};

const fetchSportsDataIoData = async ({ teamA, teamB, sportType }) => {
  if (!config.sportsDataIoApiKey || !teamA) return null;

  const client = axios.create({
    baseURL: config.sportsDataIoBaseUrl,
    timeout: 12000,
    headers: {
      'Ocp-Apim-Subscription-Key': config.sportsDataIoApiKey
    }
  });

  // Endpoint shapes vary by sport and plan. We keep this resilient and optional.
  const tryRequests = [
    `/v3/${sportType}/scores/json/Teams`,
    `/v3/${sportType}/scores/json/Players`
  ];

  const results = [];
  for (const endpoint of tryRequests) {
    try {
      const response = await client.get(endpoint);
      results.push({ endpoint, data: response.data });
    } catch (error) {
      logger.debug('SportsDataIO endpoint failed', { endpoint, error: error.message });
    }
  }

  if (!results.length) return null;

  // SportsDataIO returns rich league-level data. We use it as a team metadata/injury source.
  const players = results.find((r) => r.endpoint.includes('Players'))?.data || [];
  const injuries = players.filter((p) => {
    const team = String(p.Team || p.team || '').toLowerCase();
    const status = String(p.InjuryStatus || p.Status || '').toLowerCase();
    return team.includes(String(teamA).toLowerCase()) && status && status !== 'active';
  });

  return {
    source: 'SportsDataIO',
    injuredCount: injuries.length,
    fixtures: [],
    recentMatches: [],
    headToHeadMatches: []
  };
};

const resolveFootballDataTeam = async (client, teamName) => {
  if (!teamName) return null;

  try {
    const response = await client.get('/teams', { params: { name: teamName } });
    const teams = response.data?.teams || [];
    return teams[0] || null;
  } catch (error) {
    logger.debug('Football-Data team resolution failed', { teamName, error: error.message });
    return null;
  }
};

const mapFootballDataMatch = (match, teamAId) => {
  const isHome = match.homeTeam?.id === teamAId;
  const goalsFor = isHome ? toNumber(match.score?.fullTime?.home) : toNumber(match.score?.fullTime?.away);
  const goalsAgainst = isHome ? toNumber(match.score?.fullTime?.away) : toNumber(match.score?.fullTime?.home);

  const winner = match.score?.winner;
  const isDraw = winner === 'DRAW';
  const isWin = (winner === 'HOME_TEAM' && isHome) || (winner === 'AWAY_TEAM' && !isHome);

  return {
    isHome,
    isWin,
    isDraw,
    goalsFor,
    goalsAgainst
  };
};

const fetchFootballDataSnapshot = async ({ teamA, teamB }) => {
  if (!config.footballDataApiKey || !teamA) return null;

  const client = axios.create({
    baseURL: config.footballDataBaseUrl,
    timeout: 12000,
    headers: {
      'X-Auth-Token': config.footballDataApiKey
    }
  });

  const teamAObj = await resolveFootballDataTeam(client, teamA);
  if (!teamAObj?.id) return null;

  const teamBObj = teamB ? await resolveFootballDataTeam(client, teamB) : null;

  const [recentResponse, fixtureResponse] = await Promise.all([
    client.get(`/teams/${teamAObj.id}/matches`, { params: { status: 'FINISHED', limit: 5 } }).catch(() => ({ data: {} })),
    client.get(`/teams/${teamAObj.id}/matches`, { params: { status: 'SCHEDULED', limit: 3 } }).catch(() => ({ data: {} }))
  ]);

  const recentMatches = (recentResponse.data?.matches || []).map((m) => mapFootballDataMatch(m, teamAObj.id));
  const upcomingFixtures = fixtureResponse.data?.matches || [];

  let headToHeadMatches = [];
  if (teamBObj?.id) {
    headToHeadMatches = (recentResponse.data?.matches || [])
      .filter((m) => m.homeTeam?.id === teamBObj.id || m.awayTeam?.id === teamBObj.id)
      .map((m) => {
        const mapped = mapFootballDataMatch(m, teamAObj.id);
        return {
          teamAResult: mapped.isDraw ? 'draw' : mapped.isWin ? 'win' : 'loss'
        };
      });
  }

  return {
    source: 'Football-Data.org',
    recentMatches,
    fixtures: upcomingFixtures,
    headToHeadMatches,
    injuredCount: 0
  };
};

const scoreSportsLayer = (snapshot = {}) => {
  const teamPerf = summarizeTeamPerformance(snapshot.recentMatches || []);
  const headToHeadScore = computeHeadToHeadScore(snapshot.headToHeadMatches || []);
  const injuryImpactScore = computeInjuryImpactScore(snapshot.injuredCount || 0);

  const fixturesCount = (snapshot.fixtures || []).length;
  const fixturesScore = clamp(60 - fixturesCount * 5, 35, 70);

  const scores = {
    teamFormScore: Math.round(teamPerf.formScore),
    recentResults: {
      wins: teamPerf.wins,
      draws: teamPerf.draws,
      losses: teamPerf.losses
    },
    fixturesScore,
    headToHeadScore: Math.round(headToHeadScore),
    injuryImpactScore: Math.round(injuryImpactScore),
    scoringTrendScore: Math.round(teamPerf.scoringTrendScore),
    homeAwayPerformanceScore: Math.round(teamPerf.homeAwayPerformanceScore)
  };

  return {
    scores,
    compositeScore: computeSportsCompositeScore(scores)
  };
};

const extractCryptoIdFromMarket = (marketData = {}) => {
  const text = getMarketText(marketData);
  for (const [token, coinId] of Object.entries(CRYPTO_SYMBOL_TO_COINGECKO)) {
    if (text.includes(token)) return coinId;
  }
  return null;
};

const extractTickerFromMarket = (marketData = {}) => {
  const title = String(marketData.title || '');
  const upperTokens = title.match(/\b[A-Z]{1,5}\b/g) || [];
  const explicit = upperTokens.find((token) => COMMON_STOCK_TICKERS.includes(token));
  if (explicit) return explicit;

  const text = getMarketText(marketData);
  if (text.includes('s&p') || text.includes('sp500') || text.includes('s&p 500')) return 'SPY';
  if (text.includes('nasdaq')) return 'QQQ';
  if (text.includes('dollar index')) return 'DXY';
  return null;
};

const computeTrendFromSeries = (series = []) => {
  if (series.length < 2) return 50;
  const first = toNumber(series[0]);
  const last = toNumber(series[series.length - 1]);
  if (first <= 0) return 50;

  const pct = ((last - first) / first) * 100;
  return clamp(50 + pct * 2, 0, 100);
};

const computeVolatilityScore = (series = []) => {
  if (series.length < 3) return 50;

  const returns = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = toNumber(series[i - 1]);
    const curr = toNumber(series[i]);
    if (prev > 0) returns.push((curr - prev) / prev);
  }

  if (!returns.length) return 50;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Lower volatility gets higher score for predictability.
  return clamp(100 - stdDev * 900, 0, 100);
};

const computeVolumeStrengthScore = (volumes = []) => {
  if (volumes.length < 5) return 50;
  const latest = toNumber(volumes[volumes.length - 1]);
  const baseline = volumes.slice(-8, -1).reduce((sum, v) => sum + toNumber(v), 0) / 7;
  if (baseline <= 0) return 50;
  return clamp(50 + ((latest - baseline) / baseline) * 40, 0, 100);
};

const computeMomentumScore = (series = []) => {
  if (series.length < 2) return { priceMomentumScore: 50, change24h: 0, change7d: 0, change30d: 0 };

  const last = toNumber(series[series.length - 1]);
  const oneDay = toNumber(series[Math.max(0, series.length - 2)], last);
  const sevenDay = toNumber(series[Math.max(0, series.length - 8)], last);
  const thirtyDay = toNumber(series[0], last);

  const change24h = oneDay > 0 ? ((last - oneDay) / oneDay) * 100 : 0;
  const change7d = sevenDay > 0 ? ((last - sevenDay) / sevenDay) * 100 : 0;
  const change30d = thirtyDay > 0 ? ((last - thirtyDay) / thirtyDay) * 100 : 0;

  const weighted = change24h * 0.35 + change7d * 0.4 + change30d * 0.25;
  const priceMomentumScore = clamp(50 + weighted * 1.5, 0, 100);

  return {
    priceMomentumScore,
    change24h,
    change7d,
    change30d
  };
};

const fetchCoinGeckoData = async (coinId) => {
  if (!coinId) return null;

  const client = axios.create({
    baseURL: config.coinGeckoBaseUrl,
    timeout: 12000
  });

  const [chartResponse, coinResponse] = await Promise.all([
    client.get(`/coins/${coinId}/market_chart`, { params: { vs_currency: 'usd', days: 30 } }).catch(() => ({ data: {} })),
    client.get(`/coins/${coinId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
        sparkline: false
      }
    }).catch(() => ({ data: {} }))
  ]);

  const prices = (chartResponse.data?.prices || []).map((p) => toNumber(Array.isArray(p) ? p[1] : p));
  const volumes = (chartResponse.data?.total_volumes || []).map((v) => toNumber(Array.isArray(v) ? v[1] : v));
  const sentimentScore = toNumber(coinResponse.data?.sentiment_votes_up_percentage, 50);

  if (!prices.length) return null;

  return {
    source: 'CoinGecko',
    prices,
    volumes,
    sentimentScore
  };
};

const fetchYahooFinanceData = async (ticker) => {
  if (!ticker) return null;

  try {
    const response = await axios.get(`${config.yahooFinanceBaseUrl}/v8/finance/chart/${encodeURIComponent(ticker)}`, {
      timeout: 12000,
      params: {
        range: '1mo',
        interval: '1d'
      }
    });

    const quote = response.data?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
    const prices = quote.close || [];
    const volumes = quote.volume || [];

    if (!prices.length) return null;

    return {
      source: 'YahooFinance',
      prices,
      volumes,
      sentimentScore: 50
    };
  } catch (error) {
    logger.debug('Yahoo Finance fetch failed', { ticker, error: error.message });
    return null;
  }
};

const scoreFinancialLayer = (snapshot = {}) => {
  const trendScore = Math.round(computeTrendFromSeries(snapshot.prices || []));
  const volatilityScore = Math.round(computeVolatilityScore(snapshot.prices || []));
  const volumeStrengthScore = Math.round(computeVolumeStrengthScore(snapshot.volumes || []));
  const momentum = computeMomentumScore(snapshot.prices || []);

  const scores = {
    trendScore,
    volatilityScore,
    volumeStrengthScore,
    priceMomentumScore: Math.round(momentum.priceMomentumScore),
    sentimentScore: Math.round(toNumber(snapshot.sentimentScore, 50)),
    priceChange24h: Number(momentum.change24h.toFixed(2)),
    priceChange7d: Number(momentum.change7d.toFixed(2)),
    priceChange30d: Number(momentum.change30d.toFixed(2))
  };

  return {
    scores,
    compositeScore: computeFinancialCompositeScore(scores)
  };
};

const buildSportsLayer = async (marketData) => {
  const teams = extractTeamsFromMarket(marketData);
  const sportType = detectSportType(marketData);

  const primary = await fetchSportsDataIoData({
    teamA: teams.teamA,
    teamB: teams.teamB,
    sportType
  });

  const secondary = await fetchFootballDataSnapshot({
    teamA: teams.teamA,
    teamB: teams.teamB
  });

  const chosen = secondary || primary;
  if (!chosen) {
    return {
      ...buildDefaultLayer('sports'),
      applicable: true,
      signalStrength: 0.2,
      rawContext: {
        teams,
        reason: 'No sports provider data returned for this market'
      }
    };
  }

  const scored = scoreSportsLayer(chosen);

  return {
    applicable: true,
    sourceType: 'sports',
    scores: scored.scores,
    compositeScore: scored.compositeScore,
    signalStrength: chosen.recentMatches?.length ? 0.85 : 0.55,
    sourcesUsed: [chosen.source],
    rawContext: {
      teams,
      sportType,
      matchesAnalyzed: (chosen.recentMatches || []).length,
      fixturesAnalyzed: (chosen.fixtures || []).length,
      injuriesConsidered: chosen.injuredCount || 0
    }
  };
};

const buildFinancialLayer = async (marketData) => {
  const coinId = extractCryptoIdFromMarket(marketData);
  const ticker = extractTickerFromMarket(marketData);

  const coinSnapshot = await fetchCoinGeckoData(coinId);
  const marketSnapshot = coinSnapshot || await fetchYahooFinanceData(ticker);

  if (!marketSnapshot) {
    return {
      ...buildDefaultLayer('financial'),
      applicable: true,
      signalStrength: 0.25,
      rawContext: {
        coinId,
        ticker,
        reason: 'No financial provider data returned for this market'
      }
    };
  }

  const scored = scoreFinancialLayer(marketSnapshot);

  return {
    applicable: true,
    sourceType: 'financial',
    scores: scored.scores,
    compositeScore: scored.compositeScore,
    signalStrength: (marketSnapshot.prices || []).length >= 20 ? 0.9 : 0.6,
    sourcesUsed: [marketSnapshot.source],
    rawContext: {
      coinId,
      ticker,
      pointsAnalyzed: (marketSnapshot.prices || []).length
    }
  };
};

const getExternalDataLayer = async (marketData = {}, marketClassification = 'unpredictable/noise') => {
  const cacheKey = getCacheKey(marketData, marketClassification);
  const cached = cacheService.getFromMemory(cacheKey);
  if (cached) {
    externalDataMonitoringService.recordCacheOperation(true);
    return cached;
  }

  externalDataMonitoringService.recordCacheOperation(false);

  let layer = buildDefaultLayer();
  const sourceTypeForMetrics = mapClassificationToSourceType(marketClassification);

  try {
    const startTime = Date.now();
    if (marketClassification === 'sports' || looksLikeSportsMarket(marketData)) {
      layer = await buildSportsLayer(marketData);
    } else if (marketClassification === 'crypto' || marketClassification === 'finance/economy') {
      layer = await buildFinancialLayer(marketData);
    } else if (marketClassification === 'politics' || marketClassification === 'geopolitics') {
      layer = await geopoliticalDataService.getGeopoliticalDataLayer(marketData, marketClassification);
    } else if (marketClassification === 'corporate' || marketClassification === 'technology') {
      layer = await corporateDataService.getCorporateDataLayer(marketData);
    }

    const responseTime = Date.now() - startTime;
    const metricSource = layer.sourceType && layer.sourceType !== 'none'
      ? layer.sourceType
      : sourceTypeForMetrics;

    if (metricSource !== 'unknown' && metricSource !== 'none') {
      externalDataMonitoringService.recordApiCall(metricSource, responseTime, true);
    }
  } catch (error) {
    logger.warn('External data layer failed, proceeding with neutral external scores', {
      marketId: marketData.marketId,
      classification: marketClassification,
      error: error.message
    });

    if (sourceTypeForMetrics !== 'unknown') {
      externalDataMonitoringService.recordApiCall(sourceTypeForMetrics, 0, false, error);
    }
  }

  cacheService.setInMemory(cacheKey, layer, config.externalDataCacheTtl);

  const marketId = marketData.marketId || marketData.id;
  if (marketId) {
    externalDataMonitoringService.storeMarketDiagnostics(marketId, layer);
  }

  return layer;
};

module.exports = {
  getExternalDataLayer,
  extractTeamsFromMarket,
  extractCryptoIdFromMarket,
  extractTickerFromMarket,
  looksLikeSportsMarket,
  summarizeTeamPerformance,
  computeSportsCompositeScore,
  computeFinancialCompositeScore,
  scoreSportsLayer,
  scoreFinancialLayer
};
