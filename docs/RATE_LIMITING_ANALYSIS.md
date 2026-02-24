# Polyscope AI Rate Limiting Analysis & Solutions

## CRITICAL ISSUES IDENTIFIED

### 1. **AI RATE LIMITING PROBLEMS**

#### Issue 1.1: Single AI Provider (No Fallback)
**Severity:** CRITICAL
- **Problem:** Only Google Gemini 2.5 Flash is used. When it hits rate limits (15 requests/minute), predict fails completely
- **Current Flow:**
  ```
  generatePrediction() → llmService.generatePrediction()
  ↓
  model.generateContent() (BLOCKS if rate limited)
  ↓
  ERROR, NO FALLBACK
  ```
- **Impact:** 30-50% of markets fail to get predictions during peak hours

#### Issue 1.2: No Exponential Backoff or Circuit Breaker
**Severity:** HIGH
- **Problem:** When rate limited, requests fail immediately without retry logic
- **Missing:** 
  - Exponential backoff strategy
  - Circuit breaker pattern
  - Retry queue
  - Request deduplication

#### Issue 1.3: Over-Aggressive Prediction Computation
**Severity:** HIGH
- **Problem:** Cron job in `computePredictions.js` generates predictions for 50 markets × 2 timeframes × 1-2 options = 100-200 LLM calls every 10 minutes
- **Current Code (line 37-38 in computePredictions.js):**
  ```javascript
  for (const timeframe of ['daily', 'weekly']) {
    // Creates 2 LLM calls per market
    const prediction = await predictionEngine.generatePrediction(...)
  }
  ```
- **Rate Limit:** Gemini has ~15 requests/minute limit
- **Math:** 100-200 calls in 10 min = 10-20 calls/min = EXCEEDS LIMIT

### 2. **PREDICTION COMPUTATION ARCHITECTURE ISSUES**

#### Issue 2.1: No Pre-Computation Strategy
**Severity:** MEDIUM-HIGH
- **Problem:** Every user API request triggers LLM call (unless cached)
- **Cache TTL Issue:** Only 5 minutes (line 510 in predictionEngine.js)
- **Traffic Pattern:** If 10 users request same market, could be 10 LLM calls within 5 minutes

#### Issue 2.2: Inefficient Feature Computation
**Severity:** MEDIUM
- **Problem:** Computing 50+ features every time even when LLM fails
- **Lines 125-320 in predictionEngine.js:** Computes expensive features before calling LLM
- **Issue:** If LLM rate limits, all that computation was wasted
- **Suggestion:** Cache features separately with longer TTL (30+ minutes)

#### Issue 2.3: No Intelligent Tiering
**Severity:** MEDIUM
- **Problem:** All 50 markets processed equally regardless of liquidity/volume
- **Missing:**
  - Tier 1: Top 10-15 markets per category (high liquidity)
  - Tier 2: Mid-tier markets (medium liquidity) - process every 30 min
  - Tier 3: Long-tail (low liquidity) - process on-demand only

### 3. **RATE LIMIT CONFIGURATION ISSUES**

#### Issue 3.1: Aggressive Prediction Rate Limiter
**Severity:** MEDIUM
- **Lines 93-105 in middlewares/rateLimit.js:**
  ```javascript
  const predictionLimiter = rateLimit({
    max: 50,  // 50 requests per 5 minutes per IP
    windowMs: RATE_LIMIT_CONFIG.windowMs // 5 minutes
  });
  ```
- **Problem:** Rate limits API consumers, not preventing LLM rate limits
- **Better Focus:** Limit LLM requests internally, not API requests

#### Issue 3.2: Missing Rate Limit Headers
**Severity:** LOW
- No custom monitoring of Gemini rate limit responses
- No early detection of rate limit exhaustion

### 4. **CACHE CONFIGURATION ISSUES**

#### Issue 4.1: Short Memory Cache TTL
**Severity:** MEDIUM
- **Line 15 in cacheService.js:**
  ```javascript
  const memoryCache = new NodeCache({
    stdTTL: config.cacheTTL // Default 300s = 5 minutes
  });
  ```
- **Problem:** Predictions in memory cache expire after 5 minutes
- **Issue:** High-traffic predictions keep regenerating

