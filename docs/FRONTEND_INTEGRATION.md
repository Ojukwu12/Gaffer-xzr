# Frontend Integration Guide

**Version:** 2.0+  
**Last updated:** March 30, 2026

## Overview

This guide explains how to integrate Polyscope's notification system (email and push) into your frontend application.

## Environment Setup

### Backend Configuration (Server Admin)

Ensure the backend has the correct frontend URL configured in `.env`:

```env
# Backend URL (for admin/internal use)
APP_URL=http://localhost:5000  # or your backend domain

# Frontend URL (used for email verification links)
FRONTEND_URL=http://localhost:3000  # or your frontend domain
```

**Important:** The `FRONTEND_URL` is used to generate email verification links that redirect users to your frontend, not the backend.

---

## Email Notifications

### 1. Subscribe to Email Alerts

**Frontend Form:**
```html
<form id="email-subscribe-form">
  <input type="email" name="email" placeholder="your@email.com" required>
  <button type="submit">Subscribe to Updates</button>
</form>
```

**JavaScript:**
```javascript
document.getElementById('email-subscribe-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = e.target.email.value;
  
  try {
    const response = await fetch('https://your-backend.com/api/notifications/email/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        markets: [], // Optional: restrict to specific market IDs
        preferences: {
          minConfidence: 70, // Only send predictions with 70%+ confidence
          categories: ['Crypto', 'Politics'] // Optional: filter by categories
        }
      })
    });

    const data = await response.json();
    
    if (data.success) {
      alert('Check your email to confirm the subscription!');
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Subscription failed:', error);
  }
});
```

### 2. Email Verification Handler

**Frontend Route:** `/verify-email?token=abc123xyz`

When users click the "Confirm Email" link in their email, they'll be redirected to your frontend:

```javascript
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function EmailVerification() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setStatus('error');
        setMessage('Verification token is missing');
        return;
      }

      try {
        const response = await fetch(
          `https://your-backend.com/api/notifications/email/verify?token=${token}`
        );
        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage(`✓ Email verified! Predictions will be sent to ${data.data.email}`);
          // Redirect to home or dashboard after 3 seconds
          setTimeout(() => window.location.href = '/', 3000);
        } else {
          setStatus('error');
          setMessage('Verification failed: ' + data.error);
        }
      } catch (error) {
        setStatus('error');
        setMessage('Network error during verification');
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="verification-page">
      {status === 'verifying' && <p>{message}</p>}
      {status === 'success' && (
        <div className="success-message">
          <h2>{message}</h2>
        </div>
      )}
      {status === 'error' && (
        <div className="error-message">
          <h2>{message}</h2>
        </div>
      )}
    </div>
  );
}
```

---

## Push Notifications

### 1. Request Permission & Subscribe

**JavaScript (React example):**
```javascript
import { useEffect } from 'react';

export default function PushNotificationSubscriber() {
  useEffect(() => {
    const subscribeToPushNotifications = async () => {
      // Check if browser supports notifications
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Push notification permission denied');
        return;
      }

      try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/service-worker.js');

        // Get VAPID public key from backend
        const vapidResponse = await fetch(
          'https://your-backend.com/api/notifications/push/vapid-public-key'
        );
        const { data: { vapidPublicKey } } = await vapidResponse.json();

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Send subscription to backend
        const response = await fetch(
          'https://your-backend.com/api/notifications/push/subscribe',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription,
              markets: [], // Optional: restrict to specific markets
              preferences: {
                minConfidence: 65, // Only high-confidence predictions
                notifyOnResolution: true,
                notifyWeeklyDigest: true
              }
            })
          }
        );

        const data = await response.json();
        if (data.success) {
          console.log('✓ Push notifications enabled!');
          // You'll receive a welcome notification automatically
        }
      } catch (error) {
        console.error('Failed to subscribe to push notifications:', error);
      }
    };

    subscribeToPushNotifications();
  }, []);

  return null; // This component handles subscription silently
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

### 2. Service Worker for Push Handling

