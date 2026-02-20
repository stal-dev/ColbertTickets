import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment variables');
    }

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

function generateShowHtml(show) {
  const statusIcon = show.available ? '✅' : '❌';
  const statusText = show.available ? 'Tickets available!' : 'Not available';
  const availableCount = show.availableCount || 0;
  const totalCount = show.totalCount || show.dates?.length || 0;

  const formatDateHtml = (d) => {
    if (typeof d === 'string') return `<li style="margin: 4px 0;">${d}</li>`;
    const icon = d.soldOut ? '❌' : '✅';
    const style = d.soldOut ? 'color: #999;' : 'color: #28a745; font-weight: bold;';
    return `<li style="margin: 4px 0; ${style}">${icon} ${d.display}${d.soldOut ? ' (sold out)' : ''}</li>`;
  };

  return `
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; ${show.available ? 'background: #d4edda;' : 'background: #f8f9fa;'}">
      <h3 style="margin-top: 0;">${statusIcon} ${show.name}</h3>
      <p><strong>Status:</strong> ${statusText} (${availableCount}/${totalCount} dates available)</p>
      ${show.dates && show.dates.length > 0 ? `
        <p><strong>All dates:</strong></p>
        <ul style="margin: 0; padding-left: 20px; list-style: none;">
          ${show.dates.map(formatDateHtml).join('')}
        </ul>
      ` : '<p style="color: #666; font-style: italic;">No dates currently listed</p>'}
      ${show.error ? `<p style="color: red;"><strong>Error:</strong> ${show.error}</p>` : ''}
      <p style="margin-bottom: 0;"><a href="${show.url}" style="background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 5px; display: inline-block;">Request Tickets →</a></p>
    </div>
  `;
}

function generateShowText(show) {
  const statusText = show.available ? 'AVAILABLE' : 'Not available';
  const availableCount = show.availableCount || 0;
  const totalCount = show.totalCount || show.dates?.length || 0;

  const formatDateText = (d) => {
    if (typeof d === 'string') return `  - ${d}`;
    const status = d.soldOut ? '[SOLD OUT]' : '[AVAILABLE]';
    return `  ${status} ${d.display}`;
  };

  const datesText = show.dates && show.dates.length > 0
    ? show.dates.map(formatDateText).join('\n')
    : '  No dates listed';

  return `
${show.name}
Status: ${statusText} (${availableCount}/${totalCount} dates available)
${show.error ? `Error: ${show.error}\n` : ''}Dates:
${datesText}
Link: ${show.url}
`;
}

export async function sendTicketAlert(ticketInfo) {
  const { GMAIL_USER } = process.env;

  const subjectStatus = ticketInfo.available
    ? `AVAILABLE: ${ticketInfo.availableShows.map(s => s.name).join(', ')}`
    : 'Status Update';

  const mailOptions = {
    from: GMAIL_USER,
    to: GMAIL_USER,
    subject: `1iota Tickets: ${subjectStatus}`,
    html: `
      <h2>1iota Ticket Availability Check</h2>

      <p><strong>Overall Status:</strong> ${ticketInfo.available ? '✅ Tickets may be available!' : '❌ No tickets available'}</p>
      <p><strong>Checked at:</strong> ${ticketInfo.checkedAt}</p>
      <p><strong>Summary:</strong> ${ticketInfo.message}</p>

      <hr style="margin: 20px 0;">

      <h3>Show Details:</h3>
      ${ticketInfo.shows.map(generateShowHtml).join('')}

      ${ticketInfo.error ? `<p style="color: red;"><strong>Error:</strong> ${ticketInfo.error}</p>` : ''}
    `,
    text: `
1iota Ticket Availability Check

Overall Status: ${ticketInfo.available ? 'Tickets may be available!' : 'No tickets available'}
Checked at: ${ticketInfo.checkedAt}
Summary: ${ticketInfo.message}

--- Show Details ---
${ticketInfo.shows.map(generateShowText).join('\n')}
    `
  };

  try {
    const result = await getTransporter().sendMail(mailOptions);
    console.log(`[${new Date().toISOString()}] Email sent: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Email error:`, error.message);
    return { success: false, error: error.message };
  }
}
