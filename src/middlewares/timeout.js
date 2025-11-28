/**
 * Request Timeout Middleware
 * Prevents long-running requests from hanging
 * @module middlewares/timeout
 */

const logger = require('../config/logger');

/**
 * Sets timeout for requests
 * @param {number} ms - Timeout in milliseconds
 * @returns {Function} Express middleware
 */
const timeout = (ms = 30000) => {
  return (req, res, next) => {
    req.setTimeout(ms, () => {
      logger.error(`Request timeout: ${req.method} ${req.path}`);
      
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          message: 'Request timeout',
          errorCode: 'REQUEST_TIMEOUT'
        });
      }
    });
    
    next();
  };
};

module.exports = timeout;
