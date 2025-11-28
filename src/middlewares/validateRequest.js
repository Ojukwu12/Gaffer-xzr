/**
 * Input Validation Middleware
 * Validates request parameters using express-validator
 * @module middlewares/validateRequest
 */

const { validationResult } = require('express-validator');
const { error } = require('../utils/responseFormatter');
const logger = require('../config/logger');

/**
 * Validates request and returns formatted errors
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    
    logger.warn('Validation failed:', { errors: errorMessages, path: req.path });
    
    return error(
      res,
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      { errors: errorMessages }
    );
  }
  
  next();
};

module.exports = validateRequest;
