/**
 * Tests for Corporate Data Service
 */

jest.mock('../../config/logger');
jest.mock('../../config/env');
jest.mock('../cacheService');
jest.mock('axios');

const axios = require('axios');
const corporateDataService = require('../corporateDataService');
const cacheService = require('../cacheService');
const config = require('../../config/env');

describe('Corporate Data Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getFromMemory.mockReturnValue(null);
    cacheService.setInMemory.mockImplementation(() => {});
    config.newsApiKey = 'test_news_api_key';
    config.earningsApiKey = 'test_earnings_api_key';
    config.externalDataCacheTtl = 900;
  });

  describe('detectTechCompany', () => {
    it('should detect Apple from market title', () => {
      const marketData = { title: 'Will Apple release a new iPhone next quarter?' };
      const result = corporateDataService.detectTechCompany(marketData);
      expect(result).toBe('apple');
    });

    it('should detect NVIDIA from market description', () => {
      const marketData = { 
        title: 'Tech company earnings',
        description: 'NVIDIA Q3 earnings will beat expectations'
      };
      const result = corporateDataService.detectTechCompany(marketData);
      expect(result).toBe('nvidia');
    });

    it('should return null for non-tech markets', () => {
      const marketData = { title: 'Will Bitcoin hit $100k?' };
      const result = corporateDataService.detectTechCompany(marketData);
      expect(result).toBeNull();
    });
  });

  describe('extractTickerFromCompany', () => {
    it('should extract AAPL ticker for Apple', () => {
      const ticker = corporateDataService.extractTickerFromCompany('apple');
      expect(ticker).toBe('AAPL');
    });

    it('should extract MSFT ticker for Microsoft', () => {
      const ticker = corporateDataService.extractTickerFromCompany('microsoft');
      expect(ticker).toBe('MSFT');
    });

    it('should return null for unknown company', () => {
      const ticker = corporateDataService.extractTickerFromCompany('unknown-company');
      expect(ticker).toBeNull();
    });
  });

  describe('scoreCorporateLayer', () => {
    it('should score corporate data with earnings, regulatory and product momentum', () => {
      const earningsData = [
        { epsActual: 1.25, epsEstimate: 1.20, revenueActual: 100, revenueEstimate: 98 },
        { epsActual: 1.15, epsEstimate: 1.20, revenueActual: 95, revenueEstimate: 100 }
      ];
      const productArticles = [
        { title: 'Apple announces new product launch event' },
        { title: 'Innovation in smartphone design unveiled' }
      ];

      const result = corporateDataService.scoreCorporateLayer('apple', null, earningsData, productArticles);

      expect(result.scores.earningsSurpriseTrendScore).toBeDefined();
      expect(result.scores.regulatoryRiskScore).toBeDefined();
      expect(result.scores.productMomentumScore).toBeDefined();
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
    });
  });

  describe('getCorporateDataLayer', () => {
    it('should return cached data if available', async () => {
      const cachedLayer = {
        applicable: true,
        sourceType: 'corporate',
        compositeScore: 68,
        signalStrength: 0.85
      };
      cacheService.getFromMemory.mockReturnValue(cachedLayer);

      const marketData = { marketId: 'market123', title: 'Apple earnings next month' };
      const result = await corporateDataService.getCorporateDataLayer(marketData);

      expect(result).toEqual(cachedLayer);
      expect(cacheService.getFromMemory).toHaveBeenCalled();
    });

    it('should return default neutral layer for non-tech markets', async () => {
      const marketData = { marketId: 'market456', title: 'Will Bitcoin hit $100k?' };
      const result = await corporateDataService.getCorporateDataLayer(marketData);

      expect(result.applicable).toBe(false);
      expect(result.compositeScore).toBe(50);
      expect(result.signalStrength).toBe(0);
    });
  });
});
