import { put, head, list } from '@vercel/blob';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const STATE_BLOB_NAME = 'ticket-checker-state.json';
const HISTORY_BLOB_NAME = 'ticket-checker-history.json';
const MAX_HISTORY_ENTRIES = 50;

// Local storage directory (relative to project root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_STORAGE_DIR = join(__dirname, '..', '.local-storage');

/**
 * Helper to get the token configuration for all Blob calls
 */
function getBlobConfig() {
  return {
    token: process.env.COLBERT_TICKETS_READ_WRITE_TOKEN,
  };
}

/**
 * Check if we should use local storage (no blob token available)
 */
function useLocalStorage() {
  return !process.env.COLBERT_TICKETS_READ_WRITE_TOKEN;
}

/**
 * Ensure local storage directory exists
 */
async function ensureLocalDir() {
  try {
    await mkdir(LOCAL_STORAGE_DIR, { recursive: true });
  } catch (e) {
    // Directory already exists
  }
}

/**
 * Read a file from local storage
 */
async function localRead(filename) {
  try {
    const filepath = join(LOCAL_STORAGE_DIR, filename);
    const content = await readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Write a file to local storage
 */
async function localWrite(filename, data) {
  await ensureLocalDir();
  const filepath = join(LOCAL_STORAGE_DIR, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2));
}

/**
 * List all files in local storage or Vercel Blob
 */
export async function listStorage() {
  if (useLocalStorage()) {
    const { readdir, stat } = await import('fs/promises');
    try {
      await ensureLocalDir();
      const files = await readdir(LOCAL_STORAGE_DIR);
      const blobs = await Promise.all(
        files.map(async (filename) => {
          const filepath = join(LOCAL_STORAGE_DIR, filename);
          const stats = await stat(filepath);
          return {
            pathname: filename,
            size: stats.size,
            uploadedAt: stats.mtime.toISOString(),
            url: `file://${filepath}`
          };
        })
      );
      return { blobs };
    } catch (e) {
      return { blobs: [] };
    }
  } else {
    return await list(getBlobConfig());
  }
}

/**
 * Creates a state key from the scraper results.
 */
export function createStateKey(result) {
  if (!result.shows || result.shows.length === 0) {
    return 'no-shows';
  }

  const showStates = result.shows
    .map(show => {
      const availableDates = (show.availableDates || [])
        .map(d => d.date)
        .sort()
        .join(',');
      const waitlistDates = (show.waitlistDates || [])
        .map(d => d.date)
        .sort()
        .join(',');
      return `${show.name}:avail[${availableDates}]:wait[${waitlistDates}]`;
    })
    .sort()
    .join('|');

  return showStates || 'empty';
}

/**
 * Retrieves the previous state from storage.
 */
export async function getPreviousState() {
  try {
    if (useLocalStorage()) {
      console.log('Using local storage for state');
      return await localRead(STATE_BLOB_NAME);
    }

    // Use Vercel Blob with custom token
    const blobInfo = await head(STATE_BLOB_NAME, getBlobConfig());
    if (!blobInfo) {
      return null;
    }

    const response = await fetch(blobInfo.url);
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.log('No previous state found:', error.message);
    return null;
  }
}

/**
 * Saves the current state to storage.
 */
export async function saveState(stateKey, result, emailInfo = null) {
  const state = {
    stateKey,
    hasAvailable: result.hasAvailable,
    hasWaitlist: result.hasWaitlist,
    checkedAt: result.checkedAt,
    emailSent: !!emailInfo?.sent,
    emailReason: emailInfo?.reason || null,
    summary: result.shows.map(s => ({
      name: s.name,
      availableDates: s.availableDates?.map(d => d.date) || [],
      waitlistDates: s.waitlistDates?.map(d => d.date) || []
    }))
  };

  if (useLocalStorage()) {
    console.log('Saving state to local storage');
    await localWrite(STATE_BLOB_NAME, state);
  } else {
    // Pass custom token to put()
    await put(STATE_BLOB_NAME, JSON.stringify(state, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      ...getBlobConfig()
    });
    console.log('State saved to blob storage');
  }

  await appendToHistory(state);
  return state;
}

/**
 * Retrieves the run history from storage.
 */
export async function getRunHistory() {
  try {
    if (useLocalStorage()) {
      const data = await localRead(HISTORY_BLOB_NAME);
      return data?.runs || [];
    }

    const blobInfo = await head(HISTORY_BLOB_NAME, getBlobConfig());
    if (!blobInfo) {
      return [];
    }

    const response = await fetch(blobInfo.url);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.runs || [];
  } catch (error) {
    console.log('No history found:', error.message);
    return [];
  }
}

/**
 * Appends a run entry to the history log.
 */
async function appendToHistory(state) {
  try {
    const history = await getRunHistory();

    const entry = {
      checkedAt: state.checkedAt,
      stateKey: state.stateKey,
      hasAvailable: state.hasAvailable,
      hasWaitlist: state.hasWaitlist,
      emailSent: state.emailSent,
      emailReason: state.emailReason,
      summary: state.summary
    };

    history.unshift(entry);
    const trimmedHistory = history.slice(0, MAX_HISTORY_ENTRIES);

    if (useLocalStorage()) {
      await localWrite(HISTORY_BLOB_NAME, { runs: trimmedHistory });
      console.log(`History updated locally (${trimmedHistory.length} entries)`);
    } else {
      // Pass custom token to put()
      await put(HISTORY_BLOB_NAME, JSON.stringify({ runs: trimmedHistory }, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        ...getBlobConfig()
      });
      console.log(`History updated (${trimmedHistory.length} entries)`);
    }
  } catch (error) {
    console.error('Failed to update history:', error.message);
  }
}

/**
 * Compares current result with previous state and last sent email.
 */
export async function shouldSendEmail(result) {
  const currentKey = createStateKey(result);
  const previousState = await getPreviousState();
  const history = await getRunHistory();
  const lastSentEmail = history.find(run => run.emailSent);

  if (process.env.ALWAYS_EMAIL === 'true') {
    return {
      shouldEmail: true,
      reason: 'ALWAYS_EMAIL is enabled',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // If no tickets are available at all, don't send an email
  if (!result.hasAvailable && !result.hasWaitlist) {
    return {
      shouldEmail: false,
      reason: 'No tickets available',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // If we've never sent an email, and we have availability, send it
  if (!lastSentEmail) {
    return {
      shouldEmail: true,
      reason: 'First run with availability detected',
      isNewAvailability: true,
      stateChanged: true
    };
  }

  // Only send if the availability has changed since the last email we actually sent
  if (currentKey !== lastSentEmail.stateKey) {
    return {
      shouldEmail: true,
      reason: 'Ticket availability has changed since last email',
      isNewAvailability: true,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  return {
    shouldEmail: false,
    reason: 'No change from last notification',
    isNewAvailability: false,
    stateChanged: previousState?.stateKey !== currentKey
  };
}