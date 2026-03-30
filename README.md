# Polyscope

Production-grade backend for predicting Polymarket outcomes using AI-powered analysis with 50+ advanced features, comprehensive testing, and CI/CD pipeline.

## ✨ Key Features

- **50+ Prediction Features**: Market validation, liquidity analysis, anomaly detection, risk scoring
- **AI-Powered Insights**: Google Gemini 2.5 Flash with strict validation
- **Production Ready**: Full test suite, CI/CD pipeline, monitoring setup
- **Security Hardened**: Rate limiting, CORS, input validation, authentication
- **Well Documented**: Central API documentation and setup guidance
- **Frontend Ready**: Prediction responses include direct Polymarket links

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- MongoDB
- Google Gemini Pro API key
- Brevo account with API key (for email sending)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Generate VAPID keys (one-time setup for push notifications)
npm run generate-keys

# 3. Copy environment template
cp .env.example .env

# 4. Edit .env with your credentials
# Required: MONGODB_URI, (LLM_API_KEY or GEMINI_API_KEY)
# Recommended for production email: BREVO_API_KEY
# VAPID keys already generated in step 2!

# 5. Initialize database indexes
npm run init-db

# 6. Create admin user
npm run setup
```

### Running the Server

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check code quality
npm run lint
```

Server will start on `http://localhost:5000` by default.

## 📝 What's New in v2.0

### Prediction Status Indicators
- Markets now include a `hasPrediction` boolean field
- Frontend can display prediction indicators on market tiles (e.g., "🎯 Predicted" badge)
- Use this field to show users which markets have AI analysis available

### Updated Market Responses
All market endpoints now return:
- **`hasPrediction`** - Whether the market has approved or pending predictions
- **`cachedPredictions`** - Latest predictions organized by option and timeframe
- **`availableTimeframes`** - Prediction timeframes available for the market

### Direct Market URLs  
- Fixed Polymarket link generation to use stable `/event/{slug}` format
- Predictions now link correctly to markets without 404 errors
- Automatic slug generation from market titles when needed

### Automatic Database Migration
- Migration runs automatically on server startup (non-blocking)
- Updates all predictions with correct fields
- No manual steps required - just start the server
- Idempotent - safe to re-run or restart during migration

**Startup log output:**
```
Running startup migrations...
Running startup migration for 127 predictions
✓ Startup migration completed: updated 89/127 predictions

### Notification System Improvements
- Push notifications now send proper welcome message: "👋 Welcome to Polyscope"
- Email verification links redirect to frontend (configurable via `FRONTEND_URL`)
- Simplified frontend integration with complete code examples

**Configuration:**
```env
# Backend self-reference (internal use)
APP_URL=http://localhost:5000

# Frontend URL (for email verification redirects)
FRONTEND_URL=http://localhost:3000
```

**Frontend Integration:**
See [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) for:
- Email subscription and verification handling
- Push notification setup and service worker
- Complete code examples for React/vanilla JS
- Troubleshooting guide
```

### Migration Instructions
**No action needed** - migrations run automatically at startup.

**For Frontend Developers:**
See [docs/MIGRATION_V2_PREDICTION_STATUS.md](docs/MIGRATION_V2_PREDICTION_STATUS.md) for:
- Updated API response examples
- Frontend component code examples
- Backward compatibility notes
- Response format specifications

## 🧪 Testing

The project includes a comprehensive test suite:

```bash
# Run all tests with coverage
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# View coverage report
open coverage/lcov-report/index.html
```

**Coverage Target**: 70%+ across all metrics
**Test Files**: 70+ tests across unit, integration, and API tests

