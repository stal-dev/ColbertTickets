import puppeteer from 'puppeteer';

const TARGET_URL = 'https://1iota.com/show/536/the-late-show-with-stephen-colbert';

export async function checkTicketAvailability() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log(`[${new Date().toISOString()}] Checking ${TARGET_URL}`);

    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for main content to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Give extra time for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Look for ticket availability indicators
    const result = await page.evaluate(() => {
      const pageText = document.body.innerText.toLowerCase();
      const pageHtml = document.body.innerHTML.toLowerCase();

      // Check for "request" buttons or links (indicates tickets available)
      const requestButtons = document.querySelectorAll('a, button');
      let hasRequestButton = false;
      const availableDates = [];

      requestButtons.forEach(btn => {
        const text = btn.innerText.toLowerCase();
        if (text.includes('request') || text.includes('get tickets') || text.includes('reserve')) {
          hasRequestButton = true;
        }
      });

      // Look for date listings that might indicate available shows
      const dateElements = document.querySelectorAll('[class*="date"], [class*="show"], [class*="event"]');
      dateElements.forEach(el => {
        const text = el.innerText.trim();
        if (text && text.length < 100) {
          availableDates.push(text);
        }
      });

      // Check for "no tickets" or "sold out" messages
      const noTicketsIndicators = [
        'no tickets available',
        'sold out',
        'no upcoming shows',
        'check back later',
        'no events'
      ];

      const hasNoTicketsMessage = noTicketsIndicators.some(indicator =>
        pageText.includes(indicator)
      );

      // Check for positive availability indicators
      const hasAvailabilityIndicators =
        pageText.includes('request tickets') ||
        pageText.includes('available') ||
        hasRequestButton;

      return {
        hasRequestButton,
        hasNoTicketsMessage,
        hasAvailabilityIndicators,
        availableDates: availableDates.slice(0, 10),
        pageTextSample: pageText.substring(0, 500)
      };
    });

    // Determine if tickets are available
    const available = result.hasAvailabilityIndicators && !result.hasNoTicketsMessage;

    return {
      available,
      url: TARGET_URL,
      dates: result.availableDates,
      details: result,
      checkedAt: new Date().toISOString(),
      message: available
        ? 'Tickets may be available! Check the site.'
        : 'No tickets currently available.'
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scraper error:`, error.message);
    return {
      available: false,
      url: TARGET_URL,
      error: error.message,
      checkedAt: new Date().toISOString(),
      message: `Error checking tickets: ${error.message}`
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
