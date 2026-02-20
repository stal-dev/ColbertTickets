import { listStorage, getPreviousState, getRunHistory } from '../lib/state.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get current state
    const currentState = await getPreviousState();

    // List all blobs/files in storage
    const { blobs } = await listStorage();

    const blobSummary = blobs.map(blob => ({
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      url: blob.url
    }));

    // Calculate storage stats
    const totalSizeBytes = blobs.reduce((sum, b) => sum + (b.size || 0), 0);

    // Get run history
    const runHistory = await getRunHistory();

    return res.status(200).json({
      debug: true,
      timestamp: new Date().toISOString(),
      storage: {
        totalBlobs: blobs.length,
        totalSizeBytes: totalSizeBytes,
        totalSizeKB: (totalSizeBytes / 1024).toFixed(2)
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
      hint: 'Check if storage is accessible'
    });
  }
}
