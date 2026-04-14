/**
 * VEPA AutoCare — Booking Email Templates
 * Drop this file next to your index.js and import with:
 * const { confirmationEmail, cancellationEmail, staffNotificationEmail } = require('./emailTemplates');
 *
 * Each function returns { subject, html, text } ready to pass to Nodemailer / Firebase Extension / etc.
 */

/* ─── Shared constants ──────────────────────────── */
const BRAND = {
  red:    '#C8381A',
  dark:   '#1C1917',
  bg:     '#F7F3EE',
  card:   '#EDE9E0',
  border: '#D0C9BE',
  muted:  '#9C9389',
  body:   '#3D3730',
  green:  '#16a34a',
};

const SHOP = {
  name:    'VEPA AutoCare',
  address: '1904 Western Ave, Albany, NY 12203',
  phone:   '(518) 456-5682',
  email:   'contact@vepaautocare.com',
  url:     'https://vepaautocare.com',
};

/* ─── Shared layout wrapper ─────────────────────── */
function wrap(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>VEPA AutoCare</title>
  </head>
<body style="margin:0;padding:0;background-color:#F0EDE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F0EDE8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #D0C9BE;">

          <tr>
            <td style="background-color:${BRAND.dark};padding:24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size:28px;font-weight:800;letter-spacing:0.06em;color:#F7F3EE;font-family:Georgia,serif;">VEPA<span style="color:${BRAND.red};">.</span></span>
                  </td>
                  <td align="right" style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(247,243,238,0.40);">AutoCare</td>
                </tr>
              </table>
            </td>
          </tr>

          ${bodyHtml}

          <tr>
            <td style="background-color:#F7F3EE;padding:24px 32px;border-top:1px solid ${BRAND.border};">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:12px;color:${BRAND.muted};line-height:1.6;">
                    <strong style="display:block;margin-bottom:2px;color:${BRAND.body};">${SHOP.name}</strong>
                    ${SHOP.address}<br/>
                    <a href="tel:${SHOP.phone.replace(/\D/g,'')}" style="color:${BRAND.red};text-decoration:none;">${SHOP.phone}</a>
                     · 
                    <a href="mailto:${SHOP.email}" style="color:${BRAND.red};text-decoration:none;">${SHOP.email}</a>
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    <a href="${SHOP.url}" style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.muted};text-decoration:none;">${SHOP.url.replace('https://','')}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:11px;color:#b5b0a8;border-top:1px solid ${BRAND.border};padding-top:14px;">
                © ${new Date().getFullYear()} VEPA AutoCare. All rights reserved.
                You're receiving this because you booked an appointment with us.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/* ─── Detail row helper ─────────────────────────── */
