import { list, head } from '@vercel/blob';
import { getRunHistory } from '../lib/state.js';

const STATE_BLOB_NAME = 'ticket-checker-state.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get current state
    let currentState = null;
    try {
      const blobInfo = await head(STATE_BLOB_NAME);
      if (blobInfo) {
        const response = await fetch(blobInfo.url);
        if (response.ok) {
          currentState = await response.json();
        }
      }
    } catch (e) {
      currentState = { error: e.message };
    }

    // List all blobs in storage
    const { blobs } = await list();

    const blobSummary = blobs.map(blob => ({
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      url: blob.url
    }));

    // Calculate storage stats
    const totalSize = blobs.reduce((sum, b) => sum + b.size, 0);

    // Get run history
    const runHistory = await getRunHistory();

    return res.status(200).json({
      debug: true,
      timestamp: new Date().toISOString(),
      storage: {
        totalBlobs: blobs.length,
        totalSizeBytes: totalSize,
        totalSizeKB: (totalSize / 1024).toFixed(2)
      },
      currentState,
      runHistory: {
        totalRuns: runHistory.length,
        runs: runHistory
      },
      blobs: blobSummary,
      environment: {
        nodeVersion: process.version,
        hasGmailUser: !!process.env.GMAIL_USER,
        hasGmailPassword: !!process.env.GMAIL_APP_PASSWORD,
        hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        alwaysEmail: process.env.ALWAYS_EMAIL || 'false'
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({
      error: error.message,
      hint: 'Make sure BLOB_READ_WRITE_TOKEN is configured'
    });
  }
}
