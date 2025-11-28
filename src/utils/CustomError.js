/**
 * Custom Error Class
 * Provides structured error handling with status codes and error codes
 * @module utils/CustomError
 */

/**
 * Custom error class for application-specific errors
 * @class CustomError
 * @extends Error
 */
class CustomError extends Error {
  /**
   * Creates a new CustomError instance
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} errorCode - Application-specific error code (default: 'INTERNAL_ERROR')
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'CustomError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Flag to distinguish operational errors from programming errors
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = CustomError;
