# Quick Reference: New Features

## 1. Market Images 🖼️

Each market now includes an image URL from Polymarket:

```json
{
  "marketId": "0x123...",
  "title": "Will Bitcoin reach $100k?",
  "image": "https://polymarket-cdn.com/images/bitcoin.jpg",  // ← NEW!
  "description": "...",
  "status": "active"
}
```

**Logic:**
- Uses `image` field from API first
- Falls back to `twitterCardImage` if `image` is empty
- Sets to `null` if neither exists
- No placeholder images are generated

---

## 2. Expired Markets Filtering ⏰

Markets with passed end dates are automatically filtered out from:
- `GET /api/markets` - all markets list
- `GET /api/markets/search` - search results
- `GET /api/markets/category/:category` - category listings
- `GET /api/markets/trending` - trending markets
- Cache refresh jobs

---

## 3. Unified Market Prediction 🎯

**NEW ENDPOINT:**
```
GET /api/markets/{marketId}/predict-unified?timeframe=daily
```

**Returns a single YES/NO answer:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123...",
    "answer": "YES",                    // ← Single answer!
    "confidence": 72,
    "yes_probability": 72,
    "no_probability": 28,
    "reason": "Strong bullish momentum with whale accumulation",
    "timeframe": "daily",
    "timestamp": "2025-12-08T12:00:00Z"
  }
}
```

**Key Differences from Old Endpoints:**
| Feature | Old `/predict` | New `/predict-unified` |
|---------|-----------------|----------------------|
| Requires option? | YES ✓ | NO ✗ |
| Answer format | Per-option adjusted | Single YES/NO |
| Use case | Specific option analysis | Market outcome prediction |
| Endpoint | `/predict?option=Yes` | `/predict-unified` |

---

## 4. Implementation Details

### Image Field Logic
```javascript
// In polymarketService.parseMarket()
const image = (rawMarket.image && rawMarket.image.trim()) || 
              (rawMarket.twitterCardImage && rawMarket.twitterCardImage.trim()) || 
              null;
```

### Expiry Filtering Logic
```javascript
// In marketController.js & refreshMarkets.js
const filterExpiredMarkets = (markets) => {
  const now = new Date();
  return markets.filter(market => {
    if (!market.endDate) return true;           // Keep if no end date
    const endDate = new Date(market.endDate);
    return endDate > now;                        // Keep if not yet expired
  });
};
```

### Unified Prediction Logic
```javascript
// In predictionEngine.generateUnifiedPrediction()
// Uses 'Yes' as representative option for features
// LLM generates single YES/NO answer
// No option-specific adjustments
return {
  answer: llmResult.prediction,      // "YES" or "NO"
  confidence: llmResult.confidence,
  yes_probability: llmResult.yes_probability,
  no_probability: llmResult.no_probability,
  reason: llmResult.reason
};
```

---

## 5. Example API Calls

### Get Market with Image
```bash
curl https://api.polyscope.dev/api/markets/0x123abc
```

**Response includes:**
```json
{
  "marketId": "0x123abc",
  "image": "https://polymarket-images.s3.aws.com/market-123.jpg"
}
```

### Get Unified Prediction
```bash
curl https://api.polyscope.dev/api/markets/0x123abc/predict-unified?timeframe=weekly
```

**Response:**
```json
{
  "answer": "YES",
  "confidence": 65,
  "reason": "Recent price momentum + whale accumulation suggest upside",
  "yes_probability": 65,
  "no_probability": 35
}
```

### List Active Markets (No Expired)
```bash
curl https://api.polyscope.dev/api/markets?limit=20
```

**All returned markets have:**
- `endDate` > current time OR
- No `endDate` field

---

## 6. Backwards Compatibility ✅

**These endpoints still work:**
- `GET /api/markets/:id/predict?option=Yes` - Legacy per-option
- `GET /api/markets/:id/predict-all` - All options
- `POST /api/predictions/batch` - Batch predictions

**New field is optional:**
- Markets without image will have `image: null`
- Existing code can safely ignore it

---

## 7. Environment & Config

No new environment variables required.
No database migrations needed.
No new dependencies added.

---

## 8. Performance

- Image filtering: Negligible (string operations)
- Expiry filtering: O(n) - single date comparison per market
- Unified prediction: Same as per-option (uses 'Yes' as reference)
- Trending markets: Fetches 2x to account for expiry filtering

---

## 9. Error Handling

**Invalid timeframe:**
```json
{
  "success": false,
  "error": "Invalid timeframe. Valid options: daily, weekly, monthly"
}
```

**Market not found:**
```json
{
  "success": false,
  "error": "Market not found"
}
```

**Invalid market data:**
```json
{
  "success": false,
  "error": "The market is invalid because..."
}
```

---

## 10. Deployment Checklist

- [ ] Review changes in CHANGES_SUMMARY.md
- [ ] Run existing tests (no breaking changes)
- [ ] Deploy to staging
- [ ] Verify image URLs load in frontend
- [ ] Test unified prediction endpoint
- [ ] Confirm expired markets are filtered
- [ ] Monitor prediction cache hit rates
- [ ] Deploy to production

---

Need help? See CHANGES_SUMMARY.md for detailed implementation info.