**Create `/public/service-worker.js`:**
```javascript
// This service worker handles incoming push notifications

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('Push notification received with no data');
    return;
  }

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: data.badge || '/badge.png',
    tag: data.tag,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // If prediction has a URL, open it
  if (event.notification.data.url) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // If window already open, focus it
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].url === event.notification.data.url) {
            return clientList[i].focus();
          }
        }
        // Otherwise open new window
        return clients.openWindow(event.notification.data.url);
      })
    );
  }
});
```

### 3. Welcome Notification

When users subscribe to push notifications, they'll automatically receive a welcome notification:

**Message:**
- Title: `👋 Welcome to Polyscope`
- Body: `Your push notifications are set up and ready to receive predictions!`

Your service worker will receive and display this notification automatically.

### 4. Manual Weekly Digest Test (Admin)

Frontend/admin panel can trigger weekly push digest immediately without waiting for Monday cron:

```javascript
async function triggerWeeklyDigest(windowDays = 7) {
  const response = await fetch('https://your-backend.com/api/admin/test/push-weekly-digest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': 'your_admin_secret_key',
      'X-API-Key': 'your_admin_api_key'
    },
    body: JSON.stringify({ windowDays })
  });

  const data = await response.json();
  return data;
}
```

Response includes:
- `checked`: number of active push subscriptions evaluated
- `sent`: number of successful digest pushes
- `failed`: number of failed digest pushes

---

## Notification Contents

### Email Predictions

Users will receive emails like:

```
Subject: 🎯 Polyscope Prediction Alert

Market: Will Bitcoin reach $100k by 2025?
Option: Yes
Timeframe: Daily
Confidence: 78%

Analysis: Strong buying pressure from institutional traders...

Key Metrics:
- Liquidity: $150,000
- 24h Volume: $45,000
- Trend Score: 85%
- Sentiment: Positive

[View on Polymarket] ← Direct link to market
```

### Push Notifications

Users will receive push notifications like:

```
Title: 🎯 Polyscope Alert
Body: Will Bitcoin reach $100k?: 78% confidence for Yes

[View Details] [Dismiss]
```

---

## Handling Unsubscription

### Email Unsubscribe

Each email includes an unsubscribe link. Users can also unsubscribe via API:

```javascript
const response = await fetch(
  'https://your-backend.com/api/notifications/email/unsubscribe',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com' })
  }
);
```

### Push Unsubscribe

```javascript
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.getSubscription();

if (subscription) {
  const response = await fetch(
    'https://your-backend.com/api/notifications/push/unsubscribe',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        endpoint: subscription.endpoint 
      })
    }
  );
}
```

---

## Environment Variables (Frontend)

Create a `.env` file in your frontend:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_BACKEND_URL=http://localhost:5000
```

Or for production:

```env
REACT_APP_API_URL=https://api.polyscope.com/api
REACT_APP_BACKEND_URL=https://api.polyscope.com
```

---

## Troubleshooting

### Email verification link not working
- Ensure backend has correct `FRONTEND_URL` in `.env`
- Verify the verification token is being passed correctly
- Check CloudKit/mail logs to confirm email was sent

### Push notifications not appearing
- Ensure service worker is registered (`/public/service-worker.js`)
- Check browser DevTools → Application → Service Workers
- Verify VAPID keys are configured on backend
- Check notification permission is granted in browser settings

### User not receiving emails/pushes
- Verify subscription is active: `isActive: true` in database
- Check backend logs for notification sending errors
- Verify email/push service credentials are correct
- Check spam folder for emails

---

## API Endpoints Reference

### Email Notifications

- `POST /api/notifications/email/subscribe` - Subscribe to emails
- `GET /api/notifications/email/verify?token=...` - Verify email
- `POST /api/notifications/email/unsubscribe` - Unsubscribe from emails

### Push Notifications

- `POST /api/notifications/push/subscribe` - Subscribe to push
- `GET /api/notifications/push/vapid-public-key` - Get VAPID key
- `POST /api/notifications/push/unsubscribe` - Unsubscribe from push

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for full endpoint details.
