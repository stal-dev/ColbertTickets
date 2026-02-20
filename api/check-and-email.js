import { checkTicketAvailability } from '../lib/scraper.js';
import { sendTicketAlert } from '../lib/emailer.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Starting ticket check with email...');
    const result = await checkTicketAvailability();
    const emailResult = await sendTicketAlert(result);

    return res.status(200).json({
      ...result,
      emailSent: emailResult
    });
  } catch (error) {
    console.error('Check error:', error);
    return res.status(500).json({ error: error.message });
  }
}
