/**
 * Response Formatter Utilities
 * Standardizes API response format across the application
 * @module utils/responseFormatter
 */

/**
 * Formats successful API responses
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Express response
 */
const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Formats error API responses
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} errorCode - Application-specific error code
 * @param {*} details - Additional error details
 * @returns {Object} Express response
 */
const error = (res, message = 'An error occurred', statusCode = 500, errorCode = 'INTERNAL_ERROR', details = null) => {
  const response = {
    success: false,
    message,
    errorCode,
    timestamp: new Date().toISOString()
  };
  
  // Only include details if they exist
  if (details) {
    response.details = details;
  }
  
  // Include stack trace in development mode
  if (process.env.NODE_ENV === 'development' && details && details.stack) {
    response.stack = details.stack;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Formats paginated responses
 * @param {Object} res - Express response object
 * @param {Array} data - Response data array
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @returns {Object} Express response
 */
const paginated = (res, data, page, limit, total) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  success,
  error,
  paginated
};
