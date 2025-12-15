/**
 * Polyscope Backend Server
 * Main application entry point
 * @module index
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { corsOptions } = require('./config/cors');
const cron = require('node-cron');
const { connectDB } = require('./config/db');
const logger = require('./config/logger');
const config = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middlewares/errorMiddleware');
const { success } = require('./utils/responseFormatter');
const { sanitizeInput, blockSuspiciousRequests } = require('./middlewares/security');
const timeout = require('./middlewares/timeout');
const metricsService = require('./services/metricsService');

// Import routes
const marketRoutes = require('./routes/marketRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const predictionsCompatRoutes = require('./routes/predictionsCompatRoutes');

// Initialize Express app
const app = express();

/**
 * Global variables to track system state
 */
global.serverStartTime = Date.now();
global.lastCronRun = null;

/**
 * Middleware setup
 */
app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // Enable CORS with configuration
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Security middlewares
app.use(sanitizeInput); // Sanitize input
app.use(blockSuspiciousRequests); // Block suspicious requests
app.use(timeout(30000)); // 30 second timeout

/**
 * Request logging and metrics middleware
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Track request completion
  res.on('finish', () => {
    const success = res.statusCode < 400;
    metricsService.recordRequest(req.path, success);
  });
  
  next();
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const cacheService = require('./services/cacheService');
  const llmService = require('./services/llmService');
  
  const uptime = Math.floor((Date.now() - global.serverStartTime) / 1000);
  const cacheStats = await cacheService.getStats();
  const llmInfo = llmService.getModelInfo();
  
  return success(res, {
    status: 'healthy',
    uptime: `${uptime}s`,
    timestamp: new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      name: mongoose.connection.name
    },
    cache: {
      memoryKeys: cacheStats.memory.keys,
      databaseActive: cacheStats.database.active
    },
    llm: {
      status: llmInfo.configured ? 'configured' : 'not configured',
      model: llmInfo.model
    },
    lastCronRun: global.lastCronRun || 'never',
    version: require('../package.json').version
  });
});

/**
 * API Routes
 */
app.use('/api/markets', marketRoutes);
app.use('/api/markets', predictionRoutes); // Prediction routes nested under markets
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/metrics', require('./routes/metricsRoutes'));
// Back-compat route mounting for clients/tests expecting /api/predictions
app.use('/api/predictions', predictionsCompatRoutes);

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Polyscope API',
    version: require('../package.json').version,
    description: 'Production-grade backend for predicting Polymarket outcomes',
    documentation: '/docs/api-contract.md',
    endpoints: {
      health: '/health',
      markets: '/api/markets',
      predictions: '/api/markets/:id/predict',
      notifications: '/api/notifications',
      admin: '/api/admin'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * 404 handler
 */
app.use(notFoundHandler);

/**
 * Global error handler
 */
app.use(errorHandler);

/**
 * Setup automatic cron jobs
 */
const setupCronJobs = () => {
  logger.info('⏰ Setting up automatic cron jobs...');
  
  // Refresh markets every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('Running scheduled market refresh...');
      const refreshMarkets = require('./cron/refreshMarkets');
      await refreshMarkets();
      global.lastCronRun = new Date().toISOString();
    } catch (error) {
      logger.error('Scheduled market refresh failed:', error.message);
    }
  });
  
  // Compute predictions every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      logger.info('Running scheduled prediction computation...');
      const computePredictions = require('./cron/computePredictions');
      await computePredictions();
      global.lastCronRun = new Date().toISOString();
    } catch (error) {
      logger.error('Scheduled prediction computation failed:', error.message);
    }
  });
  
  logger.info('✓ Cron jobs scheduled: refresh (every 5 min), predictions (every 10 min)');
};

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('Database connected successfully');
    
    // Initialize services
    const llmService = require('./services/llmService');
    llmService.initializeClient();
    
    const emailService = require('./services/emailService');
    emailService.initializeResend();
    
    const webPushService = require('./services/webPushService');
    webPushService.initializeWebPush();
    
    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Polyscope server running on port ${config.port}`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`📚 API documentation: http://localhost:${config.port}/docs/api-contract.md`);
      
      // Setup automatic cron jobs
      if (config.nodeEnv !== 'test') {
        setupCronJobs();
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        const { closeDB } = require('./config/db');
        await closeDB();
        
        logger.info('Application shutdown complete');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
