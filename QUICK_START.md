# Quick Start Guide - Enhanced Prediction Engine

## 🚀 Getting Started

### Basic Usage

```javascript
const predictionEngine = require('./src/services/predictionEngine');

// Generate a prediction
const prediction = await predictionEngine.generatePrediction(
  'market_id_123',
  'Yes',
  'daily'
);

console.log(`Prediction: ${prediction.prediction}`);
console.log(`Confidence: ${prediction.confidence}%`);
console.log(`Market Quality: ${prediction.summary.marketHealth.grade}`);
```

## 📊 Understanding the Response

### Full Response Structure
```javascript
{
  // Core Prediction
  success: true,
  prediction: "YES",           // Final prediction
  confidence: 75,              // Overall confidence
  yes_probability: 61,         // YES probability
  no_probability: 39,          // NO probability
  reason: "Strong positive sentiment + rising liquidity",
  notes: "Market quality grade: B",
  
  // Market Summary
  summary: {
    marketHealth: {
      overallScore: 75,        // 0-100 score
      grade: 'B',              // A, B, C, D, or F
      status: 'valid',         // valid/invalid
      issues: []               // Validation issues
    },
    keyMetrics: {
      liquidity: {
        value: 150000,
        formatted: "$150,000",
        score: 0.8,
        risk: "LOW"
      },
      volume24h: {
        value: 45000,
        formatted: "$45,000",
        growth: 25.5,
        trend: "increasing"
      },
      currentPrice: {
        value: 0.61,
        formatted: "$0.6100",
        impliedProbability: "61.00%",
        rank: 1,
        isLeading: true
      }
    },
    sentiment: {
      score: 0.72,
      label: "positive",
      trend: "bullish",
      strength: "strong"
    },
    risks: {
      overall: "medium",
      score: 0.35,
      warnings: []
    },
    timing: {
      marketAge: "15 days",
      daysUntilExpiry: "7 days",
      lifecycleStage: "late_stage",
      urgency: "high"
    }
  },
  
  // Raw Features (50+)
  features: { ... }
}
```

## 🎯 Common Use Cases

### 1. Check Market Validity
```javascript
const { validateMarketData } = require('./src/services/predictionEngine');

const validation = validateMarketData(marketData);

if (validation.hasCriticalErrors) {
  console.log('❌ Market is invalid:');
  validation.issues.forEach(issue => console.log(`  - ${issue}`));
  return;
}

if (validation.hasWarnings) {
  console.log('⚠️  Warnings:');
  validation.issues.forEach(issue => console.log(`  - ${issue}`));
}
```

### 2. Get Market Quality Score
```javascript
const prediction = await predictionEngine.generatePrediction(marketId, 'Yes', 'daily');

const { marketHealth } = prediction.summary;

console.log(`Quality Score: ${marketHealth.overallScore}/100`);
console.log(`Grade: ${marketHealth.grade}`);

if (marketHealth.grade === 'A' || marketHealth.grade === 'B') {
  console.log('✅ High quality market');
} else {
  console.log('⚠️  Lower quality market - trade with caution');
}
```

### 3. Assess Risk Level
```javascript
const { risks } = prediction.summary;

console.log(`Risk Level: ${risks.overall}`);

if (risks.warnings.length > 0) {
  console.log('⚠️  Risk Warnings:');
  risks.warnings.forEach(warning => console.log(`  - ${warning}`));
}

// Check specific risk factors
if (prediction.features.liquidityRisk > 0.6) {
  console.log('⚠️  High liquidity risk - potential for slippage');
}

if (prediction.features.anomalyScore > 0.5) {
  console.log('🚨 Unusual market activity detected');
  prediction.features.anomalyDetails.forEach(detail => 
    console.log(`  - ${detail}`)
  );
}
```

### 4. Evaluate Timing
```javascript
const { timing } = prediction.summary;

console.log(`Lifecycle: ${timing.lifecycleStage}`);
console.log(`Urgency: ${timing.urgency}`);
console.log(`Time Remaining: ${timing.daysUntilExpiry}`);

if (timing.urgency === 'critical') {
  console.log('⏰ Market closing very soon!');
} else if (timing.urgency === 'high') {
  console.log('⏳ Market closing within a week');
}
```

### 5. Analyze Sentiment & Trends
```javascript
const { sentiment } = prediction.summary;

console.log(`Sentiment: ${sentiment.label} (${(sentiment.score * 100).toFixed(1)}%)`);
console.log(`Trend: ${sentiment.trend}`);
console.log(`Strength: ${sentiment.strength}`);

// Trading signal
if (sentiment.trend === 'bullish' && sentiment.strength === 'strong') {
  console.log('📈 Strong bullish signal');
} else if (sentiment.trend === 'bearish' && sentiment.strength === 'strong') {
  console.log('📉 Strong bearish signal');
}
```

### 6. Compare Options (Multi-Option Markets)
```javascript
const options = ['Option A', 'Option B', 'Option C'];
const predictions = await Promise.all(
  options.map(opt => predictionEngine.generatePrediction(marketId, opt, 'daily'))
);

predictions.forEach((pred, idx) => {
  console.log(`\n${options[idx]}:`);
  console.log(`  Confidence: ${pred.confidence}%`);
  console.log(`  Rank: ${pred.features.optionRank}/${pred.features.optionCount}`);
  console.log(`  Leading: ${pred.features.isLeadingOption ? 'Yes' : 'No'}`);
});

// Find best option
const best = predictions.reduce((max, pred) => 
  pred.confidence > max.confidence ? pred : max
);
console.log(`\n🏆 Best Option: ${best.option} (${best.confidence}% confidence)`);
```

