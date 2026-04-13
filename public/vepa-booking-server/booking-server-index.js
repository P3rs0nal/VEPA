const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3001;

/* ─────────────────────────────
   Firebase Admin
───────────────────────────── */
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/* ─────────────────────────────
   Email (Resend ONLY)
───────────────────────────── */
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, text, html }) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'VEPA AutoCare <onboarding@resend.dev>',
    to,
    subject,
    text,
    html,
  });
}

/* ─────────────────────────────
   Middleware
───────────────────────────── */
app.use(cors({
  origin: [
    'http://127.0.0.1:5501',
    'http://localhost:5500',
    'https://vepa-24b46.web.app',
    'https://vepaautocare.com',
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

/* ─────────────────────────────
   Auth
───────────────────────────── */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = await admin.auth().verifyIdToken(header.slice(7));
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* ─────────────────────────────
   Google Calendar
───────────────────────────── */
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const TZ = 'America/New_York';

function getCalendarClient() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

/* ─────────────────────────────
   Services
───────────────────────────── */
const SERVICES = {
  oil_change: { name: 'Oil Change', duration: 30 },
  tire_rotation: { name: 'Tire Rotation', duration: 90 },
  inspection: { name: 'NY Inspection', duration: 30 },
  brake_service: { name: 'Brake Service', duration: 120 },
  general_repair: { name: 'General Repair', duration: 120 },
};

/* ─────────────────────────────
   Helpers
───────────────────────────── */
function formatDisplayDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDisplayTime(iso) {
  return DateTime.fromISO(iso, { zone: TZ }).toFormat('h:mm a');
}

/* ─────────────────────────────
   Email templates
───────────────────────────── */
function confirmationEmail(data) {
  const { customerName, serviceName, displayDate, displayTime, bookingId } = data;

  const text = `
Hi ${customerName},

Your appointment is confirmed.

Service: ${serviceName}
Date: ${displayDate}
Time: ${displayTime}

Booking ID: ${bookingId}
`;

  const html = `
<h2>Appointment Confirmed</h2>
<p>Service: <b>${serviceName}</b></p>
<p>Date: ${displayDate}</p>
<p>Time: ${displayTime}</p>
<p><b>Booking ID:</b> ${bookingId}</p>
`;

  return { text, html };
}

/* ─────────────────────────────
   Routes
───────────────────────────── */
app.get('/', (req, res) => {
  res.send('VEPA Booking API running');
});

/* SERVICES */
app.get('/services', (req, res) => {
  res.json(Object.entries(SERVICES).map(([key, val]) => ({
    key,
    ...val,
  })));
});

/* AVAILABILITY */
app.get('/availability', async (req, res) => {
  const { date, service } = req.query;

  if (!date || !service) {
    return res.status(400).json({ error: 'Missing params' });
  }

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Invalid service' });

  try {
    const calendar = getCalendarClient();

    const startOfDay = DateTime.fromISO(date, { zone: TZ }).set({ hour: 8, minute: 0 });
    const endOfDay = DateTime.fromISO(date, { zone: TZ }).set({ hour: 17, minute: 0 });

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: startOfDay.toISO(),
        timeMax: endOfDay.toISO(),
        timeZone: TZ,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busy = fb.data.calendars?.[CALENDAR_ID]?.busy || [];

    const slots = [];
    let cursor = startOfDay;

    while (cursor.plus({ minutes: svc.duration }) <= endOfDay) {
      const end = cursor.plus({ minutes: svc.duration });

      const overlap = busy.some(b => {
        const bs = DateTime.fromISO(b.start);
        const be = DateTime.fromISO(b.end);
        return cursor < be && end > bs;
      });

      if (!overlap) {
        slots.push({
          start: cursor.toISO(),
          end: end.toISO(),
          display: cursor.toFormat('h:mm a'),
        });
      }

      cursor = cursor.plus({ minutes: 30 });
    }

    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Availability failed' });
  }
});

/* BOOK */
app.post('/book', requireAuth, async (req, res) => {
  const { date, start, end, service, customerName } = req.body;

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Invalid service' });

  try {
    const calendar = getCalendarClient();

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${svc.name} - ${customerName}`,
        start: { dateTime: start, timeZone: TZ },
        end: { dateTime: end, timeZone: TZ },
      },
    });

    const bookingRef = await db.collection('bookings').add({
      userId: req.user.uid,
      email: req.user.email,
      service,
      start,
      end,
      calEventId: event.data.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const displayDate = formatDisplayDate(date);
    const displayTime = formatDisplayTime(start);

    const { text, html } = confirmationEmail({
      customerName,
      serviceName: svc.name,
      displayDate,
      displayTime,
      bookingId: bookingRef.id,
    });

    await sendEmail({
      to: req.user.email,
      subject: `Booking confirmed - ${svc.name}`,
      text,
      html,
    });

    res.json({ success: true, bookingId: bookingRef.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

/* BOOKINGS */
app.get('/bookings', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('bookings')
      .where('userId', '==', req.user.uid)
      .orderBy('start')
      .get();

    res.json({
      bookings: snap.docs.map(d => ({ id: d.id, ...d.data() }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

/* START */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});