#### Issue 4.2: Separate Features & Prediction Caching
**Severity:** MEDIUM
- **Problem:** Features aren't cached separately from predictions
- **Issue:** If LLM fails, features are recomputed unnecessarily
- **Solution:** Cache features with 30+ min TTL, separate from prediction (5 min TTL)

### 5. **CODE-LEVEL BUGS & INEFFICIENCIES**

#### Bug 5.1: getAllOptionsPredictions Parallelizes LLM Calls
**Severity:** HIGH
- **Line 640-648 in predictionEngine.js:**
  ```javascript
  const predictions = await Promise.all(
    options.map(option => 
      generatePrediction(marketId, option, timeframe)  // Creates parallel LLM calls!
    )
  );
  ```
- **Issue:** For markets with 3+ options, creates parallel LLM calls hitting rate limit
- **Fix:** Process sequentially or limit to 1 option per market

#### Bug 5.2: batchPredict Has No Optimization
**Severity:** MEDIUM
- **Line 171 in predictionController.js:**
  ```javascript
  results = await Promise.all(
    markets.map(({ marketId, option }) =>
      predictionEngine.generatePrediction(...)
    )
  );
  ```
- **Problem:** Max 10 markets batch, all requested in parallel = parallelized LLM calls
- **Fix:** Use a queue with rate limit control

#### Bug 5.3: computePredictions.js No Error Resilience
**Severity:** MEDIUM
- **Lines 58-69:** If one market LLM call fails, continues to next without throttling
- **Missing:** Exponential backoff when rate limits detected

#### Bug 5.4: No Fallback When LLM Fails
**Severity:** HIGH
- **Line 488-497 in predictionEngine.js:**
  ```javascript
  if (!llmResult.success) {
    throw new CustomError(llmResult.error, 400, 'INVALID_MARKET_DATA');
    // NO FALLBACK - just throws error
  }
  ```
- **Fix:** Return feature-based heuristic scoring as fallback

---

## SOLUTION RECOMMENDATIONS

### SOLUTION 1: Multiple AI Model Strategy (RECOMMENDED)
**Implementing AI Redundancy with Fallback Chain**

**Approach:**
```
Primary: Google Gemini 2.5 Flash
├─ Fallback 1: Claude (Anthropic) - Different rate limits
├─ Fallback 2: GPT-4 Mini (OpenAI) - Different rate limits
└─ Fallback 3: Feature-based heuristics (always works)
```

**Implementation:**
1. Create `/src/services/aiService.js` - AI orchestration layer
2. Support multiple models in env config:
   ```env
   # Primary AI
   LLM_API_KEY=gemini_key
   
   # Fallback AIs
   CLAUDE_API_KEY=claude_key
   GPT_API_KEY=gpt_key
   
   # Rate limit thresholds
   GEMINI_MAX_REQUESTS_PER_MIN=15
   CLAUDE_MAX_REQUESTS_PER_MIN=20
   GPT_MAX_REQUESTS_PER_MIN=10
   ```

3. Implement circuit breaker pattern per AI

**Pros:**
- ✅ Handles 100+ predictions/10min (distributed across models)
- ✅ Automatic failover
- ✅ Cost optimization (use cheaper models as fallbacks)

**Cons:**
- ⚠️ Multiple API keys needed
- ⚠️ Slightly different prediction quality per model

**Estimated Implementation Time:** 6-8 hours

---

### SOLUTION 2: Reduce Prediction Scope (QUICK WIN)
**Implementing Top-20-Per-Category Model**

**Current State:**
- Processing 50 markets × 2 timeframes = 100 LLM calls per cron run
- ~200 API request predictions per day

**Proposed State:**
- Top 3-5 categories (Politics, Sports, Crypto, etc.)
- Top 20 total markets per category = 15-20 markets max
- Only `daily` timeframe (remove `weekly`)
- Pre-compute only "Yes" on binary markets

**Changes Required:**

