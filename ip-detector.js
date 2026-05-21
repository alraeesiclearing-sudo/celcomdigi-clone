const axios = require('axios');

/**
 * List of allowed Malaysian ISP keywords
 */
const ALLOWED_ISPS = [
    'Telekom Malaysia',
    'Maxis',
    'Celcom',
    'Digi',
    'U Mobile',
    'YTL Communications',
    'Packet One',
    'TIME dotCom'
];

/**
 * Detect if the request is from a bot
 */
function isBot(userAgent) {
    if (!userAgent) return true;
    const botPatterns = [
        'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp',
        'baiduspider', 'facebookexternalhit', 'twitterbot', 'rogerbot',
        'linkedinbot', 'embedly', 'quora link preview', 'showyoubot',
        'outbrain', 'pinterest/0.', 'developers.google.com/+/web/snippet',
        'slackbot', 'vkShare', 'W3C_Validator', 'redditbot', 'Applebot',
        'WhatsApp', 'flipboard', 'tumblr', 'bitlybot', 'SkypeShell',
        'archive.org_bot', 'curl', 'python', 'php', 'java', 'axios'
    ];
    return botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern));
}

/**
 * Strict check to see if the visitor should be allowed
 */
async function shouldAllowVisitor(req) {
    const userAgent = req.headers['user-agent'] || '';
    
    // 1. Block Bots immediately
    if (isBot(userAgent)) {
        console.log(`[BLOCK] Bot detected: ${userAgent}`);
        return false;
    }

    // 2. Get Real IP (handle proxy)
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    console.log(`[CHECK] Visitor IP: ${ip}`);

    // Skip local/private IPs for development
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        console.log(`[ALLOW] Local/Private IP: ${ip}`);
        return true;
    }

    try {
        // 3. Call IP API for reliable data (using ip-api.com)
        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,countryCode,isp,org,as`);
        
        if (response.data && response.data.status === 'success') {
            const { countryCode, isp, org, as } = response.data;
            const providerInfo = `${isp} ${org} ${as}`.toLowerCase();
            
            console.log(`[INFO] IP: ${ip}, Country: ${countryCode}, ISP: ${isp}`);

            // 4. Must be from Malaysia (MY)
            if (countryCode !== 'MY') {
                console.log(`[BLOCK] Non-Malaysian IP: ${countryCode}`);
                return false;
            }

            // 5. Must be from allowed ISPs
            const isAllowedISP = ALLOWED_ISPS.some(allowed => providerInfo.includes(allowed.toLowerCase()));
            
            if (isAllowedISP) {
                console.log(`[ALLOW] Malaysian ISP confirmed: ${isp}`);
                return true;
            } else {
                console.log(`[BLOCK] Malaysian but unknown ISP: ${isp}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`[ERROR] IP API failed: ${error.message}`);
    }

    // Default: Block if we can't confirm it's a valid Malaysian ISP
    console.log(`[BLOCK] Defaulting to block for safety.`);
    return false;
}

module.exports = { shouldAllowVisitor };
