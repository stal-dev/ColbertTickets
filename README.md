# 1iota Tickets Checker

Automatically checks [1iota.com](https://1iota.com) for TV show ticket availability and sends email notifications via Gmail.

## Shows Monitored

- [The Late Show with Stephen Colbert](https://1iota.com/show/536/the-late-show-with-stephen-colbert)
- [The Daily Show](https://1iota.com/show/1248/the-daily-show)
- [Jimmy Kimmel Live](https://1iota.com/show/1/jimmy-kimmel-live)
- [The Tonight Show Starring Jimmy Fallon](https://1iota.com/show/353/the-tonight-show-starring-jimmy-fallon)
- [Late Night with Seth Meyers](https://1iota.com/show/461/late-night-with-seth-meyers)

## Features

- Checks ticket availability for multiple shows
- Distinguishes between ticket statuses:
  - **Available** ("Request Tickets") - tickets definitely available
  - **Waitlist** ("Join Waitlist") - backlog, maybe available
  - **Closed** ("Registration Closed" / sold out) - no tickets
- Email notifications with grouped dates by status
- Web UI and HTTP API for on-demand checks
- Uses headless Chrome (Puppeteer) to handle JavaScript-rendered pages

## Prerequisites

- Node.js 18+
- A Gmail account with 2-Step Verification enabled

## Installation

```bash
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
PORT=3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GMAIL_USER` | Yes | Your Gmail address (used for sending and receiving) |
| `GMAIL_APP_PASSWORD` | Yes | Gmail App Password (not your regular password) |
| `ALWAYS_EMAIL` | No | Set to `true` to email on every check. Default: `false` |
| `PORT` | No | HTTP server port. Default: `3000` |

## Usage

### Option 1: HTTP Server (Web UI + API)

```bash
npm run server
```

Open http://localhost:3000 for the web UI, or trigger checks via URL:

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web UI |
| `GET /api/check` | Check tickets (JSON response) |
| `GET /api/check-and-email` | Check tickets + send email |
| `GET /api/status` | Get last cached result |

**Direct URL triggers** (bookmarkable, curl-friendly):
```bash
# Just check
curl http://localhost:3000/api/check

# Check and send email
curl http://localhost:3000/api/check-and-email
```

### Option 2: Single Check (CLI)

```bash
npm run check-now
```

Runs one check, prints the result, and exits.

### Option 3: Scheduled Checks (Hourly)

```bash
npm start
```

Runs an immediate check on startup, then checks at the top of every hour.

### Keep it running in the background

Using **PM2** (recommended):

```bash
npm install -g pm2

# HTTP server mode
pm2 start src/server.js --name 1iota-tickets

# Or scheduled mode
pm2 start src/index.js --name 1iota-tickets

pm2 logs 1iota-tickets
pm2 stop 1iota-tickets
```

Using **nohup**:

```bash
nohup npm run server > tickets.log 2>&1 &
```

## How It Works

1. **Scraper** - Launches headless Chrome, navigates to each show's 1iota page
2. **Detection** - Clicks each date tab and checks the button text:
   - "Request Tickets" = available
   - "Join Waitlist" = waitlist (backlog)
   - "Registration Closed" = closed
3. **Notification** - Sends email when status changes or tickets become available
4. **Output** - Groups dates by status (Available, Waitlist, Closed) with day of week

## Example Output

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

### "Missing GMAIL_USER or GMAIL_APP_PASSWORD"
Make sure you created the `.env` file and filled in your credentials.

### Email not sending
- Verify you're using an **App Password**, not your regular Gmail password
- Check that 2-Step Verification is enabled on your Google account

### Puppeteer errors
```bash
npx puppeteer browsers install chrome
```

## License

MIT
