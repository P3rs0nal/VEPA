/**
 * VEPA AutoCare – Appointment Booking Server
 * Express + Firebase Admin + Google Calendar API (Service Account)
 */

const express  = require('express');
const cors     = require('cors');
const { google } = require('googleapis');
const admin    = require('firebase-admin');
const { DateTime, Duration } = require('luxon');

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
// Reads the full service-account JSON from an env variable (single-line JSON string)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── Google Calendar Init ─────────────────────────────────────────────────────
const gcalCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const gcalAuth = new google.auth.GoogleAuth({
  credentials: gcalCredentials,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth: gcalAuth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID; // e.g. abc123@group.calendar.google.com

// ─── Constants ────────────────────────────────────────────────────────────────
const TZ = 'America/New_York';

/**
 * Service definitions.
 * To add a new service, add an entry here. The key becomes the API value.
 */
const SERVICES = {
  oil_change:    { name: 'Oil Change',    duration: 30 },
  tire_rotation: { name: 'Tire Rotation', duration: 45 },
  inspection:    { name: 'Inspection',    duration: 60 },
  brake_service: { name: 'Brake Service', duration: 60 },
  general_repair:{ name: 'General Repair',duration: 90 },
};

/**
 * Business hours per day-of-week (0 = Sunday … 6 = Saturday).
 * null means closed.
 */
const BUSINESS_HOURS = {
  0: null,                              // Sunday  – CLOSED
  1: { open: '08:00', close: '17:00' },// Monday
  2: { open: '08:00', close: '17:00' },// Tuesday
  3: { open: '08:00', close: '17:00' },// Wednesday
  4: { open: '08:00', close: '17:00' },// Thursday
  5: { open: '08:00', close: '17:00' },// Friday
  6: { open: '09:00', close: '16:00' },// Saturday
};

const SLOT_INTERVAL   = 30; // minutes between slot start times
const BUFFER_MINUTES  = 0;  // buffer appended after each appointment (set >0 if needed)
const MAX_ADVANCE_DAYS = 30; // how far in advance users can book

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: [
    'https://vepaautocare.com',
    'https://vepa-24b46.web.app',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ─── Auth Middleware ──────────────────────────────────────────────────────────
/**
 * Verifies Firebase ID token sent in "Authorization: Bearer <token>" header.
 * Attaches decoded token to req.user.
 */
async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized – missing token' });
  }
  try {
    req.user = await admin.auth().verifyIdToken(header.split('Bearer ')[1]);
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized – invalid token' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch busy windows from Google Calendar for a given UTC time range.
 * Returns an array of { start: ISO, end: ISO } objects.
 */
async function getCalendarBusy(timeMin, timeMax) {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TZ,
      items: [{ id: CALENDAR_ID }],
    },
  });
  return response.data.calendars[CALENDAR_ID]?.busy ?? [];
}

/**
 * Generate available time slots for a given date, service duration, and busy list.
 *
 * Strategy:
 *   - Walk from business-hours open to close in SLOT_INTERVAL increments.
 *   - For each candidate start, compute end = start + durationMin.
 *   - Reject if end exceeds close time.
 *   - Reject if the window [start, end] overlaps any busy period (+ buffer).
 *   - Return accepted slots with ISO start/end and display label.
 */
function generateSlots(date, openTime, closeTime, durationMin, busyPeriods) {
  const dayOpen  = DateTime.fromISO(`${date}T${openTime}:00`, { zone: TZ });
  const dayClose = DateTime.fromISO(`${date}T${closeTime}:00`, { zone: TZ });

  const slots  = [];
  let cursor   = dayOpen;

  while (cursor < dayClose) {
    const slotEnd = cursor.plus({ minutes: durationMin });
    if (slotEnd > dayClose) break;                          // doesn't fit before close

    const busy = busyPeriods.some(b => {
      const bStart = DateTime.fromISO(b.start);
      const bEnd   = DateTime.fromISO(b.end).plus({ minutes: BUFFER_MINUTES });
      // Overlap check: slot starts before busy ends AND slot ends after busy starts
      return cursor < bEnd && slotEnd > bStart;
    });

    if (!busy) {
      slots.push({
        start:   cursor.toISO(),
        end:     slotEnd.toISO(),
        display: cursor.setZone(TZ).toLocaleString(DateTime.TIME_SIMPLE), // "9:30 AM"
      });
    }

    cursor = cursor.plus({ minutes: SLOT_INTERVAL });
  }

  return slots;
}

/**
 * Check whether a [start, end] window has a conflict in our own Firestore bookings.
 * This is the second line of defence against race conditions (first is Google Calendar re-check).
 */
