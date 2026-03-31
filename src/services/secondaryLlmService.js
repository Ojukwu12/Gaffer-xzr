/**
 * Secondary LLM Service
 * Handles fallback LLM providers when Gemini is rate-limited
 * @module services/secondaryLlmService
 */

const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config/env');
const CustomError = require('../utils/CustomError');

const CHAT_COMPLETIONS_TIMEOUT_MS = 30000;

const parseProviderChain = (value = '') => {
  return String(value || '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
};

const extractChatCompletionsText = (responseData) => {
  return responseData?.choices?.[0]?.message?.content || '';
};

const createProviderError = ({ provider, status, errorCode, message, responseData, requestId }) => {
  return new CustomError(message, status || 500, errorCode, {
    provider,
    status: status || 500,
    requestId: requestId || null,
    responseData: responseData || null
  });
};

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
    const status = error?.response?.status || 500;
    const responseData = error?.response?.data || null;
    const requestId = error?.response?.headers?.['request-id'] || error?.response?.headers?.['x-request-id'] || null;

    logger.error('Claude API request failed', {
      status,
      model: config.secondaryLlmModel,
      requestId,
      message: error?.message,
      responseData
    });

    if (status === 429) {
      throw new CustomError('Claude rate limited', 429, 'CLAUDE_RATE_LIMITED');
    }

    throw new CustomError('Claude request failed', status, 'CLAUDE_REQUEST_FAILED', {
      status,
      requestId,
      responseData,
      message: error?.message
    });
  }
};

/**
 * Generate prediction using Groq API (OpenAI-compatible endpoint)
 * @param {string} prompt - The full prompt
 * @returns {Promise<string>} Groq response text
 */
const generateGroqPrediction = async (prompt) => {
  if (!config.groqApiKey) {
    throw new CustomError('Groq API key not configured', 500, 'GROQ_NOT_CONFIGURED');
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: config.groqModel,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          'content-type': 'application/json'
        },
        timeout: CHAT_COMPLETIONS_TIMEOUT_MS
      }
    );

    const text = extractChatCompletionsText(response.data);
    if (!text) {
      throw new Error('Invalid Groq response structure');
    }

    return text;
  } catch (error) {
    const status = error?.response?.status || 500;
    const responseData = error?.response?.data || null;
    const requestId = error?.response?.headers?.['x-request-id'] || null;

    logger.warn('Groq API request failed', {
      status,
      model: config.groqModel,
      requestId,
      message: error?.message,
      responseData
    });

    throw createProviderError({
      provider: 'groq',
      status,
      errorCode: status === 429 ? 'GROQ_RATE_LIMITED' : 'GROQ_REQUEST_FAILED',
      message: status === 429 ? 'Groq rate limited' : 'Groq request failed',
      responseData,
      requestId
    });
  }
};

/**
 * Generate prediction using OpenRouter API
 * @param {string} prompt - The full prompt
 * @returns {Promise<string>} OpenRouter response text
 */
const generateOpenRouterPrediction = async (prompt) => {
  if (!config.openRouterApiKey) {
    throw new CustomError('OpenRouter API key not configured', 500, 'OPENROUTER_NOT_CONFIGURED');
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: config.openRouterModel,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          'content-type': 'application/json',
          'HTTP-Referer': config.appUrl,
          'X-Title': 'Polyscope'
        },
        timeout: CHAT_COMPLETIONS_TIMEOUT_MS
      }
    );

    const text = extractChatCompletionsText(response.data);
    if (!text) {
      throw new Error('Invalid OpenRouter response structure');
    }

    return text;
  } catch (error) {
    const status = error?.response?.status || 500;
    const responseData = error?.response?.data || null;
    const requestId = error?.response?.headers?.['x-request-id'] || null;

    logger.warn('OpenRouter API request failed', {
      status,
      model: config.openRouterModel,
      requestId,
      message: error?.message,
      responseData
    });

    throw createProviderError({
      provider: 'openrouter',
      status,
      errorCode: status === 429 ? 'OPENROUTER_RATE_LIMITED' : 'OPENROUTER_REQUEST_FAILED',
      message: status === 429 ? 'OpenRouter rate limited' : 'OpenRouter request failed',
      responseData,
      requestId
    });
  }
};

/**
 * Generate prediction using OpenAI API
 * @param {string} prompt - The full prompt
 * @returns {Promise<string>} OpenAI response text
 */
const generateOpenAiPrediction = async (prompt) => {
  if (!config.openAiApiKey) {
    throw new CustomError('OpenAI API key not configured', 500, 'OPENAI_NOT_CONFIGURED');
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.openAiModel,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          'content-type': 'application/json'
        },
        timeout: CHAT_COMPLETIONS_TIMEOUT_MS
      }
    );

    const text = extractChatCompletionsText(response.data);
    if (!text) {
      throw new Error('Invalid OpenAI response structure');
    }

    return text;
  } catch (error) {
    const status = error?.response?.status || 500;
    const responseData = error?.response?.data || null;
    const requestId = error?.response?.headers?.['x-request-id'] || null;

    logger.warn('OpenAI API request failed', {
      status,
      model: config.openAiModel,
      requestId,
      message: error?.message,
      responseData
    });

    throw createProviderError({
      provider: 'openai',
      status,
      errorCode: status === 429 ? 'OPENAI_RATE_LIMITED' : 'OPENAI_REQUEST_FAILED',
      message: status === 429 ? 'OpenAI rate limited' : 'OpenAI request failed',
      responseData,
      requestId
    });
  }
};

const runSingleProvider = async (provider, prompt) => {
  if (provider === 'claude') {
    logger.info('Using Claude as fallback LLM provider');
    return generateClaudePrediction(prompt);
  }
  if (provider === 'ollama') {
    logger.info('Using Ollama as fallback LLM provider');
    return generateOllamaPrediction(prompt);
  }
  if (provider === 'groq') {
    logger.info('Using Groq as fallback LLM provider');
    return generateGroqPrediction(prompt);
  }
  if (provider === 'openrouter') {
    logger.info('Using OpenRouter as fallback LLM provider');
    return generateOpenRouterPrediction(prompt);
  }
  if (provider === 'openai') {
    logger.info('Using OpenAI as fallback LLM provider');
    return generateOpenAiPrediction(prompt);
  }

  throw new CustomError(`Unknown fallback LLM provider: ${provider}`, 500, 'UNKNOWN_PROVIDER');
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
        model: config.secondaryLlmModel || 'mistral',
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

  if (provider !== 'auto') {
    return runSingleProvider(provider, prompt);
  }

  const chain = parseProviderChain(config.secondaryLlmFallbackChain);
  if (chain.length === 0) {
    throw new CustomError('Secondary fallback chain is empty', 500, 'EMPTY_FALLBACK_CHAIN');
  }

  const providerErrors = [];
  for (const currentProvider of chain) {
    try {
      logger.info(`Attempting fallback provider: ${currentProvider}`);
      return await runSingleProvider(currentProvider, prompt);
    } catch (error) {
      providerErrors.push({
        provider: currentProvider,
        message: error?.message,
        status: error?.statusCode || error?.status || null,
        code: error?.errorCode || null,
        details: error?.details || null
      });
      logger.warn(`Fallback provider failed: ${currentProvider}`, providerErrors[providerErrors.length - 1]);
    }
  }

  throw new CustomError('All fallback LLM providers failed', 503, 'ALL_FALLBACKS_FAILED', {
    chain,
    providerErrors
  });
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
  generateGroqPrediction,
  generateOpenRouterPrediction,
  generateOpenAiPrediction,
  generateOllamaPrediction,
  testSecondaryConnection
};
