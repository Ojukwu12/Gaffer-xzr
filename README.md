# Polyscope

Production-grade backend for predicting Polymarket outcomes using AI-powered analysis.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- MongoDB
- Google Gemini Pro API key
- Testmail.app account (for emails)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Generate VAPID keys (one-time setup for push notifications)
npm run generate-keys

# 3. Copy environment template
cp .env.example .env

# 4. Edit .env with your credentials
# Required: MONGODB_URI, GEMINI_API_KEY, SMTP credentials
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
```

Server will start on `http://localhost:3000`

### Manual Tasks

```bash
# Compute predictions for all active markets
npm run refresh
```

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
  /docs            # API documentation
index.js           # Server entry point
```

## 🔑 Key Features

### Core Functionality
- **40+ Computed Features**: Liquidity, volume, whale metrics, trends, sentiment, risk scores
- **LLM-Powered Predictions**: Uses Google Gemini Pro for intelligent analysis
- **Whale Factor Analysis**: Tracks large trader behavior and smart money flow
- **Timeframe Support**: Daily, weekly, and monthly predictions

### Communication
- **5 Professional Email Templates**: Prediction alerts, high confidence, daily digest, welcome, confirmation
- **Web Push Notifications**: Real-time browser notifications with custom payloads
- **Webhook System**: External integrations with HMAC signatures and retry logic

### Production Ready
- **Caching System**: Hybrid in-memory + MongoDB caching
- **Rate Limiting**: Configurable with dev IP bypass
- **Authentication**: API key + role-based access control
- **Security**: Input sanitization, XSS protection, request timeouts
- **Monitoring**: Prometheus-compatible metrics endpoint
- **Docker Support**: Complete docker-compose.yml with MongoDB + Redis
- **Automated Backups**: MongoDB backup script with 7-day retention

## 📧 Email Templates

Five professionally designed, mobile-responsive templates:

1. **Prediction Alert** - Beautiful gradient design with AI analysis
2. **High Confidence** - Urgent alerts for 80%+ predictions
3. **Daily Digest** - Top 5 predictions summary
4. **Welcome Email** - Onboarding with API key
5. **Subscription Confirmation** - Email verification

See `docs/EMAIL-TEMPLATES.md` and `docs/VAPID-AND-EMAILS.md` for details.

## 🌐 API Endpoints

### Markets
- `GET /api/markets` - List all markets
- `GET /api/markets/:id` - Get market details
- `GET /api/markets/search` - Search markets
- `GET /api/markets/trending` - Trending markets

### Predictions
- `GET /api/markets/:id/predict` - Generate prediction
- `GET /api/markets/:id/predict-all` - Predict all options
- `GET /api/markets/:id/features` - Get features only
- `POST /api/predictions/batch` - Batch predictions

### Notifications
- `POST /api/notifications/email/subscribe` - Subscribe to email alerts
- `POST /api/notifications/push/subscribe` - Subscribe to push notifications
- `GET /api/notifications/push/vapid-public-key` - Get VAPID key

### Admin
- `POST /api/admin/cache/clear` - Clear cache
- `POST /api/admin/cron/run` - Run cron jobs
- `GET /api/admin/debug` - System information
- `GET /api/admin/stats/predictions` - Prediction stats

### Health
- `GET /health` - System health check

## 📖 Full Documentation

See `/src/docs/api-contract.md` for complete API documentation with examples.

## ⚙️ Configuration

Key environment variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/polyscope

# LLM (Required)
LLM_API_KEY=your_gemini_api_key

# Email (Optional)
EMAIL_SERVICE_HOST=smtp.testmail.app
EMAIL_SERVICE_USER=your_username
EMAIL_SERVICE_PASSWORD=your_password

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

## 📊 Architecture

- **Express.js** - Web framework
- **MongoDB + Mongoose** - Database
- **Google Gemini Pro** - AI predictions
- **Node-Cache** - In-memory caching
- **Nodemailer** - Email service
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
