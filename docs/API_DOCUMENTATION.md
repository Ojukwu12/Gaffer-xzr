# Polyscope API Documentation

Last updated: 2026-03-17

## Base URL
```
Development: http://localhost:5000/api
Production: https://polyscope.onrender.com 
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
    "answer": "YES",
    "marketId": "0x123...",
    "option": "Yes",
    "timeframe": "daily",
    "confidence": 75,
    "yes_probability": 65,
    "no_probability": 35,
    "polymarketUrl": "https://polymarket.com/event/some-market-slug",
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
      {
        "option": "Yes",
        "answer": "YES",
        "confidence": 74,
        "polymarketUrl": "https://polymarket.com/event/some-market-slug"
      },
      {
        "option": "No",
        "answer": "NO",
        "confidence": 71,
        "polymarketUrl": "https://polymarket.com/event/some-market-slug"
      }
    ]
  }
}
```

#### GET /api/predictions/performance
Get prediction performance for frontend dashboards (max 30 days).

**Query Parameters:**
- `days` (optional, max: 30, default: 30): Reporting window in days

**Response:**
```json
{
  "success": true,
  "data": {
    "windowDays": 30,
    "summary": {
      "totalPredictions": 42,
      "resolvedPredictions": 30,
      "pendingPredictions": 12,
      "correctPredictions": 19,
      "incorrectPredictions": 11,
      "winRate": 63.33
    },
    "correctPredictions": [
      {
        "marketId": "0x123...",
        "marketTitle": "Will BTC hit $100k?",
        "option": "Yes",
        "predictedAnswer": "YES",
        "actualAnswer": "YES",
        "winningOption": "Yes",
        "confidence": 78,
        "predictedAt": "2026-03-01T09:00:00.000Z",
        "polymarketUrl": "https://polymarket.com/event/will-btc-hit-100k"
      }
    ],
    "incorrectPredictions": [
      {
        "marketId": "0x999...",
        "marketTitle": "Will ETH ETF launch by June?",
        "option": "Yes",
        "predictedAnswer": "YES",
        "actualAnswer": "NO",
        "winningOption": "No",
        "confidence": 69,
        "predictedAt": "2026-03-03T10:30:00.000Z",
        "polymarketUrl": "https://polymarket.com/event/will-eth-etf-launch-by-june"
      }
    ],
    "pendingPredictions": []
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
Subscribe to email notifications.

Note: Email notification frequency is enforced as monthly for all opted-in email subscriptions.

**Body:**
```json
{
  "email": "user@example.com",
  "markets": [
    {
      "marketId": "0x123...",
      "marketTitle": "Will Bitcoin reach $100k by 2025?"
    }
  ],
  "preferences": {
    "frequency": "monthly",
    "minConfidence": 70,
    "maxNotificationsPerDay": 10,
    "categories": ["Crypto"],
    "includeFeatures": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscribed": true,
    "email": "user@example.com",
    "verificationRequired": true,
    "unsubscribeToken": "hex-token"
  }
}
```

#### GET /api/notifications/email/verify
Verify an email subscription.

**Query Parameters:**
- `token` (required): Verification token sent by email

**Response:**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "email": "user@example.com"
  }
}
```

#### POST /api/notifications/push/subscribe
Subscribe to push notifications.

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
  "markets": [
    {
      "marketId": "0x123...",
      "marketTitle": "Will Bitcoin reach $100k by 2025?"
    }
  ],
  "preferences": {
    "minConfidence": 70,
    "maxNotificationsPerDay": 20
  }
}
```

#### POST /api/notifications/email/unsubscribe
Unsubscribe from email notifications.

**Body:**
```json
{
  "token": "hex-token"
}
```

Alternative body:
```json
{
  "email": "user@example.com"
}
```

#### POST /api/notifications/push/unsubscribe
Unsubscribe from push notifications.

**Body:**
```json
{
  "endpoint": "https://push-service/..."
}
```

#### GET /api/notifications/push/vapid-public-key
Get the VAPID public key used for web push subscription setup.

#### POST /api/notifications/test
Send a test notification through email and/or push.

**Body:**
```json
{
  "email": "user@example.com",
  "pushSubscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

#### PATCH /api/notifications/preferences
Update notification preferences for email or push subscriptions.

**Body:**
```json
{
  "type": "email",
  "identifier": "user@example.com",
  "preferences": {
    "frequency": "monthly",
    "minConfidence": 75,
    "maxNotificationsPerDay": 5,
    "includeFeatures": true
  }
}
```

Note: For `type: "email"`, frequency is always enforced to `monthly`.

**Query Parameters:**
- None

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
