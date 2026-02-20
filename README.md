# 1iota Tickets Checker

Automatically checks [1iota.com](https://1iota.com) for TV show ticket availability and sends email notifications via Gmail. Runs on Vercel with hourly cron checks.

## Shows Monitored

- [The Late Show with Stephen Colbert](https://1iota.com/show/536/the-late-show-with-stephen-colbert)
- [The Daily Show](https://1iota.com/show/1248/the-daily-show)
- [Jimmy Kimmel Live](https://1iota.com/show/1/jimmy-kimmel-live) (disabled by default)
- [The Tonight Show Starring Jimmy Fallon](https://1iota.com/show/353/the-tonight-show-starring-jimmy-fallon) (disabled by default)
- [Late Night with Seth Meyers](https://1iota.com/show/461/late-night-with-seth-meyers) (disabled by default)

## Features

- Checks ticket availability for multiple shows
- Distinguishes between ticket statuses:
  - **Available** ("Request Tickets") - tickets definitely available
  - **Waitlist** ("Join Waitlist") - backlog, maybe available
  - **Closed** ("Registration Closed" / sold out) - no tickets
- Email notifications when tickets become available
- Web UI for manual checks
- Automatic hourly checks via Vercel Cron
- Serverless - no server to maintain

## Prerequisites

- A [Vercel](https://vercel.com) account (free tier works)
- A Gmail account with 2-Step Verification enabled

## Deployment

### 1. Create a Gmail App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (if not already enabled)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select "Mail" and generate a new app password
5. Copy the 16-character password

### 2. Deploy to Vercel

```bash
# Install dependencies
npm install

# Deploy
npx vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

### 3. Configure Environment Variables

In the Vercel dashboard, add these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Your Gmail address (used for sending and receiving) |
| `GMAIL_APP_PASSWORD` | Yes | Gmail App Password (not your regular password) |
| `ALWAYS_EMAIL` | No | Set to `true` to email on every check. Default: `false` |
| `CRON_SECRET` | No | Secret to secure the cron endpoint |

## Usage

### Web UI

Visit your Vercel deployment URL to access the web interface for manual checks.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web UI |
| `POST /api/check` | Check tickets (JSON response) |
| `POST /api/check-and-email` | Check tickets + send email |
| `/api/cron` | Called automatically every hour by Vercel |

### Automatic Checks

Vercel Cron runs `/api/cron` every hour. When tickets are available or waitlist opens, you'll receive an email notification.

## Local Development

```bash
npx vercel dev
```

This starts the Vercel dev server locally at http://localhost:3000.

## How It Works

1. **Scraper** - Launches serverless Chrome via @sparticuz/chromium
2. **Detection** - Navigates to each show's 1iota page, clicks date tabs, checks button text:
   - "Request Tickets" = available
   - "Join Waitlist" = waitlist (backlog)
   - "Registration Closed" = closed
3. **Notification** - Sends email when tickets become available or waitlist opens
4. **Output** - Groups dates by status (Available, Waitlist, Closed) with day of week

## Example Email

```
TICKETS AVAILABLE:
• The Late Show: Mon Mar 2, Tue Mar 3, Wed Mar 4

---
The Late Show - TICKETS AVAILABLE!
  Available: Mon Mar 2, Tue Mar 3, Wed Mar 4
  Waitlist: Thu Mar 5, Fri Mar 6
  Closed: Feb 5, Feb 16, Feb 17
```

## Troubleshooting

### Cold start timeout
Serverless Chrome has ~15-20 second cold starts. If checks timeout, try again - subsequent requests are faster.

### Email not sending
- Verify you're using an **App Password**, not your regular Gmail password
- Check that 2-Step Verification is enabled on your Google account
- Verify environment variables are set correctly in Vercel dashboard

### Function timeout
The function timeout is set to 60 seconds in `vercel.json`. On the free tier, this is the maximum. If scraping multiple shows takes longer, consider disabling some shows in `lib/config.js`.

## Project Structure

```
├── api/
│   ├── check.js           # Manual ticket check
│   ├── check-and-email.js # Check + send email
│   └── cron.js            # Hourly cron endpoint
├── lib/
│   ├── config.js          # Show configuration
│   ├── emailer.js         # Email notifications
│   └── scraper.js         # Puppeteer scraper
├── public/
│   └── index.html         # Web UI
└── vercel.json            # Cron + function config
```

## License

MIT
