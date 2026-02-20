import { checkTicketAvailability } from '../lib/scraper.js';
import { sendTicketAlert } from '../lib/emailer.js';
import { shouldSendEmail, saveState, createStateKey } from '../lib/state.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Starting manual ticket check with email...');
    const result = await checkTicketAvailability();
    
    // Check if we should actually send the email based on state changes
    const emailDecision = await shouldSendEmail(result);
    const forceEmail = req.query.force === 'true';
    
    console.log(`Manual Check: Email decision - ${emailDecision.reason} (force: ${forceEmail})`);

    let emailResult = null;
    let finalReason = emailDecision.reason;

    if (emailDecision.shouldEmail || forceEmail) {
      console.log('Manual Check: Sending notification email...');
      emailResult = await sendTicketAlert(result);
      if (forceEmail && !emailDecision.shouldEmail) {
        finalReason = 'Manual check (forced)';
      }
    } else {
      console.log('Manual Check: Skipping email - no changes detected');
    }

    // Always save state after check (to track current state and history)
    const stateKey = createStateKey(result);
    await saveState(stateKey, result, {
      sent: !!emailResult,
      reason: emailResult ? finalReason : (emailDecision.shouldEmail ? 'Email failed' : 'Skipped: ' + emailDecision.reason)
    });

    return res.status(200).json({
      ...result,
      emailSent: emailResult,
      emailDecision: {
        sent: !!emailResult,
        reason: finalReason,
        stateChanged: emailDecision.stateChanged
      }
    });
  } catch (error) {
    console.error('Check error:', error);
    return res.status(500).json({ error: error.message });
  }
}
