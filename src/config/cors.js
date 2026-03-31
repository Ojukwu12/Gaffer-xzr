/**
 * CORS Configuration
 * Enhanced CORS settings for frontend integration
 * @module config/cors
 */

const config = require('./env');

const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/$/, '').toLowerCase();
};

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',      // Local development (React/Next.js default)
  'http://localhost:3001',      // Alternative local port
  'http://localhost:4200',      // Angular default
  'http://localhost:8080',      // Vue default
  'http://localhost:5173',      // Vite default
  'https://polyscope.app',      // Production domain (example)
  'https://www.polyscope.app',  // Production www subdomain
  // Add your production domain here
  ...(config.allowedOrigins
    ? config.allowedOrigins.split(',').map((item) => item.trim()).filter(Boolean)
    : [])
];

const normalizedAllowedOrigins = new Set(allowedOrigins.map(normalizeOrigin));

const isLocalhostOrigin = (origin) => {
  if (!origin) return false;

  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);

    if (
      process.env.NODE_ENV === 'development' ||
      normalizedAllowedOrigins.has('*') ||
      normalizedAllowedOrigins.has(normalizedOrigin) ||
      isLocalhostOrigin(normalizedOrigin)
    ) {
      callback(null, true);
    } else {
      // Include origin in error logs to speed up CORS troubleshooting.
      // eslint-disable-next-line no-console
      console.warn(`[cors] blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'x-api-key',
    'x-admin-key',
    'X-Admin-Key',
    'Accept',
    'Origin'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page',
    'X-Per-Page',
    'X-Total-Pages',
    'X-Request-Id'
  ],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

module.exports = {
  corsOptions,
  allowedOrigins
};
