if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { DateTime } = require('luxon');
const { Resend } = require('resend');
const CLOVER_MID   = process.env.CLOVER_MERCHANT_ID;
const CLOVER_TOKEN = process.env.CLOVER_API_TOKEN;
const CLOVER_BASE  = process.env.CLOVER_BASE_URL || 'https://api.clover.com';

// Email Templates
const { confirmationEmail, cancellationEmail, staffNotificationEmail } = require('./emailTemplates');

/* ─── INITIALIZATION & CONFIG ─────────────────────────────── */
const app = express();
const PORT = process.env.PORT || 3001;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const TZ = 'America/New_York';
const resend = new Resend(process.env.RESEND_API_KEY);

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

async function cloverGet(path) {
  const url = `${CLOVER_BASE}${path}`;
  const res  = await fetch(url, {
    headers: { Authorization: `Bearer ${CLOVER_TOKEN}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Clover API ${res.status}: ${err}`);
  }
  return res.json();
}

/* ─── CONSTANTS ───────────────────────────────────────────── */
const BUSINESS_HOURS = {
  1: { open: 8, close: 17 }, // Mon
  2: { open: 8, close: 17 }, // Tue
  3: { open: 8, close: 17 }, // Wed
  4: { open: 8, close: 17 }, // Thu
  5: { open: 8, close: 17 }, // Fri
  6: { open: 9, close: 16 }, // Sat
  0: null,                   // Sun closed
};

const moneyFromEnv = (name) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const SERVICES = {
  // Oil pricing varies by oil type / capacity. Configure the public estimate in Render:
  // OIL_CHANGE_PRICE_MIN and OIL_CHANGE_PRICE_MAX (for example, your real shop range).
  oil_change: {
    name: 'Oil Change',
    duration: 30,
    priceMin: moneyFromEnv('OIL_CHANGE_PRICE_MIN'),
    priceMax: moneyFromEnv('OIL_CHANGE_PRICE_MAX'),
    estimateLabel: 'depending on oil type, capacity, and vehicle',
  },
  tire_rotation:  { name: 'Tire Rotation',  duration: 90 },
  // Albany is outside the NYMA emissions area. This is the typical light passenger vehicle fee.
  inspection: {
    name: 'NY Inspection',
    duration: 30,
    priceMin: 21,
    priceMax: 21,
    estimateLabel: 'typical passenger vehicle; exceptions may apply',
  },
  brake_service:  { name: 'Brake Service',  duration: 120 },
  general_repair: { name: 'General Repair', duration: 120 },
};

const ESTIMATE_DISCLAIMER = 'Estimate only; final price can vary by vehicle, oil type/capacity, parts, condition, and required repairs.';

/* ─── MIDDLEWARE ──────────────────────────────────────────── */
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

/* ─── HELPER FUNCTIONS ────────────────────────────────────── */
function getCalendarClient() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}


function normalizeServiceKeys(input) {
  let raw = input;
  if (typeof raw === 'string') raw = raw.split(',');
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];
  return [...new Set(raw.map(v => String(v).trim()).filter(Boolean))];
}

function getServiceBundle(input) {
  const keys = normalizeServiceKeys(input);
  if (!keys.length) return { error: 'At least one service is required' };
  if (keys.length > 5) return { error: 'A maximum of 5 services can be booked at once' };

  const unknown = keys.filter(key => !SERVICES[key]);
  if (unknown.length) return { error: `Unknown service: ${unknown.join(', ')}` };

  const items = keys.map(key => ({ key, ...SERVICES[key] }));
  const duration = items.reduce((sum, item) => sum + item.duration, 0);
  const allEstimated = items.every(item => Number.isFinite(item.priceMin) && Number.isFinite(item.priceMax));
  const estimateMin = allEstimated ? Number(items.reduce((sum, item) => sum + item.priceMin, 0).toFixed(2)) : null;
  const estimateMax = allEstimated ? Number(items.reduce((sum, item) => sum + item.priceMax, 0).toFixed(2)) : null;

  return {
    keys,
    items,
    names: items.map(item => item.name),
    duration,
    estimateMin,
    estimateMax,
    estimateDisclaimer: ESTIMATE_DISCLAIMER,
  };
}

