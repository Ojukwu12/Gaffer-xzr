# Backend Setup & Configuration Guide

## Overview

Polyscope is a production-grade backend for predicting Polymarket outcomes using AI-powered analysis and market data. This document covers the complete setup, authentication, and deployment configuration.

## System Requirements

- Node.js 18+
- MongoDB (Atlas or local)
- npm or yarn

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd Polyscope
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://yourapp.com

# MongoDB (Atlas Example)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/polyscope?appName=Cluster0

# Polymarket API
POLYMARKET_API_BASE=https://gamma-api.polymarket.com
POLYMARKET_API_KEY=your_polymarket_api_key_here

# LLM Configuration (Google Gemini)
LLM_API_KEY=your_gemini_api_key_here

# Email Service Configuration
SMTP_HOST=smtp.testmail.app
SMTP_PORT=587
SMTP_USER=your_testmail_username
SMTP_PASS=your_testmail_password
EMAIL_FROM=noreply@polyscope.com

# Web Push Notifications (VAPID)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@polyscope.com

# Admin Configuration
ADMIN_API_KEY=generated_api_key_here
ADMIN_EMAIL=admin@polyscope.app

# Cache Configuration
CACHE_TTL=300

# Notification Configuration
NOTIFICATION_THRESHOLD=10

# Logging
LOG_LEVEL=info

# Rate Limit Bypass (Dev IP)
DEV_IP=127.0.0.1
```

## Authentication

### Admin Authentication

The backend uses **API Key authentication** for admin endpoints. All admin requests must include the `X-API-Key` header.

#### Creating Admin User

```bash
npm run setup
```

This will:
1. Connect to MongoDB
2. Create an admin user with email `admin@polyscope.app`
3. Generate and display a secure API key
4. Display usage example

#### Sample Output

```
✓ Admin user created successfully!

Email:   admin@polyscope.app
API Key: 7bd914b9afa5b47933e0c2dc220d623ce6195ad198b96f1aa8015eafdf2f0a6b

Usage example:
curl -H "X-API-Key: 7bd914b9afa5b47933e0c2dc220d623ce6195ad198b96f1aa8015eafdf2f0a6b" http://localhost:5000/api/admin/debug
```

#### Sending API Key in Requests

All admin requests must include the API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:5000/api/admin/webhooks
```

For frontend (JavaScript):

```javascript
const apiKey = 'YOUR_API_KEY';

fetch('http://localhost:5000/api/admin/webhooks', {
  method: 'GET',
  headers: {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json'
  }
});
```

## Running the Backend

### Development Mode

```bash
npm run dev
```

This starts the server with auto-reload on file changes.

### Production Mode

```bash
npm start
```

### Build Command

There's no separate build step. The application runs directly with Node.js:

```bash
node src/index.js
```

## API Endpoints

### Health Check

```bash
GET /health
```

Returns system status, uptime, database connection, cache stats, and service configuration.

### Public Endpoints

- `GET /` - API information
- `GET /api/markets` - List all markets
- `GET /api/markets/:id/predict` - Get prediction for a market
- `GET /api/metrics` - System metrics

### Admin Endpoints (Require API Key)

#### Webhook Management

```bash
# Create webhook
POST /api/admin/webhooks
Body: {
  "url": "https://your-webhook-url.com/endpoint",
  "events": ["prediction.created", "market.trending", "whale.activity", "high.confidence"],
  "filters": {
    "minConfidence": 70,
    "markets": ["market-id"],
    "categories": ["category"]
  },
  "metadata": {
    "name": "Webhook Name",
    "description": "Optional description"
  }
}

# List all webhooks
GET /api/admin/webhooks

# Get specific webhook
GET /api/admin/webhooks/:id

# Update webhook
PUT /api/admin/webhooks/:id

# Delete webhook
DELETE /api/admin/webhooks/:id

# Test webhook delivery
POST /api/admin/webhooks/:id/test
```

#### System Management

```bash
# Get debug information
GET /api/admin/debug

# Get cache statistics
GET /api/admin/cache/stats

# Clear cache
POST /api/admin/cache/clear
Body: { "type": "all|expired|predictions" }

# Invalidate market cache
POST /api/admin/cache/invalidate/:marketId

# Run cron job manually
POST /api/admin/cron/run
Body: { "job": "refresh|compute" }

# Test LLM connection
POST /api/admin/test/llm

# Test email service
POST /api/admin/test/email
Body: { "to": "test@example.com" }

# Get prediction statistics
GET /api/admin/stats/predictions

# Get notification statistics
GET /api/admin/stats/notifications
```

## Webhook System

### How Webhooks Work

1. **Registration**: Admin creates a webhook with a URL and list of events
2. **Signing**: Each delivery is signed with HMAC-SHA256 using the webhook secret
3. **Delivery**: When an event occurs, the payload is sent to the registered URL
4. **Retry**: Failed deliveries retry up to 3 times with exponential backoff
5. **Tracking**: Success/failure statistics are recorded

