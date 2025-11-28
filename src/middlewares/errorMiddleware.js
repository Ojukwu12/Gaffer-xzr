/**
 * Error Handling Middleware
 * Global error handler for the application
 * @module middlewares/errorMiddleware
 */

const logger = require('../config/logger');
const { error } = require('../utils/responseFormatter');
const CustomError = require('../utils/CustomError');

/**
 * Global error handling middleware
 * Catches all errors and formats them consistently
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    errorCode: err.errorCode || 'UNKNOWN_ERROR'
  });

  // Handle CustomError instances
  if (err instanceof CustomError) {
    return error(
      res,
      err.message,
      err.statusCode,
      err.errorCode,
      err.details
    );
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return error(
      res,
      'Validation Error',
      400,
      'VALIDATION_ERROR',
      { fields: messages }
    );
  }

  // Handle Mongoose cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return error(
      res,
      `Invalid ${err.path}: ${err.value}`,
      400,
      'INVALID_ID'
    );
  }

  // Handle duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return error(
      res,
      `Duplicate value for field: ${field}`,
      409,
      'DUPLICATE_ERROR',
      { field }
    );
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return error(
      res,
      'Invalid token',
      401,
      'INVALID_TOKEN'
    );
  }

  if (err.name === 'TokenExpiredError') {
    return error(
      res,
      'Token expired',
      401,
      'TOKEN_EXPIRED'
    );
  }

  // Handle rate limit errors
  if (err.status === 429) {
    return error(
      res,
      'Too many requests, please try again later',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  return error(
    res,
    message,
    statusCode,
    'INTERNAL_ERROR',
    process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
  );
};

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFoundHandler = (req, res) => {
  return error(
    res,
    `Route not found: ${req.originalUrl}`,
    404,
    'NOT_FOUND'
  );
};

module.exports = {
  errorHandler,
  notFoundHandler
};
