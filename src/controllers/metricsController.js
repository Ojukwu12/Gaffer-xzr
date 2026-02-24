/**
 * Metrics Controller
 * Exposes metrics endpoint for monitoring
 * @module controllers/metricsController
 */

const metricsService = require('../services/metricsService');
const { success } = require('../utils/responseFormatter');
const logger = require('../config/logger');

/**
 * Get application metrics
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getMetrics = async (req, res) => {
  logger.debug('Retrieving metrics');
  
  const metrics = await metricsService.getMetrics();
  
  success(res, metrics, 'Metrics retrieved');
};

/**
 * Get Prometheus-formatted metrics
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getPrometheusMetrics = async (req, res) => {
  const metrics = await metricsService.getMetrics();
  
  // Format as Prometheus metrics
  let output = '';
  
  // Requests
  output += `# HELP polyscope_requests_total Total number of requests\n`;
  output += `# TYPE polyscope_requests_total counter\n`;
  output += `polyscope_requests_total ${metrics.metrics.requests.total}\n\n`;
  
  output += `# HELP polyscope_requests_success Total number of successful requests\n`;
  output += `# TYPE polyscope_requests_success counter\n`;
  output += `polyscope_requests_success ${metrics.metrics.requests.success}\n\n`;
  
  output += `# HELP polyscope_requests_errors Total number of failed requests\n`;
  output += `# TYPE polyscope_requests_errors counter\n`;
  output += `polyscope_requests_errors ${metrics.metrics.requests.errors}\n\n`;
  
  // Predictions
  output += `# HELP polyscope_predictions_generated Total predictions generated\n`;
  output += `# TYPE polyscope_predictions_generated counter\n`;
  output += `polyscope_predictions_generated ${metrics.metrics.predictions.generated}\n\n`;
  
  output += `# HELP polyscope_predictions_cached Predictions served from cache\n`;
  output += `# TYPE polyscope_predictions_cached counter\n`;
  output += `polyscope_predictions_cached ${metrics.metrics.predictions.cached}\n\n`;
  
  // Cache
  output += `# HELP polyscope_cache_hits Cache hits\n`;
  output += `# TYPE polyscope_cache_hits counter\n`;
  output += `polyscope_cache_hits ${metrics.metrics.cache.hits}\n\n`;
  
  output += `# HELP polyscope_cache_misses Cache misses\n`;
  output += `# TYPE polyscope_cache_misses counter\n`;
  output += `polyscope_cache_misses ${metrics.metrics.cache.misses}\n\n`;
  
  output += `# HELP polyscope_cache_hit_rate Cache hit rate percentage\n`;
  output += `# TYPE polyscope_cache_hit_rate gauge\n`;
  output += `polyscope_cache_hit_rate ${metrics.metrics.cache.hitRate}\n\n`;
  
  // LLM
  output += `# HELP polyscope_llm_requests Total LLM requests\n`;
  output += `# TYPE polyscope_llm_requests counter\n`;
  output += `polyscope_llm_requests ${metrics.metrics.llm.requests}\n\n`;
  
  output += `# HELP polyscope_llm_errors LLM request errors\n`;
  output += `# TYPE polyscope_llm_errors counter\n`;
  output += `polyscope_llm_errors ${metrics.metrics.llm.errors}\n\n`;
  
  // Uptime
  output += `# HELP polyscope_uptime_seconds Server uptime in seconds\n`;
  output += `# TYPE polyscope_uptime_seconds gauge\n`;
  output += `polyscope_uptime_seconds ${metrics.uptime.seconds}\n\n`;
  
  res.set('Content-Type', 'text/plain');
  res.send(output);
};

/**
 * Reset metrics
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const resetMetrics = async (req, res) => {
  logger.info('Resetting metrics');
  
  metricsService.resetMetrics();
  
  success(res, {}, 'Metrics reset successfully');
};

module.exports = {
  getMetrics,
  getPrometheusMetrics,
  resetMetrics
};