See [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for endpoint usage and examples.

## 🔄 CI/CD Pipeline

Automated testing and deployment via GitHub Actions:

- ✅ Automated testing on push/PR
- ✅ Code linting and quality checks
- ✅ Security vulnerability scanning
- ✅ Docker image building
- ✅ Coverage reporting

See [.github/workflows/ci.yml](.github/workflows/ci.yml) for pipeline configuration.

## 📁 Project Structure

```
/src
  /config          # Configuration files
  /controllers     # Request handlers
  /models          # MongoDB schemas
  /routes          # API routes
  /services        # Business logic
  /middlewares     # Express middlewares
  /utils           # Utility functions
  /cron            # Background jobs
index.js           # Server entry point
docs/API_DOCUMENTATION.md  # API reference
```

## 🔑 Key Features

### Core Prediction Engine (50+ Features)
- **Market Validation**: 7 comprehensive checks for data quality
- **Liquidity Analysis**: Total, per-option, health classification
- **Volume Metrics**: 24h tracking, concentration analysis
- **Price Distribution**: Spread, consensus, imbalance detection
- **Trend Analysis**: Multi-period momentum, RSI-like indicators
- **Sentiment Analysis**: Tag-based, description parsing
- **Trading Activity**: Frequency, participation, velocity
- **Whale Activity**: Large position detection, smart money tracking
- **Market Depth**: Order book analysis, liquidity distribution
- **Timing Factors**: Urgency scoring, lifecycle stages
- **Risk Analysis**: 6-factor comprehensive risk assessment
- **Anomaly Detection**: 8 types of market anomalies

### LLM Integration
- **Google Gemini 2.5 Flash**: Advanced AI-powered predictions
- **Secondary LLM Fallback**: Optional Claude/Ollama fallback for resiliency
- **Strict System Prompt**: Validated, structured output format
- **Confidence Scoring**: 0-100 confidence levels
- **Key Factors**: Reasoning and risk identification
- **Error Handling**: Comprehensive retry logic

### Communication & Notifications
- **Brevo Email Delivery**: Transactional email notifications
- **Web Push Notifications**: Real-time browser notifications
- **Webhook System**: External integrations with HMAC signatures

### Production Features
- **Caching System**: Hybrid in-memory + MongoDB
- **Rate Limiting**: General (100/5min) + Prediction (50/5min) + Sensitive (20/5min) + outbound provider pacing
- **Authentication**: JWT-based with role-based access
- **Security**: CORS, Helmet, input validation, request timeouts
- **Monitoring**: Metrics endpoint, Winston logging
- **Docker Support**: Complete containerization with compose
- **Automated Backups**: MongoDB backup script with 7-day retention

## 🌐 API Endpoints

### Markets
- `GET /api/markets` - List all markets
- `GET /api/markets/:id` - Get market details
- `GET /api/markets/search` - Search markets
- `GET /api/markets/trending` - Trending markets

### Predictions
- `GET /api/predictions` - List approved predictions (read-only)
- `GET /api/predictions/:predictionId` - Get approved prediction by ID
- `POST /api/predictions/:predictionId/vote` - Submit UI feedback vote
- `GET /api/predictions/performance` - Win-rate + correct/incorrect predictions (max 30 days)

### Notifications
- `POST /api/notifications/email/subscribe` - Subscribe to email alerts
- `POST /api/notifications/push/subscribe` - Subscribe to push notifications
- `GET /api/notifications/push/vapid-public-key` - Get VAPID key

### Admin
- `POST /api/admin/cache/clear` - Clear cache
- `POST /api/admin/cron/run` - Run cron jobs
- `GET /api/admin/debug` - System information
- `GET /api/admin/stats/predictions` - Prediction stats
- `GET /api/admin/external-data/:marketId` - External score diagnostics for a market
- `GET /api/admin/health/external-sources` - External API/source health checks
- `GET /api/admin/metrics/external-data` - External data monitoring metrics

Admin auth requirements for `/api/admin/*`:
- `x-admin-key: <ADMIN_SECRET_KEY from .env>`
- `X-API-Key: <admin user's API key>`

Example:
```bash
curl http://localhost:5000/api/admin/debug \
  -H "x-admin-key: your_admin_secret_key" \
  -H "X-API-Key: your_admin_api_key"
```

### Health
- `GET /health` - System health check

## 📖 Documentation

Primary documentation:

- **[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)** - Complete API reference with current request/response formats

## ⚙️ Configuration

Key environment variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/polyscope

# LLM (Required)
LLM_API_KEY=your_gemini_api_key
# OR
GEMINI_API_KEY=your_gemini_api_key

# Email (Optional - Brevo)
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM_ADDRESS=obiefunaokechukwu98@gmail.com
EMAIL_FROM_NAME=Polyscope Notifications
APP_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000

# Admin auth
ADMIN_SECRET_KEY=your_admin_secret_key
ADMIN_API_KEY=your_admin_api_key
ADMIN_EMAIL=admin@polyscope.app

# Startup behavior:
# - If ADMIN_EMAIL is set, backend syncs that email to an active admin user in DB.
# - If ADMIN_API_KEY is set, it is applied to that admin user during startup sync.

# Web Push (Optional)
WEB_PUSH_VAPID_PUBLIC=your_public_key
WEB_PUSH_VAPID_PRIVATE=your_private_key

# Cache & Notifications
CACHE_TTL=300
NOTIFICATION_THRESHOLD=10

# Server
PORT=5000
```

## 🔧 Development

```bash
# Run with nodemon
npm run dev

# Test prediction computation
npm run refresh
```

## ✅ Pre-Production Validation (Recommended)

Before enabling live notifications and production mode, run the system in paper mode and require statistical readiness:

```bash
# 1) Keep predictions in paper mode (no live notifications)
export PREDICTION_MODE=paper

# 2) Run regular prediction cycles to accumulate paper records
npm run paper:run

# 3) Evaluate readiness using resolved paper predictions
npm run readiness:check -- --mode=paper --days=30 --minResolved=100 --minLowerBound=51
```

Optional hard startup gate for production:

```bash
export NODE_ENV=production
export ENFORCE_PRODUCTION_READINESS=true
export READINESS_MODE=paper
export READINESS_MIN_RESOLVED=100
export MIN_WIN_RATE_LOWER_BOUND=51
npm start
```

If readiness does not pass, server startup is blocked in production mode when `ENFORCE_PRODUCTION_READINESS=true`.

## 📊 Architecture

- **Express.js** - Web framework
- **MongoDB + Mongoose** - Database
- **Google Gemini 2.5 Flash** - AI predictions
- **Node-Cache** - In-memory caching
- **Brevo API (Axios)** - Email service
- **Web-Push** - Push notifications
- **Winston** - Logging
- **Helmet + CORS** - Security

## 🛡️ Security

- Helmet for security headers
- CORS enabled
- Rate limiting per IP
- Input validation
- Error sanitization

## 📝 License

MIT

## 🤝 Contributing

This is a complete, production-ready backend. All endpoints are fully implemented with no placeholders.
