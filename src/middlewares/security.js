/**
 * Security Middleware
 * Additional security configurations and input sanitization
 * @module middlewares/security
 */

const logger = require('../config/logger');

/**
 * Sanitizes user input to prevent XSS and injection attacks
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }
  
  // Sanitize body parameters
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Recursively sanitizes object properties
 * @param {Object} obj - Object to sanitize
 */
const sanitizeObject = (obj) => {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key].trim();
      // Remove potential XSS
      obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  });
};

/**
 * Blocks suspicious requests
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const blockSuspiciousRequests = (req, res, next) => {
  const suspiciousPatterns = [
    /(\.\.)|(\.\/)/g,  // Path traversal
    /<script/gi,        // XSS attempts
    /javascript:/gi,    // JavaScript protocol
    /on\w+\s*=/gi      // Event handlers
  ];
  
  const checkString = JSON.stringify({
    query: req.query,
    body: req.body,
    params: req.params
  });
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      logger.warn('Suspicious request blocked', {
        ip: req.ip,
        path: req.path,
        pattern: pattern.toString()
      });
      
      return res.status(403).json({
        success: false,
        message: 'Request blocked',
        errorCode: 'SUSPICIOUS_REQUEST'
      });
    }
  }
  
  next();
};

module.exports = {
  sanitizeInput,
  blockSuspiciousRequests
};
