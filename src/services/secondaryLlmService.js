/**
 * Secondary LLM Service
 * Handles interactions with Claude 3.5 Sonnet as a fallback when Gemini is rate-limited
 * @module services/secondaryLlmService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

/**
 * Generate prediction using Claude via Anthropic API
 * @param {string} prompt - The full prompt to send to Claude
 * @returns {Promise<string>} Claude's response text
 */
const generateClaudePrediction = async (prompt) => {
  if (!config.secondaryLlmApiKey) {
    throw new CustomError('Claude API key not configured', 500, 'CLAUDE_NOT_CONFIGURED');
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.secondaryLlmModel,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'x-api-key': config.secondaryLlmApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (!response.data?.content?.[0]?.text) {
      throw new Error('Invalid Claude response structure');
    }

    return response.data.content[0].text;
  } catch (error) {
    if (error?.response?.status === 429) {
      throw new CustomError('Claude rate limited', 429, 'CLAUDE_RATE_LIMITED');
    }
    throw error;
  }
};

/**
 * Generate prediction using Ollama (self-hosted local LLM)
 * @param {string} prompt - The full prompt to send to Ollama
 * @returns {Promise<string>} Ollama's response text
 */
const generateOllamaPrediction = async (prompt) => {
  if (!config.ollamaBaseUrl) {
    throw new CustomError('Ollama base URL not configured', 500, 'OLLAMA_NOT_CONFIGURED');
  }

  try {
    const response = await axios.post(
      `${config.ollamaBaseUrl}/api/generate`,
      {
        model: 'mistral', // or 'llama2', adjust based on what's available
        prompt: prompt,
        stream: false,
        temperature: 0.7
      },
      {
        timeout: 60000 // Ollama can be slower since it's local
      }
    );

    if (!response.data?.response) {
      throw new Error('Invalid Ollama response structure');
    }

    return response.data.response;
  } catch (error) {
    logger.error('Ollama request failed:', error.message);
    throw new CustomError('Ollama request failed', 500, 'OLLAMA_ERROR', {
      details: error.message
    });
  }
};

/**
 * Generate prediction using the configured secondary LLM
 * @param {string} prompt - The full prompt
 * @returns {Promise<string>} Response from secondary LLM
 */
const generateSecondaryPrediction = async (prompt) => {
  const provider = config.secondaryLlmProvider?.toLowerCase();

  if (!provider) {
    throw new CustomError('No secondary LLM provider configured', 500, 'NO_SECONDARY_LLM');
  }

  if (provider === 'claude') {
    logger.info('Using Claude 3.5 Sonnet as secondary LLM');
    return generateClaudePrediction(prompt);
  } else if (provider === 'ollama') {
    logger.info('Using Ollama as secondary LLM');
    return generateOllamaPrediction(prompt);
  } else {
    throw new CustomError(`Unknown secondary LLM provider: ${provider}`, 500, 'UNKNOWN_PROVIDER');
  }
};

/**
 * Test secondary LLM connection
 * @returns {Promise<boolean>}
 */
const testSecondaryConnection = async () => {
  try {
    const provider = config.secondaryLlmProvider?.toLowerCase();
    
    if (!provider) {
      logger.warn('No secondary LLM provider configured');
      return false;
    }

    const testPrompt = 'Respond with only "OK" to confirm your working.';
    const response = await generateSecondaryPrediction(testPrompt);
    
    logger.info(`Secondary LLM (${provider}) test response:`, response.substring(0, 100));
    return response.toLowerCase().includes('ok');
  } catch (error) {
    logger.error('Secondary LLM connection test failed:', error.message);
    return false;
  }
};

module.exports = {
  generateSecondaryPrediction,
  generateClaudePrediction,
  generateOllamaPrediction,
  testSecondaryConnection
};
