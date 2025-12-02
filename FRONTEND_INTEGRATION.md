# Frontend Integration Guide

## Quick Start

### 1. Environment Setup

Create a `.env` file in your frontend project:

```env
# API Configuration
REACT_APP_API_URL=http://localhost:5000/api
# or for Next.js
NEXT_PUBLIC_API_URL=http://localhost:5000/api
# or for Vue
VUE_APP_API_URL=http://localhost:5000/api
```

### 2. API Client Setup

Create an API client utility:

```typescript
// src/lib/api.ts
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class PolyscopeAPI {
  private baseURL: string;
  
  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }
  
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data.data;
  }
  
  // Markets
  async getMarkets(params?: {
    limit?: number;
    offset?: number;
    category?: string;
    search?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/markets${query ? `?${query}` : ''}`);
  }
  
  async getMarket(marketId: string) {
    return this.request(`/markets/${marketId}`);
  }
  
  // Predictions
  async getPrediction(
    marketId: string,
    option: string,
    timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'
  ) {
    return this.request(
      `/markets/${marketId}/predict?option=${encodeURIComponent(option)}&timeframe=${timeframe}`
    );
  }
  
  async getAllPredictions(
    marketId: string,
    timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'
  ) {
    return this.request(
      `/markets/${marketId}/predict-all?timeframe=${timeframe}`
    );
  }
  
  async getFeatures(
    marketId: string,
    option: string,
    timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'
  ) {
    return this.request(
      `/markets/${marketId}/features?option=${encodeURIComponent(option)}&timeframe=${timeframe}`
    );
  }
  
  async getCachedPredictions(marketId: string) {
    return this.request(`/markets/${marketId}/cache`);
  }
  
  // Notifications
  async subscribeEmail(email: string, marketId: string, threshold: number = 75) {
    return this.request('/notifications/email/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email, marketId, threshold }),
    });
  }
  
  async subscribePush(
    subscription: PushSubscription,
    marketId: string,
    threshold: number = 75
  ) {
    return this.request('/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, marketId, threshold }),
    });
  }
  
  // Health
  async checkHealth() {
    return this.request('/health');
  }
}

export const api = new PolyscopeAPI(API_BASE);
```

---

## React/Next.js Integration

### Custom Hooks

```typescript
// hooks/usePrediction.ts
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function usePrediction(
  marketId: string,
  option: string,
  timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'
) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    async function fetchPrediction() {
      try {
        setLoading(true);
        setError(null);
        const prediction = await api.getPrediction(marketId, option, timeframe);
        
        if (!cancelled) {
          setData(prediction);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    fetchPrediction();
    
    return () => {
      cancelled = true;
    };
  }, [marketId, option, timeframe]);
  
  return { data, loading, error };
}

