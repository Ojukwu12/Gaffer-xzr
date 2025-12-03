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

... (quick start continued) ...
