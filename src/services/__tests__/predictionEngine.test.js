const predictionEngine = require('../predictionEngine');

describe('Prediction Engine - Feature Calculation', () => {
  const mockMarket = {
    id: 'test-market-123',
    question: 'Will Bitcoin reach $100k by end of 2024?',
    slug: 'bitcoin-100k-2024',
    options: [
      {
        id: 'yes-option',
        name: 'Yes',
        price: 0.65,
        volume_24h: 50000,
        liquidity: 100000,
        totalShares: 150000,
      },
      {
        id: 'no-option',
        name: 'No',
        price: 0.35,
        volume_24h: 30000,
        liquidity: 80000,
        totalShares: 100000,
      },
    ],
    volume_24h: 80000,
    liquidity: 180000,
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    tags: ['Crypto', 'Bitcoin'],
    status: 'active',
  };

  describe('calculateLiquidityMetrics', () => {
    it('should calculate liquidity metrics correctly', () => {
      const metrics = predictionEngine.calculateLiquidityMetrics(mockMarket);
      
      expect(metrics).toHaveProperty('totalLiquidity');
      expect(metrics).toHaveProperty('avgLiquidityPerOption');
      expect(metrics).toHaveProperty('liquidityScore');
      expect(metrics).toHaveProperty('volumeToLiquidityRatio');
      expect(metrics).toHaveProperty('liquidityHealth');
      
      expect(metrics.totalLiquidity).toBe(180000);
      expect(metrics.avgLiquidityPerOption).toBe(90000);
      expect(metrics.liquidityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.liquidityScore).toBeLessThanOrEqual(100);
    });

    it('should handle missing liquidity data', () => {
      const marketWithoutLiquidity = { ...mockMarket, liquidity: 0 };
      const metrics = predictionEngine.calculateLiquidityMetrics(marketWithoutLiquidity);
      
      expect(metrics.totalLiquidity).toBe(0);
      expect(metrics.liquidityHealth).toBe('critical');
    });
  });

  describe('calculateVolumeMetrics', () => {
    it('should calculate volume metrics correctly', () => {
      const metrics = predictionEngine.calculateVolumeMetrics(mockMarket);
      
      expect(metrics).toHaveProperty('totalVolume24h');
      expect(metrics).toHaveProperty('avgVolumePerOption');
      expect(metrics).toHaveProperty('volumeScore');
      expect(metrics).toHaveProperty('volumeConcentration');
      
      expect(metrics.totalVolume24h).toBe(80000);
      expect(metrics.avgVolumePerOption).toBe(40000);
      expect(metrics.volumeScore).toBeGreaterThanOrEqual(0);
      expect(metrics.volumeScore).toBeLessThanOrEqual(100);
    });
  });

  describe('calculatePriceDistribution', () => {
    it('should calculate price distribution correctly', () => {
      const distribution = predictionEngine.calculatePriceDistribution(mockMarket);
      
      expect(distribution).toHaveProperty('priceSpread');
      expect(distribution).toHaveProperty('priceImbalance');
      expect(distribution).toHaveProperty('optionPrices');
      expect(distribution).toHaveProperty('marketConsensus');
      
      expect(distribution.optionPrices).toHaveLength(2);
      expect(distribution.priceSpread).toBe(0.3);
      expect(Math.abs(distribution.priceImbalance)).toBeGreaterThan(0);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect no anomalies in a healthy market', () => {
      const anomalies = predictionEngine.detectAnomalies(mockMarket);
      
      expect(Array.isArray(anomalies)).toBe(true);
      // Healthy market should have few or no anomalies
      expect(anomalies.length).toBeLessThan(3);
    });

    it('should detect low liquidity anomaly', () => {
      const lowLiquidityMarket = { ...mockMarket, liquidity: 500 };
      const anomalies = predictionEngine.detectAnomalies(lowLiquidityMarket);
      
      expect(anomalies.some(a => a.type === 'low_liquidity')).toBe(true);
    });

    it('should detect price sum anomaly', () => {
      const invalidPriceMarket = {
        ...mockMarket,
        options: [
          { ...mockMarket.options[0], price: 0.7 },
          { ...mockMarket.options[1], price: 0.5 },
        ],
      };
      const anomalies = predictionEngine.detectAnomalies(invalidPriceMarket);
      
      expect(anomalies.some(a => a.type === 'price_sum_anomaly')).toBe(true);
    });
  });

  describe('validateMarket', () => {
    it('should validate a healthy market', () => {
      const validation = predictionEngine.validateMarket(mockMarket);
      
      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      expect(validation).toHaveProperty('score');
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.score).toBeGreaterThan(50);
    });

    it('should invalidate market with missing required fields', () => {
      const invalidMarket = { ...mockMarket, id: undefined, question: undefined };
      const validation = predictionEngine.validateMarket(invalidMarket);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should warn about low liquidity', () => {
      const lowLiquidityMarket = { ...mockMarket, liquidity: 5000 };
      const validation = predictionEngine.validateMarket(lowLiquidityMarket);
      
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some(w => w.includes('liquidity'))).toBe(true);
    });
  });

  describe('generateMarketSummary', () => {
    it('should generate comprehensive market summary', () => {
      const summary = predictionEngine.generateMarketSummary(mockMarket, {
        liquidityMetrics: predictionEngine.calculateLiquidityMetrics(mockMarket),
        volumeMetrics: predictionEngine.calculateVolumeMetrics(mockMarket),
      });
      
      expect(summary).toHaveProperty('quality');
      expect(summary).toHaveProperty('activity');
      expect(summary).toHaveProperty('risks');
      expect(summary).toHaveProperty('opportunities');
      
      expect(Array.isArray(summary.risks)).toBe(true);
      expect(Array.isArray(summary.opportunities)).toBe(true);
    });
  });

  describe('calculateMarketScore', () => {
    it('should return a score between 0 and 100', () => {
      const score = predictionEngine.calculateMarketScore(mockMarket);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give higher scores to healthier markets', () => {
      const healthyMarket = {
        ...mockMarket,
        liquidity: 500000,
        volume_24h: 200000,
      };
      const unhealthyMarket = {
        ...mockMarket,
        liquidity: 1000,
        volume_24h: 100,
      };
      
      const healthyScore = predictionEngine.calculateMarketScore(healthyMarket);
      const unhealthyScore = predictionEngine.calculateMarketScore(unhealthyMarket);
      
      expect(healthyScore).toBeGreaterThan(unhealthyScore);
    });
  });
});

describe('Prediction Engine - Edge Cases', () => {
  it('should handle empty options array', () => {
    const market = {
      id: 'test',
      question: 'Test?',
      options: [],
      liquidity: 0,
      volume_24h: 0,
    };
    
    const validation = predictionEngine.validateMarket(market);
    expect(validation.isValid).toBe(false);
  });

  it('should handle null market', () => {
    const validation = predictionEngine.validateMarket(null);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should handle market with single option', () => {
    const market = {
      id: 'test',
      question: 'Test?',
      options: [{ id: '1', name: 'Yes', price: 0.5 }],
      liquidity: 10000,
      volume_24h: 1000,
    };
    
    const validation = predictionEngine.validateMarket(market);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });
});