function detailRow(label, value) {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};vertical-align:top;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};">${label}</span>
    </td>
    <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.border};text-align:right;vertical-align:top;">
      <span style="font-size:14px;font-weight:600;color:${BRAND.body};">${value}</span>
    </td>
  </tr>`;
}

/* ─── Button helper ─────────────────────────────── */
function primaryButton(label, href) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <tr>
      <td style="background-color:${BRAND.red};border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

/* ─── Service name formatter ─────────────────────── */
function fmtService(key) {
  const map = {
    oil_change:    'Oil Change',
    tire_rotation: 'Tire Rotation',
    inspection:    'Vehicle Inspection',
    brake_service: 'Brake Service',
    general_repair:'General Repair',
  };
  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── Date / time formatters ────────────────────── */
function fmtDate(isoOrString) {
  const d = new Date(isoOrString);
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function fmtTime(isoOrString) {
  const d = new Date(isoOrString);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}


/* ═══════════════════════════════════════════════════
   1. CUSTOMER CONFIRMATION EMAIL
   ═══════════════════════════════════════════════════ */

/**
 * @param {object} booking
 * bookingId, service (key), start (ISO), end (ISO),
 * customerName, vehicleMakeModel, vehicleYear, additionalNotes,
 * customerEmail, duration (minutes)
 */
function confirmationEmail(booking) {
  const {
    bookingId, service, start, end,
    customerName, vehicleMakeModel, vehicleYear,
    additionalNotes, duration,
  } = booking;

  const firstName = (customerName || '').split(' ')[0] || 'there';
  const vehicle   = [vehicleYear, vehicleMakeModel].filter(Boolean).join(' ');

  const bodyHtml = `
  <tr>
    <td style="background-color:${BRAND.green};padding:20px 32px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center">
            <div style="display:inline-block;width:44px;height:44px;border-radius:50%;background-color:rgba(255,255,255,0.25);line-height:44px;text-align:center;font-size:22px;color:#fff;margin-bottom:8px;">✓</div>
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.01em;">Appointment Confirmed</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:${BRAND.dark};">Hi ${firstName},</p>
      <p style="margin:0;font-size:15px;color:${BRAND.muted};line-height:1.65;">
        You're all set! Your appointment at <strong style="color:${BRAND.body};">VEPA AutoCare</strong> has been confirmed. Here's everything you need to know.
      </p>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;padding:12px 18px;">
        <tr>
          <td style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.muted};">Booking Reference</td>
        </tr>
        <tr>
          <td style="font-size:15px;font-weight:700;color:${BRAND.body};font-family:Courier New,monospace;padding-top:4px;">${bookingId}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 0;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.muted};">Appointment Details</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${detailRow('Service',  fmtService(service))}
        ${detailRow('Date',     fmtDate(start))}
        ${detailRow('Time',     fmtTime(start))}
        ${detailRow('Duration', `${duration} minutes`)}
        ${vehicle ? detailRow('Vehicle', vehicle) : ''}
        ${additionalNotes ? detailRow('Notes', additionalNotes) : ''}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.dark};border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:20px 22px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(247,243,238,0.45);">Our Location</p>
            <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#F7F3EE;">${SHOP.address}</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:16px;">
                  <a href="https://maps.google.com/?q=${encodeURIComponent(SHOP.address)}"
                     style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.red};text-decoration:none;">
                    Get Directions →
                  </a>
                </td>
                <td>
                  <a href="tel:${SHOP.phone.replace(/\D/g,'')}"
                     style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(247,243,238,0.55);text-decoration:none;">
                    ${SHOP.phone}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 0;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.muted};">Before You Arrive</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${['Arrive 5 minutes early so we can get started on time.',
           'Bring your vehicle registration and any relevant service records.',
           'Questions? Reply to this email or call us at ' + SHOP.phone + '.']
          .map(tip => `
        <tr>
          <td style="vertical-align:top;padding-right:10px;padding-bottom:8px;">
            <div style="width:6px;height:6px;border-radius:50%;background-color:${BRAND.red};margin-top:6px;"></div>
          </td>
          <td style="font-size:13px;color:${BRAND.body};line-height:1.6;padding-bottom:8px;">${tip}</td>
        </tr>`).join('')}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 32px;">
      ${primaryButton('View Our Services', SHOP.url + '/services')}
      <p style="margin:20px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.6;">
        Need to cancel or reschedule? <a href="${SHOP.url}/services" style="color:${BRAND.red};text-decoration:none;">Log in to your account</a> or call us at least 2 hours before your appointment.
      </p>
    </td>
  </tr>`;

  const subject = `Appointment Confirmed – ${fmtService(service)} on ${fmtDate(start)}`;

  const text = `Hi ${firstName},

Your appointment at VEPA AutoCare is confirmed!

Booking Reference: ${bookingId}
Service: ${fmtService(service)}
Date: ${fmtDate(start)}
Time: ${fmtTime(start)}
Duration: ${duration} minutes
${vehicle ? `Vehicle: ${vehicle}` : ''}
${additionalNotes ? `Notes: ${additionalNotes}` : ''}

Location: ${SHOP.address}
Phone: ${SHOP.phone}

