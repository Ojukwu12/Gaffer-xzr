# API Usage Guide - Updated Features

## 1. Get Market with Image URL

### Endpoint
```
GET /api/markets/:id
```

### Example Request
```bash
curl https://your-api.com/api/markets/0x123abc
```

### Example Response
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "title": "Will Bitcoin reach $100k by end of 2025?",
    "description": "Resolves YES if BTC hits $100,000 at any point",
    "options": ["Yes", "No"],
    "status": "active",
    "image": "https://polymarket-cdn.com/images/bitcoin-bull.jpg",
    "liquidity": 183828,
    "volume24h": 932842,
    "categories": ["crypto", "bitcoin"],
    "createdAt": "2025-01-15T10:30:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "currentPrices": [0.65, 0.35]
  }
}
```

---

## 2. List Active Markets (Non-Expired)

### Endpoint
```
GET /api/markets
```

### Query Parameters
- `category` (optional) - Filter by category
- `timeframe` (optional) - daily, weekly, monthly
- `status` (optional) - active, closed
- `limit` (optional) - Default: 50, Max: 100
- `offset` (optional) - Default: 0

### Example Request
```bash
curl "https://your-api.com/api/markets?limit=10&offset=0"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "marketId": "0x123abc",
        "title": "Will Bitcoin reach $100k?",
        "description": "...",
        "image": "https://polymarket-cdn.com/images/bitcoin.jpg",
        "status": "active",
        "endDate": "2025-12-31T23:59:59Z"
      },
      {
        "marketId": "0x456def",
        "title": "Will Ethereum exceed $5k?",
        "image": null,
        "status": "active",
        "endDate": "2025-11-30T23:59:59Z"
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 245
    }
  }
}
```

**Note:** Expired markets are automatically filtered. Only markets with `endDate > now()` are returned.

---

## 3. Search Markets

### Endpoint
```
GET /api/markets/search
```

### Query Parameters
- `q` (required) - Search query (min 2 characters)
- `limit` (optional) - Default: 20, Max: 50

### Example Request
```bash
curl "https://your-api.com/api/markets/search?q=bitcoin&limit=5"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "query": "bitcoin",
    "markets": [
      {
        "marketId": "0x111aaa",
        "title": "Will Bitcoin reach $100k?",
        "image": "https://...",
        "endDate": "2025-12-31T23:59:59Z"
      },
      {
        "marketId": "0x222bbb",
        "title": "Bitcoin above $50k?",
        "image": null,
        "endDate": "2025-11-30T23:59:59Z"
      }
    ]
  }
}
```

**Note:** Only non-expired markets are returned.

---

## 4. Get Trending Markets

### Endpoint
```
GET /api/markets/trending
```

### Query Parameters
- `limit` (optional) - Default: 10, Max: 50

### Example Request
```bash
curl "https://your-api.com/api/markets/trending?limit=10"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "marketId": "0xtrend1",
        "title": "Most traded market today",
        "image": "https://...",
        "volume24h": 5000000,
        "status": "active"
      },
      {
        "marketId": "0xtrend2",
        "title": "Another trending market",
        "image": null,
        "volume24h": 3000000,
        "status": "active"
      }
    ]
  }
}
```

**Note:** Only non-expired markets are returned.

---

## 5. Get Markets by Category

### Endpoint
```
GET /api/markets/category/:category
```

### Path Parameters
- `category` (required) - Category name (e.g., politics, crypto, sports)

### Query Parameters
- `limit` (optional) - Default: 50, Max: 100

### Example Request
```bash
curl "https://your-api.com/api/markets/category/crypto?limit=20"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "category": "crypto",
    "markets": [
      {
        "marketId": "0xcrypto1",
        "title": "Bitcoin prediction",
        "image": "https://...",
        "categories": ["crypto", "bitcoin"]
      },
      {
        "marketId": "0xcrypto2",
        "title": "Ethereum prediction",
        "image": null,
        "categories": ["crypto", "ethereum"]
      }
    ]
  }
}
```

**Note:** Only non-expired markets are returned.

---

## 6. Get Unified Single Prediction ⭐ NEW

### Endpoint
```
GET /api/markets/:id/predict-unified
```

### Path Parameters
- `id` (required) - Market ID

### Query Parameters
- `timeframe` (optional) - daily, weekly, or monthly. Default: daily

### Example Request
```bash
curl "https://your-api.com/api/markets/0x123abc/predict-unified?timeframe=daily"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "answer": "YES",
    "confidence": 72,
    "yes_probability": 72,
    "no_probability": 28,
    "reason": "Strong bullish momentum with whale accumulation. Price has been trending up with increasing volume. Smart money flows are positive.",
    "notes": "Market has healthy liquidity ($183k). Moderate whale concentration (30%). Time to resolution is 358 days.",
    "timeframe": "daily",
    "timestamp": "2025-12-08T12:00:00Z",
    "summary": {
      "marketHealth": {
        "overallScore": 87,
        "grade": "A",
        "status": "valid",
        "issues": []
      },
      "keyMetrics": {
        "liquidity": {
          "value": 183828,
          "formatted": "$183,828",
          "score": 0.95,
          "risk": "LOW"
        },
        "volume24h": {
          "value": 932842,
          "formatted": "$932,842",
          "growth": 15.5,
          "trend": "increasing"
        },
        "currentPrice": {
          "value": 0.72,
          "formatted": "$0.72",
          "impliedProbability": "72.00%",
          "rank": 1,
          "isLeading": true
        }
      },
      "sentiment": {
        "score": 0.75,
        "label": "positive",
        "trend": "bullish",
        "strength": "strong"
      },
      "timing": {
        "marketAge": "327 days",
        "daysUntilExpiry": "358 days"
      }
    }
  }
}
```

---

## 7. Get Per-Option Prediction (Legacy)

### Endpoint
```
GET /api/markets/:id/predict
```

### Path Parameters
- `id` (required) - Market ID

### Query Parameters
- `option` (required) - Option to predict (e.g., "Yes", "No")
- `timeframe` (optional) - daily, weekly, or monthly. Default: daily

### Example Request
```bash
curl "https://your-api.com/api/markets/0x123abc/predict?option=Yes&timeframe=daily"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "option": "Yes",
    "answer": "YES",
    "confidence": 72,
    "yes_probability": 72,
    "no_probability": 28,
    "reason": "Strong bullish momentum...",
    "timeframe": "daily",
    "timestamp": "2025-12-08T12:00:00Z",
    "summary": {...}
  }
}
```

---

## 8. Get All Options Predictions (Legacy)

### Endpoint
```
GET /api/markets/:id/predict-all
```

### Path Parameters
- `id` (required) - Market ID

### Query Parameters
- `timeframe` (optional) - daily, weekly, or monthly. Default: daily

### Example Request
```bash
curl "https://your-api.com/api/markets/0x123abc/predict-all?timeframe=daily"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "timeframe": "daily",
    "predictions": [
      {
        "option": "Yes",
        "answer": "YES",
        "confidence": 72,
        "reason": "Strong bullish momentum..."
      },
      {
        "option": "No",
        "answer": "NO",
        "confidence": 28,
        "reason": "Market momentum favors YES..."
      }
    ]
  }
}
```

---

## 9. Get Prediction Features Only

### Endpoint
```
GET /api/markets/:id/features
```

### Path Parameters
- `id` (required) - Market ID

### Query Parameters
- `option` (required) - Option to analyze
- `timeframe` (optional) - daily, weekly, or monthly. Default: daily

### Example Request
```bash
curl "https://your-api.com/api/markets/0x123abc/features?option=Yes&timeframe=daily"
```

### Example Response
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "option": "Yes",
    "timeframe": "daily",
    "features": {
      "liquidity": 183828,
      "volume24h": 932842,
      "currentPrice": 0.72,
      "impliedProbability": 72,
      "trendScore": 0.75,
      "sentimentScore": 0.75,
      "whaleFactor": 0.35,
      "marketQualityScore": 87,
      "riskScore": 0.22,
      "marketAge": 327,
      "daysUntilExpiry": 358,
      "validationStatus": "valid",
      ...manyMoreFeatures
    }
  }
}
```

