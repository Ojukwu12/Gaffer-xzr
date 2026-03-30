# Migration Guide: New Prediction Status Field

**Date:** March 30, 2026  
**Version:** 2.0.0

## Overview

This release adds prediction status tracking to markets, allowing the frontend to display which markets have AI predictions available.

## Backend Changes

### New Fields in Market Responses

All market endpoints now include a `hasPrediction` boolean field:

```javascript
{
  marketId: "0x123...",
  title: "Will Bitcoin reach $100k?",
  // ... other fields
  hasPrediction: true,  // NEW: Boolean indicating if market has predictions
  availableTimeframes: ["daily", "weekly"],
  optimalTimeframe: "daily"
}
```

### Updated Endpoints

The following endpoints now return markets with prediction status:

1. **GET /api/markets** - List all markets
2. **GET /api/markets/:id** - Get single market details
3. **GET /api/markets/search** - Search markets
4. **GET /api/markets/trending** - Get trending markets
5. **GET /api/markets/category/:category** - Get markets by category

### New Market Detail Response

Single market endpoint now includes `cachedPredictions`:

```javascript
GET /api/markets/0x123

{
  success: true,
  data: {
    marketId: "0x123...",
    title: "...",
    hasPrediction: true,
    cachedPredictions: {
      "Yes": {
        "daily": {
          confidenceScore: 78,
          marketProbabilityAtTime: 65,
          aiProbability: 72,
          statement: "Market underpricing by ~7%",
          reason: "Strong institutional buying",
          status: "approved",
          approvedAt: "2026-03-29T10:30:00.000Z"
        }
      }
    }
  }
}
```

## Frontend Updates Required

### 1. Update Market List Component

Display prediction status indicator:

```javascript
// Example: React component
function MarketCard({ market }) {
  return (
    <div className="market-card">
      <h3>{market.title}</h3>
      {market.hasPrediction && (
        <span className="badge badge-prediction">🎯 Predicted</span>
      )}
      {/* ... rest of card */}
    </div>
  );
}
```

### 2. Update Market Detail Component

Display detailed predictions when available:

```javascript
function MarketDetail({ marketId }) {
  const [market, setMarket] = useState(null);

  useEffect(() => {
    fetch(`/api/markets/${marketId}`)
      .then(r => r.json())
      .then(data => setMarket(data.data));
  }, [marketId]);

  if (!market) return <div>Loading...</div>;

  return (
    <div>
      <h1>{market.title}</h1>
      
      {market.hasPrediction && market.cachedPredictions && (
        <div className="predictions-section">
          <h3>💡 Polyscope Predictions</h3>
          {Object.entries(market.cachedPredictions).map(([option, timeframes]) => (
            <div key={option}>
              <h4>{option}</h4>
              {Object.entries(timeframes).map(([timeframe, prediction]) => (
                <div key={timeframe} className="prediction-card">
                  <p><strong>Timeframe:</strong> {timeframe}</p>
                  <p><strong>Confidence:</strong> {prediction.confidenceScore}%</p>
                  <p><strong>Market Prob:</strong> {prediction.marketProbabilityAtTime}%</p>
                  <p><strong>AI Prob:</strong> {prediction.aiProbability}%</p>
                  <p><strong>Analysis:</strong> {prediction.statement}</p>
                  <p><strong>Reasoning:</strong> {prediction.reason}</p>
                  <small>Approved: {new Date(prediction.approvedAt).toLocaleDateString()}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3. Search/Filtering

No breaking changes - existing search and filter logic works as-is. The new `hasPrediction` field is available for filtering if needed:

```javascript
// Optional: Filter markets with predictions
const marketsWithPredictions = markets.filter(m => m.hasPrediction);
```

## Database Migration

A database migration runs **automatically on server startup** to update existing predictions with corrected fields:

```bash
# Just start the server normally
npm start

# The migration will run in the background and:
# ✓ Update all prediction records (all statuses)
# ✓ Populate/repair marketSlug from fetched market metadata
# ✓ Generate correct polymarketUrl using /event/{slug} format
# ✓ Update PredictionCache prediction.polymarketUrl entries
# ✓ Record completion in MigrationState collection
# ✓ Can be safely re-run multiple times (idempotent)
```

**Expected startup log:**
```
✓ Startup migration completed: updated X/Y predictions, updated A/B cached predictions
```

Note about markets:
- Market links shown in market list/details are generated from live Polymarket/Gamma fetch + in-memory cache.
- There is no persistent MongoDB `markets` collection to migrate.
- After deploy/restart, market responses will use the latest link-generation logic automatically.

### Manual Migration (Optional)

If you need to run the migration manually (e.g., after manual prediction updates):

```bash
node scripts/migrate-update-predictions-fields.js
```

## Breaking Changes

**None.** This is a backward-compatible addition:
- Existing market fields remain unchanged
- New `hasPrediction` field is optional to consume
- All market endpoints remain fully public
- Prediction generation remains backend-only

## Rollback Instructions

If rollback is needed:

```javascript
// Markets will still work without `hasPrediction` field
// Frontend can safely use optional chaining:
{market?.hasPrediction && <PredictionBadge />}
```

## API Response Examples

### Markets List with Predictions

```bash
curl https://api.polyscope.com/api/markets?limit=5
```

```json
{
  "success": true,
  "data": {
    "markets": [
      {
        "marketId": "0xabc...",
        "title": "Bitcoin price above $70k by EOM?",
        "hasPrediction": true,
        "availableTimeframes": ["daily", "weekly"],
        "optimalTimeframe": "daily"
      },
      {
        "marketId": "0xdef...",
        "title": "ETH reaches $2500?",
        "hasPrediction": false,
        "availableTimeframes": ["daily"],
        "optimalTimeframe": "daily"
      }
    ],
    "pagination": {
      "limit": 5,
      "offset": 0,
      "total": 342
    }
  }
}
```

### Market Detail with Predictions

```bash
curl https://api.polyscope.com/api/markets/0xabc...
```

```json
{
  "success": true,
  "data": {
    "marketId": "0xabc...",
    "title": "Bitcoin price above $70k by EOM?",
    "hasPrediction": true,
    "cachedPredictions": {
      "Yes": {
        "daily": {
          "confidenceScore": 72,
          "marketProbabilityAtTime": 68,
          "aiProbability": 75,
          "statement": "Market probability undervaluated",
          "reason": "Strong technical indicators and institutional accumulation",
          "status": "approved",
          "approvedAt": "2026-03-30T08:15:00.000Z"
        },
        "weekly": {
          "confidenceScore": 65,
          "marketProbabilityAtTime": 68,
          "aiProbability": 71,
          "statement": "Slight edge",
          "reason": "Longer timeframe shows consolidation pattern",
          "status": "approved",
          "approvedAt": "2026-03-29T15:00:00.000Z"
        }
      }
    }
  }
}
```

## Support

For questions or issues with the migration:
- Check the new `DEPLOYMENT.md` for production deployment notes
- Review `API_DOCUMENTATION.md` for complete endpoint specifications
- Check migration logs: `node scripts/migrate-update-predictions-fields.js` produces detailed output
