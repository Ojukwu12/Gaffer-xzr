/**
 * Rate Limiting Middleware
 * Implements rate limiting with dev IP bypass
 * @module middlewares/rateLimit
 */

const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');
const { RATE_LIMIT_CONFIG } = require('../config/features');
const config = require('../config/env');

/**
 * Custom key generator that bypasses rate limiting for dev IP
 * @param {Object} req - Express request object
 * @returns {string|null} Rate limit key or null to skip
 */
const keyGenerator = (req) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Bypass rate limiting for dev IP
  if (clientIp === config.devIp || clientIp === `::ffff:${config.devIp}`) {
    logger.info(`Rate limit bypassed for dev IP: ${clientIp}`);
    return null; // Returning null skips rate limiting
  }
  
  return clientIp;
};

/**
 * Rate limit handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handler = (req, res) => {
  logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
  res.status(429).json({
    success: false,
    message: 'Too many requests from this IP, please try again later',
    errorCode: 'RATE_LIMIT_EXCEEDED',
    retryAfter: res.getHeader('Retry-After'),
    timestamp: new Date().toISOString()
  });
};

/**
 * Skip function - determines whether to skip rate limiting
 * @param {Object} req - Express request object
 * @returns {boolean} True to skip rate limiting
 */
const skip = (req) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  return clientIp === config.devIp || clientIp === `::ffff:${config.devIp}`;
};

/**
 * General rate limiter
 * 100 requests per 5 minutes per IP (configurable)
 */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.windowMs,
  max: RATE_LIMIT_CONFIG.max,
  standardHeaders: RATE_LIMIT_CONFIG.standardHeaders,
  legacyHeaders: RATE_LIMIT_CONFIG.legacyHeaders,
  handler,
  skip,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

/**
 * Strict rate limiter for sensitive endpoints
 * 20 requests per 5 minutes per IP
 */
const strictLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.windowMs,
  max: 20,
  standardHeaders: RATE_LIMIT_CONFIG.standardHeaders,
  legacyHeaders: RATE_LIMIT_CONFIG.legacyHeaders,
  handler,
  skip,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

/**
 * Prediction endpoint rate limiter
 * 50 requests per 5 minutes per IP
 */
const predictionLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.windowMs,
  max: 50,
  standardHeaders: RATE_LIMIT_CONFIG.standardHeaders,
  legacyHeaders: RATE_LIMIT_CONFIG.legacyHeaders,
  handler,
  skip,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress,
  message: {
    success: false,
    message: 'Too many prediction requests, please try again later',
    errorCode: 'PREDICTION_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});

module.exports = {
  generalLimiter,
  strictLimiter,
  predictionLimiter
};
