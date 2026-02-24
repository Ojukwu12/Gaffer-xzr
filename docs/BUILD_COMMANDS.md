# Build & Deployment Commands

## Development

### Install Dependencies
```bash
npm install
```

### Start Development Server (with auto-reload)
```bash
npm run dev
```

Server will run on `http://localhost:5000`

### Create Admin User
```bash
npm run setup
```

This creates an admin user and displays the API key needed for admin endpoints.

## Production

### Start Production Server
```bash
npm start
```

This is the main server command that:
- Connects to MongoDB
- Initializes all services (LLM, Email, Web Push)
- Starts the Express server
- Schedules cron jobs (market refresh every 5 min, predictions every 10 min)

**Note:** There is NO separate build step. The application runs directly with Node.js.

### Full Command
```bash
node src/index.js
```

## Environment Setup

Before running, ensure `.env` is configured with:
- `MONGODB_URI` - MongoDB connection string
- `LLM_API_KEY` - Google Gemini API key
- `ADMIN_API_KEY` - Admin authentication key (from npm run setup)
- Other optional services (SMTP, VAPID, etc.)

## Docker Deployment

### Build Docker Image
```bash
docker build -t polyscope:latest .
```

### Run Docker Container
```bash
docker run -p 5000:5000 \
  --env-file .env \
  --name polyscope \
  polyscope:latest
```

### Docker Compose
```bash
docker-compose up -d
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm test -- --testPathPattern=api.integration
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

## Database

### Initialize Database Indexes
```bash
npm run init-db
```

### Backup Database
```bash
npm run backup
```

## Utility Commands

### Generate VAPID Keys (for Web Push)
```bash
npm run generate-keys
```

### View Logs (if running in background)
```bash
tail -f logs/app.log
```

## Hosting Recommendations

### Heroku
1. Push to main branch with `Procfile` containing: `web: npm start`
2. Deploy: `git push heroku main`
3. View logs: `heroku logs --tail`

### Railway / Render / Fly.io
1. Connect GitHub repository
2. Set environment variables in dashboard
3. Auto-deploy on push

### AWS (EC2/ECS)
1. Build Docker image
2. Push to ECR
3. Create task definition
4. Launch service

### DigitalOcean App Platform
1. Connect GitHub repo
2. Automatic builds on push
3. Managed deployment

## Health Check

Verify deployment is working:

```bash
curl http://localhost:5000/health | jq .
```

Expected response includes:
- Database connection status
- Service configurations
- Cache statistics
- System uptime

## Admin API Key

After creating admin user with `npm run setup`, use the API key in all admin requests:

```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:5000/api/admin/webhooks
```

## Performance Tips

1. **Enable Production Mode:**
   ```bash
   NODE_ENV=production npm start
   ```

2. **Increase Memory (if needed):**
   ```bash
   NODE_OPTIONS=--max-old-space-size=2048 npm start
   ```

3. **Enable Log Level Info/Warn:**
   ```env
   LOG_LEVEL=warn
   ```

4. **Use Process Manager (PM2):**
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name polyscope
   pm2 logs polyscope
   ```

## Troubleshooting

**"Cannot find module"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**"Port already in use"**
```bash
lsof -i :5000
kill -9 <PID>
```

**"MongoDB connection failed"**
- Check MONGODB_URI is correct
- Verify network access (IP whitelisting for Atlas)
- Test connection: `mongosh <MONGODB_URI>`

**"API key required" errors**
- Ensure X-API-Key header is sent
- Verify API key from admin user setup
- Check admin user exists: `npm run setup`

