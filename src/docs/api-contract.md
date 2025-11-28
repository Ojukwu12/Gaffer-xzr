# Polyscope API Documentation

## Overview

Polyscope is a production-grade backend that predicts the probability of outcomes on Polymarket. It uses advanced feature computation, whale analysis, and LLM-powered reasoning to provide confidence scores for market predictions.

**Base URL**: `http://localhost:5000`

**Version**: 1.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Response Format](#response-format)
4. [Error Handling](#error-handling)
5. [Market Endpoints](#market-endpoints)
6. [Prediction Endpoints](#prediction-endpoints)
7. [Notification Endpoints](#notification-endpoints)
8. [Admin Endpoints](#admin-endpoints)
9. [Example Usage](#example-usage)

---

## Authentication

Currently, the API does not require authentication for most endpoints. Admin endpoints should be protected in production environments.

---

## Rate Limiting

- **General endpoints**: 100 requests per 5 minutes per IP
- **Prediction endpoints**: 50 requests per 5 minutes per IP
- **Admin endpoints**: 20 requests per 5 minutes per IP
- **Dev IP bypass**: Configure `DEV_IP` in `.env` to bypass rate limits

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "message": "Success",
  "data": { ... },
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

### Paginated Response

```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 250,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  },
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

---

## Error Handling

### Error Response

```json
{
  "success": false,
  "message": "Error message",
  "errorCode": "ERROR_CODE",
  "timestamp": "2025-11-28T12:00:00.000Z"
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400): Invalid request parameters
- `NOT_FOUND` (404): Resource not found
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error
- `LLM_NOT_CONFIGURED` (500): LLM service not configured
- `INVALID_TIMEFRAME` (400): Invalid timeframe parameter
- `TIMEFRAME_NOT_AVAILABLE` (400): Timeframe not available for market

---

## Market Endpoints

### GET /api/markets

Get all active markets with optional filters.

**Query Parameters:**
- `category` (string, optional): Filter by category
- `timeframe` (string, optional): Filter by timeframe (`daily`, `weekly`, `monthly`)
- `status` (string, optional): Filter by status (`active`, `closed`)
- `limit` (integer, optional, default: 50, max: 100): Results per page
- `offset` (integer, optional, default: 0): Pagination offset

**Example Request:**
```bash
GET /api/markets?category=politics&timeframe=weekly&limit=10
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "marketId": "0x123...",
        "title": "Will Bitcoin reach $100k by end of 2025?",
        "description": "Resolves YES if BTC hits $100,000...",
        "options": ["Yes", "No"],
        "status": "active",
        "liquidity": 183828,
        "volume": 932842,
        "volume24h": 45000,
        "categories": ["crypto", "markets"],
        "createdAt": "2025-01-01T00:00:00.000Z",
        "endDate": "2025-12-31T23:59:59.000Z",
        "currentPrices": [0.65, 0.35],
        "availableTimeframes": ["daily", "weekly", "monthly"],
        "optimalTimeframe": "weekly"
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

---

### GET /api/markets/:id

Get detailed information for a specific market.

**Path Parameters:**
- `id` (string, required): Market ID

**Example Request:**
```bash
GET /api/markets/0x123abc
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "title": "Will Bitcoin reach $100k by end of 2025?",
    "options": ["Yes", "No"],
    "liquidity": 183828,
    "timeframes": {
      "available": ["daily", "weekly", "monthly"],
      "optimal": "weekly",
      "details": {
        "daily": {
          "timeframeValid": true,
          "relevanceScore": 0.95,
          "maturityScore": 1.0
        }
      }
    },
    "cachedPredictions": {
      "Yes": {
        "daily": {
          "confidence": 72,
          "reason": "Strong bullish momentum with whale accumulation",
          "timestamp": "2025-11-28T12:00:00.000Z"
        }
      }
    }
  }
}
```

---

### GET /api/markets/search

Search markets by query string.

**Query Parameters:**
- `q` (string, required, min: 2 chars): Search query
- `limit` (integer, optional, default: 20, max: 50): Maximum results

**Example Request:**
```bash
GET /api/markets/search?q=bitcoin&limit=5
```

---

### GET /api/markets/trending

Get trending markets.

**Query Parameters:**
- `limit` (integer, optional, default: 10, max: 50): Number of markets

**Example Request:**
```bash
GET /api/markets/trending?limit=10
```

---

### GET /api/markets/category/:category

Get markets by category.

**Path Parameters:**
- `category` (string, required): Category name

**Query Parameters:**
- `limit` (integer, optional, default: 50, max: 100)

**Example Request:**
```bash
GET /api/markets/category/politics?limit=20
```

---

## Prediction Endpoints

### GET /api/markets/:id/predict

Generate a prediction for a specific market option.

**Path Parameters:**
- `id` (string, required): Market ID

**Query Parameters:**
- `option` (string, required): Option to predict (e.g., "Yes", "No")
- `timeframe` (string, optional, default: "daily"): `daily`, `weekly`, or `monthly`

**Example Request:**
```bash
GET /api/markets/0x123abc/predict?option=Yes&timeframe=daily
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "option": "Yes",
    "timeframe": "daily",
    "confidence": 86,
    "reason": "Volume surge + whale accumulation suggest upward momentum",
    "features": {
      "liquidity": 183828,
      "volume24h": 932842,
      "whaleFactor": 0.81,
      "trendScore": 0.72,
      "sentimentScore": 0.68,
      "dailyChange": 0.12,
      "weeklyChange": 0.31,
      "monthlyChange": 0.55,
      "tradeCount24h": 9328,
      "uniqueTraders24h": 2798,
      "currentPrice": 0.65,
      "priceVolatility": 0.15,
      "momentumScore": 0.78,
      "marketAge": 45,
      "daysUntilExpiry": 320,
      "whaleCount": 12,
      "whaleVolume": 755000,
      "smartMoneyFlow": 320000,
      "smartMoneyDirection": 0.65,
      "participationRate": 0.42,
      "holderCount": 6650,
      "concentrationRatio": 0.38,
      "giniCoefficient": 0.30,
      "socialMentions": 932,
      "communityGrowth": 0.15,
      "riskScore": 0.25,
      "liquidityRisk": 0.20,
      "marketEfficiency": 0.82,
      "categoryCorrelation": 0.60,
      "historicalAccuracy": 0.65,
      "optionPopularity": 0.50,
      "optionMomentum": 0.78,
      "anomalyScore": 0.15
    },
    "timestamp": "2025-11-28T12:00:00.000Z",
    "fromCache": false,
    "computationTime": 2350
  }
}
```

---

### GET /api/markets/:id/predict-all

Generate predictions for all options in a market.

**Path Parameters:**
- `id` (string, required): Market ID

**Query Parameters:**
- `timeframe` (string, optional, default: "daily")

**Example Request:**
```bash
GET /api/markets/0x123abc/predict-all?timeframe=weekly
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "marketId": "0x123abc",
    "timeframe": "weekly",
    "predictions": [
      {
        "option": "Yes",
        "confidence": 72,
        "reason": "Bullish momentum with strong whale support"
      },
      {
        "option": "No",
        "confidence": 28,
        "reason": "Limited downward pressure"
      }
    ]
  }
}
```

---

### GET /api/markets/:id/features

Get computed features without generating LLM prediction.

**Path Parameters:**
- `id` (string, required): Market ID

**Query Parameters:**
- `option` (string, required): Option name
- `timeframe` (string, optional, default: "daily")

**Example Request:**
```bash
GET /api/markets/0x123abc/features?option=Yes&timeframe=daily
```

---

### GET /api/markets/:id/cache

Get all cached predictions for a market.

**Path Parameters:**
- `id` (string, required): Market ID

**Example Request:**
```bash
GET /api/markets/0x123abc/cache
```

---

### POST /api/predictions/batch

Generate predictions for multiple markets in a single request.

**Request Body:**
```json
{
  "markets": [
    {
      "marketId": "0x123abc",
      "option": "Yes"
    },
    {
      "marketId": "0x456def",
      "option": "No"
    }
  ],
  "timeframe": "daily"
}
```

**Limits**: Maximum 10 markets per request

---

## Notification Endpoints

### POST /api/notifications/email/subscribe

Subscribe to email notifications.

**Request Body:**
```json
{
  "email": "user@example.com",
  "markets": [
    {
      "marketId": "0x123abc",
      "marketTitle": "Bitcoin $100k?"
    }
  ],
  "preferences": {
    "frequency": "daily",
    "minConfidence": 70,
    "maxNotificationsPerDay": 10
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
    "unsubscribeToken": "abc123..."
  }
}
```

---

### GET /api/notifications/email/verify

Verify email subscription via token.

**Query Parameters:**
- `token` (string, required): Verification token from email

**Example Request:**
```bash
GET /api/notifications/email/verify?token=abc123...
```

---

### POST /api/notifications/email/unsubscribe

Unsubscribe from email notifications.

**Request Body:**
```json
{
  "token": "unsubscribe_token_here"
}
```
or
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/notifications/push/subscribe

Subscribe to Web Push notifications.

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BN...",
      "auth": "Ab..."
    }
  },
  "markets": [
    {
      "marketId": "0x123abc"
    }
  ],
  "preferences": {
    "minConfidence": 75,
    "maxNotificationsPerDay": 20
  }
}
```

---

### GET /api/notifications/push/vapid-public-key

Get VAPID public key for Web Push subscriptions.

**Response:**
```json
{
  "success": true,
  "data": {
    "publicKey": "BN4O7..."
  }
}
```

---

### POST /api/notifications/test

Send a test notification.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```
or
```json
{
  "pushSubscription": {
    "endpoint": "...",
    "keys": { ... }
  }
}
```

---

### PATCH /api/notifications/preferences

Update notification preferences.

**Request Body:**
```json
{
  "type": "email",
  "identifier": "user@example.com",
  "preferences": {
    "frequency": "weekly",
    "minConfidence": 80
  }
}
```

---

## Admin Endpoints

### POST /api/admin/cache/clear

Clear cache entries.

**Request Body:**
```json
{
  "type": "all"
}
```

**Types**: `all`, `expired`, `predictions`

---

### GET /api/admin/cache/stats

Get cache statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "memory": {
      "keys": 145,
      "hits": 2340,
      "misses": 567
    },
    "database": {
      "total": 1250,
      "active": 980,
      "expired": 270
    }
  }
}
```

---

### POST /api/admin/cron/run

Manually run a cron job.

**Request Body:**
```json
{
  "job": "refresh"
}
```

**Jobs**: `refresh` (refresh markets), `compute` (compute predictions)

---

### GET /api/admin/debug

Get comprehensive system debug information.

**Response includes:**
- Database connection status
- Cache statistics
- Model counts
- Service status (LLM, email, push)
- System information

---

### POST /api/admin/test/llm

Test LLM connection.

---

### POST /api/admin/test/email

Test email service.

**Request Body:**
```json
{
  "to": "test@example.com"
}
```

---

### GET /api/admin/stats/predictions

Get prediction statistics.

---

### GET /api/admin/stats/notifications

Get notification statistics.

---

## Example Usage

### Frontend Integration Example

```javascript
// Fetch market prediction
async function getPrediction(marketId, option) {
  const response = await fetch(
    `http://localhost:5000/api/markets/${marketId}/predict?option=${option}&timeframe=daily`
  );
  const data = await response.json();
  
  if (data.success) {
    console.log(`Confidence: ${data.data.confidence}%`);
    console.log(`Reason: ${data.data.reason}`);
    return data.data;
  }
}

