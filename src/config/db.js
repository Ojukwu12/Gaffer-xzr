/**
 * Database Connection Module
 * Handles MongoDB connection using Mongoose
 * @module config/db
 */

const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('./env');

/**
 * Connects to MongoDB database
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  await mongoose.connect(config.mongoUri, options);
  
  logger.info(`MongoDB Connected: ${mongoose.connection.host}`);
  
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
  });
  
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
};

/**
 * Gracefully closes database connection
 * @returns {Promise<void>}
 */
const closeDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

module.exports = { connectDB, closeDB };
