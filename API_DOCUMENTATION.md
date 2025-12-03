This documentation has been consolidated into the `docs/` folder.

Full API documentation can now be found at `docs/API_DOCUMENTATION.md`.

Please refer to that file for the complete reference, examples, and response schemas.

---

## Error Codes

| Code | Description |
|------|-------------|
| `MARKET_NOT_FOUND` | Market ID does not exist |
| `INVALID_OPTION` | Option not available for this market |
| `INVALID_TIMEFRAME` | Timeframe not supported |
| `INVALID_MARKET_DATA` | Market failed validation checks |
| `LLM_NOT_CONFIGURED` | LLM service not properly configured |
| `LLM_PARSE_ERROR` | Failed to parse LLM response |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `VALIDATION_ERROR` | Request validation failed |

---

## WebSocket (Future Feature)

Real-time prediction updates via WebSocket:
```javascript
const ws = new WebSocket('ws://localhost:5000');

ws.on('open', () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    marketId: '0x123...'
  }));
});

ws.on('message', (data) => {
  const update = JSON.parse(data);
  console.log('Prediction update:', update);
});
```

---

## CORS

The API supports CORS with the following allowed origins:
- `http://localhost:3000` (React/Next.js default)
- `http://localhost:3001`
- `http://localhost:4200` (Angular)
- `http://localhost:8080` (Vue)
- `http://localhost:5173` (Vite)
- Your production domain (configured via `ALLOWED_ORIGINS` env variable)

---

## Best Practices

1. **Cache Results**: Use the `/cache` endpoint before requesting new predictions
2. **Rate Limiting**: Implement client-side rate limiting to avoid 429 errors
3. **Error Handling**: Always handle error responses gracefully
4. **Timeouts**: Set reasonable timeouts (30s recommended)
5. **Validation**: Check `validation status` before using predictions
6. **Market Quality**: Prefer markets with grade A or B
7. **Risk Awareness**: Always check `risks.warnings` array

---

## Example Client Code

### JavaScript/TypeScript
```typescript
const API_BASE = 'http://localhost:5000/api';

async function getPrediction(marketId: string, option: string) {
  try {
    const response = await fetch(
      `${API_BASE}/markets/${marketId}/predict?option=${option}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result.data;
  } catch (error) {
    console.error('Prediction error:', error);
    throw error;
  }
}
```

### React Hook
```typescript
import { useState, useEffect } from 'react';

function usePrediction(marketId: string, option: string) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function fetchPrediction() {
      try {
        setLoading(true);
        const data = await getPrediction(marketId, option);
        setPrediction(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPrediction();
  }, [marketId, option]);
  
  return { prediction, loading, error };
}
```

---

## Support

For issues or questions, refer to:
- API Documentation: `/src/docs/api-contract.md`
- Feature Documentation: `/FEATURES.md`
- Quick Start Guide: `/QUICK_START.md`