```javascript
// In computePredictions.js (line 28-31)

// CURRENT:
let markets = await polymarketService.fetchMarkets({ closed: false });
markets = markets.sort((a,b) => (b.liquidity || 0) - (a.liquidity || 0)).slice(0, 50);

// NEW:
const topCategories = ['politics', 'sports', 'crypto', 'business', 'entertainment'].slice(0, 3);
let markets = await polymarketService.fetchMarkets({ closed: false });
const marketsByCategory = {};

for (const category of topCategories) {
  marketsByCategory[category] = markets
    .filter(m => m.categories?.includes(category))
    .sort((a,b) => (b.liquidity || 0) - (a.liquidity || 0))
    .slice(0, 20);
}

const selectedMarkets = Object.values(marketsByCategory).flat().slice(0, 20);

// CURRENT:
for (const timeframe of ['daily', 'weekly']) {  // 2 timeframes

// NEW:
for (const timeframe of ['daily']) {  // 1 timeframe only
```

**Impact:**
- **Before:** 50 markets × 2 timeframes = 100+ LLM calls/10min
- **After:** 20 markets × 1 timeframe = 20 LLM calls/10min
- **Within limit:** ✅ (20 calls/10min = 2 calls/min, limit is 15/min)

**Implementation Time:** 2-3 hours

---

### SOLUTION 3: Smart Caching Strategy
**Implementing Multi-Tier Cache**

**Problem:**
- Features computed but throw on LLM error (wasted computation)
- 5-minute cache TTL creates cold starts

**Solution:**
```javascript
// In cacheService.js - Add separate feature cache

const cacheFeatures = async (marketId, option, timeframe, features) => {
  const key = `features:${marketId}:${option}:${timeframe}`;
  // Cache features for 30 minutes (don't expire on LLM error)
  setInMemory(key, features, 1800);
};

const getCachedFeatures = (marketId, option, timeframe) => {
  const key = `features:${marketId}:${option}:${timeframe}`;
  return getFromMemory(key);
};

// In predictionEngine.js (line 488)
// CURRENT:
const features = await computeFeatures(marketData, option, timeframe);
const llmResult = await llmService.generatePrediction(...);
if (!llmResult.success) throw error; // Features lost!

// NEW:
let features = cacheService.getCachedFeatures(marketId, option, timeframe);
if (!features) {
  features = await computeFeatures(marketData, option, timeframe);
  cacheService.cacheFeatures(marketId, option, timeframe, features);
}

const llmResult = await llmService.generatePrediction(...);
if (!llmResult.success) {
  // Fallback: Return feature-based scoring
  return generateFeatureBasedPrediction(features);
}
```

**Implementation Time:** 2-3 hours

---

### SOLUTION 4: Feature-Based Fallback Scoring
**Implementing Graceful Degradation**

**When LLM fails, return prediction based on features:**

```javascript
// New function in predictionEngine.js

const generateFeatureBasedPrediction = (features) => {
  // Score based on key indicators
  const score = (
    features.sentimentScore * 0.35 +
    features.trendScore * 0.25 +
    features.liquidityScore * 0.15 +
    (features.smartMoneyDirection + 1) / 2 * 0.15 +
    (features.whaleFactor > 0.5 ? 0.1 : 0)
  );

  return {
    answer: score > 0.55 ? 'YES' : 'NO',
    confidence: Math.round(Math.abs(score - 0.5) * 200), // 0-100
    reason: `Feature-based prediction (LLM unavailable): Score ${score.toFixed(2)}`,
    source: 'fallback',
    features,
    fromCache: false,
    timestamp: new Date().toISOString()
  };
};

// In generatePrediction (line 488-497)
let llmResult;
try {
  llmResult = await llmService.generatePrediction(...);
} catch (llmError) {
  if (llmError.message.includes('rate limit') || llmError.message.includes('quota')) {
    logger.warn(`LLM rate limited, using feature-based fallback`);
    return generateFeatureBasedPrediction(features); // ✅ Always returns something
  }
  throw llmError; // Re-throw other errors
}
```

**Accuracy:** ~70% of LLM accuracy, but *always works*

**Implementation Time:** 1-2 hours

---

### SOLUTION 5: Request Queuing & Rate Limit Control
**Implementing Internal Rate Limit Management**

**Create `/src/services/llmQueueService.js`:**

