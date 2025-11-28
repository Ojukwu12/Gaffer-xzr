/**
 * Metrics Service
 * Collects and exposes application metrics for monitoring
 * @module services/metricsService
 */

const logger = require('../config/logger');
const PredictionCache = require('../models/PredictionCache');
const EmailSubscription = require('../models/EmailSubscription');
const PushSubscription = require('../models/PushSubscription');
const Webhook = require('../models/Webhook');

/**
 * Metrics store
 */
const metrics = {
  requests: {
    total: 0,
    success: 0,
    errors: 0,
    byEndpoint: {}
  },
  predictions: {
    generated: 0,
    cached: 0,
    highConfidence: 0,
    lowConfidence: 0
  },
  notifications: {
    email: {
      sent: 0,
      failed: 0
    },
    push: {
      sent: 0,
      failed: 0
    },
    webhooks: {
      sent: 0,
      failed: 0
    }
  },
  llm: {
    requests: 0,
    errors: 0,
    totalTokens: 0,
    avgResponseTime: 0
  },
  cache: {
    hits: 0,
    misses: 0,
    hitRate: 0
  }
};

/**
 * Records API request
 * @param {string} endpoint - Endpoint path
 * @param {boolean} success - Request success status
 */
const recordRequest = (endpoint, success = true) => {
  metrics.requests.total++;
  
  if (success) {
    metrics.requests.success++;
  } else {
    metrics.requests.errors++;
  }
  
  if (!metrics.requests.byEndpoint[endpoint]) {
    metrics.requests.byEndpoint[endpoint] = { count: 0, errors: 0 };
  }
  
  metrics.requests.byEndpoint[endpoint].count++;
  
  if (!success) {
    metrics.requests.byEndpoint[endpoint].errors++;
  }
};

/**
 * Records prediction generation
 * @param {Object} prediction - Prediction object
 * @param {boolean} fromCache - Whether prediction was from cache
 */
const recordPrediction = (prediction, fromCache = false) => {
  metrics.predictions.generated++;
  
  if (fromCache) {
    metrics.predictions.cached++;
  }
  
  if (prediction.confidence >= 70) {
    metrics.predictions.highConfidence++;
  } else {
    metrics.predictions.lowConfidence++;
  }
};

/**
 * Records notification sent
 * @param {string} type - Notification type (email, push, webhook)
 * @param {boolean} success - Send success status
 */
const recordNotification = (type, success = true) => {
  if (metrics.notifications[type]) {
    if (success) {
      metrics.notifications[type].sent++;
    } else {
      metrics.notifications[type].failed++;
    }
  }
};

/**
 * Records LLM request
 * @param {boolean} success - Request success status
 * @param {number} tokens - Tokens used
 * @param {number} responseTime - Response time in ms
 */
const recordLLMRequest = (success, tokens = 0, responseTime = 0) => {
  metrics.llm.requests++;
  
  if (!success) {
    metrics.llm.errors++;
  }
  
  metrics.llm.totalTokens += tokens;
  
  // Calculate rolling average
  const prevTotal = metrics.llm.avgResponseTime * (metrics.llm.requests - 1);
  metrics.llm.avgResponseTime = (prevTotal + responseTime) / metrics.llm.requests;
};

/**
 * Records cache hit/miss
 * @param {boolean} hit - Cache hit status
 */
const recordCacheAccess = (hit = true) => {
  if (hit) {
    metrics.cache.hits++;
  } else {
    metrics.cache.misses++;
  }
  
  const total = metrics.cache.hits + metrics.cache.misses;
  metrics.cache.hitRate = total > 0 ? (metrics.cache.hits / total * 100).toFixed(2) : 0;
};

/**
 * Gets all metrics
 * @returns {Promise<Object>} Metrics data
 */
const getMetrics = async () => {
  // Get database stats
  const [
    predictionCount,
    emailSubCount,
    pushSubCount,
    webhookCount,
    cacheStats
  ] = await Promise.all([
    PredictionCache.countDocuments(),
    EmailSubscription.countDocuments({ isActive: true }),
    PushSubscription.countDocuments({ isActive: true }),
    Webhook.countDocuments({ isActive: true }),
    PredictionCache.getStats()
  ]);
  
  // System metrics
  const uptime = Math.floor((Date.now() - global.serverStartTime) / 1000);
  const memoryUsage = process.memoryUsage();
  
  return {
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: formatUptime(uptime)
    },
    system: {
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external)
      },
      nodeVersion: process.version,
      platform: process.platform
    },
    metrics: {
      ...metrics,
      database: {
        predictions: predictionCount,
        activeEmailSubscriptions: emailSubCount,
        activePushSubscriptions: pushSubCount,
        activeWebhooks: webhookCount
      },
      cache: {
        ...metrics.cache,
        stats: cacheStats
      }
    }
  };
};

/**
 * Resets all metrics
 */
const resetMetrics = () => {
  metrics.requests = {
    total: 0,
    success: 0,
    errors: 0,
    byEndpoint: {}
  };
  metrics.predictions = {
    generated: 0,
    cached: 0,
    highConfidence: 0,
    lowConfidence: 0
  };
  metrics.notifications = {
    email: { sent: 0, failed: 0 },
    push: { sent: 0, failed: 0 },
    webhooks: { sent: 0, failed: 0 }
  };
  metrics.llm = {
    requests: 0,
    errors: 0,
    totalTokens: 0,
    avgResponseTime: 0
  };
  metrics.cache = {
    hits: 0,
    misses: 0,
    hitRate: 0
  };
  
  logger.info('Metrics reset');
};

/**
 * Formats uptime in human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string}
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

/**
 * Formats bytes in human-readable format
 * @param {number} bytes - Bytes
 * @returns {string}
 */
const formatBytes = (bytes) => {
  const mb = (bytes / 1024 / 1024).toFixed(2);
  return `${mb} MB`;
};

module.exports = {
  recordRequest,
  recordPrediction,
  recordNotification,
  recordLLMRequest,
  recordCacheAccess,
  getMetrics,
  resetMetrics
};
