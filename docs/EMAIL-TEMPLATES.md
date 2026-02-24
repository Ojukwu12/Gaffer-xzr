# Email Templates Documentation

## Available Email Templates

Polyscope includes professionally designed email templates for all user communications:

### 1. **Prediction Alert Email** 📊
**Function:** `sendPredictionEmail(to, prediction, market)`

Sent when a new prediction meets user preferences.

**Features:**
- Gradient header with branding
- Large confidence percentage display
- Detailed AI analysis section
- 6-metric feature grid (Liquidity, Volume, Whale Factor, Trend, Daily Change, Sentiment)
- Call-to-action button to Polymarket
- Unsubscribe link

**Preview:**
```
🎯 Polyscope Prediction Alert
Market: "Will Bitcoin reach $100k by Dec 2024?"
Option: Yes
Confidence: 87%
```

---

### 2. **Subscription Confirmation Email** ✉️
**Function:** `sendSubscriptionConfirmationEmail(to, verificationToken)`

Sent when a user subscribes to email notifications.

**Features:**
- Welcome message
- Email verification button
- Verification link (fallback)
- Purple gradient branding

---

### 3. **Welcome Email** 🎉
**Function:** `sendWelcomeEmail(to, apiKey)`

Sent when a new user account is created.

**Features:**
- User's API key (monospace, highlighted)
- Security warning
- Feature showcase (4 boxes):
  - 🤖 AI Predictions
  - 🐋 Whale Tracking
  - 📊 40+ Features
  - 🔔 Real-time Alerts
- Quick start cURL example
- API documentation link

---

### 4. **High Confidence Alert** 🚨
**Function:** `sendHighConfidenceAlert(to, prediction, market)`

Sent for predictions with confidence ≥ 80%.

**Features:**
- Green gradient header (urgent styling)
- "IMMEDIATE ACTION RECOMMENDED" badge
- Large 60px confidence display
- Urgent yellow alert box
- Key signals analysis with interpretations:
  - Whale Activity: VERY HIGH / HIGH / MODERATE
  - Market Trend: STRONG UPTREND / BULLISH
  - Liquidity: EXCELLENT / GOOD
- Disclaimer section
- Bold CTA button

---

### 5. **Daily Digest Email** 📅
**Function:** `sendDailyDigest(to, predictions)`

Summary of top 5 predictions sent daily.

**Features:**
- Date in header
- Top 5 predictions sorted by confidence
- Each prediction shows:
  - Market title
  - Outcome
  - Timeframe
  - Confidence percentage
- Summary statistics:
  - Total predictions analyzed
  - High confidence opportunities count

---

## Email Design System

### Color Palette
```css
Primary Gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
Success Green: #10b981
Warning Yellow: #f59e0b
Background: #f9f9f9
White Cards: #ffffff
Border Accent: #667eea
```

### Typography
- **Font Family:** Arial, sans-serif
- **Headers:** Bold, gradient backgrounds
- **Body:** 16px, line-height 1.6
- **Confidence Numbers:** 48-60px, bold
- **Monospace:** API keys, code snippets

### Layout
- **Max Width:** 600px (optimal for all email clients)
- **Padding:** 20-30px sections
- **Border Radius:** 5-10px for cards
- **Responsive:** Mobile-friendly design

---

## Responsive Design

All templates are mobile-responsive with:
- Flexible layouts
- Readable font sizes
- Touch-friendly buttons (15px+ padding)
- No fixed widths on inner elements

---

## Email Client Compatibility

Tested and working on:
- ✅ Gmail (Web, iOS, Android)
- ✅ Outlook (Web, Desktop)
- ✅ Apple Mail
- ✅ Yahoo Mail
- ✅ ProtonMail
- ✅ Mobile clients (iOS/Android)

Uses inline CSS for maximum compatibility.

---

## Plain Text Fallback

All emails include plain text versions for clients that don't support HTML.

---

## Customization

### To modify templates:

1. **Edit in:** `src/services/emailService.js`
2. **Find function:** `sendPredictionEmail`, `sendWelcomeEmail`, etc.
3. **Modify HTML:** Update the template literal
4. **Test:** Use admin endpoint `/api/admin/test/email`

### Brand Colors

To change brand colors, update these in templates:
```javascript
// Replace #667eea and #764ba2 with your brand colors
background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
```

---

## Testing Emails

### Test individual templates:
```bash
# Test general email
curl -X POST http://localhost:3000/api/admin/test/email \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com"}'
```

### View in browser:
Save email HTML to a file and open in browser:
```javascript
fs.writeFileSync('email-preview.html', emailHtml);
```

---

## Email Service Configuration

Emails are sent via **Testmail.app** (configured in `.env`):

```env
SMTP_HOST=smtp.testmail.app
SMTP_PORT=587
SMTP_USER=your_username
SMTP_PASS=your_password
EMAIL_FROM=noreply@polyscope.com
```

### Why Testmail.app?
- ✅ Free tier available
- ✅ Easy testing with disposable addresses
- ✅ Reliable delivery
- ✅ No credit card required
- ✅ API access for automation

---

## Unsubscribe Handling

All prediction emails include unsubscribe links:
```html
<a href="{{unsubscribeUrl}}">Unsubscribe</a>
```

Handled by: `POST /api/notifications/email/unsubscribe`

---

## GDPR Compliance

Email templates include:
- ✅ Unsubscribe link in footer
- ✅ Clear sender identification
- ✅ Opt-in subscription process
- ✅ Email verification required
- ✅ Plain text alternative

---

## Performance

- **Template size:** < 100KB per email
- **Image-free:** No external images (fast loading)
- **Inline CSS:** No external stylesheets
- **Delivery time:** < 2 seconds average

---

## Future Enhancements

Potential improvements:
- 📧 Weekly summary email
- 🏆 Achievement emails
- 📈 Performance reports
- 💰 Profit/loss tracking emails
- 🎁 Promotional emails
- 🔔 Custom alert templates

---

## Support

For email template issues:
1. Check SMTP configuration in `.env`
2. Test connection: `emailService.testConnection()`
3. Check logs: `logs/combined.log`
4. Verify Testmail.app account status
