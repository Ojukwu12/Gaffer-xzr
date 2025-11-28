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
  
  // MongoDB Configuration
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/polyscope',
  
  // Polymarket API
  polymarketApiKey: process.env.POLYMARKET_API_KEY || '',
  polymarketApiBase: process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com',
  
  // LLM Configuration (Gemini Pro)
  // Support both LLM_API_KEY and GEMINI_API_KEY for flexibility
  llmApiKey: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '',
  
  // Email Service Configuration (Testmail.app)
  // Support both EMAIL_SERVICE_* and SMTP_* variable names
  email: {
    host: process.env.EMAIL_SERVICE_HOST || process.env.SMTP_HOST || 'smtp.testmail.app',
    port: parseInt(process.env.EMAIL_SERVICE_PORT || process.env.SMTP_PORT || '587', 10),
    user: process.env.EMAIL_SERVICE_USER || process.env.SMTP_USER || '',
    password: process.env.EMAIL_SERVICE_PASSWORD || process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'noreply@polyscope.com'
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
  
  if (missing.length > 0 && config.nodeEnv === 'production') {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
  }
};

validateConfig();

module.exports = config;
