const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
const { Resend } = require('resend');

const {
  confirmationEmail,
  cancellationEmail,
  staffNotificationEmail,
} = require('./emailTemplates');

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

/* ───────────────────────────────────────────────── */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}
const db = admin.firestore();

/* ───────────────────────────────────────────────── */
app.use(cors({
  origin: [
    'http://127.0.0.1:5501',
    'http://localhost:5500',
    'https://vepa-24b46.web.app',
    'https://vepaautocare.com',
  ],
}));
app.use(express.json());

/* ───────────────────────────────────────────────── */
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const TZ = 'America/New_York';

function getCalendarClient() {
  return google.calendar({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    }),
  });
}

/* ───────────────────────────────────────────────── */
const BUSINESS_HOURS = {
  1: { open: 8, close: 17 },
  2: { open: 8, close: 17 },
  3: { open: 8, close: 17 },
  4: { open: 8, close: 17 },
  5: { open: 8, close: 17 },
  6: { open: 9, close: 16 },
  0: null,
};

const SERVICES = {
  oil_change: { name: 'Oil Change', duration: 30 },
  tire_rotation: { name: 'Tire Rotation', duration: 90 },
  inspection: { name: 'NY Inspection', duration: 30 },
  brake_service: { name: 'Brake Service', duration: 120 },
  general_repair: { name: 'General Repair', duration: 120 },
};

/* ───────────────────────────────────────────────── */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = await admin.auth().verifyIdToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ───────────────────────────────────────────────── */
async function sendEmail({ to, subject, text, html }) {
  const { error } = await resend.emails.send({
    from: 'VEPA AutoCare <noreply@vepaautocare.com>',
    to: [to],
    subject,
    text,
    html,
  });

  if (error) throw new Error(error.message);
}

/* ───────────────────────────────────────────────── */
app.get('/services', (req, res) => {
  res.json({
    services: Object.entries(SERVICES).map(([key, val]) => ({
      key,
      name: val.name,
      duration: val.duration,
    })),
  });
});

/* ───────────────────────────────────────────────── */
app.get('/availability', async (req, res) => {
  const { date, service } = req.query;
  if (!date || !service) return res.status(400).json({ error: 'Missing params' });

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Invalid service' });

  const dayNum = DateTime.fromISO(date, { zone: TZ }).weekday % 7;
  const hours = BUSINESS_HOURS[dayNum];
  if (!hours) return res.json({ closed: true, slots: [] });

  try {
    const calendar = getCalendarClient();

    const startDay = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.open });
    const endDay = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.close });

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDay.toISO(),
        timeMax: endDay.toISO(),
        timeZone: TZ,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busy = fb.data.calendars?.[CALENDAR_ID]?.busy || [];
    const slots = [];
    let cursor = startDay;

    while (cursor.plus({ minutes: svc.duration }) <= endDay) {
      const end = cursor.plus({ minutes: svc.duration });

      const overlap = busy.some(b => {
        const bs = DateTime.fromISO(b.start, { zone: TZ });
        const be = DateTime.fromISO(b.end, { zone: TZ });
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

    res.json({ closed: false, slots });
  } catch (err) {
    res.status(500).json({ error: 'Availability failed' });
  }
});

/* ───────────────────────────────────────────────── */
app.post('/book', requireAuth, async (req, res) => {
  const { date, start, end, service, customerName, vehicleMakeModel, vehicleYear, additionalNotes } = req.body;

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Invalid service' });

  const userEmail = req.user.email;

  try {
    const calendar = getCalendarClient();

    const fb = await calendar.freebusy.query({
      requestBody: { timeMin: start, timeMax: end, timeZone: TZ, items: [{ id: CALENDAR_ID }] },
    });

    if ((fb.data.calendars?.[CALENDAR_ID]?.busy || []).length) {
      return res.status(409).json({ error: 'Slot taken' });
    }

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${svc.name} – ${customerName || userEmail}`,
        start: { dateTime: start, timeZone: TZ },
        end: { dateTime: end, timeZone: TZ },
      },
    });

    const bookingRef = await db.collection('bookings').add({
      userId: req.user.uid,
      userEmail,
      service,
      duration: svc.duration,
      start,
      end,
      customerName,
      vehicleMakeModel,
      vehicleYear,
      additionalNotes,
      calEventId: event.data.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const email = confirmationEmail({
        bookingId: bookingRef.id,
        service,
        start,
        end,
        customerName,
        vehicleMakeModel,
        vehicleYear,
        additionalNotes,
        duration: svc.duration,
      });

      const staffEmail = staffNotificationEmail({
        bookingId: bookingRef.id,
        service,
        start,
        end,
        customerName,
        customerEmail: userEmail,
        vehicleMakeModel,
        vehicleYear,
        additionalNotes,
        duration: svc.duration,
      });

      await Promise.all([
        sendEmail({ to: userEmail, ...email }),
        sendEmail({ to: 'contact@vepaautocare.com', ...staffEmail }),
      ]);

    } catch (e) {
      console.error('Email failed:', e.message);
    }

    res.json({ success: true, bookingId: bookingRef.id });

  } catch (err) {
    res.status(500).json({ error: 'Booking failed' });
  }
});

/* ───────────────────────────────────────────────── */
app.delete('/bookings/:id', requireAuth, async (req, res) => {
  try {
    const ref = db.collection('bookings').doc(req.params.id);
    const snap = await ref.get();

    if (!snap.exists) return res.status(404).json({ error: 'Not found' });

    const data = snap.data();

    await ref.delete();

    try {
      const email = cancellationEmail({
        bookingId: req.params.id,
        service: data.service,
        start: data.start,
        customerName: data.customerName,
        vehicleMakeModel: data.vehicleMakeModel,
        vehicleYear: data.vehicleYear,
        duration: data.duration,
      });

      await sendEmail({
        to: req.user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

    } catch (e) {
      console.error('Cancel email failed:', e.message);
    }

    res.json({ success: true });

  } catch {
    res.status(500).json({ error: 'Cancel failed' });
  }
});

/* ───────────────────────────────────────────────── */
app.listen(PORT, () => console.log(`Server running on ${PORT}`));