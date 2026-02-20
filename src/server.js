import 'dotenv/config';
import http from 'http';
import { checkTicketAvailability } from './scraper.js';
import { sendTicketAlert } from './emailer.js';

const PORT = process.env.PORT || 3000;

// Store last check result
let lastResult = null;
let isChecking = false;

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Routes (GET and POST both work for actions)
  if (url.pathname === '/api/check' && (req.method === 'POST' || req.method === 'GET')) {
    if (isChecking) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: 'Check already in progress' }));
      return;
    }

    isChecking = true;
    try {
      console.log(`[${new Date().toISOString()}] HTTP: Starting ticket check...`);
      const result = await checkTicketAvailability();
      lastResult = result;
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    } finally {
      isChecking = false;
    }

  } else if (url.pathname === '/api/check-and-email' && (req.method === 'POST' || req.method === 'GET')) {
    if (isChecking) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: 'Check already in progress' }));
      return;
    }

    isChecking = true;
    try {
      console.log(`[${new Date().toISOString()}] HTTP: Starting ticket check with email...`);
      const result = await checkTicketAvailability();
      lastResult = result;

      const emailResult = await sendTicketAlert(result);
      res.writeHead(200);
      res.end(JSON.stringify({ ...result, emailSent: emailResult }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    } finally {
      isChecking = false;
    }

  } else if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      isChecking,
      lastResult,
      serverTime: new Date().toISOString()
    }));

  } else if (url.pathname === '/' || url.pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(getHtmlPage());

  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

function getHtmlPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>1iota Tickets Checker</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .btn {
      padding: 12px 24px;
      font-size: 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-right: 10px;
      margin-bottom: 10px;
    }
    .btn-primary { background: #007bff; color: white; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-success { background: #28a745; color: white; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn:hover:not(:disabled) { opacity: 0.9; }
    #status {
      padding: 15px;
      border-radius: 6px;
      margin-top: 15px;
    }
    .status-checking { background: #fff3cd; color: #856404; }
    .status-available { background: #d4edda; color: #155724; }
    .status-waitlist { background: #fff3cd; color: #856404; }
    .status-none { background: #f8d7da; color: #721c24; }
    .status-error { background: #f8d7da; color: #721c24; }
    #results {
      margin-top: 20px;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 13px;
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      max-height: 500px;
      overflow-y: auto;
    }
    .show-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      margin-top: 15px;
    }
    .show-available { background: #d4edda; }
    .show-waitlist { background: #fff3cd; }
    .show-none { background: #f8f9fa; }
    .date-list { list-style: none; padding-left: 0; margin: 10px 0; }
    .date-list li { padding: 4px 0; }
    .date-available { color: #28a745; font-weight: bold; }
    .date-waitlist { color: #856404; }
    .date-closed { color: #999; }
    .timestamp { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h1>🎟️ 1iota Tickets Checker</h1>

  <div class="card">
    <h3>Actions</h3>
    <button class="btn btn-primary" id="btnCheck" onclick="checkTickets()">
      Check Tickets
    </button>
    <button class="btn btn-success" id="btnCheckEmail" onclick="checkAndEmail()">
      Check & Send Email
    </button>
    <button class="btn btn-secondary" onclick="getStatus()">
      Refresh Status
    </button>

    <div id="status"></div>
  </div>

  <div class="card">
    <h3>Results</h3>
    <div id="results">Click a button to check ticket availability...</div>
  </div>

  <script>
    const API_BASE = '';

    async function checkTickets() {
      await makeRequest('/api/check');
    }

    async function checkAndEmail() {
      await makeRequest('/api/check-and-email');
    }

    async function makeRequest(endpoint) {
      const statusEl = document.getElementById('status');
      const resultsEl = document.getElementById('results');
      const btnCheck = document.getElementById('btnCheck');
      const btnCheckEmail = document.getElementById('btnCheckEmail');

      btnCheck.disabled = true;
      btnCheckEmail.disabled = true;
      statusEl.className = 'status-checking';
      statusEl.innerHTML = '⏳ Checking tickets... (this may take 30-60 seconds)';
      resultsEl.innerHTML = 'Loading...';

      try {
        const response = await fetch(API_BASE + endpoint, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
          displayResults(data);
        } else {
          statusEl.className = 'status-error';
          statusEl.innerHTML = '❌ Error: ' + (data.error || 'Unknown error');
          resultsEl.innerHTML = JSON.stringify(data, null, 2);
        }
      } catch (error) {
        statusEl.className = 'status-error';
        statusEl.innerHTML = '❌ Request failed: ' + error.message;
        resultsEl.innerHTML = error.toString();
      } finally {
        btnCheck.disabled = false;
        btnCheckEmail.disabled = false;
      }
    }

    async function getStatus() {
      try {
        const response = await fetch(API_BASE + '/api/status');
        const data = await response.json();

        const statusEl = document.getElementById('status');
        if (data.isChecking) {
          statusEl.className = 'status-checking';
          statusEl.innerHTML = '⏳ Check in progress...';
        } else if (data.lastResult) {
          displayResults(data.lastResult);
        } else {
          statusEl.className = '';
          statusEl.innerHTML = 'No checks performed yet. Server time: ' + data.serverTime;
        }
      } catch (error) {
        document.getElementById('status').innerHTML = 'Error getting status: ' + error.message;
      }
    }

    function displayResults(data) {
      const statusEl = document.getElementById('status');
      const resultsEl = document.getElementById('results');

      if (data.hasAvailable) {
        statusEl.className = 'status-available';
        statusEl.innerHTML = '🎟️ <strong>TICKETS AVAILABLE!</strong>';
      } else if (data.hasWaitlist) {
        statusEl.className = 'status-waitlist';
        statusEl.innerHTML = '⏳ <strong>Waitlist open</strong> (no guaranteed tickets)';
      } else {
        statusEl.className = 'status-none';
        statusEl.innerHTML = '❌ No tickets available';
      }

      if (data.emailSent) {
        statusEl.innerHTML += data.emailSent.success
          ? ' | ✉️ Email sent'
          : ' | ❌ Email failed';
      }

      let html = '<p class="timestamp">Checked at: ' + data.checkedAt + '</p>';
      html += '<p><strong>' + data.message + '</strong></p>';

      if (data.shows && data.shows.length > 0) {
        data.shows.forEach(show => {
          let cardClass = 'show-none';
          let icon = '❌';
          if (show.hasAvailable) {
            cardClass = 'show-available';
            icon = '🎟️';
          } else if (show.hasWaitlist) {
            cardClass = 'show-waitlist';
            icon = '⏳';
          }

          html += '<div class="show-card ' + cardClass + '">';
          html += '<h4>' + icon + ' ' + show.name + '</h4>';

          // List dates by status
          html += '<ul class="date-list">';
          (show.availableDates || []).forEach(d => {
            html += '<li class="date-available">🎟️ ' + (d.display || d.date) + '</li>';
          });
          (show.waitlistDates || []).forEach(d => {
            html += '<li class="date-waitlist">⏳ ' + (d.display || d.date) + '</li>';
          });
          (show.closedDates || []).forEach(d => {
            html += '<li class="date-closed">❌ ' + (d.display || d.date) + '</li>';
          });
          html += '</ul>';

          if (show.error) {
            html += '<p style="color:red">Error: ' + show.error + '</p>';
          }
          html += '<p><a href="' + show.url + '" target="_blank">Open in 1iota →</a></p>';
          html += '</div>';
        });
      }

      resultsEl.innerHTML = html;
    }

    // Check status on load
    getStatus();
  </script>
</body>
</html>`;
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(' 1iota Tickets Checker - HTTP Server');
  console.log('='.repeat(50));
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /                    - Web UI');
  console.log('  GET  /api/status          - Get last result');
  console.log('  GET  /api/check           - Check tickets');
  console.log('  GET  /api/check-and-email - Check + send email');
  console.log('');
});
