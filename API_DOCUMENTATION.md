# Polyscope API Documentation

## Base URL
```
Development: http://localhost:5000/api
Production: https://your-domain.com/api
```

## Authentication
Most endpoints don't require authentication. Admin endpoints require API key authentication:
```
X-API-Key: your-admin-api-key
```

## Response Format
All responses follow a standard format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-12-02T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-12-02T10:30:00.000Z"
}
```

## Endpoints

### Health Check

#### GET /health
Check server health status

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": "3600s",
    "timestamp": "2025-12-02T10:30:00.000Z",
    "database": {
      "status": "connected",
      "name": "polyscope"
    },
    "cache": {
      "memoryKeys": 42,
      "databaseActive": 15
    },
    "llm": {
      "status": "configured",
      "model": "gemini-2.5-flash"
    },
    "lastCronRun": "2025-12-02T10:00:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### Markets

#### GET /api/markets
Get list of active markets

**Query Parameters:**
- `limit` (optional, default: 50): Number of markets to return
- `offset` (optional, default: 0): Pagination offset
- `category` (optional): Filter by category
- `search` (optional): Search markets by title

**Response:**
```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "marketId": "0x123...",
        "title": "Will Bitcoin reach $100k by 2025?",
        "description": "Market description",
        "options": ["Yes", "No"],
        "currentPrices": [0.65, 0.35],
        "liquidity": 150000,
        "volume24h": 45000,
        "endDate": "2025-12-31T23:59:59.000Z",
        "categories": ["Crypto"]
      }
    ],
    "total": 100,
    "page": 1,
    "pages": 2
  }
}
```

#### GET /api/markets/:id
Get details for a specific market

**Parameters:**
- `id`: Market ID (condition_id)

**Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123...",
    "title": "Will Bitcoin reach $100k by 2025?",
    "description": "Detailed market description",
    "options": ["Yes", "No"],
    "currentPrices": [0.65, 0.35],
    "liquidity": 150000,
    "volume": 500000,
    "volume24h": 45000,
    "volume7d": 280000,
    "endDate": "2025-12-31T23:59:59.000Z",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "categories": ["Crypto"],
    "active": true,
    "resolved": false
  }
}
```

---

### Predictions

#### GET /api/markets/:id/predict
Generate prediction for a specific option

**Parameters:**
- `id`: Market ID

**Query Parameters:**
- `option`: Option to predict (e.g., "Yes", "No")
- `timeframe` (optional, default: "daily"): Prediction timeframe ("daily", "weekly", "monthly")

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "marketId": "0x123...",
    "option": "Yes",
    "timeframe": "daily",
    "prediction": "YES",
    "confidence": 75,
    "yes_probability": 65,
    "no_probability": 35,
    "reason": "Strong positive sentiment + rising liquidity + bullish trend",
    "notes": "Market quality grade: B. No critical warnings.",
    "summary": {
      "marketHealth": {
        "overallScore": 75,
        "grade": "B",
        "status": "valid",
        "issues": []
      },
      "keyMetrics": {
        "liquidity": {
          "value": 150000,
          "formatted": "$150,000",
          "score": 0.8,
          "risk": "LOW"
        },
        "volume24h": {
          "value": 45000,
          "formatted": "$45,000",
          "growth": 25.5,
          "trend": "increasing"
        },
        "currentPrice": {
          "value": 0.65,
          "formatted": "$0.6500",
          "impliedProbability": "65.00%",
          "rank": 1,
          "isLeading": true
        }
      },
      "sentiment": {
        "score": 0.72,
        "label": "positive",
        "trend": "bullish",
        "strength": "strong"
      },
      "risks": {
        "overall": "medium",
        "score": 0.35,
        "warnings": []
      },
      "timing": {
        "marketAge": "30 days",
        "daysUntilExpiry": "7 days",
        "lifecycleStage": "late_stage",
        "urgency": "high"
      }
    },
    "features": { ... },
    "timestamp": "2025-12-02T10:30:00.000Z",
    "fromCache": false,
    "computationTime": 1250
  }
}
```

#### GET /api/markets/:id/predict-all
Generate predictions for all options in a market

**Parameters:**
- `id`: Market ID

**Query Parameters:**
- `timeframe` (optional, default: "daily"): Prediction timeframe

**Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123...",
    "predictions": [
      { ... prediction for option 1 ... },
      { ... prediction for option 2 ... }
    ]
  }
}
```

#### GET /api/markets/:id/features
Get computed features without LLM prediction (faster, no API costs)

**Parameters:**
- `id`: Market ID

**Query Parameters:**
- `option`: Option to analyze
- `timeframe` (optional, default: "daily"): Analysis timeframe

**Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123...",
    "option": "Yes",
    "features": {
      "validationStatus": "valid",
      "marketQualityScore": 75,
      "marketQualityGrade": "B",
      "liquidity": 150000,
      "volume24h": 45000,
      "currentPrice": 0.65,
      "trendDirection": "bullish",
      "sentimentScore": 0.72,
      "riskLevel": "medium",
      ... // 50+ other features
    },
    "summary": { ... }
  }
}
```

#### GET /api/markets/:id/cache
Get cached predictions for a market (if available)

**Parameters:**
- `id`: Market ID

**Response:**
```json
{
  "success": true,
  "data": {
    "cached": [
      {
        "option": "Yes",
        "timeframe": "daily",
        "confidence": 75,
        "timestamp": "2025-12-02T10:25:00.000Z",
        "expiresIn": 240
      }
    ]
  }
}
```

---

### Notifications

#### POST /api/notifications/email/subscribe
Subscribe to email notifications

**Body:**
```json
{
  "email": "user@example.com",
  "marketId": "0x123...",
  "threshold": 75
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Successfully subscribed",
    "subscriptionId": "sub_123..."
  }
}
```

#### POST /api/notifications/push/subscribe
Subscribe to push notifications

**Body:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "marketId": "0x123...",
  "threshold": 75
}
```

#### DELETE /api/notifications/email/unsubscribe
Unsubscribe from email notifications

**Query Parameters:**
- `token`: Unsubscribe token

---

### Metrics (Admin)

#### GET /api/metrics
Get system metrics

**Headers:**
- `X-API-Key`: Admin API key

**Response:**
```json
{
  "success": true,
  "data": {
    "predictions": {
      "total": 1000,
      "cached": 400,
      "success": 950,
      "errors": 50
    },
    "requests": {
      "total": 5000,
      "successful": 4800,
      "failed": 200
    },
    "cache": {
      "hitRate": 0.75,
      "memoryUsage": "45MB"
    },
    "uptime": "86400s"
  }
}
```

---

## Rate Limiting

- **General endpoints**: 100 requests per 15 minutes per IP
- **Prediction endpoints**: 20 predictions per 15 minutes per IP
- **Admin endpoints**: 50 requests per 15 minutes per API key

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1701518400
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `MARKET_NOT_FOUND` | Market ID does not exist |
| `INVALID_OPTION` | Option not available for this market |
| `INVALID_TIMEFRAME` | Timeframe not supported |
| `INVALID_MARKET_DATA` | Market failed validation checks |
| `LLM_NOT_CONFIGURED` | LLM service not properly configured |
| `LLM_PARSE_ERROR` | Failed to parse LLM response |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `VALIDATION_ERROR` | Request validation failed |

---

## WebSocket (Future Feature)

Real-time prediction updates via WebSocket:
```javascript
const ws = new WebSocket('ws://localhost:5000');

ws.on('open', () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    marketId: '0x123...'
  }));
});

ws.on('message', (data) => {
  const update = JSON.parse(data);
  console.log('Prediction update:', update);
});
```

---

## CORS

The API supports CORS with the following allowed origins:
- `http://localhost:3000` (React/Next.js default)
- `http://localhost:3001`
- `http://localhost:4200` (Angular)
- `http://localhost:8080` (Vue)
- `http://localhost:5173` (Vite)
- Your production domain (configured via `ALLOWED_ORIGINS` env variable)

---

## Best Practices

1. **Cache Results**: Use the `/cache` endpoint before requesting new predictions
2. **Rate Limiting**: Implement client-side rate limiting to avoid 429 errors
3. **Error Handling**: Always handle error responses gracefully
4. **Timeouts**: Set reasonable timeouts (30s recommended)
5. **Validation**: Check `validation status` before using predictions
6. **Market Quality**: Prefer markets with grade A or B
7. **Risk Awareness**: Always check `risks.warnings` array

---

## Example Client Code

### JavaScript/TypeScript
```typescript
const API_BASE = 'http://localhost:5000/api';

async function getPrediction(marketId: string, option: string) {
  try {
    const response = await fetch(
      `${API_BASE}/markets/${marketId}/predict?option=${option}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result.data;
  } catch (error) {
    console.error('Prediction error:', error);
    throw error;
  }
}
```

### React Hook
```typescript
import { useState, useEffect } from 'react';

function usePrediction(marketId: string, option: string) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function fetchPrediction() {
      try {
        setLoading(true);
        const data = await getPrediction(marketId, option);
        setPrediction(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPrediction();
  }, [marketId, option]);
  
  return { prediction, loading, error };
}
```

---

## Support

For issues or questions, refer to:
- API Documentation: `/src/docs/api-contract.md`
- Feature Documentation: `/FEATURES.md`
- Quick Start Guide: `/QUICK_START.md`
