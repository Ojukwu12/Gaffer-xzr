// MongoDB indexes for production performance
// Run this script: mongosh < scripts/init-indexes.js

use('polyscope');

// PredictionCache indexes
db.prediction_cache.createIndex({ "marketId": 1, "timeframe": 1 }, { background: true });
db.prediction_cache.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0, background: true });
db.prediction_cache.createIndex({ "createdAt": -1 }, { background: true });
db.prediction_cache.createIndex({ "prediction.confidence": -1 }, { background: true });
db.prediction_cache.createIndex({ "hitCount": -1, "lastAccessed": -1 }, { background: true });

// EmailSubscription indexes
db.email_subscriptions.createIndex({ "email": 1 }, { unique: true, background: true });
db.email_subscriptions.createIndex({ "isActive": 1 }, { background: true });
db.email_subscriptions.createIndex({ "preferences.categories": 1 }, { background: true });
db.email_subscriptions.createIndex({ "preferences.minConfidence": 1 }, { background: true });

// PushSubscription indexes
db.push_subscriptions.createIndex({ "subscription.endpoint": 1 }, { unique: true, background: true });
db.push_subscriptions.createIndex({ "isActive": 1 }, { background: true });
db.push_subscriptions.createIndex({ "lastNotificationSent": 1 }, { background: true });
db.push_subscriptions.createIndex({ "failureCount": 1 }, { background: true });

// User indexes
db.users.createIndex({ "email": 1 }, { unique: true, sparse: true, background: true });
db.users.createIndex({ "apiKey": 1 }, { unique: true, background: true });
db.users.createIndex({ "isActive": 1 }, { background: true });
db.users.createIndex({ "role": 1 }, { background: true });

// Webhook indexes
db.webhooks.createIndex({ "isActive": 1 }, { background: true });
db.webhooks.createIndex({ "events": 1 }, { background: true });
db.webhooks.createIndex({ "filters.markets": 1 }, { background: true });
db.webhooks.createIndex({ "createdAt": -1 }, { background: true });
db.webhooks.createIndex({ "consecutiveFailures": 1, "isActive": 1 }, { background: true });

// Compound indexes for common queries
db.prediction_cache.createIndex({ "marketId": 1, "confidence": -1, "createdAt": -1 }, { background: true });
db.email_subscriptions.createIndex({ "isActive": 1, "preferences.categories": 1 }, { background: true });
db.webhooks.createIndex({ "isActive": 1, "events": 1, "filters.minConfidence": 1 }, { background: true });

print("✓ Indexes created successfully!");

