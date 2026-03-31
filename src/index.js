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

/**
 * Ensures ADMIN_EMAIL in env is mapped to an active admin user in DB.
 * This keeps runtime auth (which checks DB role) aligned with env config.
 */
const ensureEnvAdminUser = async () => {
  const configuredEmail = (config.adminEmail || '').trim().toLowerCase();
  if (!configuredEmail) {
    return;
  }

  const configuredApiKey = (process.env.ADMIN_API_KEY || '').trim();
  let user = await User.findOne({ email: configuredEmail });

  if (!user) {
    if (!configuredApiKey) {
      logger.warn(
        `ADMIN_EMAIL (${configuredEmail}) is set but ADMIN_API_KEY is missing. ` +
        'Skipping admin user creation to avoid generating unexpected credentials.'
      );
      return;
    }

    const apiKeyOwner = await User.findOne({ apiKey: configuredApiKey })
      .select('email')
      .lean();

    if (apiKeyOwner && apiKeyOwner.email !== configuredEmail) {
      logger.warn(
        `Cannot create ADMIN_EMAIL user (${configuredEmail}) because ADMIN_API_KEY is already assigned to ${apiKeyOwner.email}.`
      );
      return;
    }

    user = await User.create({
      email: configuredEmail,
      apiKey: configuredApiKey,
      role: 'admin',
      isActive: true,
      metadata: {
        createdBy: 'startup-admin-sync'
      }
    });

    logger.info(`Created admin user from ADMIN_EMAIL (${configuredEmail}) using ADMIN_API_KEY from env.`);

    return;
  }

  const updates = {};
  if (user.role !== 'admin') updates.role = 'admin';
  if (!user.isActive) updates.isActive = true;

  if (configuredApiKey) {
    const apiKeyOwner = await User.findOne({ apiKey: configuredApiKey })
      .select('email')
      .lean();

    if (apiKeyOwner && apiKeyOwner.email !== configuredEmail) {
      logger.warn(
        `ADMIN_API_KEY is already assigned to ${apiKeyOwner.email}. ` +
        `Skipping API key update for ADMIN_EMAIL (${configuredEmail}).`
      );
    } else if (user.apiKey !== configuredApiKey) {
      updates.apiKey = configuredApiKey;
    }
  } else {
    logger.warn(
      `ADMIN_API_KEY not set; keeping existing API key for ADMIN_EMAIL (${configuredEmail}).`
    );
  }

  if (Object.keys(updates).length > 0) {
    await User.updateOne({ _id: user._id }, { $set: updates });
    logger.info(`Synced admin user from ADMIN_EMAIL (${configuredEmail})`, updates);
  }
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
app.options('*', cors(corsOptions)); // Ensure browser preflight requests succeed
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
 * Run all startup migrations
 * Non-blocking - warns on failure but doesn't halt startup
 */
const runStartupMigrations = async () => {
  try {
    const MigrationState = require('./models/MigrationState');
    const PredictionRecord = require('./models/PredictionRecord');
    const PredictionCache = require('./models/PredictionCache');
    const polymarketService = require('./services/polymarketService');
    
    const MIGRATION_KEY = '2026-03-30-polymarket-links-backfill-v2';
    
    // Check if already migrated
    const existing = await MigrationState.findOne({ key: MIGRATION_KEY });
    if (existing && existing.status === 'completed') {
      logger.info(`✓ Startup migration already completed on ${existing.completedAt}`);
      return;
    }
    
    // Record migration start
    await MigrationState.updateOne(
      { key: MIGRATION_KEY },
      {
        key: MIGRATION_KEY,
        status: 'in_progress',
        startedAt: new Date(),
        migrationName: 'Polymarket Links Backfill v2 (Startup)'
      },
      { upsert: true }
    );
    
    // Fetch all predictions and cached predictions
    const predictions = await PredictionRecord.find({}).lean();
    const cachedPredictions = await PredictionCache.find({}).lean();
    
    if (predictions.length === 0 && cachedPredictions.length === 0) {
      logger.info('No prediction links to update in startup migration');
      await MigrationState.updateOne(
        { key: MIGRATION_KEY },
        { status: 'completed', completedAt: new Date(), recordsUpdated: 0, cacheUpdated: 0 }
      );
      return;
    }
    
    logger.info(
      `Running startup link migration for ${predictions.length} prediction records and ${cachedPredictions.length} cached predictions`
    );
    
    // Group predictions by market ID
    const marketIds = [...new Set([
      ...predictions.map((p) => p.marketId),
      ...cachedPredictions.map((c) => c.marketId)
    ].filter(Boolean))];
    const marketDataMap = {};
    
    // Fetch market data with error handling
    for (const marketId of marketIds) {
      try {
        const rawMarket = await polymarketService.fetchMarketById(marketId);
        const parsedMarket = polymarketService.parseMarket(rawMarket);
        marketDataMap[marketId] = parsedMarket;
      } catch (error) {
        logger.warn(`Failed to fetch market ${marketId} in startup migration: ${error.message}`);
      }
    }
    
    const buildEventUrlFromSlug = (slug) => {
      if (!slug) return null;
      return `https://polymarket.com/event/${encodeURIComponent(slug)}`;
    };

    const buildLink = ({ marketId, recordSlug, marketData }) => {
      if (marketData) {
        return polymarketService.getMarketUrl({
          marketId,
          slug: marketData.slug,
          eventSlug: marketData.eventSlug || null
        });
      }

      const fallbackEventUrl = buildEventUrlFromSlug(recordSlug);
      if (fallbackEventUrl) return fallbackEventUrl;

      return polymarketService.getMarketUrl({ marketId, slug: null, eventSlug: null });
    };

    // Update prediction records
    let updated = 0;
    let cacheUpdated = 0;
    for (const prediction of predictions) {
      try {
        const marketData = marketDataMap[prediction.marketId] || null;
        const bestSlug = (marketData && (marketData.eventSlug || marketData.slug)) || prediction.marketSlug || null;
        
        const updates = {
          marketSlug: bestSlug,
          polymarketUrl: buildLink({
            marketId: prediction.marketId,
            recordSlug: prediction.marketSlug,
            marketData
          }),
          marketTitle: (marketData && marketData.title) || prediction.marketTitle
        };
        
        if (prediction.marketSlug !== updates.marketSlug || prediction.polymarketUrl !== updates.polymarketUrl) {
          await PredictionRecord.updateOne({ _id: prediction._id }, { $set: updates });
          updated++;
        }
      } catch (error) {
        logger.warn(`Failed to update prediction in startup migration: ${error.message}`);
      }
    }

    // Update cached prediction links
    for (const cacheEntry of cachedPredictions) {
      try {
        const marketData = marketDataMap[cacheEntry.marketId] || null;
        const nextUrl = buildLink({
          marketId: cacheEntry.marketId,
          recordSlug: null,
          marketData
        });

        const currentUrl = cacheEntry?.prediction?.polymarketUrl || null;
        if (currentUrl !== nextUrl) {
          await PredictionCache.updateOne(
            { _id: cacheEntry._id },
            { $set: { 'prediction.polymarketUrl': nextUrl } }
          );
          cacheUpdated++;
        }
      } catch (error) {
        logger.warn(`Failed to update cached prediction in startup migration: ${error.message}`);
      }
    }
    
    // Record completion
    await MigrationState.updateOne(
      { key: MIGRATION_KEY },
      {
        status: 'completed',
        completedAt: new Date(),
        recordsUpdated: updated,
        cacheUpdated,
        details: {
          totalPredictions: predictions.length,
          totalCachedPredictions: cachedPredictions.length
        }
      }
    );
    
    logger.info(
      `✓ Startup migration completed: updated ${updated}/${predictions.length} predictions, ` +
      `updated ${cacheUpdated}/${cachedPredictions.length} cached predictions`
    );
  } catch (error) {
    logger.warn(`Startup migration error (non-blocking): ${error.message}`);
    // Don't throw - let server start regardless
  }
};

/**
 * Setup automatic cron jobs
 */
const setupCronJobs = () => {
  logger.info('⏰ Setting up automatic cron jobs...');

  let refreshInProgress = false;
  let predictionInProgress = false;
  let weeklyDigestInProgress = false;
  
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

  // Weekly push digest every Monday at 09:00 UTC
  cron.schedule('0 9 * * 1', async () => {
    if (weeklyDigestInProgress) {
      logger.info('Skipping weekly digest: previous run still in progress');
      return;
    }

    weeklyDigestInProgress = true;
    const digestRunId = `weekly-digest-${Date.now()}`;

    try {
      logger.info(`[cron][weekly-digest][${digestRunId}] START`);
      const notificationService = require('./services/notificationService');
      const digestResult = await notificationService.sendWeeklyPushDigest({ windowDays: 7 });
      logger.info(
        `[cron][weekly-digest][${digestRunId}] END sent=${digestResult.sent}, failed=${digestResult.failed}, checked=${digestResult.checked}`
      );
      global.lastCronRun = new Date().toISOString();
    } catch (error) {
      logger.error(`[cron][weekly-digest][${digestRunId}] FAILED: ${error.message}`);
    } finally {
      weeklyDigestInProgress = false;
    }
  });
  
  logger.info('✓ Cron jobs scheduled: refresh (every 5 min), predictions (every 10 min), weekly digest (Mon 09:00 UTC)');
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
      await ensureEnvAdminUser();
    } catch (adminSyncError) {
      logger.warn(`Could not sync ADMIN_EMAIL to admin user: ${adminSyncError.message}`);
    }

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

    // Run startup migrations (non-blocking)
    try {
      logger.info('Running startup migrations...');
      await runStartupMigrations();
    } catch (migrationError) {
      // Do not block boot for migration failures; keep service available.
      logger.warn(`Startup migrations did not complete: ${migrationError.message}`);
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
