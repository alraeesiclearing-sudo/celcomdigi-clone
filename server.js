const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

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

// English version (default)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// All other routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CelcomDigi Clone running on port ${PORT}`);
});
