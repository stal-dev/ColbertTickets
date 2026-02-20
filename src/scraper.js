import puppeteer from 'puppeteer';
import { SHOWS } from './config.js';

// Normalize date to "Mon D" format (e.g., "Mar 4")
function normalizeDate(month, day) {
  const monthMap = {
    'jan': 'Jan', 'january': 'Jan',
    'feb': 'Feb', 'february': 'Feb',
    'mar': 'Mar', 'march': 'Mar',
    'apr': 'Apr', 'april': 'Apr',
    'may': 'May',
    'jun': 'Jun', 'june': 'Jun',
    'jul': 'Jul', 'july': 'Jul',
    'aug': 'Aug', 'august': 'Aug',
    'sep': 'Sep', 'september': 'Sep',
    'oct': 'Oct', 'october': 'Oct',
    'nov': 'Nov', 'november': 'Nov',
    'dec': 'Dec', 'december': 'Dec'
  };
  const normalizedMonth = monthMap[month.toLowerCase()] || month;
  return `${normalizedMonth} ${day}`;
}

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

      dateTabs.forEach((tab, index) => {
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
            tabIndex: index
          });
        }
      });

      return results;
    });

    // Deduplicate by month+day, keeping desktop version (has dow)
    const seen = new Set();
    const uniqueDates = dates.filter(d => {
      const key = `${d.month}-${d.day}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // For non-sold-out dates, click and check button status
    const enrichedDates = [];
    for (const date of uniqueDates) {
      const normalized = normalizeDate(date.month, date.day);

      if (date.soldOut) {
        enrichedDates.push({
          date: normalized,
          status: 'sold_out',
          display: normalized
        });
        continue;
      }

      // Click on the date tab to see the button
      try {
        await page.evaluate((tabIndex) => {
          const tabs = document.querySelectorAll('.tabList li.tabWidth, .tabList li.tabWidthMobile');
          if (tabs[tabIndex]) {
            tabs[tabIndex].click();
          }
        }, date.tabIndex);

        await new Promise(resolve => setTimeout(resolve, 800));

        // Check button text in the event card
        const buttonStatus = await page.evaluate(() => {
          const buttons = document.querySelectorAll('.btn-action, .eventCardDesktop button, .eventCardMobile button');
          for (const btn of buttons) {
            const text = btn.innerText.trim().toLowerCase();
            if (text.includes('request tickets')) {
              return 'available';
            } else if (text.includes('join waitlist')) {
              return 'waitlist';
            } else if (text.includes('registration closed')) {
              return 'closed';
            }
          }
          return 'unknown';
        });

        enrichedDates.push({
          date: normalized,
          status: buttonStatus,
          display: normalized
        });

      } catch {
        enrichedDates.push({
          date: normalized,
          status: 'unknown',
          display: normalized
        });
      }
    }

    // Categorize dates by status
    const availableDates = enrichedDates.filter(d => d.status === 'available');
    const waitlistDates = enrichedDates.filter(d => d.status === 'waitlist');
    const closedDates = enrichedDates.filter(d => d.status === 'closed' || d.status === 'sold_out');

    console.log(`[${new Date().toISOString()}]   Found ${enrichedDates.length} date(s): ${availableDates.length} available, ${waitlistDates.length} waitlist, ${closedDates.length} closed/sold out`);

    return {
      name: show.name,
      url: show.url,
      hasAvailable: availableDates.length > 0,
      hasWaitlist: waitlistDates.length > 0,
      dates: enrichedDates,
      availableDates,
      waitlistDates,
      closedDates,
      totalCount: enrichedDates.length,
      error: null
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking ${show.name}:`, error.message);
    return {
      name: show.name,
      url: show.url,
      hasAvailable: false,
      hasWaitlist: false,
      dates: [],
      availableDates: [],
      waitlistDates: [],
      closedDates: [],
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

    const showsWithAvailable = results.filter(r => r.hasAvailable);
    const showsWithWaitlist = results.filter(r => r.hasWaitlist && !r.hasAvailable);

    let message;
    if (showsWithAvailable.length > 0) {
      const availInfo = showsWithAvailable.map(s =>
        `${s.name}: ${s.availableDates.map(d => d.date).join(', ')}`
      ).join('; ');
      message = `TICKETS AVAILABLE: ${availInfo}`;
    } else if (showsWithWaitlist.length > 0) {
      const waitlistInfo = showsWithWaitlist.map(s =>
        `${s.name}: ${s.waitlistDates.map(d => d.date).join(', ')}`
      ).join('; ');
      message = `Waitlist open: ${waitlistInfo}`;
    } else {
      message = 'No tickets currently available for any show.';
    }

    return {
      hasAvailable: showsWithAvailable.length > 0,
      hasWaitlist: showsWithWaitlist.length > 0,
      shows: results,
      showsWithAvailable,
      showsWithWaitlist,
      checkedAt: new Date().toISOString(),
      message
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Scraper error:`, error.message);
    return {
      hasAvailable: false,
      hasWaitlist: false,
      shows: [],
      showsWithAvailable: [],
      showsWithWaitlist: [],
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
