# Polyscope API Documentation

Last updated: 2026-03-17

## Base URL
```
Development: http://localhost:5000/api
Production: https://polyscope.onrender.com 
```

## Authentication
Most endpoints don't require authentication.

Admin access uses two headers on `/api/admin/*` routes:
```
X-API-Key: your-admin-api-key
x-admin-key: your_admin_secret_key
```

Notes:
- `X-API-Key` must belong to an active user with `role: admin`.
- `x-admin-key` must match `ADMIN_SECRET_KEY` from backend `.env`.
- `/api/metrics` uses `X-API-Key` only (not `x-admin-key`).

Admin debug example:
```bash
curl http://localhost:5000/api/admin/debug \
  -H "x-admin-key: your_admin_secret_key" \
  -H "X-API-Key: your_admin_api_key"
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
Get list of active markets with prediction status indicators

**Query Parameters:**
- `limit` (optional, default: 50): Number of markets to return
- `offset` (optional, default: 0): Pagination offset
- `category` (optional): Filter by category
- `search` (optional): Search markets by title
- `status` (optional): Filter by status (`active` or `closed`)
- `timeframe` (optional): Filter by available timeframe (`daily`, `weekly`, `monthly`)

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
        "categories": ["Crypto"],
        "hasPrediction": true,
        "availableTimeframes": ["daily", "weekly"],
        "optimalTimeframe": "daily"
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 100
    }
  }
}
```

**New Fields:**
- `hasPrediction` (boolean): Whether this market has approved or pending predictions
- `availableTimeframes` (array): Timeframes for which analysis is available
- `optimalTimeframe` (string): Recommended timeframe for this market based on its age

#### GET /api/markets/:id
Get details for a specific market with prediction status

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
    "resolved": false,
    "hasPrediction": true,
    "availableTimeframes": ["daily", "weekly", "monthly"],
    "optimalTimeframe": "daily",
    "cachedPredictions": {
      "Yes": {
        "daily": {
          "confidenceScore": 78,
          "marketProbabilityAtTime": 65,
          "aiProbability": 72,
          "statement": "The market is underpricing this outcome by ~7%",
          "reason": "Strong buying pressure from institutional traders",
          "status": "approved",
          "approvedAt": "2026-03-29T10:30:00.000Z"
        }
      }
    }
  }
}
```

**New Fields:**
- `hasPrediction` (boolean): Whether this market has approved or pending predictions
- `cachedPredictions` (object): Latest approved predictions organized by option, then timeframe
  - Each prediction includes confidence, market probability, AI probability, reasoning, and approval date

---

### Predictions

Prediction generation is private and runs only in backend scheduled/background processes.

The following public read routes are supported for frontend consumption of already-generated records:

#### GET /api/predictions
List approved prediction records

**Query Parameters:**
- `timeframe` (optional): `daily`, `weekly`, `monthly`
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "count": 2,
    "predictions": [
      {
        "id": "65fabc1234def56789012345",
        "marketId": "0x123...",
        "status": "approved",
        "marketProbability": 40,
        "aiProbability": 30,
        "confidence": "high"
      }
    ]
  }
}
```

#### GET /api/predictions/:predictionId
Get a single approved prediction record

**Parameters:**
- `predictionId`: MongoDB prediction record ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "65fabc1234def56789012345",
    "marketId": "0x123...",
    "status": "approved",
    "marketProbability": 40,
    "aiProbability": 30,
    "confidence": "high"
  }
}
```

Security & Public Access:
- **Public Market Routes (GET):** All market endpoints (`/api/markets`, `/api/markets/:id`, `/api/markets/search`, `/api/markets/trending`, `/api/markets/category/:category`) are fully public
- **Private Prediction Generation:** Prediction creation is backend-only and not exposed
- **Public Prediction Reading:** Approved predictions are public read-only
- **Frontend Use Case:** Use `hasPrediction` field on market tiles to display prediction indicators (e.g., "🎯 Predicted" badge)
- **Prediction details:** Retrieved via `cachedPredictions` object in market detail endpoint
- **Note:** Prediction engine internals, external-source logic, and model features are not exposed in public responses

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

- **General endpoints**: 100 requests per 5 minutes per IP
- **Prediction endpoints**: 50 prediction requests per 5 minutes per IP
- **Admin/sensitive endpoints**: 20 requests per 5 minutes per IP

External API adapters also apply outbound provider-specific pacing (TheSportsDB, Football-Data, CoinGecko, Yahoo Finance, GDELT, NewsAPI, SEC EDGAR, and Earnings API) to reduce upstream throttling risk.

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 35
X-RateLimit-Reset: 1701518400
```

