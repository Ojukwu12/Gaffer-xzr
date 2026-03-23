/**
 * External Data Monitoring Service
 * Tracks performance, health, and diagnostics for external data sources
 * @module services/externalDataMonitoringService
 */

const logger = require('../config/logger');
const axios = require('axios');
const config = require('../config/env');
const externalApiRateLimiter = require('./externalApiRateLimiter');

/**
 * Metrics store for external data operations
 */
const externalDataMetrics = {
  // API call tracking
  apiCalls: {
    sports: { total: 0, success: 0, failures: 0, avgResponseTime: 0, lastCallTime: null },
    financial: { total: 0, success: 0, failures: 0, avgResponseTime: 0, lastCallTime: null },
    geopolitical: { total: 0, success: 0, failures: 0, avgResponseTime: 0, lastCallTime: null },
    corporate: { total: 0, success: 0, failures: 0, avgResponseTime: 0, lastCallTime: null }
  },
  
  // Cache tracking
  cache: {
    hits: 0,
    misses: 0,
    hitRate: 0
  },
  
  // Probability adjustments
  probabilityAdjustments: {
    totalAdjustments: 0,
    avgAdjustmentMagnitude: 0,
    adjustmentRange: { min: 0, max: 0 }
  },
  
  // Source health status
  sourceHealth: {
    sports: { healthy: true, lastCheckTime: null, lastErrorTime: null },
    financial: { healthy: true, lastCheckTime: null, lastErrorTime: null },
    geopolitical: { healthy: true, lastCheckTime: null, lastErrorTime: null },
    corporate: { healthy: true, lastCheckTime: null, lastErrorTime: null }
  },
  
  // Signal strength tracking
  signalStrength: {
    avg: 0,
    distribution: { high: 0, medium: 0, low: 0, none: 0 }
  }
};

/**
 * Store per-market diagnostic data (in-memory, expires after TTL)
 */
const marketDiagnostics = {};
const DIAGNOSTICS_TTL = 3600000; // 1 hour

/**
 * Record an external API call
 * @param {string} sourceType - Type of source (sports, financial, geopolitical, corporate)
 * @param {number} responseTime - Response time in milliseconds
 * @param {boolean} success - Whether call succeeded
 * @param {Error} error - Error object if failed
 */
function recordApiCall(sourceType, responseTime, success, error) {
  if (!externalDataMetrics.apiCalls[sourceType]) {
    return logger.warn(`Unknown source type: ${sourceType}`);
  }
  
  const source = externalDataMetrics.apiCalls[sourceType];
  source.total += 1;
  
  if (success) {
    source.success += 1;
    // Update average response time
    source.avgResponseTime = 
      (source.avgResponseTime * (source.success - 1) + responseTime) / source.success;
  } else {
    source.failures += 1;
    externalDataMetrics.sourceHealth[sourceType].healthy = false;
    externalDataMetrics.sourceHealth[sourceType].lastErrorTime = new Date();
  }
  
  source.lastCallTime = new Date();
  
  if (error) {
    logger.debug(`External API call failed for ${sourceType}: ${error.message}`);
  }
}

/**
 * Record cache hit/miss
 * @param {boolean} hit - Whether it was a cache hit
 */
function recordCacheOperation(hit) {
  if (hit) {
    externalDataMetrics.cache.hits += 1;
  } else {
    externalDataMetrics.cache.misses += 1;
  }
  
  const total = externalDataMetrics.cache.hits + externalDataMetrics.cache.misses;
  externalDataMetrics.cache.hitRate = externalDataMetrics.cache.hits / total;
}

/**
 * Record probability adjustment from external data
 * @param {number} adjustmentMagnitude - Absolute value of adjustment (0-12)
 */
function recordProbabilityAdjustment(adjustmentMagnitude) {
  externalDataMetrics.probabilityAdjustments.totalAdjustments += 1;
  const adj = externalDataMetrics.probabilityAdjustments;
  
  // Update average
  adj.avgAdjustmentMagnitude = 
    (adj.avgAdjustmentMagnitude * (adj.totalAdjustments - 1) + adjustmentMagnitude) / 
    adj.totalAdjustments;
  
  // Update range
  if (adjustmentMagnitude > adj.adjustmentRange.max) {
    adj.adjustmentRange.max = adjustmentMagnitude;
  }
  if (adjustmentMagnitude < adj.adjustmentRange.min || adj.adjustmentRange.min === 0) {
    adj.adjustmentRange.min = adjustmentMagnitude;
  }
}

