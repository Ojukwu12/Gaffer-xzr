// Jest setup file
// This runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/polyscope_test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // error: jest.fn(),
  // warn: jest.fn(),
  // info: jest.fn(),
};
