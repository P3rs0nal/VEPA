const express      = require('express');
const cors         = require('cors');
const { google }   = require('googleapis');
const admin        = require('firebase-admin');
const { DateTime } = require('luxon');
const nodemailer   = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─────────────────────────────────────────────────────────────────
   Firebase Admin
───────────────────────────────────────────────────────────────── */
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
}
const db = admin.firestore();

/* ─────────────────────────────────────────────────────────────────
   Nodemailer – Gmail App Password
   Add these two env vars on Render:
     GMAIL_USER         = vepaautoshop1904@gmail.com
     GMAIL_APP_PASSWORD = xxxx xxxx xxxx xxxx  (16-char App Password)

   How to generate the App Password:
     1. Go to myaccount.google.com → Security
     2. Enable 2-Step Verification if not already on
     3. Search "App passwords" → create one named "VEPA Booking Server"
     4. Copy the 16-character password into the Render env var
───────────────────────────────────────────────────────────────── */
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // IMPORTANT
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/* Verify connection on startup — visible in Render logs */
mailer.verify((err) => {
  if (err) {
    console.error('[MAILER] Gmail SMTP FAILED:', err.message);
    console.error('[MAILER] → Check GMAIL_USER and GMAIL_APP_PASSWORD env vars on Render');
  } else {
    console.log('[MAILER] Gmail SMTP ready ✓');
  }
});

async function sendEmail({ to, subject, text, html }) {
  return mailer.sendMail({
    from:    `"VEPA AutoCare" <${process.env.GMAIL_USER}>`,
    to,
    bcc:     process.env.GMAIL_USER, // shop always gets a copy
    subject,
    text,
    html,
  });
}

