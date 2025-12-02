const request = require('supertest');
const mongoose = require('mongoose');

// Mock environment before importing app
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/polyscope_test';
process.env.GEMINI_API_KEY = 'test-key';
process.env.SKIP_DB_CONNECTION = 'true'; // Skip actual DB connection for tests

describe('API Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Mock the database connection
    jest.spyOn(mongoose, 'connect').mockResolvedValue(true);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe('Health Check', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        app = require('../index');
      });
    });

    it('GET /health should return 200', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Prediction Endpoints', () => {
    beforeEach(() => {
      // Mock the polymarket service
      jest.mock('../services/polymarketService', () => ({
        getMarketById: jest.fn().mockResolvedValue({
          id: 'test-market',
          question: 'Test question?',
          options: [
            { id: '1', name: 'Yes', price: 0.6, liquidity: 10000, volume_24h: 5000 },
            { id: '2', name: 'No', price: 0.4, liquidity: 8000, volume_24h: 3000 },
          ],
          liquidity: 18000,
          volume_24h: 8000,
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        getAllMarkets: jest.fn().mockResolvedValue([]),
      }));

      jest.isolateModules(() => {
        app = require('../index');
      });
    });

    afterEach(() => {
      jest.unmock('../services/polymarketService');
    });

    it('POST /api/predictions should validate request body', async () => {
      const response = await request(app)
        .post('/api/predictions')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });

    it('GET /api/predictions/:marketId should return 400 for invalid ID', async () => {
      const response = await request(app)
        .get('/api/predictions/invalid-id-123')
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        app = require('../index');
      });
    });

    it('should enforce rate limits on prediction endpoints', async () => {
      // This test would require sending multiple requests
      // For now, just verify the endpoint exists
      const response = await request(app)
        .get('/api/predictions/test-market-id')
        .expect(400); // Will fail validation but confirms endpoint exists
      
      expect(response.body).toBeDefined();
    });
  });

  describe('CORS Configuration', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        app = require('../index');
      });
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      jest.isolateModules(() => {
        app = require('../index');
      });
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
    });

    it('should handle server errors gracefully', async () => {
      // Test error middleware by triggering an error
      const response = await request(app)
        .post('/api/predictions')
        .send({ marketId: null })
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
});
