import puppeteer from 'puppeteer';
import { SHOWS } from './config.js';

// Parse event text like "Thu, Feb 05 4:15 PM PT Los Angeles, CA 18 +"
function parseEventInfo(text) {
  if (!text || typeof text !== 'string') return null;

  // Clean up the text
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Match pattern: Day, Mon DD H:MM AM/PM TZ Location, ST Age +
  const dateMatch = cleaned.match(/^([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*([A-Z]{2,3})?\s*(.+?)?\s*(\d+\s*\+)?$/i);

  if (dateMatch) {
    const [, dayOfWeek, month, day, time, timezone, location, ageReq] = dateMatch;
    return {
      dayOfWeek: dayOfWeek,
      month: month,
      day: parseInt(day, 10),
      time: time.trim(),
      timezone: timezone || '',
      location: location ? location.trim().replace(/,\s*$/, '') : '',
      ageRequirement: ageReq ? ageReq.trim() : '',
      raw: cleaned
    };
  }

  // Fallback: just return the cleaned text if we can't parse it
  return { raw: cleaned };
}

// Format parsed event for display (concise: day + date only)
function formatEvent(event) {
  if (!event) return '';
  if (!event.dayOfWeek) return event.raw;

  return `${event.dayOfWeek}, ${event.month} ${event.day}`;
}

// Create unique key for deduplication
function eventKey(event) {
  if (!event) return '';
  if (event.dayOfWeek) {
    return `${event.month}-${event.day}-${event.time}`;
  }
  return event.raw;
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

    // Collect all events across calendar dates
    const allEvents = [];

    // Find clickable calendar date elements
    const calendarDates = await page.$$('[class*="calendar"] [class*="day"], [class*="date-picker"] button, [class*="datepicker"] button, .calendar-day, [data-date]');

    if (calendarDates.length > 0) {
      console.log(`[${new Date().toISOString()}]   Found ${calendarDates.length} calendar dates to check`);

      for (const dateEl of calendarDates) {
        try {
          // Check if the date element is clickable/enabled
          const isDisabled = await dateEl.evaluate(el => {
            return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
          });

          if (!isDisabled) {
            await dateEl.click();
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Collect events visible after clicking
            const events = await page.evaluate(() => {
              const eventTexts = [];
              // Look for event cards/rows
              const eventElements = document.querySelectorAll(
                '[class*="event-card"], [class*="show-card"], [class*="ticket-row"], ' +
                '[class*="showtime"], [class*="event-item"], [class*="event-row"]'
              );

              eventElements.forEach(el => {
                const text = el.innerText.trim();
                if (text && text.length > 5 && text.length < 200) {
                  eventTexts.push(text);
                }
              });

              return eventTexts;
            });

            allEvents.push(...events);
          }
        } catch {
          // Skip unclickable elements
        }
      }
    }

    // Also collect events visible on the initial page view
    const initialEvents = await page.evaluate(() => {
      const events = [];
      const pageText = document.body.innerText.toLowerCase();

      // Look for "Request" buttons which indicate available tickets
      const hasRequestButton = Array.from(document.querySelectorAll('a, button')).some(btn => {
        const text = btn.innerText.toLowerCase();
        return text.includes('request') || text.includes('get tickets') || text.includes('reserve');
      });

      // Check for no tickets messages
      const noTicketsIndicators = [
        'no tickets available',
        'sold out',
        'no upcoming shows',
        'check back later',
        'no events',
        'currently no'
      ];
      const hasNoTicketsMessage = noTicketsIndicators.some(indicator => pageText.includes(indicator));

      // Find event listings - look for elements with date/time patterns
      const allElements = document.querySelectorAll('*');
      const dateTimePattern = /[A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{1,2}:\d{2}\s*[AP]M/i;

      allElements.forEach(el => {
        // Only check leaf nodes or small containers
        if (el.children.length <= 3) {
          const text = el.innerText?.trim();
          if (text && text.length > 10 && text.length < 150 && dateTimePattern.test(text)) {
            events.push(text);
          }
        }
      });

      return { events, hasRequestButton, hasNoTicketsMessage };
    });

    allEvents.push(...initialEvents.events);

    // Parse and deduplicate events
    const parsedEvents = allEvents
      .map(parseEventInfo)
      .filter(e => e !== null);

    // Deduplicate by key
    const seen = new Set();
    const uniqueEvents = parsedEvents.filter(event => {
      const key = eventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Format for display
    const formattedDates = uniqueEvents.map(formatEvent);

    // Determine availability
    const available = (initialEvents.hasRequestButton || uniqueEvents.length > 0) && !initialEvents.hasNoTicketsMessage;

    console.log(`[${new Date().toISOString()}]   Found ${uniqueEvents.length} unique event(s), available: ${available}`);

    return {
      name: show.name,
      url: show.url,
      available,
      dates: formattedDates,
      eventCount: uniqueEvents.length,
      error: null
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking ${show.name}:`, error.message);
    return {
      name: show.name,
      url: show.url,
      available: false,
      dates: [],
      eventCount: 0,
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
