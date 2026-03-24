# Frontend Skeleton + API Integration Prompt (For Figma AI / Copilot)

Use the following as a direct prompt to generate a production-ready frontend skeleton, UX architecture, and API integration plan for the Polyscope backend.

---

## Copy/Paste Prompt

You are a senior frontend architect + product designer + API integration engineer.

Build a full frontend skeleton for a prediction platform called Polyscope using the backend contract below.

Goals:
1. Design a clean, modern, responsive UI/UX skeleton (desktop + mobile).
2. Include full route map (public + admin).
3. Generate JSON data contracts for request/response handling per endpoint.
4. Define strict security handling rules in frontend code.
5. Ensure no frontend behavior violates backend security constraints.

Output format required:
1. Information architecture and navigation map.
2. Frontend route table with access level (public/admin).
3. Screen-by-screen wireframe specs (components + states).
4. API integration contract table (method, path, auth headers, payload, success shape, error shape).
5. Type-safe JSON models / interfaces.
6. Error/loading/empty/retry handling strategy.
7. Security do and do-not checklist.
8. Implementation order for another coding Copilot.

Assume backend base URL:
- Development: http://localhost:5000/api
- Production: https://polyscope.onrender.com/api

Global response shape:
Success:
{
  "success": true,
  "data": {},
  "timestamp": "ISO_DATE"
}

Error:
{
  "success": false,
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "timestamp": "ISO_DATE"
}

Important backend security constraints:
- Prediction generation is private and must not be exposed in frontend.
- Any route that generates predictions is blocked publicly.
- Admin routes require BOTH headers:
  - X-API-Key: <admin user API key>
  - x-admin-key: <server admin secret key>
- Frontend must never hardcode secrets.
- Admin keys must only be handled in secure admin-only deployment context.

Build the frontend to consume only allowed routes:

A) Public Market Routes
1. GET /markets
Query:
- category?: string
- timeframe?: daily | weekly | monthly
- status?: active | closed
- limit?: number (1..100)
- offset?: number (>=0)

2. GET /markets/search
Query:
- q: string (required)
- limit?: number (1..50)

3. GET /markets/trending
Query:
- limit?: number (1..50)

4. GET /markets/category/:category
Query:
- limit?: number (1..100)

5. GET /markets/:id

B) Public Predictions Read Routes
1. GET /predictions
Query:
- limit?: number (1..100)
- offset?: number (>=0)
- timeframe?: daily | weekly | monthly

2. GET /predictions/approved
(same query options as /predictions)

3. GET /predictions/performance
Query:
- days?: number (1..30)
- mode?: paper | production | staging
- minResolved?: number
- minLowerBound?: number (1..100)

4. GET /predictions/:predictionId

5. POST /predictions/:predictionId/vote
Body:
{
  "voteType": "like" | "dislike"
}

6. GET /predictions/:predictionId/votes

C) Public Notification Routes
1. POST /notifications/email/subscribe
Body:
{
  "email": "user@example.com",
  "markets": [
    { "marketId": "string", "marketTitle": "string" }
  ],
  "preferences": {
    "frequency": "monthly",
    "minConfidence": 70,
    "maxNotificationsPerDay": 10,
    "categories": ["Crypto"],
    "includeFeatures": false
  }
}

2. GET /notifications/email/verify?token=...

3. POST /notifications/email/unsubscribe
Body option A:
{ "token": "string" }
Body option B:
{ "email": "user@example.com" }

4. POST /notifications/push/subscribe
Body:
{
  "subscription": {
    "endpoint": "string",
    "keys": {
      "p256dh": "string",
      "auth": "string"
    }
  },
  "markets": [
    { "marketId": "string", "marketTitle": "string" }
  ],
  "preferences": {
    "minConfidence": 70,
    "maxNotificationsPerDay": 20
  }
}

5. POST /notifications/push/unsubscribe
Body:
{ "endpoint": "string" }

6. GET /notifications/push/vapid-public-key

7. POST /notifications/test
Body:
{
  "email": "user@example.com",
  "pushSubscription": {
    "endpoint": "string",
    "keys": {
      "p256dh": "string",
      "auth": "string"
    }
  }
}

8. PATCH /notifications/preferences
Body:
{
  "type": "email" | "push",
  "identifier": "string",
  "preferences": {
    "frequency": "monthly",
    "minConfidence": 75,
    "maxNotificationsPerDay": 5,
    "includeFeatures": true
  }
}

D) Metrics Routes
1. GET /metrics
Headers:
- X-API-Key required

2. GET /metrics/prometheus
No auth required (for scraping).

3. POST /metrics/reset
Headers:
- X-API-Key required