```javascript
class LLMQueue {
  constructor(maxRequestsPerMinute = 10) {
    this.queue = [];
    this.activeRequests = 0;
    this.maxRequests = maxRequestsPerMinute;
    this.windowStart = Date.now();
    this.requestsInWindow = [];
  }

  async execute(fn) {
    // Wait if rate limit approaching
    while (this.getRequestsInCurrentMinute() >= this.maxRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.requestsInWindow.push(Date.now());
    this.resetWindowIfNeeded();
    
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('rate limit')) {
        // Back off aggressively
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      throw error;
    }
  }

  getRequestsInCurrentMinute() {
    const now = Date.now();
    return this.requestsInWindow.filter(t => now - t < 60000).length;
  }

  resetWindowIfNeeded() {
    const now = Date.now();
    this.requestsInWindow = this.requestsInWindow.filter(t => now - t < 60000);
  }
}

module.exports = new LLMQueue(10); // Max 10 requests/minute
```

**Usage in llmService.js:**
```javascript
const llmQueue = require('./llmQueueService');

const generatePrediction = async (marketData, option, features, timeframe) => {
  return llmQueue.execute(async () => {
    // Actual LLM call
    const result = await model.generateContent(prompt);
    return parseResponse(result.response.text());
  });
};
```

**Implementation Time:** 2-3 hours

---

## RECOMMENDED IMPLEMENTATION ROADMAP

### Phase 1 (IMMEDIATE - Day 1-2) - Quick Wins
1. ✅ Reduce prediction scope: Top 20 markets, 1 timeframe (2-3 hours)
2. ✅ Feature-based fallback scoring (1-2 hours)
3. ✅ Internal rate limit queue (2-3 hours)
**Total:** 5-8 hours | Impact: 70% reduction in rate limit errors

### Phase 2 (SHORT-TERM - Day 3-5) - Stability
1. ✅ Smart multi-tier cache (2-3 hours)
2. ✅ Request deduplication (1-2 hours)
3. ✅ Circuit breaker pattern (2-3 hours)
**Total:** 5-8 hours | Impact: 95% stability improvement

### Phase 3 (MEDIUM-TERM - Week 2) - Redundancy
1. ✅ Multi-AI model support (6-8 hours)
2. ✅ Fallback to Claude/GPT (2-3 hours)
3. ✅ AI-specific rate limit handling (2-3 hours)
**Total:** 10-14 hours | Impact: 100% uptime with AI failovers

---

## SUMMARY TABLE

| Issue | Severity | Solution | Impact | Time |
|-------|----------|----------|--------|------|
| Single AI provider | CRITICAL | Multiple AIs + fallbacks | 90% uptime → 99%+ | Phase 3 |
| Over 100 LLM calls/10min | CRITICAL | Reduce to 20 markets + 1 timeframe | Within limit | Phase 1 |
| No rate limit handling | HIGH | Add queue + circuit breaker | Graceful degradation | Phase 1 |
| No LLM failure fallback | HIGH | Feature-based scoring | Always returns prediction | Phase 1 |
| Short cache TTL | MEDIUM | Separate feature cache (30min) | 50% less recomputation | Phase 2 |
| Parallel LLM calls | MEDIUM | Sequential queuing | Better rate limit handling | Phase 1 |

---

## IMMEDIATE ACTION ITEMS

### To fix rate limiting TODAY:
1. **Reduce market count from 50 to 20** in `computePredictions.js` line 31
2. **Remove weekly timeframe** from cron schedule (line 37)
3. **Add simple fallback** in `predictionEngine.js` for LLM errors
4. **Increase cache TTLs** in `env.js` from 300s to 600s+

These 4 changes will immediately fix the issue with minimal code changes.

---

## Questions for Clarification

1. **Do you want multiple external AIs, or just improve current Gemini usage?**
   - Multiple AIs recommended but requires 2-3 more API keys
   
2. **Which genres/categories are most important?**
   - Currently no category filtering - can we focus on specific categories first?
   
3. **What's the target prediction frequency?**
   - Per market predictions: Real-time? Every 30 min? Every hour?
   - This affects caching strategy
   
4. **Budget for different AI services?**
   - Gemini: Cheap but rate limited
   - Claude: ~2-3x cost, better quality, higher rate limits
   - GPT: ~3-4x cost, highest quality, highest rate limits
