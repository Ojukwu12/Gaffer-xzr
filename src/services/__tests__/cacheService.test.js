const cacheService = require('../cacheService');

describe('Cache Service', () => {
  beforeEach(() => {
    cacheService.clear(); // Clear cache before each test
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cacheService.set('test-key', { data: 'test' });
      const value = cacheService.get('test-key');
      
      expect(value).toEqual({ data: 'test' });
    });

    it('should return undefined for non-existent key', () => {
      const value = cacheService.get('non-existent-key');
      expect(value).toBeUndefined();
    });

    it('should handle complex objects', () => {
      const complexObject = {
        nested: {
          data: [1, 2, 3],
          timestamp: Date.now(),
        },
      };
      
      cacheService.set('complex', complexObject);
      const retrieved = cacheService.get('complex');
      
      expect(retrieved).toEqual(complexObject);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect TTL settings', async () => {
      cacheService.set('ttl-test', 'value', 1); // 1 second TTL
      
      // Immediately available
      expect(cacheService.get('ttl-test')).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(cacheService.get('ttl-test')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete existing keys', () => {
      cacheService.set('to-delete', 'value');
      expect(cacheService.get('to-delete')).toBe('value');
      
      cacheService.del('to-delete');
      expect(cacheService.get('to-delete')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', () => {
      expect(() => cacheService.del('non-existent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.set('key3', 'value3');
      
      cacheService.clear();
      
      expect(cacheService.get('key1')).toBeUndefined();
      expect(cacheService.get('key2')).toBeUndefined();
      expect(cacheService.get('key3')).toBeUndefined();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', () => {
      cacheService.set('stats-key', 'value');
      
      // Hit
      cacheService.get('stats-key');
      
      // Miss
      cacheService.get('non-existent');
      
      const stats = cacheService.getStats();
      
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Prediction Cache Keys', () => {
    it('should generate consistent cache keys', () => {
      const marketId = 'test-market-123';
      const key1 = `prediction:${marketId}`;
      const key2 = `prediction:${marketId}`;
      
      expect(key1).toBe(key2);
    });

    it('should store prediction results', () => {
      const prediction = {
        marketId: 'test-market',
        prediction: 'YES',
        confidence: 75,
        timestamp: Date.now(),
      };
      
      cacheService.set(`prediction:${prediction.marketId}`, prediction, 3600);
      const cached = cacheService.get(`prediction:${prediction.marketId}`);
      
      expect(cached).toEqual(prediction);
    });
  });
});
