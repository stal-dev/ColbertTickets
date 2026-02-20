import { put, head } from '@vercel/blob';

const STATE_BLOB_NAME = 'ticket-checker-state.json';

/**
 * Creates a state key from the scraper results.
 * This key uniquely identifies the current ticket availability state.
 */
export function createStateKey(result) {
  if (!result.shows || result.shows.length === 0) {
    return 'no-shows';
  }

  // Create a deterministic key from available/waitlist dates per show
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
 * Retrieves the previous state from Vercel Blob storage.
 */
export async function getPreviousState() {
  try {
    // Check if the blob exists
    const blobInfo = await head(STATE_BLOB_NAME);
    if (!blobInfo) {
      return null;
    }

    // Fetch the blob content
    const response = await fetch(blobInfo.url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Blob doesn't exist yet or other error
    console.log('No previous state found:', error.message);
    return null;
  }
}

/**
 * Saves the current state to Vercel Blob storage.
 */
export async function saveState(stateKey, result) {
  const state = {
    stateKey,
    hasAvailable: result.hasAvailable,
    hasWaitlist: result.hasWaitlist,
    checkedAt: result.checkedAt,
    summary: result.shows.map(s => ({
      name: s.name,
      availableDates: s.availableDates?.map(d => d.date) || [],
      waitlistDates: s.waitlistDates?.map(d => d.date) || []
    }))
  };

  await put(STATE_BLOB_NAME, JSON.stringify(state, null, 2), {
    access: 'public',
    addRandomSuffix: false
  });

  console.log('State saved to blob storage');
  return state;
}

/**
 * Compares current result with previous state and determines if email should be sent.
 * Returns { shouldEmail, reason, isNewAvailability }
 */
export async function shouldSendEmail(result) {
  const currentKey = createStateKey(result);
  const previousState = await getPreviousState();

  // Always send if ALWAYS_EMAIL is set
  if (process.env.ALWAYS_EMAIL === 'true') {
    return {
      shouldEmail: true,
      reason: 'ALWAYS_EMAIL is enabled',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // No tickets available - don't send
  if (!result.hasAvailable && !result.hasWaitlist) {
    return {
      shouldEmail: false,
      reason: 'No tickets available',
      isNewAvailability: false,
      stateChanged: previousState?.stateKey !== currentKey
    };
  }

  // No previous state - this is new availability
  if (!previousState) {
    return {
      shouldEmail: true,
      reason: 'First run with availability detected',
      isNewAvailability: true,
      stateChanged: true
    };
  }

  // Compare state keys
  if (currentKey !== previousState.stateKey) {
    return {
      shouldEmail: true,
      reason: 'Ticket availability has changed',
      isNewAvailability: true,
      stateChanged: true
    };
  }

  // State is the same - don't send duplicate email
  return {
    shouldEmail: false,
    reason: 'No change from previous check',
    isNewAvailability: false,
    stateChanged: false
  };
}
