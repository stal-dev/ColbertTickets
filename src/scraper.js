import puppeteer from 'puppeteer';
import { SHOWS } from './config.js';

async function checkSingleShow(page, show) {
  console.log(`[${new Date().toISOString()}] Checking ${show.name}...`);

  try {
    await page.goto(show.url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for main content to load
    await page.waitForSelector('body', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to expand the calendar by clicking the calendar-plus button
    try {
      const calendarExpandBtn = await page.$('.fa-calendar-plus');
      if (calendarExpandBtn) {
        await page.evaluate(el => {
          const clickable = el.closest('li, div, button') || el.parentElement;
          if (clickable) clickable.click();
        }, calendarExpandBtn);
        console.log(`[${new Date().toISOString()}]   Clicked calendar expand button`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch {
      // Calendar expand button not found or not clickable
    }

    // Extract dates from 1iota calendar structure
    const dates = await page.evaluate(() => {
      const results = [];

      // Find date tabs in the calendar (desktop version has more info)
      const dateTabs = document.querySelectorAll('.tabList li.tabWidth, .tabList li.tabWidthMobile');

      dateTabs.forEach(tab => {
        // Skip calendar icon buttons
        if (tab.querySelector('.fa-calendar-plus, .fa-calendar-times')) {
          return;
        }

        const monthEl = tab.querySelector('.month');
        const dayEl = tab.querySelector('.dom');
        const dowEl = tab.querySelector('.dow');

        if (monthEl && dayEl) {
          const month = monthEl.innerText.trim();
          const day = dayEl.innerText.trim();
          const dow = dowEl ? dowEl.innerText.trim() : '';

          // Check if sold out - either has soldout class or contains soldOut status
          const isSoldOut = tab.classList.contains('soldout') ||
                           tab.querySelector('.soldOut, .soldOutMobile') !== null;

          results.push({
            month,
            day: parseInt(day, 10),
            dow,
            soldOut: isSoldOut,
            display: dow ? `${dow}, ${month} ${day}` : `${month} ${day}`
          });
        }
      });

      return results;
    });

    // Deduplicate by month+day
    const seen = new Set();
    const uniqueDates = dates.filter(d => {
      const key = `${d.month}-${d.day}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Check if any dates are available (not sold out)
    const availableDates = uniqueDates.filter(d => !d.soldOut);
    const hasAvailable = availableDates.length > 0;

    console.log(`[${new Date().toISOString()}]   Found ${uniqueDates.length} date(s), ${availableDates.length} available`);

    return {
      name: show.name,
      url: show.url,
      available: hasAvailable,
      dates: uniqueDates,
      availableCount: availableDates.length,
      totalCount: uniqueDates.length,
      error: null
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking ${show.name}:`, error.message);
    return {
      name: show.name,
      url: show.url,
      available: false,
      dates: [],
      availableCount: 0,
      totalCount: 0,
      error: error.message
    };
  }
}

export async function checkTicketAvailability() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const enabledShows = SHOWS.filter(show => show.enabled);
    const results = [];
    for (const show of enabledShows) {
      const result = await checkSingleShow(page, show);
      results.push(result);
    }

    const anyAvailable = results.some(r => r.available);
    const availableShows = results.filter(r => r.available);

    return {
      available: anyAvailable,
      shows: results,
      availableShows,
      checkedAt: new Date().toISOString(),
      message: anyAvailable
        ? `Tickets may be available for: ${availableShows.map(s => s.name).join(', ')}`
        : 'No tickets currently available for any show.'
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scraper error:`, error.message);
    return {
      available: false,
      shows: [],
      availableShows: [],
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
