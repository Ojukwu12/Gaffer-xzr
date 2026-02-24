/**
 * Production Deployment Guide
 * Step-by-step guide for deploying Polyscope to production
 */

# Polyscope Production Deployment Guide

## Prerequisites

- Node.js 18+ installed
- MongoDB 7.0+ (local or cloud instance)
- Valid Gemini API key from Google AI Studio
- Testmail.app account for email notifications
- Domain with HTTPS certificate (recommended)

## 1. Environment Configuration

Create `.env` file in project root:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/polyscope

# Google Gemini LLM
GEMINI_API_KEY=your_gemini_api_key_here

# Email Service (Testmail.app)
SMTP_HOST=smtp.testmail.app
SMTP_PORT=587
SMTP_USER=your_testmail_username
SMTP_PASS=your_testmail_password
EMAIL_FROM=noreply@polyscope.com

# Web Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@polyscope.com

# Security
DEV_IP=your_dev_ip_for_rate_limit_bypass

# Optional: Admin User
ADMIN_EMAIL=admin@polyscope.com
ADMIN_API_KEY=generate_secure_key_here
```

## 2. Database Setup

### Option A: Local MongoDB

```bash
# Install MongoDB
# Windows: Download from mongodb.com
# Linux: sudo apt-get install mongodb

# Start MongoDB
mongod --dbpath /path/to/data

# Create indexes
mongosh < scripts/init-indexes.js
```

### Option B: MongoDB Atlas (Recommended)

1. Create free cluster at mongodb.com/cloud/atlas
2. Whitelist your server IP
3. Create database user
4. Get connection string and update MONGODB_URI

## 3. Install Dependencies

```bash
npm install --production
```

## 4. Generate VAPID Keys for Web Push

```bash
npm install -g web-push
web-push generate-vapid-keys

# Add keys to .env file
```

## 5. Create Admin User

```bash
node scripts/create-admin-user.js
# Save the generated API key securely
```

## 6. Test Configuration

```bash
# Test database connection
node -e "require('./src/config/db').connectDB().then(() => console.log('DB OK')).catch(console.error)"

# Test LLM service
curl -X POST http://localhost:3000/api/admin/test/llm \
  -H "X-API-Key: your_admin_api_key"

# Test email service
curl -X POST http://localhost:3000/api/admin/test/email \
  -H "X-API-Key: your_admin_api_key" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com"}'
```

## 7. Start Application

### Development Mode
```bash
npm run dev
```

### Production Mode (Direct)
```bash
npm start
```

### Production Mode (PM2 - Recommended)
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/index.js --name polyscope

# Enable startup script
pm2 startup
pm2 save

# Monitor
pm2 monit
```

## 8. Docker Deployment (Alternative)

```bash
# Build and start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop containers
docker-compose down
```

## 9. Setup Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name api.polyscope.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS with Let's Encrypt:
```bash
sudo certbot --nginx -d api.polyscope.com
```

## 10. Setup Cron Jobs

### Option A: System Cron (Linux)

```bash
# Edit crontab
crontab -e

# Add jobs
*/5 * * * * cd /path/to/polyscope && node src/cron/refreshMarkets.js
*/10 * * * * cd /path/to/polyscope && node src/cron/computePredictions.js
0 2 * * * cd /path/to/polyscope && node scripts/backup.js
```

### Option B: Node-cron (Built-in)

Already configured in `src/index.js` - runs automatically when server starts.

## 11. Monitoring

### Application Metrics
```bash
# Access metrics endpoint
curl http://localhost:3000/api/metrics \
  -H "X-API-Key: your_api_key"

# Prometheus metrics
curl http://localhost:3000/api/metrics/prometheus
```

### Setup Prometheus (Optional)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'polyscope'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics/prometheus'
```

### Logs

Logs are stored in `logs/` directory:
- `error.log` - Error logs
- `combined.log` - All logs

Rotate logs with logrotate:
```bash
# /etc/logrotate.d/polyscope
/path/to/polyscope/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
}
```

## 12. Backup Strategy

### Automated Daily Backups
```bash
# Runs via cron at 2 AM
node scripts/backup.js
```

### Manual Backup
```bash
mongodump --uri="$MONGODB_URI" --out=./backup-$(date +%Y%m%d)
```

### Restore Backup
```bash
mongorestore --uri="$MONGODB_URI" ./backup-20240101/
```

## 13. Security Checklist

- [ ] Change all default passwords
- [ ] Generate strong API keys
- [ ] Enable firewall (allow only ports 80, 443, 22)
- [ ] Keep dependencies updated: `npm audit`
- [ ] Setup rate limiting (already configured)
- [ ] Enable HTTPS
- [ ] Restrict MongoDB access
- [ ] Setup backup strategy
- [ ] Monitor error logs
- [ ] Configure CORS properly

## 14. Performance Tuning

### MongoDB
```javascript
// Set up proper indexes (already in init-indexes.js)
// Monitor query performance
db.setProfilingLevel(1, { slowms: 100 })
```

### Node.js
```bash
# Increase memory limit if needed
node --max-old-space-size=4096 src/index.js
```

### Caching
- Memory cache configured (5 minute TTL)
- MongoDB cache for persistence
- Adjust TTL in `src/config/features.js`

## 15. Scaling

### Horizontal Scaling
```bash
# Run multiple instances with PM2
pm2 start src/index.js -i max --name polyscope
```

### Load Balancer (Nginx)
```nginx
upstream polyscope {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
```

## 16. Troubleshooting

### Check Health
```bash
curl http://localhost:3000/health
```

### Common Issues

**Database Connection Failed**
```bash
# Check MongoDB is running
systemctl status mongod

# Test connection
mongosh $MONGODB_URI
```

**LLM Not Responding**
```bash
# Verify API key
curl https://generativelanguage.googleapis.com/v1/models/gemini-pro?key=$GEMINI_API_KEY
```

**High Memory Usage**
```bash
# Restart with PM2
pm2 restart polyscope

# Clear cache
curl -X POST http://localhost:3000/api/admin/cache/clear \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"type":"all"}'
```

## 17. API Documentation

Full API documentation available at:
- `docs/api-contract.md`
- Postman collection: Import from `docs/postman_collection.json`

## 18. Support

For issues:
1. Check logs in `logs/` directory
2. Review health endpoint: `/health`
3. Check metrics: `/api/metrics`
4. Review GitHub issues

## Production Checklist

Before going live:
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] Admin user created
- [ ] Services tested (LLM, Email, Push)
- [ ] Cron jobs configured
- [ ] Backups scheduled
- [ ] Monitoring setup
- [ ] Logs rotation configured
- [ ] HTTPS enabled
- [ ] Firewall configured
- [ ] Documentation reviewed
- [ ] Load testing completed
