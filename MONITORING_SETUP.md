# Monitoring & Observability Setup

## Overview
This guide covers setting up monitoring, logging, and observability for the Polyscope Prediction Engine in production.
This monitoring and observability guide has been consolidated into `docs/MONITORING_SETUP.md`.

See `docs/MONITORING_SETUP.md` for Sentry/Datadog, Prometheus, Grafana examples, and log aggregation guidance.

module.exports = metrics;
```

### 2. Performance Middleware
```javascript
// src/middlewares/performance.js
const metrics = require('../utils/metrics');

function performanceMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordApiResponseTime(duration);
    
    // Log slow requests
    if (duration > 2000) {
      logger.warn('Slow request detected', {
        path: req.path,
        method: req.method,
        duration,
      });
    }
  });
  
  next();
}

module.exports = performanceMiddleware;
```

### 3. Database Query Monitoring
```javascript
// Monitor slow queries
mongoose.set('debug', (collectionName, method, query, doc) => {
  const start = Date.now();
  
  // After query completes
  process.nextTick(() => {
    const duration = Date.now() - start;
    if (duration > 100) {
      logger.warn('Slow database query', {
        collection: collectionName,
        method,
        duration,
      });
    }
  });
});
```

## Logging

### Current Setup (Winston)
Already configured in `src/config/logger.js`. Enhance with:

#### 1. Structured Logging
```javascript
logger.info('Prediction generated', {
  marketId,
  prediction: result.prediction,
  confidence: result.confidence,
  duration: Date.now() - startTime,
  userId: req.user?.id,
});
```

#### 2. Log Levels
- `error`: System errors, exceptions
- `warn`: Warnings, anomalies, slow operations
- `info`: Important business events
- `debug`: Detailed debugging (dev only)

#### 3. Log Aggregation (Production)

**Option A: ELK Stack**
- Elasticsearch: Store logs
- Logstash: Process logs
- Kibana: Visualize logs

**Option B: Datadog Logs**
```bash
# Install Datadog agent, configure log collection
# In datadog-agent.yaml:
logs_enabled: true

# In your app:
logs:
  - type: file
    path: /app/logs/combined.log
    service: polyscope-api
    source: nodejs
```

**Option C: CloudWatch Logs (AWS)**
```bash
npm install winston-cloudwatch
```

```javascript
const CloudWatchTransport = require('winston-cloudwatch');

logger.add(new CloudWatchTransport({
  logGroupName: 'polyscope-api',
  logStreamName: `${process.env.NODE_ENV}-${new Date().toISOString()}`,
  awsRegion: 'us-east-1',
}));
```

## Metrics & Dashboards

### 1. Prometheus Metrics

Install:
```bash
npm install prom-client
```

Create `src/utils/prometheus.js`:
```javascript
const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const predictionCounter = new client.Counter({
  name: 'polyscope_predictions_total',
  help: 'Total number of predictions generated',
  labelNames: ['status'],
});

const predictionDuration = new client.Histogram({
  name: 'polyscope_prediction_duration_seconds',
  help: 'Prediction generation duration',
  buckets: [0.1, 0.5, 1, 2, 5],
});

const cacheHitRate = new client.Gauge({
  name: 'polyscope_cache_hit_rate',
  help: 'Cache hit rate percentage',
});

register.registerMetric(predictionCounter);
register.registerMetric(predictionDuration);
register.registerMetric(cacheHitRate);

module.exports = {
  register,
  predictionCounter,
  predictionDuration,
  cacheHitRate,
};
```

Add metrics endpoint:
```javascript
// src/index.js
const { register } = require('./utils/prometheus');

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 2. Grafana Dashboards

Configure Grafana to scrape metrics:
1. Add Prometheus data source
2. Create dashboard with panels for:
   - Request rate
   - Error rate
   - Response time (p50, p95, p99)
   - Cache hit rate
   - Prediction confidence distribution
   - Active markets
   - Database connection pool

## Alerts

### 1. Sentry Alerts
Configure in Sentry UI:
- Error rate threshold
- New error types
- Performance degradation

### 2. Prometheus/Grafana Alerts
Create alert rules:
```yaml
# alerts.yml
groups:
  - name: polyscope-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(polyscope_predictions_total{status="error"}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High prediction error rate"
          
      - alert: SlowPredictions
        expr: histogram_quantile(0.95, polyscope_prediction_duration_seconds) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile prediction time > 5s"
          
      - alert: LowCacheHitRate
        expr: polyscope_cache_hit_rate < 0.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate below 50%"
```

### 3. Email/Slack Notifications

Configure notification channels in:
- Sentry → Integrations
- Grafana → Alerting → Contact points
- Datadog → Integrations → Slack

### 4. Application Health Checks

Enhance `/health` endpoint:
```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      cache: 'unknown',
      llm: 'unknown',
    },
  };
  
  try {
    // Database check
    await mongoose.connection.db.admin().ping();
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }
  
  // Cache check
  try {
    cacheService.set('health-check', Date.now());
    cacheService.get('health-check');
    health.checks.cache = 'healthy';
  } catch (error) {
    health.checks.cache = 'unhealthy';
    health.status = 'degraded';
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

## Implementation Checklist

- [ ] Install Sentry SDK
- [ ] Configure Sentry DSN in production
- [ ] Add Sentry error handler middleware
- [ ] Set up structured logging
- [ ] Configure log aggregation (ELK/Datadog/CloudWatch)
- [ ] Add Prometheus metrics
- [ ] Create Grafana dashboards
- [ ] Configure alert rules
- [ ] Set up notification channels
- [ ] Test health check endpoint
- [ ] Document runbook for common issues
- [ ] Set up on-call rotation (if applicable)

## Cost Considerations

### Free Tiers (for small projects)
- **Sentry**: 5,000 errors/month
- **Datadog**: 14-day trial, then paid
- **Grafana Cloud**: 10k metrics, 50GB logs
- **New Relic**: 100GB/month free

### Self-Hosted (free, but requires infrastructure)
- **Prometheus + Grafana**
- **ELK Stack**
- **Jaeger** (distributed tracing)

## Next Steps

1. **Start with basics**: Sentry + Winston logs
2. **Add metrics**: Prometheus + Grafana
3. **Set up alerts**: Critical errors, downtime
4. **Enhance over time**: Add more metrics, refine alerts
5. **Review regularly**: Weekly review of errors and performance

## Resources

- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Datadog APM](https://docs.datadoghq.com/tracing/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Winston Documentation](https://github.com/winstonjs/winston)
- [Grafana Tutorials](https://grafana.com/tutorials/)
