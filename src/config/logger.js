/**
 * Logger Configuration Module
 * Winston-based logging system
 * @module config/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

/**
 * Logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'polyscope-backend' },
  transports: (
    process.env.NODE_ENV === 'test' ? [
      new winston.transports.Console({ format: consoleFormat })
    ] : [
      // Write all logs to console
      new winston.transports.Console({
        format: consoleFormat
      }),
      // Write all logs with level 'error' and below to error.log
      new winston.transports.File({ 
        filename: path.join('logs', 'error.log'), 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: path.join('logs', 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ]
  ),
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'exceptions.log') })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'rejections.log') })
  ]
});

// Ensure logs directory exists when not in test environment
if (process.env.NODE_ENV !== 'test') {
  try {
    const logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      // Set permissive but safe permissions (owner read/write, group+others read)
      try { fs.chmodSync(logsDir, 0o755); } catch (e) { /* ignore chmod failures on some systems */ }
    }
  } catch (err) {
    // If we cannot create the logs directory, surface the error but keep running
    // so that in containerized environments the process can still start and
    // logging may be redirected to stdout/stderr.
    // eslint-disable-next-line no-console
    console.warn('Warning: could not create logs directory:', err.message || err);
  }
}

/**
 * Stream for Morgan HTTP logger
 */
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
