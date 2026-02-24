# VAPID Keys & Email Templates - Setup Guide

## ✅ Email Templates

Yes! **5 professional email templates** are included and ready to use:

### 1. 📊 **Prediction Alert Email**
- Beautiful gradient design
- Large confidence display
- 6-metric feature grid
- AI analysis section
- CTA to Polymarket

### 2. ✉️ **Subscription Confirmation**
- Email verification button
- Welcome message
- Clean purple branding

### 3. 🎉 **Welcome Email**
- Displays user's API key
- Feature showcase (4 boxes)
- Quick start guide
- Security warnings

### 4. 🚨 **High Confidence Alert**
- Urgent green design
- "IMMEDIATE ACTION" badge
- Key signals with interpretations
- 80%+ confidence only

### 5. 📅 **Daily Digest**
- Top 5 predictions
- Summary statistics
- Daily delivery

**All templates:**
- ✅ Mobile responsive
- ✅ Email client compatible
- ✅ Plain text fallback
- ✅ Unsubscribe links
- ✅ GDPR compliant

See `docs/EMAIL-TEMPLATES.md` for full documentation.

---

## 🔐 VAPID Keys Generation

Yes! **Automated VAPID key generator** included:

### Quick Setup

```bash
# Generate VAPID keys (one-time setup)
npm run generate-keys
```

This will:
1. ✅ Generate secure VAPID key pair
2. ✅ Display keys in terminal
3. ✅ Create `.env` file (if not exists)
4. ✅ Save backup to `vapid-keys.txt`
5. ✅ Add to `.gitignore` automatically

### Output Example
```
🔐 Generating VAPID Keys for Web Push...

✓ VAPID keys generated successfully!

═══════════════════════════════════════════════════════════════
  Add these to your .env file:
═══════════════════════════════════════════════════════════════

VAPID_PUBLIC_KEY=BGt...xyz
VAPID_PRIVATE_KEY=abc...123
VAPID_SUBJECT=mailto:admin@polyscope.com

═══════════════════════════════════════════════════════════════
```

---

## 🚀 Complete Setup Flow

### Step 1: Generate VAPID Keys
```bash
npm run generate-keys
```

### Step 2: Setup Email (Testmail.app)
1. Sign up at https://testmail.app
2. Get SMTP credentials
3. Add to `.env`:
```env
SMTP_HOST=smtp.testmail.app
SMTP_PORT=587
SMTP_USER=your_username
SMTP_PASS=your_password
EMAIL_FROM=noreply@polyscope.com
```

### Step 3: Test Everything
```bash
# Start server
npm run dev

# Test email templates
curl -X POST http://localhost:3000/api/admin/test/email \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@testmail.app"}'

# Test push notifications (after subscribing)
curl -X POST http://localhost:3000/api/notifications/push/test \
  -H "Content-Type: application/json" \
  -d '{"subscription": YOUR_PUSH_SUBSCRIPTION}'
```

---

## 📧 Email Template Usage

### Send Prediction Alert
```javascript
const emailService = require('./services/emailService');

await emailService.sendPredictionEmail(
  'user@example.com',
  prediction,
  marketData
);
```

### Send Welcome Email
```javascript
await emailService.sendWelcomeEmail(
  'newuser@example.com',
  'api_key_here'
);
```

### Send High Confidence Alert
```javascript
await emailService.sendHighConfidenceAlert(
  'user@example.com',
  highConfPrediction,
  marketData
);
```

### Send Daily Digest
```javascript
await emailService.sendDailyDigest(
  'user@example.com',
  [prediction1, prediction2, ...]
);
```

---

## 🔔 Web Push Setup

### Frontend Integration

1. **Get VAPID Public Key:**
```javascript
const response = await fetch('http://localhost:3000/api/notifications/push/vapid');
const { publicKey } = await response.json();
```

2. **Register Service Worker:**
```javascript
const registration = await navigator.serviceWorker.register('/sw.js');
```

3. **Subscribe to Push:**
```javascript
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey)
});

// Send subscription to backend
await fetch('http://localhost:3000/api/notifications/push/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(subscription)
});
```

---

## 🔒 Security Notes

### VAPID Private Key
- ⚠️ **Never commit to Git** (already in `.gitignore`)
- ⚠️ **Keep backup secure**
- ⚠️ **Rotate if compromised**

### API Keys
- ⚠️ **Use environment variables only**
- ⚠️ **Never log keys**
- ⚠️ **Separate dev/prod keys**

---

## 📂 Files Created

```
Polyscope/
├── scripts/
│   └── generate-vapid-keys.js    # ✅ VAPID generator
├── docs/
│   └── EMAIL-TEMPLATES.md        # ✅ Template docs
├── src/services/
│   ├── emailService.js           # ✅ 5 email templates
│   └── webPushService.js         # ✅ Push notification templates
└── package.json                  # ✅ Added "generate-keys" script
```

---

## 🎨 Customization

### Change Email Branding
Edit colors in `src/services/emailService.js`:
```css
background: linear-gradient(135deg, #YOUR_COLOR 0%, #YOUR_COLOR 100%);
```

### Add New Templates
1. Create function in `emailService.js`
2. Design HTML with inline CSS
3. Add plain text fallback
4. Export function

### Modify Push Notifications
Edit payload in `src/services/webPushService.js`:
```javascript
const payload = {
  title: 'Your Title',
  body: 'Your message',
  icon: '/your-icon.png',
  // ... customize
};
```

---

## ✅ Verification Checklist

Before going live:

- [ ] VAPID keys generated (`npm run generate-keys`)
- [ ] `.env` file configured with all keys
- [ ] Testmail.app account set up
- [ ] Email templates tested
- [ ] Push notifications tested
- [ ] Unsubscribe links working
- [ ] `vapid-keys.txt` deleted (or secured)
- [ ] `.env` not committed to Git
- [ ] Email deliverability verified

---

## 🆘 Troubleshooting

### "Email service not configured"
✅ Check `.env` has `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`

### "Web Push not configured"
✅ Run `npm run generate-keys` and add to `.env`

### Emails not sending
✅ Test connection: `emailService.testConnection()`
✅ Check Testmail.app quota
✅ Verify SMTP credentials

### Push notifications failing
✅ Check VAPID keys match frontend
✅ Verify service worker registered
✅ Check browser supports push API

---

## 📚 Additional Resources

- **Email Templates:** `docs/EMAIL-TEMPLATES.md`
- **API Documentation:** `docs/api-contract.md`
- **Deployment Guide:** `DEPLOYMENT.md`
- **Web Push API:** https://developer.mozilla.org/en-US/docs/Web/API/Push_API

---

**Status:** ✅ Email templates designed | ✅ VAPID generator ready