---

### External Data Observability (Admin, Frontend Dashboard)

These endpoints are intended for admin dashboards, QA tools, and frontend diagnostics pages.

#### GET /api/admin/external-data/:marketId
Get the external-data diagnostics snapshot for a market that was recently analyzed.

**Headers:**
- `X-API-Key`: Admin API key

**Path Parameters:**
- `marketId`: Market ID

**Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123...",
    "timestamp": "2026-03-23T12:00:00.000Z",
    "applicable": true,
    "sourceType": "geopolitical",
    "scores": {
      "politicalMomentumScore": 66,
      "conflictEscalationScore": 41,
      "diplomaticProgressScore": 58,
      "narrativeShiftScore": 63
    },
    "compositeScore": 57,
    "signalStrength": 0.78,
    "sourcesUsed": ["GDELT", "NewsAPI"],
    "rawContext": {
      "articlesAnalyzed": 25,
      "eventsAnalyzed": 18
    }
  },
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

Note: diagnostics are stored in-memory with a TTL and may return 404 if expired.

#### GET /api/admin/health/external-sources
Check live availability and connectivity of each external source.

**Headers:**
- `X-API-Key`: Admin API key

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-03-23T12:00:00.000Z",
    "sources": {
      "sports": { "status": "healthy", "responseTime": 412, "lastCheck": "2026-03-23T12:00:00.000Z" },
      "financial": { "status": "healthy", "responseTime": 188, "lastCheck": "2026-03-23T12:00:00.000Z" },
      "geopolitical": { "status": "unconfigured", "message": "API key not configured", "lastCheck": "2026-03-23T12:00:00.000Z" },
      "corporate": { "status": "healthy", "responseTime": 229, "lastCheck": "2026-03-23T12:00:00.000Z" }
    },
    "summary": {
      "allHealthy": true,
      "configuredSources": 3
    }
  },
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

#### GET /api/admin/metrics/external-data
Get aggregate monitoring metrics for external data usage and quality.

**Headers:**
- `X-API-Key`: Admin API key

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-03-23T12:00:00.000Z",
    "metrics": {
      "apiCalls": {
        "sports": { "total": 21, "success": 19, "failures": 2, "avgResponseTime": 643, "lastCallTime": "2026-03-23T11:59:41.000Z" },
        "financial": { "total": 30, "success": 28, "failures": 2, "avgResponseTime": 295, "lastCallTime": "2026-03-23T11:59:50.000Z" },
        "geopolitical": { "total": 11, "success": 9, "failures": 2, "avgResponseTime": 704, "lastCallTime": "2026-03-23T11:58:10.000Z" },
        "corporate": { "total": 8, "success": 8, "failures": 0, "avgResponseTime": 387, "lastCallTime": "2026-03-23T11:57:32.000Z" }
      },
      "cache": {
        "hits": 44,
        "misses": 26,
        "hitRate": 0.6285
      },
      "probabilityAdjustments": {
        "totalAdjustments": 38,
        "avgAdjustmentMagnitude": 3.97,
        "adjustmentRange": { "min": 0.4, "max": 10.2 }
      },
      "sourceHealth": {
        "sports": { "healthy": true, "lastCheckTime": "2026-03-23T12:00:00.000Z", "lastErrorTime": null },
        "financial": { "healthy": true, "lastCheckTime": "2026-03-23T12:00:00.000Z", "lastErrorTime": null },
        "geopolitical": { "healthy": false, "lastCheckTime": "2026-03-23T12:00:00.000Z", "lastErrorTime": "2026-03-23T11:56:20.000Z" },
        "corporate": { "healthy": true, "lastCheckTime": "2026-03-23T12:00:00.000Z", "lastErrorTime": null }
      },
      "signalStrength": {
        "avg": 0.61,
        "distribution": { "high": 14, "medium": 11, "low": 9, "none": 4 }
      }
    },
    "diagnosticsStored": 67
  },
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

Frontend guidance:
- Poll `GET /api/admin/metrics/external-data` every 30-60 seconds for dashboard cards.
- Trigger `GET /api/admin/health/external-sources` on load and on-demand refresh.
- Use `GET /api/admin/external-data/:marketId` in market detail QA views.
