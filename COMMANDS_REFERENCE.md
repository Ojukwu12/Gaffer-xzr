# Quick Commands Reference

## 🚀 Development

### Start Development Server
```bash
npm run dev
```

### Start Production Server
```bash
npm start
```

### Run Prediction Refresh
```bash
npm run refresh
```

## 🧪 Testing

### Run All Tests with Coverage
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Only Unit Tests
```bash
npm run test:unit
```

### Run Only Integration Tests
```bash
npm run test:integration
```

### View Coverage Report
```bash
npm test
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

## 🔍 Code Quality

### Run Linter
```bash
npm run lint
```

### Auto-fix Linting Issues
```bash
npm run lint:fix
```

### Check for Security Vulnerabilities
```bash
npm audit
```

### Fix Vulnerabilities (Auto)
```bash
npm audit fix
```

## 🐳 Docker

### Build Docker Image
```bash
docker build -t polyscope:latest .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

### Stop Docker Compose
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f polyscope
```

### Rebuild and Restart
```bash
docker-compose up -d --build
```

## 🗄️ Database

### Initialize Database Indexes
```bash
npm run init-db
```

### Create Admin User
```bash
npm run setup
```

### Backup Database
```bash
npm run backup
```

## 🔑 Configuration

### Generate VAPID Keys
```bash
npm run generate-keys
```

### Check Environment Variables
```bash
# View current env vars (without values)
grep "^[A-Z]" .env.example

# Verify your .env has all required vars
diff <(grep "^[A-Z]" .env.example | cut -d= -f1 | sort) <(grep "^[A-Z]" .env | cut -d= -f1 | sort)
```

## 🔧 Utilities

### Check Server Health
```bash
curl http://localhost:3000/health
```

### Check Server Metrics
```bash
curl http://localhost:3000/api/metrics
```

### Test API Endpoint
```bash
# Get prediction for a market
curl http://localhost:3000/api/predictions/MARKET_ID

# Get all markets
curl http://localhost:3000/api/markets
```

### Test with Authentication
```bash
# Set your JWT token
export TOKEN="your-jwt-token"

# Make authenticated request
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/users
```

## 📝 Git Workflow

### Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### Commit Changes
```bash
git add .
git commit -m "feat: description of changes"
```

### Push to Remote
```bash
git push origin feature/your-feature-name
```

### Update from Main
```bash
git checkout main
git pull origin main
git checkout feature/your-feature-name
git merge main
```

## 🔒 Pre-Deployment

### Run Verification Script
```bash
./scripts/verify-deployment.sh
```

### Manual Verification Checklist
```bash
# 1. Run tests
npm test

# 2. Check linting
npm run lint

# 3. Security audit
npm audit

# 4. Build (if applicable)
npm run build

# 5. Check environment
cat .env

# 6. Test Docker build
docker build -t polyscope:test .
```

## 📊 Monitoring

### View Application Logs
```bash
# With PM2
pm2 logs polyscope

# With Docker
docker-compose logs -f polyscope

# Raw log files
tail -f logs/combined.log
tail -f logs/error.log
```

### Check Process Status
```bash
# With PM2
pm2 status
pm2 monit

# With Docker
docker-compose ps
```

### Restart Application
```bash
# With PM2
pm2 restart polyscope

# With Docker
docker-compose restart polyscope

# Manual (development)
# Stop with Ctrl+C, then:
npm start
```

## 🚨 Emergency Commands

### Stop Everything
```bash
# Docker
docker-compose down

# PM2
pm2 stop all
pm2 delete all
```

### Quick Rollback (Docker)
```bash
# Stop current version
docker-compose down

# Pull previous image
docker pull polyscope:previous-tag

# Start with previous version
docker-compose up -d
```

### Clear Cache
```bash
# Application cache (if endpoint exists)
curl -X DELETE http://localhost:3000/api/cache

# Or restart the service
pm2 restart polyscope
```

### View Recent Errors
```bash
# Last 50 error logs
tail -50 logs/error.log

# Watch errors in real-time
tail -f logs/error.log
```

## 📚 Documentation

### View API Documentation
```bash
cat API_DOCUMENTATION.md
```

### View Features List
```bash
cat FEATURES.md
```

### View Testing Guide
```bash
cat TESTING_GUIDE.md
```

### Generate API Docs (if configured)
```bash
npm run docs  # If configured
```

## 🔄 CI/CD

### Trigger GitHub Actions Manually
Go to GitHub → Actions → Select workflow → Run workflow

### Check CI Status
```bash
# List recent workflow runs
gh run list  # Requires GitHub CLI

# View specific run
gh run view RUN_ID
```

### View Build Logs
```bash
gh run view --log  # Requires GitHub CLI
```

## 💡 Development Tips

### Quick Test Cycle
```bash
# Terminal 1: Run in watch mode
npm run dev

# Terminal 2: Run tests in watch mode
npm run test:watch
```

### Debug Mode
```bash
# Start with debugger
node --inspect src/index.js

# Or with nodemon
nodemon --inspect src/index.js
```

### Performance Profiling
```bash
# Start with CPU profiling
node --prof src/index.js

# Process the profile
node --prof-process isolate-*.log > profile.txt
```

### Memory Profiling
```bash
# Start with heap snapshot
node --inspect --inspect-brk src/index.js

# Then connect Chrome DevTools to chrome://inspect
```

## 📦 Package Management

### Update All Packages
```bash
npm update
```

### Check for Outdated Packages
```bash
npm outdated
```

### Update Specific Package
```bash
npm update package-name
```

### Clean Install
```bash
rm -rf node_modules package-lock.json
npm install
```

## 🎯 Quick Aliases (Add to ~/.bashrc or ~/.zshrc)

```bash
# Polyscope aliases
alias pdev="npm run dev"
alias ptest="npm test"
alias plint="npm run lint"
alias plog="tail -f logs/combined.log"
alias perr="tail -f logs/error.log"
alias phealth="curl http://localhost:3000/health | jq"
```

## Need Help?

- 📖 Full API Docs: `cat API_DOCUMENTATION.md`
- 🧪 Testing Guide: `cat TESTING_GUIDE.md`
- 🚀 Quick Start: `cat QUICK_START.md`
- 🐛 Debugging: Check logs in `logs/` directory
- 💬 Issues: Create a GitHub issue
