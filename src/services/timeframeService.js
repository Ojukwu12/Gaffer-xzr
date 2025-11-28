/**
 * Timeframe Service
 * Handles timeframe-specific market filtering and analysis
 * @module services/timeframeService
 */

const logger = require('../config/logger');
const { TIMEFRAMES } = require('../config/features');

/**
 * Determines which timeframes are available for a market
 * @param {Object} marketData - Market data
 * @returns {Array<string>} Available timeframes
 */
const getAvailableTimeframes = (marketData) => {
  const availableTimeframes = [];
  
  if (!marketData || !marketData.endDate) {
    // If no end date, assume all timeframes are available
    return Object.keys(TIMEFRAMES).filter(tf => TIMEFRAMES[tf].enabled);
  }
  
  const now = new Date();
  const endDate = new Date(marketData.endDate);
  const hoursUntilExpiry = (endDate - now) / (1000 * 60 * 60);
  
  // Check each timeframe
  Object.entries(TIMEFRAMES).forEach(([key, config]) => {
    if (!config.enabled) return;
    
    // Market should have enough time remaining for the timeframe to be relevant
    if (hoursUntilExpiry >= config.hours) {
      availableTimeframes.push(key);
    }
  });
  
  // If no timeframes available but market is still active, include daily
  if (availableTimeframes.length === 0 && hoursUntilExpiry > 0) {
    availableTimeframes.push('daily');
  }
  
  return availableTimeframes;
};

/**
 * Filters markets based on timeframe availability
 * @param {Array} markets - Array of market objects
 * @param {string} timeframe - Desired timeframe
 * @returns {Array} Filtered markets
 */
const filterMarketsByTimeframe = (markets, timeframe) => {
  if (!timeframe || !TIMEFRAMES[timeframe]) {
    return markets;
  }
  
  return markets.filter(market => {
    const available = getAvailableTimeframes(market);
    return available.includes(timeframe);
  });
};

/**
 * Gets timeframe configuration
 * @param {string} timeframe - Timeframe key
 * @returns {Object|null}
 */
const getTimeframeConfig = (timeframe) => {
  return TIMEFRAMES[timeframe] || null;
};

/**
 * Validates timeframe
 * @param {string} timeframe - Timeframe to validate
 * @returns {boolean}
 */
const isValidTimeframe = (timeframe) => {
  return timeframe && TIMEFRAMES[timeframe] && TIMEFRAMES[timeframe].enabled;
};

/**
 * Gets all enabled timeframes
 * @returns {Array<string>}
 */
const getEnabledTimeframes = () => {
  return Object.keys(TIMEFRAMES).filter(key => TIMEFRAMES[key].enabled);
};

/**
 * Calculates timeframe-specific features
 * @param {Object} marketData - Market data
 * @param {string} timeframe - Timeframe
 * @returns {Object} Timeframe-specific metrics
 */
const calculateTimeframeFeatures = (marketData, timeframe) => {
  const config = getTimeframeConfig(timeframe);
  
  if (!config) {
    return {
      timeframeValid: false,
      relevanceScore: 0
    };
  }
  
  const now = new Date();
  const endDate = marketData.endDate ? new Date(marketData.endDate) : null;
  const createdDate = marketData.createdAt ? new Date(marketData.createdAt) : null;
  
  let relevanceScore = 1.0;
  
  // Calculate relevance based on time remaining
  if (endDate) {
    const hoursUntilExpiry = (endDate - now) / (1000 * 60 * 60);
    
    // Lower relevance if market expires too soon for the timeframe
    if (hoursUntilExpiry < config.hours) {
      relevanceScore = Math.max(0.3, hoursUntilExpiry / config.hours);
    }
    
    // Lower relevance if market expires too far in the future
    if (hoursUntilExpiry > config.hours * 10) {
      relevanceScore = Math.max(0.5, 1 - (hoursUntilExpiry - config.hours * 10) / (config.hours * 10));
    }
  }
  
  // Calculate market maturity for timeframe
  let maturityScore = 1.0;
  if (createdDate) {
    const marketAge = (now - createdDate) / (1000 * 60 * 60); // hours
    
    // Markets should have some history for longer timeframes
    if (timeframe === 'weekly' && marketAge < 48) {
      maturityScore = marketAge / 48;
    } else if (timeframe === 'monthly' && marketAge < 168) {
      maturityScore = marketAge / 168;
    }
  }
  
  return {
    timeframeValid: true,
    timeframe: timeframe,
    timeframeLabel: config.label,
    timeframeHours: config.hours,
    relevanceScore: Math.round(relevanceScore * 100) / 100,
    maturityScore: Math.round(maturityScore * 100) / 100,
    hoursUntilExpiry: endDate ? Math.round((endDate - now) / (1000 * 60 * 60)) : null
  };
};

/**
 * Determines optimal timeframe for a market
 * @param {Object} marketData - Market data
 * @returns {string} Optimal timeframe
 */
const getOptimalTimeframe = (marketData) => {
  const available = getAvailableTimeframes(marketData);
  
  if (available.length === 0) {
    return 'daily'; // Default fallback
  }
  
  if (!marketData.endDate) {
    return 'weekly'; // Default for markets without expiry
  }
  
  const now = new Date();
  const endDate = new Date(marketData.endDate);
  const daysUntilExpiry = (endDate - now) / (1000 * 60 * 60 * 24);
  
  // Choose based on time until expiry
  if (daysUntilExpiry <= 3) {
    return 'daily';
  } else if (daysUntilExpiry <= 14) {
    return 'weekly';
  } else {
    return 'monthly';
  }
};

/**
 * Groups markets by timeframe availability
 * @param {Array} markets - Array of markets
 * @returns {Object} Markets grouped by timeframe
 */
const groupMarketsByTimeframe = (markets) => {
  const grouped = {
    daily: [],
    weekly: [],
    monthly: [],
    all: markets
  };
  
  markets.forEach(market => {
    const available = getAvailableTimeframes(market);
    available.forEach(timeframe => {
      if (grouped[timeframe]) {
        grouped[timeframe].push(market);
      }
    });
  });
  
  return grouped;
};

/**
 * Enriches market data with timeframe information
 * @param {Object} market - Market object
 * @returns {Object} Enriched market object
 */
const enrichMarketWithTimeframes = (market) => {
  const availableTimeframes = getAvailableTimeframes(market);
  const optimalTimeframe = getOptimalTimeframe(market);
  
  return {
    ...market,
    timeframes: {
      available: availableTimeframes,
      optimal: optimalTimeframe,
      details: availableTimeframes.reduce((acc, tf) => {
        acc[tf] = calculateTimeframeFeatures(market, tf);
        return acc;
      }, {})
    }
  };
};

module.exports = {
  getAvailableTimeframes,
  filterMarketsByTimeframe,
  getTimeframeConfig,
  isValidTimeframe,
  getEnabledTimeframes,
  calculateTimeframeFeatures,
  getOptimalTimeframe,
  groupMarketsByTimeframe,
  enrichMarketWithTimeframes
};
