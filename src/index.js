/**
 * Polyscope Backend Server
 * Main application entry point
 * @module index
 */

const express = require('express');
const path = require('path');
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
const User = require('./models/User');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (minMs, maxMs) => {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

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
app.use('/docs', express.static(path.join(__dirname, '../docs')));

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Polyscope API',
    version: require('../package.json').version,
    description: 'Production-grade backend for predicting Polymarket outcomes',
    documentation: '/docs/API_DOCUMENTATION.md',
    endpoints: {
      health: '/health',
      markets: '/api/markets',
      predictions: '/api/predictions',
      predictionById: '/api/predictions/:predictionId',
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

  let refreshInProgress = false;
  let predictionInProgress = false;
  
  // Refresh markets every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (refreshInProgress) {
      logger.info('Skipping scheduled market refresh: previous run still in progress');
      return;
    }

    refreshInProgress = true;
    const refreshDelayMs = randomBetween(config.refreshCronJitterMinMs, config.refreshCronJitterMaxMs);
    const refreshRunId = `refresh-${Date.now()}`;

    try {
      logger.info(`[cron][refresh][${refreshRunId}] Triggered. Delaying execution by ${refreshDelayMs}ms.`);
      await sleep(refreshDelayMs);
      logger.info(`[cron][refresh][${refreshRunId}] START`);
      const refreshMarkets = require('./cron/refreshMarkets');
      await refreshMarkets();
      logger.info(`[cron][refresh][${refreshRunId}] END`);
      global.lastCronRun = new Date().toISOString();
    } catch (error) {
      logger.error(`[cron][refresh][${refreshRunId}] FAILED: ${error.message}`);
    } finally {
      refreshInProgress = false;
    }
  });
  
  // Compute predictions every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    if (predictionInProgress) {
      logger.info('Skipping scheduled prediction computation: previous run still in progress');
      return;
    }

    predictionInProgress = true;
    const predictionDelayMs = randomBetween(config.predictionCronJitterMinMs, config.predictionCronJitterMaxMs);
    const predictionRunId = `predict-${Date.now()}`;

    try {
      logger.info(`[cron][prediction][${predictionRunId}] Triggered. Delaying execution by ${predictionDelayMs}ms.`);
      await sleep(predictionDelayMs);
      logger.info(`[cron][prediction][${predictionRunId}] START`);
      const computePredictions = require('./cron/computePredictions');
      await computePredictions();
      logger.info(`[cron][prediction][${predictionRunId}] END`);
      global.lastCronRun = new Date().toISOString();
    } catch (error) {
      logger.error(`[cron][prediction][${predictionRunId}] FAILED: ${error.message}`);
    } finally {
      predictionInProgress = false;
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

    try {
      const adminUsers = await User.find({ role: 'admin', isActive: true })
        .select('email')
        .lean();

      if (!adminUsers.length) {
        logger.warn('No active admin users found in database. Run npm run setup to create one.');
      } else {
        const adminEmails = adminUsers
          .map((user) => user.email)
          .filter(Boolean)
          .join(', ');

        logger.info(`Active admin users (${adminUsers.length}): ${adminEmails}`);
      }
    } catch (adminLookupError) {
      logger.warn(`Could not load admin users during startup: ${adminLookupError.message}`);
    }

    try {
      const predictionBackfillService = require('./services/predictionBackfillService');
      // Cleanup old migration state first (non-blocking)
      await predictionBackfillService.cleanupOldMigrationState();
      // Then run new backfill
      await predictionBackfillService.runApprovedReasonBackfillOnce();
    } catch (backfillError) {
      // Do not block boot for migration failures; keep service available.
      logger.warn(`Approved reason backfill did not complete: ${backfillError.message}`);
    }

    // Optional hard gate to prevent going live before paper validation proves readiness.
    if (config.nodeEnv === 'production' && config.enforceProductionReadiness) {
      const predictionTrackingService = require('./services/predictionTrackingService');
      const readiness = await predictionTrackingService.getProductionReadiness({
        days: config.readinessWindowDays,
        evaluationMode: config.readinessMode,
        minResolved: config.readinessMinResolved,
        minLowerBound: config.minWinRateLowerBound
      });

      if (!readiness.ready) {
        logger.error('Production readiness gate failed', readiness.checks);
        for (const reason of readiness.reasons || []) {
          logger.error(`Readiness reason: ${reason}`);
        }
        throw new Error('Production start blocked by readiness gate');
      }

      logger.info('Production readiness gate passed', readiness.checks);
    }
    
    // Initialize services
    const llmService = require('./services/llmService');
    llmService.initializeClient();
    
    const emailService = require('./services/emailService');
    emailService.initializeTransporter();
    
    const webPushService = require('./services/webPushService');
    webPushService.initializeWebPush();
    
    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Polyscope server running on port ${config.port}`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`📚 API documentation: http://localhost:${config.port}/docs/API_DOCUMENTATION.md`);
      
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
