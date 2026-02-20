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

  let totalAvailable = 0;
  let totalWaitlist = 0;
  let totalUnavailable = 0;
  const showDateBoundaries = [];

  result.shows.forEach(show => {
    const avail = show.availableDates || [];
    const wait = show.waitlistDates || [];
    
    totalAvailable += avail.length;
    totalWaitlist += wait.length;
    totalUnavailable += (show.closedDates || []).length;

    if (avail.length > 0 || wait.length > 0) {
      const firstAvail = avail.length > 0 ? avail[0].date : 'none';
      const lastAvail = avail.length > 0 ? avail[avail.length - 1].date : 'none';
      const firstWait = wait.length > 0 ? wait[0].date : 'none';
      const lastWait = wait.length > 0 ? wait[wait.length - 1].date : 'none';
      
      showDateBoundaries.push(`${show.name}:A[${firstAvail}-${lastAvail}]:W[${firstWait}-${lastWait}]`);
    }
  });

  const boundariesKey = showDateBoundaries.sort().join('|');
  return `avail:${totalAvailable}|wait:${totalWaitlist}|unavail:${totalUnavailable}|dates:${boundariesKey || 'none'}`;
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
  const totalAvailable = result.shows.reduce((sum, s) => sum + (s.availableDates?.length || 0), 0);
  const totalWaitlist = result.shows.reduce((sum, s) => sum + (s.waitlistDates?.length || 0), 0);
  const totalUnavailable = result.shows.reduce((sum, s) => sum + (s.closedDates?.length || 0), 0);

  const state = {
    stateKey,
    hasAvailable: result.hasAvailable,
    hasWaitlist: result.hasWaitlist,
    checkedAt: result.checkedAt,
    emailSent: !!emailInfo?.sent,
    emailReason: emailInfo?.reason || null,
    totalShows: result.shows.length,
    totalAvailable,
    totalWaitlist,
    totalUnavailable,
    summary: result.shows.map(s => {
      const avail = s.availableDates || [];
      const wait = s.waitlistDates || [];
      return {
        name: s.name,
        availableCount: avail.length,
        waitlistCount: wait.length,
        firstAvailable: avail[0]?.date || null,
        lastAvailable: avail[avail.length - 1]?.date || null,
        firstWaitlist: wait[0]?.date || null,
        lastWaitlist: wait[wait.length - 1]?.date || null,
        allAvailableDates: avail.map(d => d.date),
        allWaitlistDates: wait.map(d => d.date)
      };
    })
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
      totalShows: state.totalShows,
      totalAvailable: state.totalAvailable,
      totalWaitlist: state.totalWaitlist,
      totalUnavailable: state.totalUnavailable,
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

  console.log(`shouldSendEmail Check:`);
  result.shows.forEach(show => {
    const avail = show.availableDates || [];
    const wait = show.waitlistDates || [];
    if (avail.length > 0 || wait.length > 0) {
      const aRange = avail.length > 0 ? `${avail[0].display} - ${avail[avail.length-1].display}` : 'none';
      const wRange = wait.length > 0 ? `${wait[0].display} - ${wait[wait.length-1].display}` : 'none';
      console.log(`- ${show.name}: Avail[${aRange}], Wait[${wRange}]`);
    } else {
      console.log(`- ${show.name}: No tickets`);
    }
  });

  const currentTotalAvailable = result.shows.reduce((sum, s) => sum + (s.availableDates?.length || 0), 0);
  const currentTotalWaitlist = result.shows.reduce((sum, s) => sum + (s.waitlistDates?.length || 0), 0);

  console.log(`- Current Totals: Avail(${currentTotalAvailable}), Wait(${currentTotalWaitlist})`);
  
  if (lastSentEmail) {
    console.log(`- Last Sent Totals: Avail(${lastSentEmail.totalAvailable || 0}), Wait(${lastSentEmail.totalWaitlist || 0})`);
  } else {
    console.log(`- No previous emails sent.`);
  }

  if (process.env.ALWAYS_EMAIL === 'true') {
    return {
      shouldEmail: true,
      reason: 'ALWAYS_EMAIL is enabled',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // If we've never sent an email, send if there is ANY availability
  if (!lastSentEmail) {
    if (currentTotalAvailable > 0 || currentTotalWaitlist > 0) {
      return {
        shouldEmail: true,
        reason: 'Initial availability detected',
        isNewAvailability: true,
        stateChanged: true
      };
    }
    return {
      shouldEmail: false,
      reason: 'No tickets available (initial run)',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // Increase logic: Only send if the number of available OR waitlist tickets has increased
  const lastTotalAvail = lastSentEmail.totalAvailable || 0;
  const lastTotalWait = lastSentEmail.totalWaitlist || 0;

  if (currentTotalAvailable > lastTotalAvail) {
    return {
      shouldEmail: true,
      reason: `Available tickets increased: ${lastTotalAvail} -> ${currentTotalAvailable}`,
      isNewAvailability: true,
      stateChanged: true
    };
  }

  if (currentTotalWaitlist > lastTotalWait) {
    return {
      shouldEmail: true,
      reason: `Waitlist tickets increased: ${lastTotalWait} -> ${currentTotalWaitlist}`,
      isNewAvailability: true,
      stateChanged: true
    };
  }

  console.log(`- No increase in ticket counts detected.`);
  return {
    shouldEmail: false,
    reason: 'No increase in ticket counts',
    isNewAvailability: false,
    stateChanged: previousState?.stateKey !== currentKey
  };
}