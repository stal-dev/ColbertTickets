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

export async function sendTicketAlert(ticketInfo) {
  const { GMAIL_USER } = process.env;

  const mailOptions = {
    from: GMAIL_USER,
    to: GMAIL_USER,
    subject: `Colbert Tickets Alert: ${ticketInfo.available ? 'AVAILABLE!' : 'Status Update'}`,
    html: `
      <h2>Late Show with Stephen Colbert - Ticket Update</h2>

      <p><strong>Status:</strong> ${ticketInfo.available ? '✅ Tickets may be available!' : '❌ No tickets available'}</p>

      <p><strong>Checked at:</strong> ${ticketInfo.checkedAt}</p>

      ${ticketInfo.dates && ticketInfo.dates.length > 0 ? `
        <p><strong>Dates found:</strong></p>
        <ul>
          ${ticketInfo.dates.map(d => `<li>${d}</li>`).join('')}
        </ul>
      ` : ''}

      <p><strong>Message:</strong> ${ticketInfo.message}</p>

      <p><a href="${ticketInfo.url}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Check 1iota Now</a></p>

      ${ticketInfo.error ? `<p style="color: red;"><strong>Error:</strong> ${ticketInfo.error}</p>` : ''}
    `,
    text: `
Late Show with Stephen Colbert - Ticket Update

Status: ${ticketInfo.available ? 'Tickets may be available!' : 'No tickets available'}
Checked at: ${ticketInfo.checkedAt}
Message: ${ticketInfo.message}

Check here: ${ticketInfo.url}
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
