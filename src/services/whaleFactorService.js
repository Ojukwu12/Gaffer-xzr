/**
 * Whale Factor Service
 * Calculates whale influence and smart money metrics
 * @module services/whaleFactorService
 */

const logger = require('../config/logger');
const { WHALE_THRESHOLDS } = require('../config/features');
const polymarketService = require('./polymarketService');

/**
 * Calculates whale factor for a market
 * @param {string} marketId - Market ID
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>} Whale metrics
 */
const calculateWhaleFactor = async (marketId, marketData) => {
  logger.info(`Calculating whale factor for market: ${marketId}`);
  
  // Fetch top traders for the market
  const traders = await polymarketService.fetchTopTraders(marketId, 50).catch(() => []);
  
  if (!traders || traders.length === 0) {
    logger.warn(`No trader data available for market: ${marketId}`);
    return getDefaultWhaleMetrics();
  }
  
  // Calculate individual whale scores
  const whaleScores = await Promise.all(
    traders.map(trader => calculateTraderWhaleScore(trader, marketData))
  );
  
  // Filter actual whales
  const whales = whaleScores.filter(w => w.isWhale);
  
  // Calculate aggregate metrics
  const totalVolume = traders.reduce((sum, t) => sum + (t.volume || 0), 0);
  const whaleVolume = whales.reduce((sum, w) => sum + (w.volume || 0), 0);
  const whaleCount = whales.length;
  
  // Calculate whale factor (0-1)
  const volumeRatio = totalVolume > 0 ? whaleVolume / totalVolume : 0;
  const participationRatio = traders.length > 0 ? whaleCount / traders.length : 0;
  
  const whaleFactor = (
    volumeRatio * 0.6 +           // 60% weight on volume dominance
    participationRatio * 0.4      // 40% weight on participation
  );
  
  // Calculate smart money direction
  const smartMoneyDirection = calculateSmartMoneyDirection(whales);
  
  // Calculate smart money flow
  const smartMoneyFlow = whales.reduce((sum, w) => {
    return sum + (w.recentVolume || 0) * (w.profitability || 0);
  }, 0);
  
  logger.info(`Whale factor calculated: ${whaleFactor.toFixed(3)}, whales: ${whaleCount}`);
  
  return {
    whaleFactor: Math.min(1, whaleFactor),
    whaleCount,
    whaleVolume,
    smartMoneyDirection,
    smartMoneyFlow,
    topWhales: whales.slice(0, 10).map(w => ({
      address: w.address,
      volume: w.volume,
      profitability: w.profitability,
      score: w.score
    }))
  };
};

/**
 * Calculates whale score for individual trader
 * @param {Object} trader - Trader data
 * @param {Object} marketData - Market data
 * @returns {Promise<Object>} Trader whale metrics
 */
const calculateTraderWhaleScore = async (trader, marketData) => {
  const volume = trader.volume || trader.totalVolume || 0;
  const tradeCount = trader.trades || trader.tradeCount || 0;
  const profitability = trader.profitability || trader.pnl || 0;
  
  // Normalize metrics
  const volumeScore = Math.min(1, volume / (marketData.volume || 1));
  const tradeFrequency = Math.min(1, tradeCount / 100);
  
  // Profitability score (normalize to 0-1)
  const profitabilityScore = profitability > 0 
    ? Math.min(1, Math.abs(profitability) / 10000)
    : 0;
  
  // Calculate composite whale score
  const score = (
    volumeScore * WHALE_THRESHOLDS.volumeWeight +
    profitabilityScore * WHALE_THRESHOLDS.profitabilityWeight +
    tradeFrequency * WHALE_THRESHOLDS.frequencyWeight
  );
  
  // Determine if trader qualifies as whale
  const isWhale = volume >= WHALE_THRESHOLDS.minVolumeUSD && 
                  tradeCount >= WHALE_THRESHOLDS.minTradeCount;
  
  return {
    address: trader.address || trader.id,
    volume,
    tradeCount,
    profitability,
    score,
    isWhale,
    recentVolume: trader.volume24h || volume * 0.1 // Estimate if not available
  };
};