/* ─────────────────────────────────────────────────────────────────
   CORS
───────────────────────────────────────────────────────────────── */
app.use(cors({
  origin: [
    'http://127.0.0.1:5501',
    'http://localhost:5500',
    'https://vepa-24b46.web.app',
    'https://vepaautocare.com',
  ],
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

/* ─────────────────────────────────────────────────────────────────
   Google Calendar
───────────────────────────────────────────────────────────────── */
const SCOPES      = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const TZ          = 'America/New_York';

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

function getCalendarClient() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

/* ─────────────────────────────────────────────────────────────────
   Business hours & services
───────────────────────────────────────────────────────────────── */
const BUSINESS_HOURS = {
  1: { open: 8,  close: 17 }, // Mon
  2: { open: 8,  close: 17 }, // Tue
  3: { open: 8,  close: 17 }, // Wed
  4: { open: 8,  close: 17 }, // Thu
  5: { open: 8,  close: 17 }, // Fri
  6: { open: 9,  close: 16 }, // Sat
  0: null,                     // Sun closed
};

const SERVICES = {
  oil_change:    { name: 'Oil Change',     duration: 30 },
  tire_rotation: { name: 'Tire Rotation',  duration: 90 },
  inspection:    { name: 'NY Inspection',  duration: 30 },
  brake_service: { name: 'Brake Service',  duration: 120 },
  general_repair:{ name: 'General Repair', duration: 120 },
};

/* ─────────────────────────────────────────────────────────────────
   Auth middleware
───────────────────────────────────────────────────────────────── */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = await admin.auth().verifyIdToken(header.slice(7));
    next();
  } catch (err) {
    console.error("AUTH FAILED:", err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ─────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────── */
function formatDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatDisplayTime(isoString) {
  return DateTime.fromISO(isoString, { zone: TZ }).toFormat('h:mm a');
}

function buildConfirmationEmail({ customerName, svcName, displayDate, displayTime, duration, vehicleStr, additionalNotes, bookingId }) {
  const text = [
    `Hi ${customerName || 'there'},`,
    '',
    'Your appointment at VEPA AutoCare is confirmed.',
    '',
    `Service:   ${svcName}`,
    `Date:      ${displayDate}`,
    `Time:      ${displayTime}`,
    `Duration:  ${duration} minutes`,
    `Vehicle:   ${vehicleStr}`,
    additionalNotes ? `Notes:     ${additionalNotes}` : null,
    '',
    `Booking ID: ${bookingId}`,
    '',
    'Address: 1904 Western Ave, Albany, NY 12203',
    'Phone:   (518) 456-5682',
    '',
    'To cancel or reschedule, log in at vepaautocare.com/services',
    'or call us at least 2 hours before your appointment.',
    '',
    '— The VEPA AutoCare Team',
  ].filter(l => l !== null).join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .hdr{background:#1C1917;padding:28px 36px;}
  .logo{font-family:Georgia,serif;font-size:2rem;font-weight:900;color:#F7F3EE;letter-spacing:.08em;text-transform:uppercase;}
  .logo span{color:#C8381A;}
  .hero{background:#C8381A;padding:22px 36px;}
  .hero h1{color:#fff;font-size:1.4rem;margin:0;font-weight:700;letter-spacing:.03em;text-transform:uppercase;}
  .body{padding:32px 36px;}
  .body p{color:#3D3730;font-size:.93rem;line-height:1.7;margin:0 0 14px;}
  .box{background:#F7F3EE;border-radius:8px;padding:18px 22px;margin:22px 0;border:1px solid #D0C9BE;}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #E8E3DA;font-size:.88rem;}
  .row:last-child{border-bottom:none;}
  .lbl{color:#9C9389;font-weight:600;text-transform:uppercase;font-size:.68rem;letter-spacing:.1em;padding-top:2px;flex-shrink:0;}
  .val{color:#1C1917;font-weight:600;text-align:right;padding-left:12px;}
  .bid{font-family:monospace;font-size:.78rem;color:#9C9389;background:#EDE9E0;padding:7px 11px;border-radius:6px;margin-top:18px;display:inline-block;}
  .ftr{background:#1C1917;padding:22px 36px;text-align:center;}
  .ftr p{color:rgba(247,243,238,.35);font-size:.75rem;margin:0;line-height:1.6;}
  .ftr a{color:rgba(247,243,238,.55);}
  @media(max-width:600px){.wrap{margin:0;border-radius:0;}.body,.hdr,.hero,.ftr{padding:20px;}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><div class="logo">VEPA<span>.</span></div></div>
  <div class="hero"><h1>Appointment Confirmed</h1></div>
  <div class="body">
    <p>Hi ${customerName || 'there'},</p>
    <p>Your appointment at <strong>VEPA AutoCare</strong> is confirmed. We look forward to seeing you!</p>
    <div class="box">
      <div class="row"><span class="lbl">Service</span><span class="val">${svcName}</span></div>
      <div class="row"><span class="lbl">Date</span><span class="val">${displayDate}</span></div>
      <div class="row"><span class="lbl">Time</span><span class="val">${displayTime} &middot; ${duration} min</span></div>
      <div class="row"><span class="lbl">Vehicle</span><span class="val">${vehicleStr}</span></div>
      ${additionalNotes ? `<div class="row"><span class="lbl">Notes</span><span class="val">${additionalNotes}</span></div>` : ''}
    </div>
    <p>Need to cancel? Log in at <a href="https://vepaautocare.com/services" style="color:#C8381A;font-weight:600;">vepaautocare.com/services</a> or call us at least 2 hours before your appointment.</p>
    <p style="font-size:.82rem;color:#9C9389;">1904 Western Ave, Albany, NY 12203 &nbsp;&middot;&nbsp; (518) 456-5682</p>
    <div class="bid">Booking ID: ${bookingId}</div>
  </div>
  <div class="ftr">
    <p>&copy; 2025 VEPA AutoCare &middot; Albany, NY<br>
    <a href="https://vepaautocare.com/privacy">Privacy Policy</a></p>
  </div>
</div>
</body>
</html>`;

  return { text, html };
}

function buildCancellationEmail({ svcName, displayDate, displayTime }) {
  const text = [
    'Hi,',
    '',
    'Your VEPA AutoCare appointment has been cancelled.',
    '',
    `Service: ${svcName}`,
    `Date:    ${displayDate}`,
    `Time:    ${displayTime}`,
    '',
    'To rebook, visit vepaautocare.com/services or call (518) 456-5682.',
    '',
    '— VEPA AutoCare',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;}
  .hdr{background:#1C1917;padding:28px 36px;}
  .logo{font-family:Georgia,serif;font-size:2rem;font-weight:900;color:#F7F3EE;letter-spacing:.08em;text-transform:uppercase;}
  .logo span{color:#C8381A;}
  .hero{background:#3D3730;padding:22px 36px;}
  .hero h1{color:#fff;font-size:1.4rem;margin:0;font-weight:700;text-transform:uppercase;}
  .body{padding:32px 36px;}
  .body p{color:#3D3730;font-size:.93rem;line-height:1.7;margin:0 0 14px;}
  .box{background:#F7F3EE;border-radius:8px;padding:18px 22px;margin:22px 0;border:1px solid #D0C9BE;}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #E8E3DA;font-size:.88rem;}
  .row:last-child{border-bottom:none;}
  .lbl{color:#9C9389;font-weight:600;text-transform:uppercase;font-size:.68rem;letter-spacing:.1em;}
  .val{color:#1C1917;font-weight:600;text-align:right;}
  .ftr{background:#1C1917;padding:22px 36px;text-align:center;}
  .ftr p{color:rgba(247,243,238,.35);font-size:.75rem;margin:0;}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><div class="logo">VEPA<span>.</span></div></div>
  <div class="hero"><h1>Appointment Cancelled</h1></div>
  <div class="body">
    <p>Your appointment has been cancelled:</p>
    <div class="box">
      <div class="row"><span class="lbl">Service</span><span class="val">${svcName}</span></div>
      <div class="row"><span class="lbl">Date</span><span class="val">${displayDate}</span></div>
      <div class="row"><span class="lbl">Time</span><span class="val">${displayTime}</span></div>
    </div>
    <p>To rebook, visit <a href="https://vepaautocare.com/services" style="color:#C8381A;font-weight:600;">vepaautocare.com/services</a>.</p>
    <p style="font-size:.82rem;color:#9C9389;">1904 Western Ave, Albany, NY 12203 &nbsp;&middot;&nbsp; (518) 456-5682</p>
  </div>
  <div class="ftr"><p>&copy; 2025 VEPA AutoCare &middot; Albany, NY</p></div>
</div>
</body>
</html>`;

  return { text, html };
}

/* ─────────────────────────────────────────────────────────────────
   ROUTES
───────────────────────────────────────────────────────────────── */

/* GET /services */
app.get('/services', (req, res) => {
  res.json({
    services: Object.entries(SERVICES).map(([key, val]) => ({
      key,
      name:     val.name,
      duration: val.duration,
    })),
  });
});

/* GET /availability?date=YYYY-MM-DD&service=oil_change */
app.get('/availability', async (req, res) => {
  const { date, service } = req.query;
  if (!date || !service) return res.status(400).json({ error: 'date and service required' });

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Unknown service' });

  const dayNum = DateTime.fromISO(date, { zone: TZ }).weekday % 7;
  const hours  = BUSINESS_HOURS[dayNum];
  if (!hours) return res.json({ closed: true, slots: [] });

  try {
    const calendar = getCalendarClient();
    const dayStart = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.open,  minute: 0, second: 0 });
    const dayEnd   = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.close, minute: 0, second: 0 });

    const fbResp = await calendar.freebusy.query({
      requestBody: {
        timeMin:  dayStart.toISO(),
        timeMax:  dayEnd.toISO(),
        timeZone: TZ,
        items:    [{ id: CALENDAR_ID }],
      },
    });

    const busyPeriods = fbResp.data.calendars?.[CALENDAR_ID]?.busy || [];
    const slots = [];
    let cursor  = dayStart;

    while (cursor.plus({ minutes: svc.duration }) <= dayEnd) {
      const slotEnd  = cursor.plus({ minutes: svc.duration });
      const overlaps = busyPeriods.some(b => {
        const bs = DateTime.fromISO(b.start, { zone: TZ });
        const be = DateTime.fromISO(b.end,   { zone: TZ });
        return cursor < be && slotEnd > bs;
      });
      if (!overlaps) {
        slots.push({ start: cursor.toISO(), end: slotEnd.toISO(), display: cursor.toFormat('h:mm a') });
      }
      cursor = cursor.plus({ minutes: 30 });
    }

    res.json({ closed: false, slots });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ error: 'Could not fetch availability' });
  }
});

/* POST /book */
app.post('/book', requireAuth, async (req, res) => {
  const { date, start, end, service, customerName, vehicleMakeModel, vehicleYear, additionalNotes } = req.body;

  if (!date || !start || !end || !service) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Unknown service' });

  const userEmail = req.user.email;
  let emailSent   = false;
  let emailError  = null;

  try {
    const calendar = getCalendarClient();

    /* Re-check availability */
    const fbResp = await calendar.freebusy.query({
      requestBody: { timeMin: start, timeMax: end, timeZone: TZ, items: [{ id: CALENDAR_ID }] },
    });
    if ((fbResp.data.calendars?.[CALENDAR_ID]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'This slot is no longer available. Please choose another time.' });
    }

    /* Optimistic lock */
    const lockKey    = `${userEmail}_${start}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const pendingRef = db.collection('bookings_pending').doc(lockKey);
    if ((await pendingRef.get()).exists) {
      return res.status(409).json({ error: 'This slot is being booked. Please try again in a moment.' });
    }
    await pendingRef.set({ lockedAt: admin.firestore.FieldValue.serverTimestamp() });

    /* Create Calendar event */
    let calEventId = null;
    try {
      const desc = [
        `Service: ${svc.name}`,
        `Customer: ${customerName || userEmail}`,
        `Email: ${userEmail}`,
        vehicleMakeModel ? `Vehicle: ${vehicleYear ? vehicleYear + ' ' : ''}${vehicleMakeModel}` : '',
        additionalNotes  ? `Notes: ${additionalNotes}` : '',
      ].filter(Boolean).join('\n');

      const event = await calendar.events.insert({
        calendarId:  CALENDAR_ID,
        requestBody: {
          summary:     `${svc.name} – ${customerName || userEmail}`,
          description: desc,
          start:       { dateTime: start, timeZone: TZ },
          end:         { dateTime: end,   timeZone: TZ },
          colorId:     '11',
        },
      });
      calEventId = event.data.id;
    } catch (calErr) {
      await pendingRef.delete();
      throw calErr;
    }

    /* Save to Firestore */
    const bookingRef = await db.collection('bookings').add({
      userId:           req.user.uid,
      userEmail,
      customerName:     customerName     || userEmail,
      service,
      serviceName:      svc.name,
      duration:         svc.duration,
      date,
      start,
      end,
      vehicleMakeModel: vehicleMakeModel || '',
      vehicleYear:      vehicleYear      || '',
      additionalNotes:  additionalNotes  || '',
      calEventId,
      status:           'confirmed',
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
    });

    await pendingRef.delete();

    /* Send email via Nodemailer */
    try {
      const displayDate = formatDisplayDate(date);
      const displayTime = formatDisplayTime(start);
      const vehicleStr  = vehicleMakeModel
        ? `${vehicleYear ? vehicleYear + ' ' : ''}${vehicleMakeModel}`.trim()
        : 'Not specified';

      const { text, html } = buildConfirmationEmail({
        customerName, svcName: svc.name, displayDate, displayTime,
        duration: svc.duration, vehicleStr, additionalNotes, bookingId: bookingRef.id,
      });

      await sendEmail({
        to:      userEmail,
        subject: `Appointment Confirmed – ${svc.name} on ${displayDate}`,
        text,
        html,
      });

      emailSent = true;
      console.log(`[EMAIL] Confirmation sent → ${userEmail} (booking: ${bookingRef.id})`);

    } catch (emailErr) {
      emailError = emailErr.message;
      console.error('[EMAIL] Confirmation failed:', emailErr.message);
    }

    res.json({
      success:   true,
      bookingId: bookingRef.id,
      emailSent,
      // Expose error detail in non-production so you can debug in Render logs
      ...(emailError && process.env.NODE_ENV !== 'production' ? { emailError } : {}),
    });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: err.message || 'Booking failed' });
  }
});

/* GET /bookings */
app.get('/bookings', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('bookings')
      .where('userId', '==', req.user.uid)
      .orderBy('start', 'asc')
      .get();

    const now = DateTime.now().toISO();

    const bookings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(b => b.start >= now);

    res.json({ bookings });
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ error: 'Could not fetch bookings' });
  }
});

/* DELETE /bookings/:id */
app.delete('/bookings/:id', requireAuth, async (req, res) => {
  try {
    const docRef  = db.collection('bookings').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) return res.status(404).json({ error: 'Booking not found' });
    if (docSnap.data().userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    const { start, calEventId, serviceName, date } = docSnap.data();

    if (new Date(start) - new Date() < 2 * 60 * 60 * 1000) {
      return res.status(400).json({
        error: 'Appointments cannot be cancelled within 2 hours. Please call us at (518) 456-5682.',
      });
    }

    if (calEventId) {
      try {
        await getCalendarClient().events.delete({ calendarId: CALENDAR_ID, eventId: calEventId });
      } catch (e) {
        console.error('[CAL] Event delete failed (non-fatal):', e.message);
      }
    }

    await docRef.delete();

    try {
      const displayDate = formatDisplayDate(date);
      const displayTime = formatDisplayTime(start);
      const { text, html } = buildCancellationEmail({ svcName: serviceName, displayDate, displayTime });
      await sendEmail({
        to:      req.user.email,
        subject: `Appointment Cancelled – ${serviceName} on ${displayDate}`,
        text,
        html,
      });
      console.log(`[EMAIL] Cancellation sent → ${req.user.email}`);
    } catch (e) {
      console.error('[EMAIL] Cancellation email failed (non-fatal):', e.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: err.message || 'Cancel failed' });
  }
});

app.get('/', (req, res) => res.send('VEPA Booking API — running'));

app.listen(PORT, () => console.log(`Booking server on port ${PORT}`));