async function hasFirestoreConflict(date, startISO, endISO) {
  const snap = await db.collection('appointments')
    .where('date',   '==', date)
    .where('status', 'in', ['confirmed', 'pending'])
    .get();

  const start = DateTime.fromISO(startISO);
  const end   = DateTime.fromISO(endISO);

  return snap.docs.some(doc => {
    const d  = doc.data();
    const ds = DateTime.fromISO(d.start);
    const de = DateTime.fromISO(d.end);
    return start < de && end > ds;
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Health check */
app.get('/', (_req, res) =>
  res.json({ status: 'VEPA Booking Server running', version: '1.0.0' })
);

/**
 * GET /services
 * Returns the list of available service types.
 */
app.get('/services', (_req, res) => {
  const list = Object.entries(SERVICES).map(([key, s]) => ({
    key,
    name:     s.name,
    duration: s.duration,
  }));
  res.json({ services: list });
});

/**
 * GET /availability?date=YYYY-MM-DD&service=oil_change
 *
 * Returns time slots available for the given date & service.
 * No authentication required – anyone can browse availability.
 */
app.get('/availability', async (req, res) => {
  const { date, service } = req.query;

  // ── Input validation ──
  if (!date || !service)
    return res.status(400).json({ error: 'Both "date" and "service" query params are required.' });

  const serviceInfo = SERVICES[service];
  if (!serviceInfo)
    return res.status(400).json({ error: `Unknown service "${service}". Valid: ${Object.keys(SERVICES).join(', ')}` });

  // Validate date format
  const parsedDate = DateTime.fromISO(date, { zone: TZ });
  if (!parsedDate.isValid)
    return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD format.' });

  // Prevent booking in the past or too far in the future
  const today    = DateTime.now().setZone(TZ).startOf('day');
  const maxDate  = today.plus({ days: MAX_ADVANCE_DAYS });
  if (parsedDate < today)
    return res.status(400).json({ error: 'Cannot book appointments in the past.' });
  if (parsedDate > maxDate)
    return res.status(400).json({ error: `Cannot book more than ${MAX_ADVANCE_DAYS} days in advance.` });

  // Check business hours for this day
  const dayOfWeek = parsedDate.weekday % 7; // Luxon: 1=Mon…7=Sun → convert to 0=Sun…6=Sat
  const hours = BUSINESS_HOURS[dayOfWeek];
  if (!hours)
    return res.json({ slots: [], closed: true, message: 'We are closed on this day.' });

  try {
    // Fetch busy times for entire day (UTC bookends)
    const dayStart = DateTime.fromISO(`${date}T00:00:00`, { zone: TZ }).toUTC().toISO();
    const dayEnd   = DateTime.fromISO(`${date}T23:59:59`, { zone: TZ }).toUTC().toISO();

    const busyPeriods = await getCalendarBusy(dayStart, dayEnd);
    const slots = generateSlots(date, hours.open, hours.close, serviceInfo.duration, busyPeriods);

    return res.json({
      date,
      service:  serviceInfo,
      hours:    hours,
      slots,
      count:    slots.length,
    });

  } catch (err) {
    console.error('Availability error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch availability. Please try again.' });
  }
});

/**
 * POST /book
 * Body: { date, start, end, service, customerName }
 * Headers: Authorization: Bearer <Firebase ID token>
 *
 * Flow:
 *   1. Verify Firebase token.
 *   2. Re-check Google Calendar – immediate slot availability.
 *   3. Check Firestore for concurrent bookings (race condition guard).
 *   4. Insert event on Google Calendar.
 *   5. Save booking document to Firestore.
 */
app.post('/book', verifyToken, async (req, res) => {
  const { date, start, end, service, customerName } = req.body;
  const { uid, email } = req.user;

  // ── Input validation ──
  if (!date || !start || !end || !service)
    return res.status(400).json({ error: 'Missing required fields: date, start, end, service.' });

  const serviceInfo = SERVICES[service];
  if (!serviceInfo)
    return res.status(400).json({ error: `Unknown service "${service}".` });

  // Validate that start/end match expected duration (prevent tampering)
  const startDT    = DateTime.fromISO(start);
  const endDT      = DateTime.fromISO(end);
  const expectedEnd = startDT.plus({ minutes: serviceInfo.duration });
  if (Math.abs(endDT.diff(expectedEnd, 'minutes').minutes) > 1)
    return res.status(400).json({ error: 'Slot times do not match service duration.' });

  // Validate start is within business hours
  const parsedDate = DateTime.fromISO(date, { zone: TZ });
  const dayOfWeek  = parsedDate.weekday % 7;
  const hours      = BUSINESS_HOURS[dayOfWeek];
  if (!hours)
    return res.status(400).json({ error: 'Cannot book on this day – we are closed.' });

  const dayOpen  = DateTime.fromISO(`${date}T${hours.open}:00`,  { zone: TZ });
  const dayClose = DateTime.fromISO(`${date}T${hours.close}:00`, { zone: TZ });
  if (startDT < dayOpen || endDT > dayClose)
    return res.status(400).json({ error: 'Requested slot is outside business hours.' });

  try {
    // ── STEP 1: Re-check Google Calendar (prevents race with external calendar changes) ──
    const busyPeriods = await getCalendarBusy(start, end);
    if (busyPeriods.length > 0)
      return res.status(409).json({ error: 'This slot was just taken. Please choose another time.' });

    // ── STEP 2: Check Firestore for concurrent bookings ──
    const conflict = await hasFirestoreConflict(date, start, end);
    if (conflict)
      return res.status(409).json({ error: 'This slot was just taken. Please choose another time.' });

    // ── STEP 3: Write a "pending" record to Firestore BEFORE touching Google Calendar ──
    // This acts as an optimistic lock. A second simultaneous request will see this
    // document in the conflict check above and be rejected.
    const bookingRef = db.collection('appointments').doc();
    await bookingRef.set({
      uid,
      email,
      name:        customerName || email,
      service,
      serviceName: serviceInfo.name,
      duration:    serviceInfo.duration,
      date,
      start,
      end,
      status:      'pending',          // will be updated to 'confirmed' below
      googleEventId: null,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    let googleEventId = null;

    try {
      // ── STEP 4: Create Google Calendar event ──
      const event = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          summary: `${serviceInfo.name} – ${customerName || email}`,
          description: [
            `Service:  ${serviceInfo.name} (${serviceInfo.duration} min)`,
            `Customer: ${customerName || 'N/A'}`,
            `Email:    ${email}`,
            `Booking:  ${bookingRef.id}`,
          ].join('\n'),
          start: { dateTime: start, timeZone: TZ },
          end:   { dateTime: end,   timeZone: TZ },
          colorId: '2', // sage green – visually distinct on the calendar
        },
      });
      googleEventId = event.data.id;
    } catch (calErr) {
      // If Google Calendar fails, roll back the Firestore record
      await bookingRef.delete();
      console.error('Google Calendar insert failed:', calErr.message);
      return res.status(500).json({ error: 'Failed to create calendar event. Your slot has NOT been reserved.' });
    }

    // ── STEP 5: Update Firestore record to confirmed ──
    await bookingRef.update({ status: 'confirmed', googleEventId });

    return res.json({
      success:   true,
      bookingId: bookingRef.id,
      eventId:   googleEventId,
      message:   `Your ${serviceInfo.name} appointment has been confirmed.`,
    });

  } catch (err) {
    console.error('Booking error:', err.message);
    return res.status(500).json({ error: 'Booking failed. Please try again.' });
  }
});

/**
 * GET /bookings
 * Returns upcoming bookings for the authenticated user.
 */
app.get('/bookings', verifyToken, async (req, res) => {
  try {
    const now  = DateTime.now().toISO();
    const snap = await db.collection('appointments')
      .where('uid',    '==', req.user.uid)
      .where('status', 'in', ['confirmed', 'pending'])
      .orderBy('start', 'asc')
      .limit(10)
      .get();

    const bookings = snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() }))
      .filter(b => b.start >= now); // only upcoming

    return res.json({ bookings });
  } catch (err) {
    console.println("error:L " + bookings)
    console.error('Fetch bookings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

/**
 * DELETE /bookings/:id
 * Cancels a booking (deletes Firestore record + Google Calendar event).
 */
app.delete('/bookings/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('appointments').doc(id);
    const snap   = await docRef.get();

    if (!snap.exists) return res.status(404).json({ error: 'Booking not found.' });
    if (snap.data().uid !== req.user.uid)
      return res.status(403).json({ error: 'Forbidden.' });

    // Check cancellation window (e.g. must cancel >2 hours before)
    const apptStart  = DateTime.fromISO(snap.data().start);
    const hoursUntil = apptStart.diffNow('hours').hours;
    if (hoursUntil < 2)
      return res.status(400).json({ error: 'Appointments must be cancelled at least 2 hours in advance.' });

    // Delete Google Calendar event
    if (snap.data().googleEventId) {
      try {
        await calendar.events.delete({
          calendarId: CALENDAR_ID,
          eventId:    snap.data().googleEventId,
        });
      } catch (e) {
        console.warn('Could not delete Google Calendar event:', e.message);
      }
    }

    // Update Firestore status
    await docRef.update({ status: 'cancelled', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });

    return res.json({ success: true, message: 'Appointment cancelled.' });
  } catch (err) {
    console.error('Cancel error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel appointment.' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`VEPA Booking Server listening on port ${PORT}`);
  console.log(`Calendar ID: ${CALENDAR_ID ?? '(NOT SET – set GOOGLE_CALENDAR_ID env var)'}`);
});