/**
 * Record signal strength from external data
 * @param {number} strength - Signal strength (0-1)
 */
function recordSignalStrength(strength) {
  if (strength >= 0.75) {
    externalDataMetrics.signalStrength.distribution.high += 1;
  } else if (strength >= 0.5) {
    externalDataMetrics.signalStrength.distribution.medium += 1;
  } else if (strength > 0) {
    externalDataMetrics.signalStrength.distribution.low += 1;
  } else {
    externalDataMetrics.signalStrength.distribution.none += 1;
  }
  
  const total = Object.values(externalDataMetrics.signalStrength.distribution)
    .reduce((a, b) => a + b, 0);
  const weightedSum = 
    externalDataMetrics.signalStrength.distribution.high * 0.9 +
    externalDataMetrics.signalStrength.distribution.medium * 0.6 +
    externalDataMetrics.signalStrength.distribution.low * 0.3;
  
  externalDataMetrics.signalStrength.avg = total > 0 ? weightedSum / total : 0;
}

/**
 * Store per-market diagnostic data
 * @param {string} marketId - Market ID
 * @param {object} externalDataLayer - External data layer result
 */
function storeMarketDiagnostics(marketId, externalDataLayer) {
  marketDiagnostics[marketId] = {
    timestamp: new Date(),
    externalDataLayer,
    expiresAt: Date.now() + DIAGNOSTICS_TTL
  };
  
  // Cleanup old entries
  Object.keys(marketDiagnostics).forEach(id => {
    if (marketDiagnostics[id].expiresAt < Date.now()) {
      delete marketDiagnostics[id];
    }
  });
}

/**
 * Get diagnostics for a specific market
 * @param {string} marketId - Market ID
 * @returns {object} Diagnostic data for the market or null
 */
function getMarketDiagnostics(marketId) {
  const diag = marketDiagnostics[marketId];
  
  if (!diag) {
    return null;
  }
  
  if (diag.expiresAt < Date.now()) {
    delete marketDiagnostics[marketId];
    return null;
  }
  
  return {
    marketId,
    timestamp: diag.timestamp,
    ...diag.externalDataLayer
  };
}

/**
 * Health check for external data sources
 * Validates API connectivity and returns status
 * @returns {Promise<object>} Health status for each source
 */