### Webhook Events

- `prediction.created` - New prediction generated
- `prediction.updated` - Existing prediction updated
- `market.trending` - Market trending detected
- `whale.activity` - Large whale trader activity
- `high.confidence` - High confidence prediction (>80%)

### Webhook Payload Format

```json
{
  "event": "prediction.created",
  "data": {
    "marketId": "0x123...",
    "prediction": "Yes",
    "confidence": 85,
    "timeframe": "daily"
  },
  "timestamp": "2025-12-09T00:45:26.577Z",
  "webhookId": "693771226b343c410cec803ab"
}
```

### Webhook Headers

```
X-Webhook-Signature: <hmac-sha256-signature>
X-Webhook-Event: prediction.created
User-Agent: Polyscope-Webhook/1.0
```

### Webhook Secret

Each webhook has a unique secret generated automatically. Use it to verify request signatures:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
}
```

## Frontend Integration

### API Base URL

Set the API base URL in your frontend environment:

```env
# React
REACT_APP_API_URL=http://localhost:5000/api

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Vue
VUE_APP_API_URL=http://localhost:5000/api
```

### Admin API Key

Store the admin API key securely (environment variable, secrets manager):

```javascript
// Example: React
const API_KEY = process.env.REACT_APP_ADMIN_API_KEY;

// Always send with requests
const makeAdminRequest = async (endpoint, options = {}) => {
  const response = await fetch(`${process.env.REACT_APP_API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  return response.json();
};
```

## Database

### MongoDB Atlas Setup

1. Create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a database named `polyscope`
3. Add a database user with read/write permissions
4. Whitelist your IP address (or use 0.0.0.0 for development)
5. Copy the connection string and update `MONGODB_URI` in `.env`

### Indexes

The application automatically creates required indexes on startup. Collections created:

- `users` - User accounts and admin credentials
- `webhooks` - Webhook registrations and delivery history
- `emailSubscriptions` - Email subscription management
- `pushSubscriptions` - Web push subscription management
- `predictionCache` - Cached market predictions

## Services

### LLM Service (Google Gemini)

Provides AI-powered market analysis and predictions.

**Setup:**
1. Get API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Set `LLM_API_KEY` in `.env`

### Email Service

Sends email notifications to subscribers.

**Configured with:** Testmail.app SMTP
**To use custom email:** Update `SMTP_*` variables

### Web Push Service

Sends browser push notifications.

**Requires:** VAPID keys (public/private pair)

**Generate keys:**
```bash
npm run generate-keys
```

## Cron Jobs

Scheduled tasks running automatically:

- **Market Refresh**: Every 5 minutes - Fetches latest market data from Polymarket
- **Prediction Computation**: Every 10 minutes - Generates predictions for active markets

**Manual execution:**
```bash
# Run via API
curl -X POST -H "X-API-Key: YOUR_KEY" http://localhost:5000/api/admin/cron/run -d '{"job":"refresh"}' -H "Content-Type: application/json"

# Or via script
node src/cron/refreshMarkets.js
node src/cron/computePredictions.js
```

## Deployment

### Environment Variables for Production

Update `.env` for production:

```env
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
LOG_LEVEL=warn
```

### Hosting Platforms

#### Heroku

```bash
# Deploy
git push heroku main

# View logs
heroku logs --tail
```

#### Railway / Render / Fly.io

Add `Procfile`:
```
web: node src/index.js
```

#### Docker

```bash
docker build -t polyscope .
docker run -p 5000:5000 --env-file .env polyscope
```

## Monitoring & Logging

### Log Levels

Set via `LOG_LEVEL` environment variable:
- `error` - Errors only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

### Logs Location

- Console output
- File: `logs/app.log` (if configured)

## Troubleshooting

### "MongoDB connection refused"

- Check MongoDB is running
- Verify `MONGODB_URI` is correct
- Ensure IP is whitelisted (Atlas)

### "API key is required"

- Include `X-API-Key` header in requests
- Use the correct admin API key

### "LLM API key is invalid"

- Verify `LLM_API_KEY` is correct
- Check API key has proper permissions

### Webhook delivery failing

- Verify webhook URL is accessible
- Check webhook secret for signature verification
- Review webhook logs: `GET /api/admin/webhooks/:id`

## Useful Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Create admin user
npm run setup

# Run tests
npm test

# Generate API keys
npm run generate-keys

# Backup database
npm run backup

# Initialize database indexes
npm run init-db
```

## Support

For issues or questions, refer to:
- API Documentation: `/docs/API_DOCUMENTATION.md`
- Testing Guide: `/docs/TESTING_GUIDE.md`
- Production Checklist: `/docs/PRODUCTION_READINESS.md`

