const llmService = require('../llmService');

// Mock the Google Generative AI
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockReturnValue(JSON.stringify({
              prediction: 'YES',
              confidence: 75,
              odds: { yes: 0.65, no: 0.35 },
              reasoning: 'Test reasoning',
              keyFactors: ['Factor 1', 'Factor 2'],
              risks: ['Risk 1'],
              timeframe: '30 days',
            })),
          },
        }),
      }),
    })),
  };
});

describe('LLM Service', () => {
  const mockMarket = {
    id: 'test-market',
    question: 'Will Bitcoin reach $100k by end of 2024?',
    options: [
      { name: 'Yes', price: 0.65 },
      { name: 'No', price: 0.35 },
    ],
  };

  const mockFeatures = {
    liquidityMetrics: {
      totalLiquidity: 100000,
      liquidityScore: 75,
    },
    volumeMetrics: {
      totalVolume24h: 50000,
      volumeScore: 70,
    },
    marketScore: 80,
    anomalies: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePrediction', () => {
    it('should generate a prediction successfully', async () => {
      const prediction = await llmService.generatePrediction(mockMarket, mockFeatures);
      
      expect(prediction).toHaveProperty('prediction');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('odds');
      expect(prediction).toHaveProperty('reasoning');
      expect(prediction).toHaveProperty('keyFactors');
      expect(prediction).toHaveProperty('risks');
      
      expect(['YES', 'NO', 'UNCERTAIN']).toContain(prediction.prediction);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(100);
    });

    it('should handle invalid market data', async () => {
      await expect(llmService.generatePrediction(null, mockFeatures))
        .rejects.toThrow();
    });

    it('should handle missing features', async () => {
      const prediction = await llmService.generatePrediction(mockMarket, {});
      
      // Should still generate a prediction with available data
      expect(prediction).toHaveProperty('prediction');
      expect(prediction).toHaveProperty('confidence');
    });
  });

  describe('Response Parsing', () => {
    it('should parse valid JSON response', async () => {
      const prediction = await llmService.generatePrediction(mockMarket, mockFeatures);
      
      expect(prediction.odds).toHaveProperty('yes');
      expect(prediction.odds).toHaveProperty('no');
      expect(Array.isArray(prediction.keyFactors)).toBe(true);
      expect(Array.isArray(prediction.risks)).toBe(true);
    });

    it('should handle malformed JSON gracefully', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: jest.fn().mockReturnValue('Invalid JSON'),
            },
          }),
        }),
      }));

      await expect(llmService.generatePrediction(mockMarket, mockFeatures))
        .rejects.toThrow();
    });
  });

  describe('Confidence Validation', () => {
    it('should ensure confidence is within 0-100 range', async () => {
      const prediction = await llmService.generatePrediction(mockMarket, mockFeatures);
      
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(100);
    });

    it('should handle confidence values as strings', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: jest.fn().mockReturnValue(JSON.stringify({
                prediction: 'YES',
                confidence: '75',
                odds: { yes: 0.65, no: 0.35 },
                reasoning: 'Test',
                keyFactors: [],
                risks: [],
              })),
            },
          }),
        }),
      }));

      const prediction = await llmService.generatePrediction(mockMarket, mockFeatures);
      expect(typeof prediction.confidence).toBe('number');
    });
  });
});