function servicePublicShape(key, svc) {
  return {
    key,
    name: svc.name,
    duration: svc.duration,
    priceMin: Number.isFinite(svc.priceMin) ? svc.priceMin : null,
    priceMax: Number.isFinite(svc.priceMax) ? svc.priceMax : null,
    estimateLabel: svc.estimateLabel || '',
  };
}


function buildSlotLockRefs(startDt, endDt) {
  const refs = [];
  let cursor = startDt;
  while (cursor < endDt) {
    const key = `slot_${cursor.toISO()}`.replace(/[^a-zA-Z0-9_]/g, '_');
    refs.push(db.collection('bookings_pending').doc(key));
    cursor = cursor.plus({ minutes: 30 });
  }
  return refs;
}

async function acquireSlotLocks(startDt, endDt, userId) {
  const refs = buildSlotLockRefs(startDt, endDt);
  await db.runTransaction(async tx => {
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    const now = Date.now();
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const lockedAt = snap.data()?.lockedAt?.toMillis?.() || 0;
      if (now - lockedAt < 5 * 60 * 1000) {
        const err = new Error('Slot is being booked');
        err.code = 'SLOT_LOCKED';
        throw err;
      }
    }
    for (const ref of refs) {
      tx.set(ref, {
        userId,
        lockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
  return refs;
}

async function releaseSlotLocks(refs) {
  await Promise.allSettled((refs || []).map(ref => ref.delete()));
}

async function sendEmail({ to, subject, text, html, replyTo }) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'VEPA AutoCare <noreply@vepaautocare.com>',
      to: [to],
      subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) throw new Error(error.message);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Grouped Email Dispatchers to keep routes clean
async function notifyBookingConfirmed(bookingData, userEmail) {
  const customerTemplate = confirmationEmail(bookingData);
  const staffTemplate = staffNotificationEmail({ ...bookingData, customerEmail: userEmail });

  const customerResult = await sendEmail({
    to: userEmail,
    subject: customerTemplate.subject,
    text: customerTemplate.text,
    html: customerTemplate.html,
  });

  const staffResult = await sendEmail({
    to: 'vepaautoshop1904@gmail.com',
    subject: staffTemplate.subject,
    text: staffTemplate.text,
    html: staffTemplate.html,
  });

  return {
    customerEmailSent: customerResult.success,
    staffEmailSent: staffResult.success,
  };
}

async function notifyBookingCancelled(bookingData, userEmail) {
  try {
    const email = cancellationEmail(bookingData);
    await sendEmail({
      to: userEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    console.log(`[EMAIL] Cancellation sent → ${userEmail}`);
  } catch (e) {
    console.error('[EMAIL] Cancellation email failed:', e.message);
  }
}

/* ─── API ROUTES ──────────────────────────────────────────── */

app.get('/', (req, res) => res.send('VEPA Booking API — running'));

app.post('/contact', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').replace(/[\r\n]+/g, ' ').trim();
  const phone = String(req.body?.phone || '').replace(/[\r\n]+/g, ' ').trim();
  const subjectKey = String(req.body?.subject || 'general').trim();
  const message = String(req.body?.message || '').trim();
  const userEmail = req.user.email;

  if (!name || !phone || !message || !userEmail) {
    return res.status(400).json({ error: 'Name, phone, email, and message are required' });
  }
  if (name.length > 120 || phone.length > 40 || message.length > 1000 || subjectKey.length > 40) {
    return res.status(400).json({ error: 'One or more fields are too long' });
  }

  const subjectNames = {
    vehicle: 'Vehicle',
    service: 'Service',
    pricing: 'Pricing',
    other: 'Other',
    general: 'General',
  };
  const subjectLabel = subjectNames[subjectKey] || 'General';

  try {
    const inquiryRef = await db.collection('web_inquiries').add({
      source: 'web',
      type: subjectKey || 'general',
      userId: req.user.uid,
      authenticated: true,
      user: { uid: req.user.uid, name, phone, email: userEmail },
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const safeName = escapeHtml(name);
    const safePhone = escapeHtml(phone);
    const safeEmail = escapeHtml(userEmail);
    const safeSubject = escapeHtml(subjectLabel);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    const emailResult = await sendEmail({
      to: 'vepaautoshop1904@gmail.com',
      subject: `[VEPA Website] ${subjectLabel} Inquiry – ${name}`,
      text: `New inquiry from VEPA website:\n\nName: ${name}\nPhone: ${phone}\nEmail: ${userEmail}\nSubject: ${subjectLabel}\n\nMessage:\n${message}`,
      html: `<h2>New Inquiry — ${safeSubject}</h2><p><b>Name:</b> ${safeName}<br><b>Phone:</b> ${safePhone}<br><b>Email:</b> ${safeEmail}<br><b>Subject:</b> ${safeSubject}</p><h3>Message</h3><p>${safeMessage}</p><hr><small>VEPA Website Contact Form · Authenticated user ${escapeHtml(req.user.uid)}</small>`,
      replyTo: userEmail,
    });

    if (!emailResult.success) {
      console.error('[CONTACT] Staff email failed:', emailResult.error);
      return res.json({ success: true, inquiryId: inquiryRef.id, notificationSent: false, warning: 'Message saved, but the email notification failed. Please call us if your request is urgent.' });
    }

    res.json({ success: true, inquiryId: inquiryRef.id, notificationSent: true });
  } catch (err) {
    console.error('Contact error:', err);
    res.status(500).json({ error: 'Could not send your message' });
  }
});

app.get('/services', (req, res) => {
  res.json({
    services: Object.entries(SERVICES).map(([key, val]) => servicePublicShape(key, val)),
    estimateDisclaimer: ESTIMATE_DISCLAIMER,
  });
});

app.get('/availability', async (req, res) => {
  const { date } = req.query;
  const serviceInput = req.query.services || req.query.service; // keep legacy single-service URLs working
  if (!date || !serviceInput) return res.status(400).json({ error: 'date and service(s) required' });

  const bundle = getServiceBundle(serviceInput);
  if (bundle.error) return res.status(400).json({ error: bundle.error });

  const requestedDate = DateTime.fromISO(date, { zone: TZ });
  if (!requestedDate.isValid) return res.status(400).json({ error: 'Invalid date' });

  const dayNum = requestedDate.weekday % 7;
  const hours = BUSINESS_HOURS[dayNum];
  if (!hours) {
    return res.json({
      closed: true,
      slots: [],
      services: bundle.keys,
      serviceNames: bundle.names,
      duration: bundle.duration,
      estimateMin: bundle.estimateMin,
      estimateMax: bundle.estimateMax,
      estimateDisclaimer: bundle.estimateDisclaimer,
    });
  }

  try {
    const calendar = getCalendarClient();
    const dayStart = requestedDate.set({ hour: hours.open, minute: 0, second: 0, millisecond: 0 });
    const dayEnd   = requestedDate.set({ hour: hours.close, minute: 0, second: 0, millisecond: 0 });

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
    let cursor = dayStart;

    while (cursor.plus({ minutes: bundle.duration }) <= dayEnd) {
      const slotEnd = cursor.plus({ minutes: bundle.duration });
      const overlaps = busyPeriods.some(b => {
        const bs = DateTime.fromISO(b.start, { zone: TZ });
        const be = DateTime.fromISO(b.end,   { zone: TZ });
        return cursor < be && slotEnd > bs;
      });

      if (!overlaps) {
        slots.push({
          start: cursor.toISO(),
          end: slotEnd.toISO(),
          display: cursor.toFormat('h:mm a'),
          duration: bundle.duration,
        });
      }
      cursor = cursor.plus({ minutes: 30 });
    }

    res.json({
      closed: false,
      services: bundle.keys,
      serviceNames: bundle.names,
      duration: bundle.duration,
      estimateMin: bundle.estimateMin,
      estimateMax: bundle.estimateMax,
      estimateDisclaimer: bundle.estimateDisclaimer,
      slots,
    });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ error: 'Could not fetch availability' });
  }
});

app.post('/book', requireAuth, async (req, res) => {
  const {
    date,
    start,
    services,
    service, // legacy client fallback
    customerName,
    vehicleMakeModel,
    vehicleYear,
    additionalNotes,
  } = req.body;

  if (!date || !start || (!services && !service)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const bundle = getServiceBundle(services || service);
  if (bundle.error) return res.status(400).json({ error: bundle.error });

  const startDt = DateTime.fromISO(start, { zone: TZ });
  const requestedDate = DateTime.fromISO(date, { zone: TZ });
  if (!startDt.isValid || !requestedDate.isValid) return res.status(400).json({ error: 'Invalid booking date/time' });
  if (startDt.toISODate() !== requestedDate.toISODate()) return res.status(400).json({ error: 'Start time does not match booking date' });

  if (![0, 30].includes(startDt.minute) || startDt.second !== 0) {
    return res.status(400).json({ error: 'Appointments must start on a 30-minute interval' });
  }

  const dayNum = requestedDate.weekday % 7;
  const hours = BUSINESS_HOURS[dayNum];
  if (!hours) return res.status(400).json({ error: 'The shop is closed on this date' });

  const dayStart = requestedDate.set({ hour: hours.open, minute: 0, second: 0, millisecond: 0 });
  const dayEnd = requestedDate.set({ hour: hours.close, minute: 0, second: 0, millisecond: 0 });
  const serverEndDt = startDt.plus({ minutes: bundle.duration });
  if (startDt < dayStart || serverEndDt > dayEnd) {
    return res.status(400).json({ error: 'Selected services do not fit within business hours' });
  }

  // Never trust a client-provided end time. The server calculates the complete block.
  const serverStart = startDt.toISO();
  const serverEnd = serverEndDt.toISO();
  const userEmail = req.user.email;
  const primaryService = bundle.keys[0];
  const primaryServiceName = bundle.names[0];
  const servicesLabel = bundle.names.join(' + ');

  let pendingRefs = [];
  try {
    const calendar = getCalendarClient();

    // Re-check the entire server-calculated block immediately before inserting.
    const fbResp = await calendar.freebusy.query({
      requestBody: {
        timeMin: serverStart,
        timeMax: serverEnd,
        timeZone: TZ,
        items: [{ id: CALENDAR_ID }],
      },
    });

    if ((fbResp.data.calendars?.[CALENDAR_ID]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'Slot no longer available' });
    }

    // Lock every 30-minute bucket in the requested block so overlapping concurrent bookings cannot race.
    try {
      pendingRefs = await acquireSlotLocks(startDt, serverEndDt, req.user.uid);
    } catch (lockErr) {
      if (lockErr.code === 'SLOT_LOCKED') {
        return res.status(409).json({ error: 'Slot is being booked' });
      }
      throw lockErr;
    }

    // Check again after acquiring the lock in case another process inserted a calendar event just before the lock.
    const lockedFbResp = await calendar.freebusy.query({
      requestBody: {
        timeMin: serverStart,
        timeMax: serverEnd,
        timeZone: TZ,
        items: [{ id: CALENDAR_ID }],
      },
    });
    if ((lockedFbResp.data.calendars?.[CALENDAR_ID]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'Slot no longer available' });
    }

    // One Google Calendar event reserves the full combined duration.
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${servicesLabel} – ${customerName || userEmail}`,
        description: [
          `Services: ${servicesLabel}`,
          `Total duration: ${bundle.duration} minutes`,
          bundle.estimateMin != null
            ? `Estimated total: ${bundle.estimateMin === bundle.estimateMax ? `$${bundle.estimateMin.toFixed(2)}` : `$${bundle.estimateMin.toFixed(2)}–$${bundle.estimateMax.toFixed(2)}`}`
            : '',
          `Customer: ${customerName || userEmail}`,
          `Email: ${userEmail}`,
          vehicleMakeModel ? `Vehicle: ${vehicleYear || ''} ${vehicleMakeModel}` : '',
          additionalNotes ? `Notes: ${additionalNotes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: serverStart, timeZone: TZ },
        end: { dateTime: serverEnd, timeZone: TZ },
        colorId: '11',
      },
    });

    const bookingRef = await db.collection('bookings').add({
      userId: req.user.uid,
      userEmail,
      customerName: customerName || userEmail,

      // New multi-service fields
      services: bundle.keys,
      serviceNames: bundle.names,

      // Legacy fields retained so old UI/admin code keeps working during rollout
      service: primaryService,
      serviceName: bundle.names.length > 1 ? servicesLabel : primaryServiceName,

      duration: bundle.duration,
      estimateMin: bundle.estimateMin,
      estimateMax: bundle.estimateMax,
      estimateDisclaimer: bundle.estimateDisclaimer,
      date,
      start: serverStart,
      end: serverEnd,
      vehicleMakeModel: vehicleMakeModel || '',
      vehicleYear: vehicleYear || '',
      additionalNotes: additionalNotes || '',
      calEventId: event.data.id,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const emailResult = await notifyBookingConfirmed({
      bookingId: bookingRef.id,
      service: primaryService,
      services: bundle.keys,
      serviceNames: bundle.names,
      start: serverStart,
      end: serverEnd,
      customerName,
      vehicleMakeModel,
      vehicleYear,
      additionalNotes,
      duration: bundle.duration,
      estimateMin: bundle.estimateMin,
      estimateMax: bundle.estimateMax,
      estimateDisclaimer: bundle.estimateDisclaimer,
    }, userEmail);

    res.json({
      success: true,
      bookingId: bookingRef.id,
      services: bundle.keys,
      serviceNames: bundle.names,
      duration: bundle.duration,
      start: serverStart,
      end: serverEnd,
      estimateMin: bundle.estimateMin,
      estimateMax: bundle.estimateMax,
      estimateDisclaimer: bundle.estimateDisclaimer,
      email: emailResult,
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
  } finally {
    try { await releaseSlotLocks(pendingRefs); } catch (e) { console.error('[LOCK] Cleanup failed:', e.message); }
  }
});

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

app.delete('/bookings/:id', requireAuth, async (req, res) => {
  try {
    const docRef = db.collection('bookings').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) return res.status(404).json({ error: 'Booking not found' });
    
    const bookingData = docSnap.data();
    if (bookingData.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    // Check 2-hour cancellation window
    if (new Date(bookingData.start) - new Date() < 2 * 60 * 60 * 1000) {
      return res.status(400).json({
        error: 'Appointments cannot be cancelled within 2 hours. Please call us at (518) 456-5682.',
      });
    }

    // Delete Calendar Event
    if (bookingData.calEventId) {
      try {
        await getCalendarClient().events.delete({ calendarId: CALENDAR_ID, eventId: bookingData.calEventId });
      } catch (e) {
        console.error('[CAL] Event delete failed (non-fatal):', e.message);
      }
    }

    // Delete Firestore Document
    await docRef.delete();

    // Dispatch Email asynchronously
    notifyBookingCancelled({
      bookingId: req.params.id,
      service: bookingData.service,
      services: bookingData.services,
      serviceNames: bookingData.serviceNames,
      start: bookingData.start,
      customerName: bookingData.customerName,
      vehicleMakeModel: bookingData.vehicleMakeModel,
      vehicleYear: bookingData.vehicleYear,
      duration: bookingData.duration,
      estimateMin: bookingData.estimateMin,
      estimateMax: bookingData.estimateMax,
    }, req.user.email);

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: err.message || 'Cancel failed' });
  }
});

/* ─── CLOVER ROUTES ──────────────────────────── */

app.get('/clover/sync', requireAuth, async (req, res) => {
  try {
    const email = req.user.email;
    const userRef = db.collection('users').doc(req.user.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    let customerId = userData?.cloverCustomerId;

    // Find customer (only once)
    if (!customerId) {
      const customerRes = await fetch(
        `https://api.clover.com/v3/merchants/${process.env.CLOVER_MERCHANT_ID}/customers?filter=email=${email}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.CLOVER_TOKEN}`
          }
        }
      );

      const customerData = await customerRes.json();
      const customer = customerData.elements?.[0];

      if (!customer) {
        return res.json({ transactions: [] });
      }

      customerId = customer.id;

      await userRef.update({ cloverCustomerId: customerId });
    }

    // Get orders
    const ordersRes = await fetch(
      `https://api.clover.com/v3/merchants/${process.env.CLOVER_MERCHANT_ID}/orders?filter=customer.id=${customerId}&expand=lineItems`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOVER_TOKEN}`
        }
      }
    );

    const ordersData = await ordersRes.json();
    const orders = ordersData.elements || [];

    // Map data
    const mappedTransactions = orders.map(order => {
      const items = order.lineItems?.elements || [];

      return {
        id: order.id,
        amount: (order.total || 0) / 100,
        date: order.createdTime,
        service: items[0]?.name || 'Purchase',
        items: items.map(i => ({
          name: i.name,
          price: (i.price || 0) / 100
        }))
      };
    });

    // Summary
    const totalSpend = mappedTransactions.reduce((sum, t) => sum + t.amount, 0);

    const cloverSummary = {
      totalSpend,
      totalVisits: mappedTransactions.length,
      lastInvoice: mappedTransactions[0]?.amount || 0,
      lastInvoiceDate: mappedTransactions[0]?.date || null
    };

    // Save
    await userRef.update({
      clover: cloverSummary,
      cloverTransactions: mappedTransactions,
      cloverUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      clover: cloverSummary,
      transactions: mappedTransactions
    });

  } catch (err) {
    console.error('Clover sync error:', err);
    res.status(500).json({ error: 'Clover sync failed' });
  }
});

// app.get('/clover/customer-stats', verifyToken, async (req, res) => {
//   if (!CLOVER_MID || !CLOVER_TOKEN) {
//     return res.status(503).json({ error: 'Clover not configured on this server.' });
//   }
 
//   try {
//     const uid   = req.user.uid;
//     const email = req.user.email;
 
//     // Get phone from Firestore profile (already have db from your existing setup)
//     let phone = '';
//     try {
//       const userSnap = await db.collection('users').doc(uid).get();
//       if (userSnap.exists) phone = userSnap.data().phone || '';
//       // Normalize phone to digits only for Clover search
//       phone = phone.replace(/\D/g, '');
//     } catch (_) {}
 
//     // ── Search Clover by email first ──────────────────────────────
//     let cloverCustomer = null;
//     try {
//       const emailSearch = await cloverGet(
//         `/v3/merchants/${CLOVER_MID}/customers?filter=emailAddresses.emailAddress%3D${encodeURIComponent(email)}&expand=emailAddresses,phoneNumbers`
//       );
//       if (emailSearch.elements?.length) {
//         cloverCustomer = emailSearch.elements[0];
//       }
//     } catch (_) {}
 
//     // ── Fallback: search by phone ─────────────────────────────────
//     if (!cloverCustomer && phone) {
//       try {
//         const phoneSearch = await cloverGet(
//           `/v3/merchants/${CLOVER_MID}/customers?filter=phoneNumbers.phoneNumber%3D${encodeURIComponent(phone)}&expand=emailAddresses,phoneNumbers`
//         );
//         if (phoneSearch.elements?.length) {
//           cloverCustomer = phoneSearch.elements[0];
//         }
//       } catch (_) {}
//     }
 
//     if (!cloverCustomer) {
//       return res.json({ notFound: true });
//     }
 
//     // ── Fetch this customer's orders ──────────────────────────────
//     const cid = cloverCustomer.id;
//     let orders = [];
//     try {
//       // Clover orders are paginated; fetch up to 100 most recent
//       const orderData = await cloverGet(
//         `/v3/merchants/${CLOVER_MID}/orders?filter=customers.id%3D${cid}&orderBy=createdTime+DESC&limit=100&expand=lineItems`
//       );
//       orders = orderData.elements || [];
//     } catch (_) {}
 
//     // ── Compute stats ─────────────────────────────────────────────
//     // Clover stores totals in cents
//     const paidOrders = orders.filter(o => o.paymentState === 'PAID' || o.total > 0);
//     const totalCents = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
//     const orderCount = paidOrders.length;
//     const avgCents   = orderCount ? Math.round(totalCents / orderCount) : 0;
//     const lastVisit  = paidOrders[0]?.createdTime || null;   // already DESC sorted
 
//     // Build recent orders list (last 4, human-readable)
//     const recentOrders = paidOrders.slice(0, 4).map(o => ({
//       id:          o.id,
//       createdTime: o.createdTime,
//       total:       o.total,             // cents
//       itemCount:   o.lineItems?.elements?.length || 0,
//       title:       o.lineItems?.elements?.[0]?.name || 'Service Visit',
//     }));
 
//     return res.json({
//       cloverCustomerId: cid,
//       totalSpent:       totalCents / 100,       // dollars
//       orderCount,
//       avgOrderValue:    avgCents / 100,          // dollars
//       lastVisit,
//       recentOrders,
//     });
 
//   } catch (err) {
//     console.error('Clover stats error:', err);
//     return res.status(500).json({ error: 'Failed to load Clover data.' });
//   }
// });

/* ─── START SERVER ────────────────────────────────────────── */
app.listen(PORT, () => console.log(`Booking server running on port ${PORT}`));