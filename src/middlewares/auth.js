/**
 * API Key Authentication Middleware
 * Protects admin and sensitive endpoints
 * @module middlewares/auth
 */

const CustomError = require('../utils/CustomError');
const logger = require('../config/logger');
const User = require('../models/User');

/**
 * Validates API key from request headers
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const requireApiKey = async (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey) {
    throw new CustomError('API key is required', 401, 'MISSING_API_KEY');
  }
  
  // Find user by API key
  const user = await User.findOne({ apiKey, isActive: true });
  
  if (!user) {
    logger.warn('Invalid API key attempt', { 
      ip: req.ip,
      path: req.path 
    });
    throw new CustomError('Invalid API key', 401, 'INVALID_API_KEY');
  }
  
  // Update last seen
  user.lastSeen = new Date();
  await user.save();
  
  // Attach user to request
  req.user = user;
  
  next();
};

/**
 * Checks if user has admin role
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    throw new CustomError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  
  if (req.user.role !== 'admin') {
    logger.warn('Unauthorized admin access attempt', {
      userId: req.user._id,
      role: req.user.role,
      ip: req.ip,
      path: req.path
    });
    throw new CustomError('Admin access required', 403, 'FORBIDDEN');
  }
  
  next();
};

/**
 * Checks user tier limits
 * @param {string} feature - Feature to check
 * @returns {Function} Middleware function
 */
const checkTierLimit = (feature) => {
  return async (req, res, next) => {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'AUTH_REQUIRED');
    }
    
    const limits = {
      free: { requests: 100 },
      basic: { requests: 1000 },
      premium: { requests: 10000 }
    };
    
    const userLimit = limits[req.user.tier]?.requests || limits.free.requests;
    
    if (req.user.usage.requests >= userLimit) {
      throw new CustomError(
        `Tier limit reached. Upgrade to continue.`,
        429,
        'TIER_LIMIT_REACHED'
      );
    }
    
    next();
  };
};

module.exports = {
  requireApiKey,
  requireAdmin,
  checkTierLimit
};
