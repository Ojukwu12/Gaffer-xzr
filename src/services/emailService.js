/**
 * Email Service
 * Handles email sending using Brevo API v3
 * @module services/emailService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

const BREVO_API_BASE = 'https://api.brevo.com/v3';

/**
 * Brevo API client initialization flag
 */
let brevoInitialized = false;

/**
 * Initializes Brevo email service
 * @returns {boolean} Success status
 */
const initializeTransporter = () => {
  if (!config.brevo.apiKey) {
    logger.warn('Brevo API key not configured');
    return false;
  }
  
  brevoInitialized = true;
  logger.info('Brevo email service initialized');
  
  return true;
};

/**
 * Sends an email using Brevo API
 * @param {Object} options - Email options
 * @returns {Promise<Object>} Send result
 */
const sendEmail = async (options) => {
  if (!initializeTransporter()) {
    throw new CustomError('Email service not configured', 500, 'EMAIL_NOT_CONFIGURED');
  }
  
  const emailPayload = {
    to: [
      {
        email: options.to,
        name: options.toName || options.to
      }
    ],
    sender: {
      name: config.brevo.emailFromName,
      email: config.brevo.emailFrom
    },
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text
  };

  logger.info(`Sending email to ${options.to}: ${options.subject}`);
  
  try {
    const response = await axios.post(
      `${BREVO_API_BASE}/smtp/email`,
      emailPayload,
      {
        headers: {
          'api-key': config.brevo.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    logger.info(`Email sent successfully: ${response.data.messageId}`);
    
    return {
      messageId: response.data.messageId,
      accepted: [options.to],
      rejected: []
    };
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    logger.error(`Email send error: ${errorMessage}`);
    throw new CustomError(errorMessage, 500, 'EMAIL_SEND_FAILED');
  }
};

/**
 * Sends prediction notification email
 * @param {string} to - Recipient email
 * @param {Object} prediction - Prediction data
 * @param {Object} market - Market data
 * @returns {Promise<Object>}
 */
const sendPredictionEmail = async (to, prediction, market) => {
  const subject = `Polyscope Alert: ${market.title}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .confidence { font-size: 48px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; }
    .reason { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; }
    .market-info { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; }
    .feature { background: white; padding: 10px; border-radius: 5px; font-size: 14px; }
    .feature-label { font-weight: bold; color: #667eea; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Polyscope Prediction Alert</h1>
    </div>
    <div class="content">
      <div class="market-info">
        <h2>${market.title}</h2>
        <p><strong>Option:</strong> ${prediction.option}</p>
        <p><strong>Timeframe:</strong> ${prediction.timeframe}</p>
      </div>
      
      <div class="confidence">
        ${prediction.confidence}%
      </div>
      
      <div class="reason">
        <h3>Analysis</h3>
        <p>${prediction.reason}</p>
      </div>
      
      <div class="features">
        <div class="feature">
          <div class="feature-label">Liquidity</div>
          <div>$${(prediction.features.liquidity || 0).toLocaleString()}</div>
        </div>
        <div class="feature">
          <div class="feature-label">24h Volume</div>
          <div>$${(prediction.features.volume24h || 0).toLocaleString()}</div>
        </div>
        <div class="feature">
          <div class="feature-label">Whale Factor</div>
          <div>${((prediction.features.whaleFactor || 0) * 100).toFixed(0)}%</div>
        </div>
        <div class="feature">
          <div class="feature-label">Trend Score</div>
          <div>${((prediction.features.trendScore || 0) * 100).toFixed(0)}%</div>
        </div>
        <div class="feature">
          <div class="feature-label">Daily Change</div>
          <div>${((prediction.features.dailyChange || 0) * 100).toFixed(2)}%</div>
        </div>
        <div class="feature">
          <div class="feature-label">Sentiment</div>
          <div>${((prediction.features.sentimentScore || 0) * 100).toFixed(0)}%</div>
        </div>
      </div>
      
      <center>
        <a href="https://polymarket.com" class="button">View on Polymarket</a>
      </center>
      
      <div class="footer">
        <p>This is an automated prediction from Polyscope</p>
        <p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  const text = `
Polyscope Prediction Alert

Market: ${market.title}
Option: ${prediction.option}
Timeframe: ${prediction.timeframe}
Confidence: ${prediction.confidence}%

Analysis: ${prediction.reason}

Key Metrics:
- Liquidity: $${(prediction.features.liquidity || 0).toLocaleString()}
- 24h Volume: $${(prediction.features.volume24h || 0).toLocaleString()}
- Whale Factor: ${((prediction.features.whaleFactor || 0) * 100).toFixed(0)}%
- Trend Score: ${((prediction.features.trendScore || 0) * 100).toFixed(0)}%

View on Polymarket: https://polymarket.com
  `;
  
  return sendEmail({
    to,
    subject,
    html,
    text
  });
};

/**
 * Sends subscription confirmation email
 * @param {string} to - Recipient email
 * @param {string} verificationToken - Verification token
 * @returns {Promise<Object>}
 */
const sendSubscriptionConfirmationEmail = async (to, verificationToken) => {
  const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/api/notifications/email/verify?token=${verificationToken}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; padding: 15px 40px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Welcome to Polyscope!</h1>
    </div>
    <div class="content">
      <h2>Confirm Your Email</h2>
      <p>Thank you for subscribing to Polyscope prediction alerts!</p>
      <p>Click the button below to confirm your email address and start receiving predictions:</p>
      <center>
        <a href="${verificationUrl}" class="button">Confirm Email</a>
      </center>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
    </div>
  </div>
</body>
</html>
  `;
  
  return sendEmail({
    to,
    subject: 'Confirm your Polyscope subscription',
    html,
    text: `Confirm your email: ${verificationUrl}`
  });
};

/**
 * Sends welcome email to new users
 * @param {string} to - Recipient email
 * @param {string} apiKey - User's API key
 * @returns {Promise<Object>}
 */
const sendWelcomeEmail = async (to, apiKey) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .api-key { background: #fff; padding: 15px; border-radius: 5px; font-family: monospace; word-break: break-all; border: 2px solid #667eea; margin: 20px 0; }
    .feature-box { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Welcome to Polyscope!</h1>
      <p>Your AI-Powered Polymarket Prediction Engine</p>
    </div>
    <div class="content">
      <h2>Getting Started</h2>
      <p>Thank you for joining Polyscope! Your account has been created successfully.</p>
      
      <h3>Your API Key</h3>
      <div class="api-key">
        ${apiKey}
      </div>
      <p><strong>⚠️ Keep this key secure!</strong> Never share it publicly or commit it to version control.</p>
      
      <h3>What You Get</h3>
      <div class="feature-box">
        <strong>🤖 AI Predictions</strong>
        <p>LLM-powered analysis using Google Gemini Pro for intelligent market predictions</p>
      </div>
      <div class="feature-box">
        <strong>🐋 Whale Tracking</strong>
        <p>Monitor smart money movements and large wallet activities</p>
      </div>
      <div class="feature-box">
        <strong>📊 40+ Features</strong>
        <p>Comprehensive market analysis with liquidity, volume, trends, and sentiment</p>
      </div>
      <div class="feature-box">
        <strong>🔔 Real-time Alerts</strong>
        <p>Email and push notifications for high-confidence predictions</p>
      </div>
      
      <h3>Quick Start</h3>
      <p>1. Make your first API request:</p>
      <code style="background: #f0f0f0; padding: 10px; display: block; border-radius: 5px; margin: 10px 0;">
curl -H "X-API-Key: ${apiKey}" \\
  http://localhost:3000/api/markets
      </code>
      
      <center>
        <a href="http://localhost:3000/docs/api-contract.md" class="button">View API Documentation</a>
      </center>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #ddd;">
        <p>Need help? Check out our documentation or contact support.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return sendEmail({
    to,
    subject: 'Welcome to Polyscope - Your API Key Inside',
    html,
    text: `Welcome to Polyscope!\n\nYour API Key: ${apiKey}\n\nKeep this secure and never share it publicly.`
  });
};

/**
 * Sends high confidence alert email
 * @param {string} to - Recipient email
 * @param {Object} prediction - Prediction data
 * @param {Object} market - Market data
 * @returns {Promise<Object>}
 */
const sendHighConfidenceAlert = async (to, prediction, market) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .alert-badge { background: #10b981; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; margin: 10px 0; font-weight: bold; }
    .confidence { font-size: 60px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
    .urgent { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; padding: 15px 40px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-size: 18px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 HIGH CONFIDENCE ALERT</h1>
      <span class="alert-badge">IMMEDIATE ACTION RECOMMENDED</span>
    </div>
    <div class="content">
      <div class="urgent">
        <strong>⚡ High Confidence Prediction Detected</strong>
        <p>Our AI has identified a high-probability market opportunity that meets your criteria.</p>
      </div>
      
      <h2>${market.title}</h2>
      <p><strong>Predicted Outcome:</strong> ${prediction.option}</p>
      
      <div class="confidence">
        ${prediction.confidence}%
      </div>
      <center><p style="color: #10b981; font-weight: bold; font-size: 18px;">CONFIDENCE LEVEL</p></center>
      
      <div style="background: white; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0;">
        <h3>AI Analysis</h3>
        <p>${prediction.reason}</p>
      </div>
      
      <h3>Key Signals</h3>
      <ul style="background: white; padding: 20px; border-radius: 5px;">
        <li><strong>Whale Activity:</strong> ${((prediction.features.whaleFactor || 0) * 100).toFixed(0)}% - ${prediction.features.whaleFactor > 0.7 ? 'VERY HIGH' : prediction.features.whaleFactor > 0.5 ? 'HIGH' : 'MODERATE'}</li>
        <li><strong>Market Trend:</strong> ${((prediction.features.trendScore || 0) * 100).toFixed(0)}% - ${prediction.features.trendScore > 0.7 ? 'STRONG UPTREND' : 'BULLISH'}</li>
        <li><strong>Liquidity:</strong> $${(prediction.features.liquidity || 0).toLocaleString()} - ${prediction.features.liquidity > 100000 ? 'EXCELLENT' : 'GOOD'}</li>
        <li><strong>24h Volume:</strong> $${(prediction.features.volume24h || 0).toLocaleString()}</li>
      </ul>
      
      <center>
        <a href="https://polymarket.com" class="button">VIEW ON POLYMARKET →</a>
      </center>
      
      <div style="margin-top: 30px; padding: 20px; background: #fee2e2; border-radius: 5px;">
        <p><strong>⚠️ Disclaimer:</strong> This is an AI-generated prediction based on market data analysis. Always do your own research and never invest more than you can afford to lose.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return sendEmail({
    to,
    subject: `🚨 HIGH CONFIDENCE: ${market.title} - ${prediction.confidence}%`,
    html,
    text: `HIGH CONFIDENCE ALERT\n\n${market.title}\nPredicted: ${prediction.option}\nConfidence: ${prediction.confidence}%\n\nAnalysis: ${prediction.reason}`
  });
};

/**
 * Sends daily digest email
 * @param {string} to - Recipient email
 * @param {Array} predictions - Array of predictions
 * @returns {Promise<Object>}
 */
const sendDailyDigest = async (to, predictions) => {
  const topPredictions = predictions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  
  const predictionsHtml = topPredictions.map(p => `
    <div style="background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #667eea;">
      <h3 style="margin: 0 0 10px 0;">${p.market.title}</h3>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="margin: 5px 0;"><strong>Outcome:</strong> ${p.option}</p>
          <p style="margin: 5px 0;"><strong>Timeframe:</strong> ${p.timeframe}</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 36px; font-weight: bold; color: #667eea;">${p.confidence}%</div>
        </div>
      </div>
    </div>
  `).join('');
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Market Digest</h1>
      <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    <div class="content">
      <h2>Top ${topPredictions.length} Predictions Today</h2>
      ${predictionsHtml}
      
      <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 5px; text-align: center;">
        <p><strong>${predictions.length}</strong> total predictions analyzed today</p>
        <p><strong>${predictions.filter(p => p.confidence >= 70).length}</strong> high confidence opportunities</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return sendEmail({
    to,
    subject: `📊 Your Daily Polyscope Digest - ${topPredictions.length} Top Predictions`,
    html,
    text: `Daily Digest\n\nTop predictions:\n${topPredictions.map(p => `- ${p.market.title}: ${p.confidence}%`).join('\n')}`
  });
};

/**
 * Tests email connection with Brevo API
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  if (!initializeTransporter()) {
    return false;
  }
  
  try {
    // Test Brevo API connection by making a simple account request
    const response = await axios.get(
      `${BREVO_API_BASE}/account`,
      {
        headers: {
          'api-key': config.brevo.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    logger.info(`Brevo connection verified - Account: ${response.data.email}`);
    return true;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    logger.error(`Brevo connection failed: ${errorMessage}`);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendPredictionEmail,
  sendSubscriptionConfirmationEmail,
  sendWelcomeEmail,
  sendHighConfidenceAlert,
  sendDailyDigest,
  testConnection,
  initializeTransporter
};