E) Admin Routes (all require BOTH X-API-Key and x-admin-key)
1. POST /admin/cache/clear
Body:
{ "type": "all" | "expired" | "predictions" }

2. GET /admin/cache/stats

3. POST /admin/cache/invalidate/:marketId

4. POST /admin/cron/run
Body:
{ "job": "refresh" | "compute" }

5. GET /admin/debug

6. POST /admin/test/llm

7. POST /admin/test/email
Body:
{ "to": "email" }

8. POST /admin/cleanup/subscriptions

9. GET /admin/stats/predictions

10. GET /admin/stats/notifications

11. Webhooks:
- POST /admin/webhooks
- GET /admin/webhooks
- GET /admin/webhooks/:id
- PUT /admin/webhooks/:id
- DELETE /admin/webhooks/:id
- POST /admin/webhooks/:id/test

Webhook create body:
{
  "url": "https://example.com/hook",
  "events": [
    "prediction.created",
    "prediction.updated",
    "market.trending",
    "whale.activity",
    "high.confidence"
  ]
}

12. Prediction moderation:
- GET /admin/predictions
- POST /admin/predictions/:id/approve
  Body: { "reviewNotes": "optional string <= 1000" }
- POST /admin/predictions/:id/reject
  Body: { "reviewNotes": "optional string <= 1000" }
- PATCH /admin/predictions/:id/probability
  Body: { "aiProbability": number 0..100 }

13. External data observability:
- GET /admin/external-data/:marketId
- GET /admin/health/external-sources
- GET /admin/metrics/external-data

Blocked routes that frontend MUST NOT use for generation:
- GET /markets/:id/predict-unified
- GET /markets/:id/predict
- GET /markets/:id/predict-all
- GET /markets/:id/features
- GET /markets/:id/cache
- POST /predictions
- POST /predictions/batch

If attempted, backend returns rejection (prediction engine private).

Now design the frontend architecture:

1) Frontend app routes to produce
Public:
- /
- /markets
- /markets/:id
- /markets/trending
- /predictions
- /predictions/:predictionId
- /performance
- /notifications
- /notifications/verify

Admin:
- /admin/login-or-key-entry
- /admin/dashboard
- /admin/cache
- /admin/cron
- /admin/debug
- /admin/webhooks
- /admin/webhooks/:id
- /admin/predictions
- /admin/external-data
- /admin/metrics

2) For each page define:
- purpose
- primary components
- API calls
- loading state
- empty state
- validation errors
- retry UX

3) Data model output requirements:
Create interfaces/types for:
- ApiSuccess<T>
- ApiError
- Market
- Prediction
- PredictionPerformance
- VoteSummary
- NotificationPreference
- EmailSubscriptionPayload
- PushSubscriptionPayload
- AdminHeaders
- Webhook
- ExternalDataHealth
- ExternalDataMetrics

4) Security requirements in frontend implementation:
Do:
- Use a central API client with request/response interceptors.
- Normalize all API errors into one UI-safe error object.
- Keep admin keys only in secure runtime configuration and restricted admin app scope.
- Use role-gated admin routing and explicit warning UI for privileged actions.
- Add rate-limit aware retry logic with backoff for 429 responses.
- Log sensitive-action audits client-side without secrets.

Do not:
- Do not store admin keys in localStorage/sessionStorage in plaintext.
- Do not expose admin keys in public bundles.
- Do not call blocked prediction-generation routes.
- Do not show raw backend stack traces to users.
- Do not trust client validation alone; always expect backend validation errors.
- Do not infer or display internal prediction timing mechanics.

5) API client behavior rules:
- Attach X-API-Key only on endpoints that require it.
- Attach x-admin-key only for admin routes.
- Separate public API client and admin API client.
- Provide per-endpoint timeout and cancellation support.
- Add idempotency handling pattern for unsafe admin mutations where possible.

6) Deliverables for coding Copilot:
- Suggested folder structure (components, pages, services, hooks, types, utils).
- Route config file.
- Typed API service modules grouped by domain (markets, predictions, notifications, admin, metrics).
- Form validation schemas for all POST/PATCH routes.
- Example request/response mappers.
- Test checklist for payload and response handling.

7) Add explicit handling for these common error codes in UI copy:
- MISSING_API_KEY
- INVALID_API_KEY
- INVALID_ADMIN_KEY
- FORBIDDEN
- AUTH_REQUIRED
- PREDICTION_ENGINE_PRIVATE
- validation errors from express-validator
- rate-limit responses (429)

Produce practical, implementation-ready output (not vague guidance).

---

## Notes For Team

- This prompt intentionally aligns with current backend hardening: private prediction generation, admin dual-header enforcement, and strict route-level auth.
- If backend routes change, update this prompt before generating a new frontend scaffold.
