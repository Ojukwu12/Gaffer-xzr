/**
 * Tests for Geopolitical Data Service
 */

jest.mock('../../config/logger');
jest.mock('../../config/env');
jest.mock('../cacheService');
jest.mock('axios');

const axios = require('axios');
const geopoliticalDataService = require('../geopoliticalDataService');
const cacheService = require('../cacheService');
const config = require('../../config/env');

describe('Geopolitical Data Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getFromMemory.mockReturnValue(null);
    cacheService.setInMemory.mockImplementation(() => {});
    config.newsApiKey = 'test_news_api_key';
    config.gdeltApiKey = 'test_gdelt_api_key';
    config.externalDataCacheTtl = 900;
  });

  describe('detectCategory', () => {
    it('should detect politics category', () => {
      const marketData = { title: 'Will Biden win the 2024 election?' };
      const result = geopoliticalDataService.detectCategory(marketData);
      expect(result).toBe('politics');
    });

    it('should detect geopolitics category', () => {
      const marketData = { title: 'Will there be a ceasefire in the Israel-Gaza conflict?' };
      const result = geopoliticalDataService.detectCategory(marketData);
      expect(result).toBe('geopolitics');
    });

    it('should return null for non-political markets', () => {
      const marketData = { title: 'Will Bitcoin hit $100k?' };
      const result = geopoliticalDataService.detectCategory(marketData);
      expect(result).toBeNull();
    });
  });

  describe('scorePoliticsLayer', () => {
    it('should score politics with polling momentum and narrative shift', () => {
      const articles = [
        { title: 'Candidate A leads in latest polls with strong support' },
        { title: 'Polling shows momentum shift towards challenger' },
        { title: 'Campaign announces strong quarterly fundraising' }
      ];
      
      const result = geopoliticalDataService.scorePoliticsLayer(articles);
      
      expect(result.scores.pollingMomentumScore).toBeDefined();
      expect(result.scores.narrativeShiftScore).toBeDefined();
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
    });

    it('should return default scores for empty articles', () => {
      const result = geopoliticalDataService.scorePoliticsLayer([]);
      expect(result.compositeScore).toBe(50);
    });
  });

  describe('scoreGeopoliticalLayer', () => {
    it('should score geopolitical data with conflict, diplomacy and narrative', () => {
      const events = [
        { description: 'Military offensive reported in disputed territory', date: new Date().toISOString() },
        { description: 'Peace negotiations underway between parties', date: new Date().toISOString() }
      ];
      const articles = [
        { title: 'Diplomatic talks scheduled for next week' },
        { title: 'Military escalation reported in border region' }
      ];
      
      const result = geopoliticalDataService.scoreGeopoliticalLayer(events, articles);
      
      expect(result.scores.conflictEscalationScore).toBeDefined();
      expect(result.scores.diplomaticProgressScore).toBeDefined();
      expect(result.scores.narrativeShiftScore).toBeDefined();
      expect(result.compositeScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
    });
  });

  describe('getGeopoliticalDataLayer', () => {
    it('should return cached data if available', async () => {
      const cachedLayer = {
        applicable: true,
        sourceType: 'politics',
        compositeScore: 72,
        signalStrength: 0.85
      };
      cacheService.getFromMemory.mockReturnValue(cachedLayer);

      const marketData = { marketId: 'market123', title: 'Election prediction' };
      const result = await geopoliticalDataService.getGeopoliticalDataLayer(marketData, 'politics');

      expect(result).toEqual(cachedLayer);
      expect(cacheService.getFromMemory).toHaveBeenCalled();
    });

    it('should return default neutral layer for non-political markets', async () => {
      const marketData = { marketId: 'market456', title: 'Crypto price prediction' };
      const result = await geopoliticalDataService.getGeopoliticalDataLayer(marketData, 'crypto');

      expect(result.applicable).toBe(false);
      expect(result.compositeScore).toBe(50);
      expect(result.signalStrength).toBe(0);
    });
  });
});