/**
 * Calculates smart money direction
 * @param {Array} whales - Array of whale traders
 * @returns {number} Direction score (-1 to 1)
 */
const calculateSmartMoneyDirection = (whales) => {
  if (!whales || whales.length === 0) return 0;
  
  // Calculate weighted direction based on profitable whales
  let bullishWeight = 0;
  let bearishWeight = 0;
  
  whales.forEach(whale => {
    const weight = whale.volume * (whale.profitability > 0 ? 1 : 0);
    
    // Assume direction based on recent activity (simplified)
    // In production, this would analyze actual position changes
    if (whale.recentVolume > whale.volume * 0.2) {
      bullishWeight += weight;
    } else {
      bearishWeight += weight;
    }
  });
  
  const totalWeight = bullishWeight + bearishWeight;
  if (totalWeight === 0) return 0;
  
  // Return normalized direction (-1 = bearish, 1 = bullish)
  return (bullishWeight - bearishWeight) / totalWeight;
};

/**
 * Gets default whale metrics when data is unavailable
 * @returns {Object}
 */
const getDefaultWhaleMetrics = () => {
  return {
    whaleFactor: 0.3, // Default moderate whale influence
    whaleCount: 0,
    whaleVolume: 0,
    smartMoneyDirection: 0,
    smartMoneyFlow: 0,
    topWhales: []
  };
};

/**
 * Analyzes whale behavior patterns
 * @param {string} marketId - Market ID
 * @param {string} timeframe - Analysis timeframe
 * @returns {Promise<Object>}
 */
const analyzeWhaleBehavior = async (marketId, timeframe = '24h') => {
  logger.info(`Analyzing whale behavior for market: ${marketId}, timeframe: ${timeframe}`);
  
  const trades = await polymarketService.fetchMarketTrades(marketId, { limit: 500 }).catch(() => []);
  
  if (!trades || trades.length === 0) {
    return {
      pattern: 'unknown',
      confidence: 0,
      description: 'Insufficient trade data'
    };
  }
  
  // Analyze large trades
  const largeTrades = trades.filter(t => (t.size || 0) > 1000);
  const buyPressure = largeTrades.filter(t => t.side === 'buy').length;
  const sellPressure = largeTrades.filter(t => t.side === 'sell').length;
  
  let pattern = 'neutral';
  let confidence = 0.5;
  
  if (buyPressure > sellPressure * 1.5) {
    pattern = 'accumulation';
    confidence = Math.min(0.9, buyPressure / (buyPressure + sellPressure));
  } else if (sellPressure > buyPressure * 1.5) {
    pattern = 'distribution';
    confidence = Math.min(0.9, sellPressure / (buyPressure + sellPressure));
  }
  
  return {
    pattern,
    confidence,
    largeTrades: largeTrades.length,
    buyPressure,
    sellPressure,
    description: getPatternDescription(pattern)
  };
};

/**
 * Gets description for whale behavior pattern
 * @param {string} pattern - Pattern type
 * @returns {string}
 */
const getPatternDescription = (pattern) => {
  const descriptions = {
    accumulation: 'Whales are accumulating positions, indicating bullish sentiment',
    distribution: 'Whales are distributing positions, indicating bearish sentiment',
    neutral: 'No clear whale direction detected',
    unknown: 'Insufficient data to determine whale behavior'
  };
  
  return descriptions[pattern] || descriptions.unknown;
};

/**
 * Calculates trending whale wallets
 * @returns {Promise<Array>}
 */
const getTrendingWhales = async () => {
  // This would fetch from Polymarket's trending traders API
  // Simplified implementation
  logger.info('Fetching trending whale wallets');
  
  return [
    // Placeholder for trending whales
    // In production, this would fetch real data
  ];
};

module.exports = {
  calculateWhaleFactor,
  calculateTraderWhaleScore,
  analyzeWhaleBehavior,
  getTrendingWhales,
  getDefaultWhaleMetrics
};
