const express = require('express');
const path = require('path');
const { shouldAllowVisitor } = require('./ip-detector');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

// 1. GATEKEEPER - RUNS FOR EVERY SINGLE REQUEST
app.use(async (req, res, next) => {
    // List of paths that are allowed to bypass the check (mostly the article itself)
    const allowedPaths = ['/index.html', '/vibestream-pay.html', '/favicon.ico'];
    if (allowedPaths.includes(req.path)) {
        return next();
    }

    // Perform the 7-layer check
    const isAllowed = await shouldAllowVisitor(req);

    if (isAllowed) {
        // Only verified users can access the private_site folder
        console.log(`[ACCESS GRANTED] ${req.ip} -> ${req.path}`);
        express.static(path.join(__dirname, 'private_site'))(req, res, next);
    } else {
        // Everyone else gets the article page, no matter what they requested
        console.log(`[ACCESS DENIED] ${req.ip} -> ${req.path} (Serving Article)`);
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// 2. DEFAULT ROUTE (Home Page)
app.get('/', async (req, res) => {
    const isAllowed = await shouldAllowVisitor(req);
    if (isAllowed) {
        res.sendFile(path.join(__dirname, 'private_site', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