// Subscribe to push notifications
async function subscribeToPush(marketId) {
  // Get service worker registration
  const registration = await navigator.serviceWorker.ready;
  
  // Get VAPID key
  const vapidResponse = await fetch('http://localhost:5000/api/notifications/push/vapid-public-key');
  const { data: { publicKey } } = await vapidResponse.json();
  
  // Subscribe
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey
  });
  
  // Send to backend
  await fetch('http://localhost:5000/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription,
      markets: [{ marketId }],
      preferences: { minConfidence: 75 }
    })
  });
}

// Subscribe to email notifications
async function subscribeToEmail(email, marketId) {
  const response = await fetch('http://localhost:5000/api/notifications/email/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      markets: [{ marketId }],
      preferences: {
        frequency: 'daily',
        minConfidence: 70
      }
    })
  });
  
  const data = await response.json();
  if (data.success) {
    alert('Subscription successful! Check your email to verify.');
  }
}
```

---

## Health Check

### GET /health

Check system health and status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": "3600s",
    "timestamp": "2025-11-28T12:00:00.000Z",
    "database": {
      "status": "connected",
      "name": "polyscope"
    },
    "cache": {
      "memoryKeys": 145,
      "databaseActive": 980
    },
    "llm": {
      "status": "configured",
      "model": "gemini-pro"
    },
    "lastCronRun": "2025-11-28T11:00:00.000Z",
    "version": "1.0.0"
  }
}
```

---

## CLI Commands

```bash
# Start server
npm start

# Development mode with auto-reload
npm run dev

# Run prediction computation manually
npm run refresh
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Prediction results are cached for 5 minutes (300 seconds)
- Market data is cached for 10 minutes (600 seconds)
- Whale factor data is cached for 10 minutes (600 seconds)
- The LLM uses Google Gemini Pro for prediction reasoning
- Email service uses Testmail.app
- Web Push uses VAPID protocol

---

## Support

For issues or questions, refer to the system logs or check the `/health` endpoint for system status.
