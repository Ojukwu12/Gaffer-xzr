/**
 * Webhook Service
 * Handles webhook delivery and management
 * @module services/webhookService
 */

const axios = require('axios');
const logger = require('../config/logger');
const Webhook = require('../models/Webhook');

/**
 * Delivers webhook payload to registered URLs
 * @param {string} event - Event type
 * @param {Object} data - Event data
 * @returns {Promise<Object>} Delivery results
 */
const deliverWebhook = async (event, data) => {
  logger.info(`Delivering webhooks for event: ${event}`);
  
  // Find active webhooks for this event
  const webhooks = await Webhook.find({
    isActive: true,
    events: event
  });
  
  if (webhooks.length === 0) {
    logger.debug(`No active webhooks for event: ${event}`);
    return { delivered: 0, failed: 0 };
  }
  
  const results = {
    delivered: 0,
    failed: 0,
    errors: []
  };
  
  // Deliver to each webhook
  for (const webhook of webhooks) {
    // Check if webhook should receive this event
    if (!webhook.shouldReceiveEvent(event, data)) {
      continue;
    }
    
    const payload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      webhookId: webhook._id
    };
    
    const signature = webhook.generateSignature(payload);
    
    await deliverToWebhook(webhook, payload, signature, results);
  }
  
  logger.info(`Webhook delivery complete: ${results.delivered} delivered, ${results.failed} failed`);
  
  return results;
};

/**
 * Delivers payload to a single webhook with retry logic
 * @param {Object} webhook - Webhook document
 * @param {Object} payload - Payload to send
 * @param {string} signature - HMAC signature
 * @param {Object} results - Results object to update
 */
const deliverToWebhook = async (webhook, payload, signature, results) => {
  let attempt = 0;
  let delivered = false;
  
  while (attempt <= webhook.retryConfig.maxRetries && !delivered) {
    try {
      await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'User-Agent': 'Polyscope-Webhook/1.0'
        },
        timeout: 10000
      });
      
      await webhook.recordSuccess();
      results.delivered++;
      delivered = true;
      
      logger.info(`Webhook delivered successfully: ${webhook.url}`);
      
    } catch (error) {
      attempt++;
      
      if (attempt > webhook.retryConfig.maxRetries) {
        await webhook.recordFailure(error.message);
        results.failed++;
        results.errors.push({
          url: webhook.url,
          error: error.message
        });
        
        logger.error(`Webhook delivery failed after ${attempt} attempts: ${webhook.url}`, {
          error: error.message
        });
      } else {
        logger.warn(`Webhook delivery attempt ${attempt} failed, retrying...`, {
          url: webhook.url,
          error: error.message
        });
        
        // Wait before retry
        await new Promise(resolve => 
          setTimeout(resolve, webhook.retryConfig.retryDelay)
        );
      }
    }
  }
};

/**
 * Triggers prediction webhook
 * @param {Object} prediction - Prediction data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>}
 */
const triggerPredictionWebhook = async (prediction, marketData) => {
  const event = 'prediction.created';
  const data = {
    marketId: marketData.marketId,
    marketTitle: marketData.title,
    option: prediction.option,
    confidence: prediction.confidence,
    reason: prediction.reason,
    timeframe: prediction.timeframe,
    features: prediction.features
  };
  
  return deliverWebhook(event, data);
};

/**
 * Triggers high confidence webhook
 * @param {Object} prediction - Prediction data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>}
 */
const triggerHighConfidenceWebhook = async (prediction, marketData) => {
  if (prediction.confidence >= 80) {
    const event = 'high.confidence';
    const data = {
      marketId: marketData.marketId,
      marketTitle: marketData.title,
      option: prediction.option,
      confidence: prediction.confidence,
      reason: prediction.reason
    };
    
    return deliverWebhook(event, data);
  }
  
  return { delivered: 0, failed: 0 };
};

/**
 * Cleans up failed webhooks
 * @returns {Promise<Object>}
 */
const cleanupFailedWebhooks = async () => {
  const result = await Webhook.deleteMany({
    isActive: false,
    consecutiveFailures: { $gte: 10 },
    updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 days old
  });
  
  logger.info(`Cleaned up ${result.deletedCount} failed webhooks`);
  
  return result;
};

module.exports = {
  deliverWebhook,
  triggerPredictionWebhook,
  triggerHighConfidenceWebhook,
  cleanupFailedWebhooks
};
