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
