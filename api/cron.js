import { checkTicketAvailability } from '../lib/scraper.js';
import { sendTicketAlert } from '../lib/emailer.js';
import { shouldSendEmail, saveState, createStateKey } from '../lib/state.js';

export default async function handler(req, res) {
  // Verify this is a Vercel cron request (optional security)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Cron: Starting scheduled ticket check...');
    const result = await checkTicketAvailability();

    // Compare with previous state to avoid duplicate emails
    const emailDecision = await shouldSendEmail(result);
    console.log(`Cron: Email decision - ${emailDecision.reason} (stateChanged: ${emailDecision.stateChanged})`);

    let emailResult = null;

    if (emailDecision.shouldEmail) {
      console.log('Cron: Sending notification email...');
      emailResult = await sendTicketAlert(result);
    } else {
      console.log('Cron: Skipping email - no changes detected');
    }

    // Always save state after check (to track current state)
    const stateKey = createStateKey(result);
    await saveState(stateKey, result);

    return res.status(200).json({
      ...result,
      emailSent: emailResult,
      emailDecision: {
        sent: emailDecision.shouldEmail,
        reason: emailDecision.reason,
        stateChanged: emailDecision.stateChanged
      }
    });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