async function checkExternalSourceHealth() {
  const healthCheck = {
    timestamp: new Date(),
    sources: {}
  };
  
  // Check sports data (SportsDataIO)
  try {
    const startTime = Date.now();
    // Simple connectivity check - just see if we can reach the API
    if (config.sportsDataIoApiKey && config.sportsDataIoApiKey !== 'your_sportsdata_api_key') {
      await externalApiRateLimiter.schedule('sportsDataIo', () =>
        axios.get('https://api.sportsdataio.com/v3/nba/scores/json/teams', {
          params: { key: config.sportsDataIoApiKey },
          timeout: 5000
        })
      );
      const responseTime = Date.now() - startTime;
      healthCheck.sources.sports = {
        status: 'healthy',
        responseTime,
        lastCheck: new Date()
      };
      externalDataMetrics.sourceHealth.sports.healthy = true;
      externalDataMetrics.sourceHealth.sports.lastCheckTime = new Date();
    } else {
      healthCheck.sources.sports = {
        status: 'unconfigured',
        message: 'API key not configured',
        lastCheck: new Date()
      };
    }
  } catch (error) {
    healthCheck.sources.sports = {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.sports.healthy = false;
    externalDataMetrics.sourceHealth.sports.lastErrorTime = new Date();
  }
  
  // Check financial data (CoinGecko - public API, no key required)
  try {
    const startTime = Date.now();
    await externalApiRateLimiter.schedule('coinGecko', () =>
      axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'bitcoin', vs_currencies: 'usd' },
        timeout: 5000
      })
    );
    const responseTime = Date.now() - startTime;
    healthCheck.sources.financial = {
      status: 'healthy',
      responseTime,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.financial.healthy = true;
    externalDataMetrics.sourceHealth.financial.lastCheckTime = new Date();
  } catch (error) {
    healthCheck.sources.financial = {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.financial.healthy = false;
    externalDataMetrics.sourceHealth.financial.lastErrorTime = new Date();
  }
  
  // Check geopolitical data (NewsAPI)
  try {
    const startTime = Date.now();
    if (config.newsApiKey && config.newsApiKey !== 'your_newsapi_key') {
      await externalApiRateLimiter.schedule('newsApi', () =>
        axios.get('https://newsapi.org/v2/everything', {
          params: {
            q: 'politics',
            pageSize: 1,
            apiKey: config.newsApiKey
          },
          timeout: 5000
        })
      );
      const responseTime = Date.now() - startTime;
      healthCheck.sources.geopolitical = {
        status: 'healthy',
        responseTime,
        lastCheck: new Date()
      };
      externalDataMetrics.sourceHealth.geopolitical.healthy = true;
      externalDataMetrics.sourceHealth.geopolitical.lastCheckTime = new Date();
    } else {
      healthCheck.sources.geopolitical = {
        status: 'unconfigured',
        message: 'API key not configured',
        lastCheck: new Date()
      };
    }
  } catch (error) {
    healthCheck.sources.geopolitical = {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.geopolitical.healthy = false;
    externalDataMetrics.sourceHealth.geopolitical.lastErrorTime = new Date();
  }
  
  // Check corporate data (SEC EDGAR - public API, no key required)
  try {
    const startTime = Date.now();
    const secUrl = `${config.secEdgarApiBase}/companyfacts/CIK0000320193.json`;
    await externalApiRateLimiter.schedule('secEdgar', () =>
      axios.get(secUrl, {
        headers: {
          'User-Agent': 'Polyscope/1.0 (ops@polyscope.local)',
          Accept: 'application/json'
        },
        timeout: 5000
      })
    );
    const responseTime = Date.now() - startTime;
    healthCheck.sources.corporate = {
      status: 'healthy',
      responseTime,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.corporate.healthy = true;
    externalDataMetrics.sourceHealth.corporate.lastCheckTime = new Date();
  } catch (error) {
    healthCheck.sources.corporate = {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date()
    };
    externalDataMetrics.sourceHealth.corporate.healthy = false;
    externalDataMetrics.sourceHealth.corporate.lastErrorTime = new Date();
  }
  
  // Summary
  const allHealthy = Object.values(healthCheck.sources)
    .every(s => s.status === 'healthy' || s.status === 'unconfigured');
  
  healthCheck.summary = {
    allHealthy,
    configuredSources: Object.values(healthCheck.sources)
      .filter(s => s.status !== 'unconfigured').length
  };
  
  return healthCheck;
}

/**
 * Get all external data metrics
 * @returns {object} Current metrics snapshot
 */
function getMetrics() {
  return {
    timestamp: new Date(),
    metrics: externalDataMetrics,
    diagnosticsStored: Object.keys(marketDiagnostics).length
  };
}

/**
 * Reset metrics (for testing or admin purposes)
 */
function resetMetrics() {
  Object.keys(externalDataMetrics.apiCalls).forEach(key => {
    externalDataMetrics.apiCalls[key] = {
      total: 0,
      success: 0,
      failures: 0,
      avgResponseTime: 0,
      lastCallTime: null
    };
  });
  
  externalDataMetrics.cache = {
    hits: 0,
    misses: 0,
    hitRate: 0
  };
  
  externalDataMetrics.probabilityAdjustments = {
    totalAdjustments: 0,
    avgAdjustmentMagnitude: 0,
    adjustmentRange: { min: 0, max: 0 }
  };
  
  externalDataMetrics.signalStrength = {
    avg: 0,
    distribution: { high: 0, medium: 0, low: 0, none: 0 }
  };
  
  logger.info('External data metrics reset');
}

module.exports = {
  recordApiCall,
  recordCacheOperation,
  recordProbabilityAdjustment,
  recordSignalStrength,
  storeMarketDiagnostics,
  getMarketDiagnostics,
  checkExternalSourceHealth,
  getMetrics,
  resetMetrics
};
