/**
 * Environment Configuration Module
 * Loads and validates all environment variables
 * @module config/env
 */

require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS Configuration
  allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  
  // MongoDB Configuration
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/polyscope',
  
  // Polymarket API
  polymarketApiBase: process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com',
  
  // LLM Configuration (Gemini Pro)
  // Support both LLM_API_KEY and GEMINI_API_KEY for flexibility
  llmApiKey: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '',
  
  // Email Service Configuration (Gmail SMTP)
  gmail: {
    user: process.env.GMAIL_USER || '',
    password: process.env.GMAIL_PASSWORD || '',
    emailFrom: process.env.GMAIL_USER || 'noreply@gmail.com'
  },
  
  // Web Push Configuration
  // Support both WEB_PUSH_VAPID_* and VAPID_* variable names
  webPush: {
    vapidPublic: process.env.WEB_PUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivate: process.env.WEB_PUSH_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || ''
  },
  
  // Cache Configuration
  cacheTTL: parseInt(process.env.CACHE_TTL || '300', 10),
  
  // Notification Configuration
  notificationThreshold: parseInt(process.env.NOTIFICATION_THRESHOLD || '10', 10),
  
  // Rate Limit Bypass
  devIp: process.env.DEV_IP || '127.0.0.1'
};

/**
 * Validates critical environment variables
 * @throws {Error} If critical env vars are missing
 */
const validateConfig = () => {
  const required = ['MONGODB_URI', 'LLM_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (config.nodeEnv === 'production') {
      // In production we should fail fast to avoid running with invalid configuration
      // Throwing will surface the error during startup and prevent the server from running.
      throw new Error(msg);
    }

    // In non-production environments, warn so developers can still run locally.
    // This helps CI/dev where some secrets may be intentionally absent.
    // eslint-disable-next-line no-console
    console.warn(`Warning: ${msg}`);
  }
};

validateConfig();

module.exports = config;