See you soon,
VEPA AutoCare
${SHOP.url}`;

  return { subject, html: wrap(bodyHtml), text };
}


/* ═══════════════════════════════════════════════════
   2. CUSTOMER CANCELLATION EMAIL
   ═══════════════════════════════════════════════════ */

/**
 * @param {object} booking  Same shape as confirmationEmail.
 */
function cancellationEmail(booking) {
  const {
    bookingId, service, start,
    customerName, vehicleMakeModel, vehicleYear, duration,
  } = booking;

  const firstName = (customerName || '').split(' ')[0] || 'there';
  const vehicle   = [vehicleYear, vehicleMakeModel].filter(Boolean).join(' ');

  const bodyHtml = `
  <tr>
    <td style="background-color:${BRAND.dark};padding:20px 32px;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#F7F3EE;letter-spacing:0.01em;">Appointment Cancelled</p>
    </td>
  </tr>

  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:${BRAND.dark};">Hi ${firstName},</p>
      <p style="margin:0;font-size:15px;color:${BRAND.muted};line-height:1.65;">
        Your appointment has been cancelled. No action is needed on your end — your slot has been released from our calendar.
      </p>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 0;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.muted};">Cancelled Appointment</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="opacity:0.6;">
        ${detailRow('Booking ID', bookingId)}
        ${detailRow('Service',    fmtService(service))}
        ${detailRow('Date',       fmtDate(start))}
        ${detailRow('Time',       fmtTime(start))}
        ${detailRow('Duration',   `${duration} minutes`)}
        ${vehicle ? detailRow('Vehicle', vehicle) : ''}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:10px;">
        <tr>
          <td style="padding:20px 22px;">
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${BRAND.dark};">Need to rebook?</p>
            <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.65;">
              We'd love to see you. You can schedule a new appointment any time through our website, or give us a call.
            </p>
            ${primaryButton('Book a New Appointment', SHOP.url + '/services#booking')}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 32px;">
      <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.7;">
        Have questions? Reach us at
        <a href="tel:${SHOP.phone.replace(/\D/g,'')}" style="color:${BRAND.red};text-decoration:none;">${SHOP.phone}</a>
        or
        <a href="mailto:${SHOP.email}" style="color:${BRAND.red};text-decoration:none;">${SHOP.email}</a>.
        We're happy to help.
      </p>
    </td>
  </tr>`;

  const subject = `Appointment Cancelled – ${fmtService(service)} on ${fmtDate(start)}`;

  const text = `Hi ${firstName},

Your appointment has been cancelled.

Booking Reference: ${bookingId}
Service: ${fmtService(service)}
Date: ${fmtDate(start)}
Time: ${fmtTime(start)}

Want to rebook? Visit ${SHOP.url}/services or call ${SHOP.phone}.

VEPA AutoCare
${SHOP.url}`;

  return { subject, html: wrap(bodyHtml), text };
}


/* ═══════════════════════════════════════════════════
   3. STAFF NOTIFICATION EMAIL  (sent to VEPA on every new booking)
   ═══════════════════════════════════════════════════ */

/**
 * @param {object} booking  Same shape + customerEmail field.
 */
function staffNotificationEmail(booking) {
  const {
    bookingId, service, start, end,
    customerName, customerEmail, vehicleMakeModel, vehicleYear,
    additionalNotes, duration,
  } = booking;

  const vehicle = [vehicleYear, vehicleMakeModel].filter(Boolean).join(' ');

  const bodyHtml = `
  <tr>
    <td style="background-color:${BRAND.red};padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;">New Booking Alert</p>
    </td>
  </tr>

  <tr>
    <td style="padding:28px 32px 0;">
      <p style="margin:0 0 4px;font-size:21px;font-weight:700;color:${BRAND.dark};">
        ${fmtService(service)}
      </p>
      <p style="margin:0;font-size:15px;color:${BRAND.muted};">
        ${fmtDate(start)}  ·  ${fmtTime(start)}  ·  ${duration} min
      </p>
    </td>
  </tr>

  <tr>
    <td style="padding:22px 32px 0;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.muted};">Customer</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${detailRow('Name',     customerName || '—')}
        ${detailRow('Email',    customerEmail)}
        ${vehicle ? detailRow('Vehicle', vehicle) : ''}
        ${additionalNotes ? detailRow('Notes', `<em>${additionalNotes}</em>`) : ''}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 32px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background-color:${BRAND.dark};border-radius:6px;">
            <a href="${SHOP.url}/admin"
               style="display:inline-block;padding:11px 22px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#F7F3EE;text-decoration:none;">
              Open Admin
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const subject = `[New Booking] ${fmtService(service)} – ${customerName || customerEmail}`;
  const text = `NEW BOOKING: ${fmtService(service)} for ${customerName} on ${fmtDate(start)}. Manage at ${SHOP.url}/admin`;

  return { subject, html: wrap(bodyHtml), text };
}


/* ─── Exports ───────────────────────────────────── */
module.exports = {
  confirmationEmail,
  cancellationEmail,
  staffNotificationEmail,
};