// hooks/useMarkets.ts
export function useMarkets(params?: {
  limit?: number;
  offset?: number;
  category?: string;
  search?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    async function fetchMarkets() {
      try {
        setLoading(true);
        setError(null);
        const markets = await api.getMarkets(params);
        
        if (!cancelled) {
          setData(markets);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    fetchMarkets();
    
    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(params)]);
  
  return { data, loading, error };
}
```

### Component Examples

```tsx
// components/PredictionCard.tsx
import { usePrediction } from '@/hooks/usePrediction';

interface PredictionCardProps {
  marketId: string;
  option: string;
}

export function PredictionCard({ marketId, option }: PredictionCardProps) {
  const { data, loading, error } = usePrediction(marketId, option);
  
  if (loading) {
    return <div className="animate-pulse">Loading prediction...</div>;
  }
  
  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }
  
  if (!data) return null;
  
  const { prediction, confidence, summary } = data;
  
  return (
    <div className="border rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-bold">{option}</h3>
        <span className={`text-lg font-semibold ${
          prediction === 'YES' ? 'text-green-600' : 'text-red-600'
        }`}>
          {prediction}
        </span>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">Confidence</span>
            <span className="font-bold text-lg">{confidence}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
        
        <div>
          <span className="text-gray-600">Market Quality:</span>
          <span className={`ml-2 font-bold ${
            summary.marketHealth.grade === 'A' ? 'text-green-600' :
            summary.marketHealth.grade === 'B' ? 'text-blue-600' :
            summary.marketHealth.grade === 'C' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {summary.marketHealth.grade} ({summary.marketHealth.overallScore}/100)
          </span>
        </div>
        
        <div>
          <span className="text-gray-600">Risk Level:</span>
          <span className={`ml-2 font-semibold ${
            summary.risks.overall === 'low' ? 'text-green-600' :
            summary.risks.overall === 'medium' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {summary.risks.overall.toUpperCase()}
          </span>
        </div>
        
        <div>
          <span className="text-gray-600">Sentiment:</span>
          <span className="ml-2 font-semibold">{summary.sentiment.label}</span>
          <span className="ml-2 text-sm text-gray-500">
            ({summary.sentiment.trend} - {summary.sentiment.strength})
          </span>
        </div>
        
        <div className="pt-4 border-t">
          <p className="text-sm text-gray-700">{data.reason}</p>
        </div>
        
        {data.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-sm text-yellow-800">{data.notes}</p>
          </div>
        )}
        
        {summary.risks.warnings.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm font-semibold text-red-800 mb-1">Warnings:</p>
            <ul className="text-sm text-red-700 list-disc list-inside">
              {summary.risks.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// components/MarketList.tsx
import { useMarkets } from '@/hooks/useMarkets';

export function MarketList() {
  const [search, setSearch] = useState('');
  const { data, loading, error } = useMarkets({ search, limit: 20 });
  
  if (loading) return <div>Loading markets...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search markets..."
        className="w-full px-4 py-2 border rounded-lg mb-4"
      />
      
      <div className="grid gap-4">
        {data.markets.map((market) => (
          <div key={market.marketId} className="border rounded-lg p-4">
            <h3 className="font-bold text-lg mb-2">{market.title}</h3>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Liquidity: ${market.liquidity.toLocaleString()}</span>
              <span>Volume: ${market.volume24h.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Vue 3 Integration

### Composables

```typescript
// composables/usePrediction.ts
import { ref, watchEffect } from 'vue';
import { api } from '@/lib/api';

export function usePrediction(
  marketId: Ref<string>,
  option: Ref<string>,
  timeframe: Ref<'daily' | 'weekly' | 'monthly'> = ref('daily')
) {
  const data = ref(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  
  watchEffect(async () => {
    try {
      loading.value = true;
      error.value = null;
      data.value = await api.getPrediction(
        marketId.value,
        option.value,
        timeframe.value
      );
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  });
  
  return { data, loading, error };
}
```

### Component Example

```vue
<template>
  <div class="prediction-card">
    <div v-if="loading">Loading...</div>
    <div v-else-if="error">Error: {{ error }}</div>
    <div v-else-if="data">
      <h3>{{ option }}</h3>
      <div class="prediction">{{ data.prediction }}</div>
      <div class="confidence">
        <span>Confidence: {{ data.confidence }}%</span>
        <div class="progress-bar">
          <div
            class="progress"
            :style="{ width: `${data.confidence}%` }"
          ></div>
        </div>
      </div>
      <div class="summary">
        <p>Quality: {{ data.summary.marketHealth.grade }}</p>
        <p>Risk: {{ data.summary.risks.overall }}</p>
        <p>{{ data.reason }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { usePrediction } from '@/composables/usePrediction';

const props = defineProps<{
  marketId: string;
  option: string;
}>();

const marketId = ref(props.marketId);
const option = ref(props.option);

const { data, loading, error } = usePrediction(marketId, option);
</script>
```

---

## Angular Integration

### Service

```typescript
// services/polyscope.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PolyscopeService {
  private apiUrl = environment.apiUrl;
  
  constructor(private http: HttpClient) {}
  
  getPrediction(
    marketId: string,
    option: string,
    timeframe: string = 'daily'
  ): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/markets/${marketId}/predict`, {
        params: { option, timeframe }
      })
      .pipe(map((response: any) => response.data));
  }
  
  getMarkets(params?: any): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/markets`, { params })
      .pipe(map((response: any) => response.data));
  }
}
```

### Component

```typescript
import { Component, OnInit } from '@angular/core';
import { PolyscopeService } from './services/polyscope.service';

@Component({
  selector: 'app-prediction',
  template: `
    <div *ngIf="loading">Loading...</div>
    <div *ngIf="error">Error: {{ error }}</div>
    <div *ngIf="prediction">
      <h3>{{ prediction.prediction }}</h3>
      <p>Confidence: {{ prediction.confidence }}%</p>
      <p>{{ prediction.reason }}</p>
    </div>
  `
})
export class PredictionComponent implements OnInit {
  prediction: any;
  loading = true;
  error: string | null = null;
  
  constructor(private polyscope: PolyscopeService) {}
  
  ngOnInit() {
    this.polyscope.getPrediction('marketId', 'Yes').subscribe({
      next: (data) => {
        this.prediction = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message;
        this.loading = false;
      }
    });
  }
}
```

---

## State Management

### Redux Toolkit

```typescript
// store/predictionsSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '@/lib/api';

export const fetchPrediction = createAsyncThunk(
  'predictions/fetch',
  async ({ marketId, option, timeframe }: any) => {
    return await api.getPrediction(marketId, option, timeframe);
  }
);

const predictionsSlice = createSlice({
  name: 'predictions',
  initialState: {
    data: {},
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrediction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPrediction.fulfilled, (state, action) => {
        state.loading = false;
        state.data[action.meta.arg.marketId] = action.payload;
      })
      .addCase(fetchPrediction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default predictionsSlice.reducer;
```

---

## Error Handling Best Practices

```typescript
// utils/errorHandler.ts
export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function handleAPIRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  try {
    return await request();
  } catch (error: any) {
    // Handle specific error codes
    if (error.code === 'MARKET_NOT_FOUND') {
      throw new APIError('Market not found', error.code, 404);
    } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
      throw new APIError('Too many requests. Please try again later.', error.code, 429);
    } else if (error.code === 'INVALID_MARKET_DATA') {
      throw new APIError('Market data is invalid', error.code, 400);
    }
    
    throw error;
  }
}
```

---

## Performance Optimization

### Caching Strategy

```typescript
// utils/cache.ts
class PredictionCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minutes
  
  get(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
  
  clear() {
    this.cache.clear();
  }
}

export const predictionCache = new PredictionCache();

// Usage in API client
async getPrediction(marketId: string, option: string, timeframe: string) {
  const cacheKey = `${marketId}-${option}-${timeframe}`;
  const cached = predictionCache.get(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  const data = await this.request(/* ... */);
  predictionCache.set(cacheKey, data);
  return data;
}
```

---

## Testing

### Jest Example

```typescript
// __tests__/api.test.ts
import { api } from '@/lib/api';

describe('PolyscopeAPI', () => {
  it('should fetch prediction', async () => {
    const prediction = await api.getPrediction('marketId', 'Yes');
    expect(prediction).toHaveProperty('confidence');
    expect(prediction).toHaveProperty('prediction');
  });
  
  it('should handle errors', async () => {
    await expect(
      api.getPrediction('invalid-id', 'Yes')
    ).rejects.toThrow();
  });
});
```

---

## Deployment Checklist

- [ ] Update `ALLOWED_ORIGINS` environment variable with production domain
- [ ] Set up HTTPS for production API
- [ ] Configure proper error logging
- [ ] Set up monitoring and alerts
- [ ] Test CORS configuration
- [ ] Verify rate limiting
- [ ] Test all API endpoints
- [ ] Set up CDN for static assets (if applicable)
- [ ] Configure proper caching headers
- [ ] Set up health check monitoring

---

## Support

For issues or questions:
- API Documentation: `/API_DOCUMENTATION.md`
- Feature Documentation: `/FEATURES.md`
- Quick Start: `/QUICK_START.md`