### 7. Monitor Whale Activity
```javascript
const features = prediction.features;

console.log(`Whale Factor: ${(features.whaleFactor * 100).toFixed(1)}%`);
console.log(`Whale Count: ${features.whaleCount}`);
console.log(`Smart Money: ${features.smartMoneyDirection > 0 ? '📈 Bullish' : '📉 Bearish'}`);

if (features.concentrationRatio > 0.7) {
  console.log('⚠️  High concentration - whale manipulation risk');
}
```

### 8. Generate Trading Report
```javascript
function generateReport(prediction) {
  const { summary, features, confidence, reason } = prediction;
  
  return `
═══════════════════════════════════════════════════
        POLYMARKET TRADING REPORT
═══════════════════════════════════════════════════

PREDICTION: ${prediction.prediction}
CONFIDENCE: ${confidence}%

YES Probability: ${prediction.yes_probability}%
NO Probability: ${prediction.no_probability}%

REASONING:
${reason}

MARKET QUALITY: ${summary.marketHealth.grade} (${summary.marketHealth.overallScore}/100)

KEY METRICS:
  Liquidity: ${summary.keyMetrics.liquidity.formatted} (${summary.keyMetrics.liquidity.risk} risk)
  Volume (24h): ${summary.keyMetrics.volume24h.formatted} (${summary.keyMetrics.volume24h.trend})
  Current Price: ${summary.keyMetrics.currentPrice.formatted}

SENTIMENT: ${summary.sentiment.label} (${summary.sentiment.trend})

RISK LEVEL: ${summary.risks.overall}
${summary.risks.warnings.length > 0 ? `
WARNINGS:
${summary.risks.warnings.map(w => `  • ${w}`).join('\n')}
` : ''}

TIMING:
  Market Age: ${summary.timing.marketAge}
  Time Remaining: ${summary.timing.daysUntilExpiry}
  Urgency: ${summary.timing.urgency}

NOTES:
${prediction.notes || 'None'}

═══════════════════════════════════════════════════
  `;
}

const report = generateReport(prediction);
console.log(report);
```

## 🚨 Error Handling

### Handle Invalid Markets
```javascript
try {
  const prediction = await predictionEngine.generatePrediction(marketId, 'Yes', 'daily');
  
  if (!prediction.success) {
    console.error(`Prediction failed: ${prediction.error}`);
    console.error(`Details: ${prediction.details}`);
    return;
  }
  
  // Use prediction
  console.log(`Confidence: ${prediction.confidence}%`);
  
} catch (error) {
  console.error(`Error: ${error.message}`);
  
  if (error.code === 'INVALID_MARKET_DATA') {
    console.log('The market data is invalid and cannot be predicted');
  }
}
```

## 📊 Feature Access

### Access All Features
```javascript
const features = prediction.features;

// Market validation
console.log(`Validation Status: ${features.validationStatus}`);
console.log(`Quality Score: ${features.marketQualityScore}/100`);

// Liquidity & Volume
console.log(`Liquidity: $${features.liquidity.toLocaleString()}`);
console.log(`Volume Growth (24h): ${features.volumeGrowth24h.toFixed(2)}%`);

// Price & Trend
console.log(`Current Price: $${features.currentPrice.toFixed(4)}`);
console.log(`Trend Direction: ${features.trendDirection}`);
console.log(`Momentum Index: ${features.momentumIndex.toFixed(2)}`);

// Risk
console.log(`Risk Score: ${features.riskScore.toFixed(2)}`);
console.log(`Anomaly Score: ${features.anomalyScore.toFixed(2)}`);

// Timing
console.log(`Days Until Expiry: ${features.daysUntilExpiry}`);
console.log(`Lifecycle Stage: ${features.lifecycleStage}`);
```

## 🎯 Best Practices

1. **Always check validation status** before making trading decisions
2. **Review market quality grade** - prefer A/B grade markets
3. **Monitor risk warnings** - especially for high-risk markets
4. **Consider urgency level** - avoid critical urgency unless necessary
5. **Check anomaly details** - investigate unusual activity
6. **Compare probabilities** - use both YES and NO probabilities
7. **Read the reasoning** - understand why the prediction was made
8. **Monitor whale activity** - be cautious with high concentration

## 📈 Performance Tips

- Use caching for repeated predictions
- Generate predictions for all options in parallel
- Monitor computation time for optimization
- Review market summaries for quick decisions

## 🔗 Related Files

- `FEATURES.md` - Complete feature documentation
- `IMPROVEMENTS_SUMMARY.md` - Enhancement details
- `src/services/predictionEngine.js` - Prediction engine
- `src/services/llmService.js` - LLM service with system prompt

## 🆘 Support

For issues or questions:
1. Check validation errors first
2. Review market quality score
3. Examine risk warnings
4. Check feature values for anomalies
5. Review LLM reasoning for insights
