import { checkTicketAvailability } from '../lib/scraper.js';
import { saveState, createStateKey } from '../lib/state.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Starting ticket check...');
    const result = await checkTicketAvailability();

    // Always save state after check (to track current state and history)
    const stateKey = createStateKey(result);
    await saveState(stateKey, result);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Check error:', error);
    return res.status(500).json({ error: error.message });
  }
}
