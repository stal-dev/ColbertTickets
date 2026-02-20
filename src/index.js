import 'dotenv/config';
import cron from 'node-cron';
import { checkTicketAvailability } from './scraper.js';
import { sendTicketAlert } from './emailer.js';

const CHECK_NOW = process.argv.includes('--check-now');
const ALWAYS_EMAIL = process.env.ALWAYS_EMAIL === 'true';

// Track last known availability to avoid spam
let lastStatus = { hasAvailable: false, hasWaitlist: false };

async function runCheck() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[${new Date().toISOString()}] Starting ticket check...`);

  const result = await checkTicketAvailability();

  let statusText;
  if (result.hasAvailable) {
    statusText = 'TICKETS AVAILABLE';
  } else if (result.hasWaitlist) {
    statusText = 'WAITLIST OPEN';
  } else {
    statusText = 'Not available';
  }
  console.log(`[${new Date().toISOString()}] Result: ${statusText}`);

  // Send email if:
  // 1. ALWAYS_EMAIL is enabled, OR
  // 2. Tickets are available (always notify - high priority), OR
  // 3. Waitlist opened (notify once), OR
  // 4. Status changed from available to not available
  const availabilityChanged = lastStatus.hasAvailable !== result.hasAvailable;
  const waitlistChanged = lastStatus.hasWaitlist !== result.hasWaitlist;
  const shouldEmail = ALWAYS_EMAIL ||
    result.hasAvailable ||
    (result.hasWaitlist && waitlistChanged) ||
    (availabilityChanged && lastStatus.hasAvailable);

  if (shouldEmail) {
    console.log(`[${new Date().toISOString()}] Sending notification email...`);
    await sendTicketAlert(result);
  } else {
    console.log(`[${new Date().toISOString()}] No email needed (status unchanged)`);
  }

  lastStatus = { hasAvailable: result.hasAvailable, hasWaitlist: result.hasWaitlist };

  return result;
}

async function main() {
  console.log('='.repeat(50));
  console.log(' Colbert Tickets Checker');
  console.log('='.repeat(50));
  console.log(`Mode: ${CHECK_NOW ? 'Single check' : 'Scheduled (hourly)'}`);
  console.log(`Always email: ${ALWAYS_EMAIL ? 'Yes' : 'No (only on availability)'}`);

  if (CHECK_NOW) {
    // Run once and exit
    const result = await runCheck();
    console.log('\nFull result:', JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // Run immediately on startup
  await runCheck();

  // Schedule hourly checks (at minute 0)
  cron.schedule('0 * * * *', async () => {
    await runCheck();
  });

  console.log(`\n[${new Date().toISOString()}] Scheduler running. Next check at the top of the hour.`);
  console.log('Press Ctrl+C to stop.\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
