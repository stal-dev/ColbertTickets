import nodemailer from 'nodemailer';

function generateShowHtml(show) {
  const hasAvailable = show.hasAvailable;
  const hasWaitlist = show.hasWaitlist;

  let statusIcon, statusText, bgColor;
  if (hasAvailable) {
    statusIcon = '🎟️';
    statusText = 'TICKETS AVAILABLE!';
    bgColor = '#d4edda';
  } else if (hasWaitlist) {
    statusIcon = '⏳';
    statusText = 'Waitlist open';
    bgColor = '#fff3cd';
  } else {
    statusIcon = '❌';
    statusText = 'Not available';
    bgColor = '#f8f9fa';
  }

  const formatDates = (dates, icon, color) => {
    if (!dates?.length) return '';
    return dates.map(d =>
      `<li style="color: ${color};">${icon} ${d.display || d.date}</li>`
    ).join('');
  };

  const availableList = formatDates(show.availableDates, '🎟️', '#28a745');
  const waitlistList = formatDates(show.waitlistDates, '⏳', '#856404');
  const closedList = formatDates(show.closedDates, '❌', '#999');

  return `
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: ${bgColor};">
      <strong>${statusIcon} ${show.name}</strong> - ${statusText}
      <ul style="margin: 8px 0; padding-left: 20px; list-style: none;">
        ${availableList}
        ${waitlistList}
        ${closedList}
      </ul>
      ${show.error ? `<span style="color: red;">Error: ${show.error}</span><br>` : ''}
      <a href="${show.url}" style="color: #007bff;">Open in 1iota →</a>
    </div>
  `;
}

function generateShowText(show) {
  let statusText;
  if (show.hasAvailable) {
    statusText = 'TICKETS AVAILABLE';
  } else if (show.hasWaitlist) {
    statusText = 'WAITLIST OPEN';
  } else {
    statusText = 'Not available';
  }

  let lines = [`${show.name} - ${statusText}`];

  const allDates = [
    ...(show.availableDates || []).map(d => `  🎟️ ${d.display || d.date}`),
    ...(show.waitlistDates || []).map(d => `  ⏳ ${d.display || d.date}`),
    ...(show.closedDates || []).map(d => `  ❌ ${d.display || d.date}`)
  ];

  if (allDates.length > 0) {
    lines.push(...allDates);
  }
  if (show.error) lines.push(`  Error: ${show.error}`);
  lines.push(`  ${show.url}`);

  return lines.join('\n');
}

export async function sendTicketAlert(ticketInfo) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
    return { success: false, error: 'Missing email credentials' };
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD
    }
  });

  let subjectStatus;
  if (ticketInfo.hasAvailable) {
    subjectStatus = `🎟️ AVAILABLE: ${ticketInfo.showsWithAvailable.map(s => s.name).join(', ')}`;
  } else if (ticketInfo.hasWaitlist) {
    subjectStatus = `⏳ Waitlist: ${ticketInfo.showsWithWaitlist.map(s => s.name).join(', ')}`;
  } else {
    subjectStatus = 'Status Update';
  }

  let overallStatus;
  if (ticketInfo.hasAvailable) {
    overallStatus = '🎟️ TICKETS AVAILABLE!';
  } else if (ticketInfo.hasWaitlist) {
    overallStatus = '⏳ Waitlist open (no guaranteed tickets)';
  } else {
    overallStatus = '❌ No tickets available';
  }

  const mailOptions = {
    from: GMAIL_USER,
    to: GMAIL_USER,
    subject: `1iota Tickets: ${subjectStatus}`,
    html: `
      <h2>1iota Ticket Availability Check</h2>

      <p><strong>Overall Status:</strong> ${overallStatus}</p>
      <p><strong>Checked at:</strong> ${ticketInfo.checkedAt}</p>
      <p><strong>Summary:</strong> ${ticketInfo.message}</p>

      <hr style="margin: 20px 0;">

      <h3>Show Details:</h3>
      ${ticketInfo.shows.map(generateShowHtml).join('')}

      ${ticketInfo.error ? `<p style="color: red;"><strong>Error:</strong> ${ticketInfo.error}</p>` : ''}
    `,
    text: `
1iota Ticket Availability Check

Overall Status: ${overallStatus}
Checked at: ${ticketInfo.checkedAt}
Summary: ${ticketInfo.message}

--- Show Details ---
${ticketInfo.shows.map(generateShowText).join('\n')}
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`Email error:`, error.message);
    return { success: false, error: error.message };
  }
}
