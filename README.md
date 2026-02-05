# 1iota Tickets Checker

Automatically checks [1iota.com](https://1iota.com) for TV show ticket availability and sends email notifications via Gmail.

## Shows Monitored

- [The Late Show with Stephen Colbert](https://1iota.com/show/536/the-late-show-with-stephen-colbert)
- [The Daily Show](https://1iota.com/show/1248/the-daily-show)
- [Jimmy Kimmel Live](https://1iota.com/show/1/jimmy-kimmel-live)
- [The Tonight Show Starring Jimmy Fallon](https://1iota.com/show/353/the-tonight-show-starring-jimmy-fallon)
- [Late Night with Seth Meyers](https://1iota.com/show/461/late-night-with-seth-meyers)

## Features

- Checks ticket availability for multiple shows every hour
- Email notifications when tickets become available
- Uses headless Chrome (Puppeteer) to handle JavaScript-rendered pages
- Configurable to send emails on every check or only when status changes

## Prerequisites

- Node.js 18+
- A Gmail account with 2-Step Verification enabled

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

### 1. Create a Gmail App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (if not already enabled)
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Select "Mail" and generate a new app password
5. Copy the 16-character password

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
ALWAYS_EMAIL=false
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Your Gmail address (used for sending and receiving) |
| `GMAIL_APP_PASSWORD` | Yes | Gmail App Password (not your regular password) |
| `ALWAYS_EMAIL` | No | Set to `true` to email on every check, even when no tickets available. Default: `false` |

## Usage

### Run a single check

```bash
npm run check-now
```

This runs one check, prints the result, and exits. Useful for testing your setup.

### Run continuously (hourly checks)

```bash
npm start
```

This starts the scheduler which:
- Runs an immediate check on startup
- Checks again at the top of every hour
- Sends email notifications based on your `ALWAYS_EMAIL` setting

### Keep it running in the background

Using **PM2** (recommended):

```bash
# Install PM2 globally
npm install -g pm2

# Start the checker
pm2 start src/index.js --name colbert-tickets

# View logs
pm2 logs colbert-tickets

# Stop
pm2 stop colbert-tickets
```

Using **nohup**:

```bash
nohup npm start > colbert.log 2>&1 &
```

## How It Works

1. **Scraper** - Launches headless Chrome via Puppeteer, navigates to each show's 1iota page, and waits for JavaScript to render
2. **Detection** - Looks for "Request" buttons, available dates, or "no tickets" messages for each show
3. **Notification** - Sends an email when tickets are detected for any show (or on every check if `ALWAYS_EMAIL=true`)
4. **Scheduler** - Repeats the check every hour using node-cron

## Troubleshooting

### "Missing GMAIL_USER or GMAIL_APP_PASSWORD"
Make sure you created the `.env` file and filled in your credentials.

### Email not sending
- Verify you're using an **App Password**, not your regular Gmail password
- Check that 2-Step Verification is enabled on your Google account
- Check the console for error messages

### Puppeteer errors
If you see Chrome/Chromium errors:
```bash
# On macOS, you may need to allow Chromium in Security settings
# Or install dependencies:
npx puppeteer browsers install chrome
```

## License

MIT
