import { checkTicketAvailability } from '../lib/scraper.js';
import { sendTicketAlert } from '../lib/emailer.js';

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

    let emailResult = null;

    // Send email if tickets are available or waitlist opens
    const shouldEmail =
      process.env.ALWAYS_EMAIL === 'true' ||
      result.hasAvailable ||
      result.hasWaitlist;

    if (shouldEmail) {
      console.log('Cron: Sending notification email...');
      emailResult = await sendTicketAlert(result);
    } else {
      console.log('Cron: No tickets available, skipping email');
    }

    return res.status(200).json({
      ...result,
      emailSent: emailResult
    });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
