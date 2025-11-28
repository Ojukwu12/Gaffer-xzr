/**
 * Async Handler Middleware
 * Wraps async route handlers to catch errors and pass to error middleware
 * Eliminates need for try-catch blocks in controllers
 * @module middlewares/asyncHandler
 */

/**
 * Wraps async functions to handle promise rejections
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   return success(res, users);
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
