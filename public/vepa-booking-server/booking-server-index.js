const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
const { Resend } = require('resend');
const {confirmationEmail, cancellationEmail, staffNotificationEmail, } = require('./emailTemplates');
const resend = new Resend(process.env.RESEND_API_KEY);
const app = express();
const PORT = process.env.PORT || 3001;

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
}
const db = admin.firestore();

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
  oil_change: { name: 'Oil Change',     duration: 30 },
  tire_rotation: { name: 'Tire Rotation',  duration: 90 },
  inspection: { name: 'NY Inspection',  duration: 30 },
  brake_service: { name: 'Brake Service',  duration: 120 },
  general_repair: { name: 'General Repair', duration: 120 },
};

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

function formatDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatDisplayTime(isoString) {
  return DateTime.fromISO(isoString, { zone: TZ }).toFormat('h:mm a');
}

async function sendEmail({ to, subject, text, html }) {
  const { data, error } = await resend.emails.send({
    from:    'VEPA AutoCare <noreply@vepaautocare.com>',
    to:      [to],
    subject,
    text,
    html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data;
}

/* GET /services */
app.get('/services', (req, res) => {
  res.json({
    services: Object.entries(SERVICES).map(([key, val]) => ({
      key,
      name: val.name,
      duration: val.duration,
    })),
  });
});


app.get('/availability', async (req, res) => {
  const { date, service } = req.query;
  if (!date || !service) return res.status(400).json({ error: 'date and service required' });

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Unknown service' });

  const dayNum = DateTime.fromISO(date, { zone: TZ }).weekday % 7;
  const hours = BUSINESS_HOURS[dayNum];
  if (!hours) return res.json({ closed: true, slots: [] });

  try {
    const calendar = getCalendarClient();
    const dayStart = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.open,  minute: 0, second: 0 });
    const dayEnd   = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.close, minute: 0, second: 0 });

    const fbResp = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISO(),
        timeMax: dayEnd.toISO(),
        timeZone: TZ,
        items: [{ id: CALENDAR_ID }],
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

app.post('/book', requireAuth, async (req, res) => {
  const { date, start, end, service, customerName, vehicleMakeModel, vehicleYear, additionalNotes } = req.body;

  if (!date || !start || !end || !service) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Unknown service' });

  const userEmail = req.user.email;

  try {
    const calendar = getCalendarClient();

    // Re-check availability
    const fbResp = await calendar.freebusy.query({
      requestBody: { timeMin: start, timeMax: end, timeZone: TZ, items: [{ id: CALENDAR_ID }] },
    });

    if ((fbResp.data.calendars?.[CALENDAR_ID]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'Slot no longer available' });
    }

    // Lock
    const lockKey = `${userEmail}_${start}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const pendingRef = db.collection('bookings_pending').doc(lockKey);

    if ((await pendingRef.get()).exists) {
      return res.status(409).json({ error: 'Slot is being booked' });
    }

    await pendingRef.set({ lockedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Create calendar event
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${svc.name} – ${customerName || userEmail}`,
        description: [
          `Service: ${svc.name}`,
          `Customer: ${customerName || userEmail}`,
          `Email: ${userEmail}`,
          vehicleMakeModel ? `Vehicle: ${vehicleYear || ''} ${vehicleMakeModel}` : '',
          additionalNotes ? `Notes: ${additionalNotes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: start, timeZone: TZ },
        end: { dateTime: end, timeZone: TZ },
        colorId: '11',
      },
    });

    // Save booking
    const bookingRef = await db.collection('bookings').add({
      userId: req.user.uid,
      userEmail,
      customerName: customerName || userEmail,
      service,
      serviceName: svc.name,
      duration: svc.duration,
      date,
      start,
      end,
      vehicleMakeModel: vehicleMakeModel || '',
      vehicleYear: vehicleYear || '',
      additionalNotes: additionalNotes || '',
      calEventId: event.data.id,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await pendingRef.delete();

    // EMAILS
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

      await sendEmail({
        to: userEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
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

      await sendEmail({
        to: 'contact@vepaautocare.com',
        subject: staffEmail.subject,
        text: staffEmail.text,
        html: staffEmail.html,
      });

    } catch (emailErr) {
      console.error('[EMAIL ERROR]', emailErr.message);
    }

    res.json({ success: true, bookingId: bookingRef.id });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
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
      const email = cancellationEmail({
        bookingId: req.params.id,
        service: docSnap.data().service,
        start,
        customerName: docSnap.data().customerName,
        vehicleMakeModel: docSnap.data().vehicleMakeModel,
        vehicleYear: docSnap.data().vehicleYear,
        duration: docSnap.data().duration,
      });

      await sendEmail({
        to: req.user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
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