---

## 10. Batch Predictions

### Endpoint
```
POST /api/predictions/batch
```

### Request Body
```json
{
  "timeframe": "daily",
  "markets": [
    { "marketId": "0x123abc", "option": "Yes" },
    { "marketId": "0x456def", "option": "No" },
    { "marketId": "0x789ghi", "option": "Yes" }
  ]
}
```

### Example Request
```bash
curl -X POST https://your-api.com/api/predictions/batch \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": "daily",
    "markets": [
      { "marketId": "0x123abc", "option": "Yes" }
    ]
  }'
```

### Example Response
```json
{
  "success": true,
  "data": {
    "timeframe": "daily",
    "results": [
      {
        "marketId": "0x123abc",
        "option": "Yes",
        "answer": "YES",
        "confidence": 72,
        "reason": "..."
      }
    ]
  }
}
```

**Note:** Maximum 10 markets per request.

---

## Error Handling

### 400 Bad Request
```json
{
  "success": false,
  "error": "Option parameter is required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Market not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

---

## Key Changes Summary

| Feature | Old | New |
|---------|-----|-----|
| Market image field | `null` | `"https://..."` or `null` |
| Expired markets | Included | Automatically filtered |
| Single prediction | N/A | `/predict-unified` ⭐ |
| Per-option prediction | `/predict?option=Yes` | Still works |
| All options | `/predict-all` | Still works |

---

## Rate Limiting

- **General endpoints:** 100 requests/minute per IP
- **Prediction endpoints:** 30 requests/minute per IP
- **Batch predictions:** 10 requests/minute per IP

---

## Response Format

All successful responses follow this format:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ }
}
```

All error responses follow this format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

---

## Best Practices

1. **Use `/predict-unified` for single answers** - It's simpler and more efficient
2. **Cache responses** - Use the provided TTL values
3. **Handle null images gracefully** - Not all markets have images
4. **Don't worry about expired markets** - They're automatically filtered
5. **Use appropriate timeframes** - daily for short-term, weekly for medium, monthly for long-term

---

**Last Updated:** December 8, 2025  
**Version:** 2.0 (with images, expiry filtering, and unified predictions)
