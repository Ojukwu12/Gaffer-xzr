This testing guide has been consolidated into `docs/TESTING_GUIDE.md`.

See `docs/TESTING_GUIDE.md` for setup, running tests, and CI integration details.

#### 1. Unit Tests (`src/services/__tests__/`)
Test individual functions and modules in isolation.

**Example**: `predictionEngine.test.js`
- Tests feature calculation functions
- Tests market validation
- Tests anomaly detection
- Tests edge cases

#### 2. Integration Tests (`src/__tests__/`)
Test multiple components working together.

**Example**: `api.integration.test.js`
- Tests API endpoints
- Tests middleware (auth, rate limiting, CORS)
- Tests error handling
- Tests request/response flow

#### 3. API Tests
Full end-to-end tests of HTTP endpoints.

**Coverage:**
- Health check endpoint
- Prediction endpoints
- Admin endpoints
- Rate limiting
- CORS configuration
- Error responses

## Writing Tests

### Basic Test Structure
```javascript
describe('Feature Name', () => {
  // Setup before all tests
  beforeAll(() => {
    // One-time setup
  });

  // Setup before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Function Name', () => {
    it('should do something specific', () => {
      // Arrange
      const input = { /* test data */ };
      
      // Act
      const result = functionToTest(input);
      
      // Assert
      expect(result).toBe(expectedValue);
    });

    it('should handle edge case', () => {
      // Test edge cases
    });
  });
});
```

### Testing Async Functions
```javascript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toHaveProperty('data');
});
```

### Testing API Endpoints
```javascript
it('should return 200 for valid request', async () => {
  const response = await request(app)
    .get('/api/endpoint')
    .expect(200);
    
  expect(response.body).toHaveProperty('data');
});
```

### Mocking External Services
```javascript
jest.mock('../services/externalService', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mock' }),
}));
```

### Testing Error Handling
```javascript
it('should throw error for invalid input', async () => {
  await expect(functionToTest(invalidInput))
    .rejects.toThrow('Expected error message');
});
```

## Coverage Reports

### Viewing Coverage
After running `npm test`, coverage reports are generated in:
- `coverage/lcov-report/index.html` (HTML report - open in browser)
- `coverage/lcov.info` (LCOV format for CI/CD)

### Coverage Thresholds
Current thresholds (configured in `jest.config.js`):
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

### Checking Coverage
```bash
npm test -- --coverage
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

## CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Push to `main`, `develop`, or `feature/*` branches
- Pull requests to `main` or `develop`

### Pipeline Steps
1. **Lint**: Code quality checks
2. **Test**: Run all tests with MongoDB service
3. **Security**: npm audit for vulnerabilities
4. **Build**: Verify application builds
5. **Docker**: Build Docker image (main/develop only)

### Required Secrets
Configure in GitHub repository settings:
- `GEMINI_API_KEY`: For LLM service tests
- `DOCKER_USERNAME`: (Optional) For Docker Hub
- `DOCKER_PASSWORD`: (Optional) For Docker Hub

## Best Practices

### 1. Test Naming
- Use descriptive test names: `it('should calculate liquidity score correctly', ...)`
- Group related tests with `describe()`

### 2. Test Independence
- Each test should run independently
- Use `beforeEach()` to reset state
- Don't rely on test execution order

### 3. Mock External Dependencies
- Mock API calls to external services
- Mock database operations when testing logic
- Use `jest.mock()` for module mocking

### 4. Test Coverage
- Aim for >70% coverage
- Focus on critical paths first
- Test edge cases and error handling

### 5. Async Testing
- Always use `async/await` or return promises
- Set appropriate timeouts for slow operations
- Mock external async operations

### 6. Assertions
- Use specific matchers: `toEqual()`, `toHaveProperty()`, `toBeGreaterThan()`
- Test both positive and negative cases
- Verify error messages and codes

## Example Test Scenarios

### Testing Market Validation
```javascript
it('should validate healthy market', () => {
  const market = createMockMarket();
  const validation = validateMarket(market);
  
  expect(validation.isValid).toBe(true);
  expect(validation.score).toBeGreaterThan(50);
});
```

### Testing API with Authentication
```javascript
it('should require authentication', async () => {
  await request(app)
    .get('/api/admin/users')
    .expect(401);
});

it('should allow authenticated requests', async () => {
  const token = 'valid-jwt-token';
  
  await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
});
```

### Testing Rate Limiting
```javascript
it('should enforce rate limits', async () => {
  // Make multiple requests
  for (let i = 0; i < 25; i++) {
    await request(app).get('/api/predictions/test-market');
  }
  
  // Next request should be rate limited
  await request(app)
    .get('/api/predictions/test-market')
    .expect(429);
});
```

## Troubleshooting

### Tests Timeout
- Increase timeout in `jest.config.js`: `testTimeout: 30000`
- Or per test: `jest.setTimeout(30000)`

### MongoDB Connection Issues
- Ensure MongoDB is running: `docker-compose up -d mongodb`
- Check connection string in `jest.setup.js`

### Mock Not Working
- Clear mocks between tests: `jest.clearAllMocks()`
- Verify mock path matches actual import path

### Coverage Not Generated
- Run with coverage flag: `npm test -- --coverage`
- Check `collectCoverageFrom` patterns in `jest.config.js`

## Next Steps

1. **Expand Test Coverage**: Add tests for remaining services
2. **Performance Tests**: Add load testing with Artillery or k6
3. **E2E Tests**: Add full end-to-end tests with real services
4. **Contract Tests**: Add API contract tests for frontend integration
5. **Visual Regression**: Add visual testing for any UI components

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#6-testing-best-practices)
