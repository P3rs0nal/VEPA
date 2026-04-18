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

const SERVICES = {
  oil_change:     { name: 'Oil Change',     duration: 30 },
  tire_rotation:  { name: 'Tire Rotation',  duration: 90 },
  inspection:     { name: 'NY Inspection',  duration: 30 },
  brake_service:  { name: 'Brake Service',  duration: 120 },
  general_repair: { name: 'General Repair', duration: 120 },
};

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

async function sendEmail({ to, subject, text, html }) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'VEPA AutoCare <noreply@vepaautocare.com>',
      to: [to],
      subject,
      text,
      html,
    });

    if (error) throw new Error(error.message);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Grouped Email Dispatchers to keep routes clean
async function notifyBookingConfirmed(bookingData, userEmail) {
  let customerResult = await sendEmail({
    to: userEmail,
    subject: confirmationEmail(bookingData).subject,
    text: confirmationEmail(bookingData).text,
    html: confirmationEmail(bookingData).html,
  });

  let staffResult = await sendEmail({
    to: 'vepaautoshop1904@gmail.com',
    subject: staffNotificationEmail({
      ...bookingData,
      customerEmail: userEmail,
    }).subject,
    text: staffNotificationEmail({
      ...bookingData,
      customerEmail: userEmail,
    }).text,
    html: staffNotificationEmail({
      ...bookingData,
      customerEmail: userEmail,
    }).html,
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
    const dayStart = DateTime.fromISO(date, { zone: TZ }).set({ hour: hours.open, minute: 0, second: 0 });
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

    // Lock mechanism
    const lockKey = `${userEmail}_${start}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const pendingRef = db.collection('bookings_pending').doc(lockKey);

    if ((await pendingRef.get()).exists) {
      return res.status(409).json({ error: 'Slot is being booked' });
    }

    await pendingRef.set({ lockedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Create Calendar event
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

    // Save booking to Firestore
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

    // Clear lock
    await pendingRef.delete();

    // Dispatch Emails asynchronously (doesn't block the response)
    const emailResult = await notifyBookingConfirmed({
      bookingId: bookingRef.id,
      service,
      start,
      end,
      customerName,
      vehicleMakeModel,
      vehicleYear,
      additionalNotes,
      duration: svc.duration,
    }, userEmail);

    res.json({
      success: true,
      bookingId: bookingRef.id,
      email: emailResult
    });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
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
      start: bookingData.start,
      customerName: bookingData.customerName,
      vehicleMakeModel: bookingData.vehicleMakeModel,
      vehicleYear: bookingData.vehicleYear,
      duration: bookingData.duration,
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

app.get('/clover/customer-stats', verifyToken, async (req, res) => {
  if (!CLOVER_MID || !CLOVER_TOKEN) {
    return res.status(503).json({ error: 'Clover not configured on this server.' });
  }
 
  try {
    const uid   = req.user.uid;
    const email = req.user.email;
 
    // Get phone from Firestore profile (already have db from your existing setup)
    let phone = '';
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) phone = userSnap.data().phone || '';
      // Normalize phone to digits only for Clover search
      phone = phone.replace(/\D/g, '');
    } catch (_) {}
 
    // ── Search Clover by email first ──────────────────────────────
    let cloverCustomer = null;
    try {
      const emailSearch = await cloverGet(
        `/v3/merchants/${CLOVER_MID}/customers?filter=emailAddresses.emailAddress%3D${encodeURIComponent(email)}&expand=emailAddresses,phoneNumbers`
      );
      if (emailSearch.elements?.length) {
        cloverCustomer = emailSearch.elements[0];
      }
    } catch (_) {}
 
    // ── Fallback: search by phone ─────────────────────────────────
    if (!cloverCustomer && phone) {
      try {
        const phoneSearch = await cloverGet(
          `/v3/merchants/${CLOVER_MID}/customers?filter=phoneNumbers.phoneNumber%3D${encodeURIComponent(phone)}&expand=emailAddresses,phoneNumbers`
        );
        if (phoneSearch.elements?.length) {
          cloverCustomer = phoneSearch.elements[0];
        }
      } catch (_) {}
    }
 
    if (!cloverCustomer) {
      return res.json({ notFound: true });
    }
 
    // ── Fetch this customer's orders ──────────────────────────────
    const cid = cloverCustomer.id;
    let orders = [];
    try {
      // Clover orders are paginated; fetch up to 100 most recent
      const orderData = await cloverGet(
        `/v3/merchants/${CLOVER_MID}/orders?filter=customers.id%3D${cid}&orderBy=createdTime+DESC&limit=100&expand=lineItems`
      );
      orders = orderData.elements || [];
    } catch (_) {}
 
    // ── Compute stats ─────────────────────────────────────────────
    // Clover stores totals in cents
    const paidOrders = orders.filter(o => o.paymentState === 'PAID' || o.total > 0);
    const totalCents = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderCount = paidOrders.length;
    const avgCents   = orderCount ? Math.round(totalCents / orderCount) : 0;
    const lastVisit  = paidOrders[0]?.createdTime || null;   // already DESC sorted
 
    // Build recent orders list (last 4, human-readable)
    const recentOrders = paidOrders.slice(0, 4).map(o => ({
      id:          o.id,
      createdTime: o.createdTime,
      total:       o.total,             // cents
      itemCount:   o.lineItems?.elements?.length || 0,
      title:       o.lineItems?.elements?.[0]?.name || 'Service Visit',
    }));
 
    return res.json({
      cloverCustomerId: cid,
      totalSpent:       totalCents / 100,       // dollars
      orderCount,
      avgOrderValue:    avgCents / 100,          // dollars
      lastVisit,
      recentOrders,
    });
 
  } catch (err) {
    console.error('Clover stats error:', err);
    return res.status(500).json({ error: 'Failed to load Clover data.' });
  }
});

/* ─── START SERVER ────────────────────────────────────────── */
app.listen(PORT, () => console.log(`Booking server running on port ${PORT}`));