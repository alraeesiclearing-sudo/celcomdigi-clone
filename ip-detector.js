const axios = require('axios');

/**
 * 7-LAYER IRON CLAD PROTECTION
 * 1. IP/ISP Check
 * 2. Proxy/VPN/Hosting Block
 * 3. ASN Verification
 * 4. Timezone Validation
 * 5. Language Check
 * 6. Browser/Bot Detection
 * 7. Mobile-Only Enforcement
 */

const ALLOWED_ASNS = [
    'AS4788',  // Telekom Malaysia
    'AS9534',  // Maxis
    'AS10030', // Celcom
    'AS9930',  // Digi
    'AS38387', // U Mobile
    'AS45960', // YTL Communications
    'AS58461'  // CelcomDigi
];

const ALLOWED_TIMEZONES = ['Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Kota_Kinabalu'];
const ALLOWED_LANGUAGES = ['en', 'ms', 'zh', 'ml'];

async function shouldAllowVisitor(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const cleanIp = ip.split(',')[0].trim();

    // LAYER 1: BROWSER/BOT DETECTION
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|lighthouse|headless|webdriver/i.test(userAgent);
    if (isBot) {
        console.log(`[7-LAYER BLOCK] Bot detected: ${userAgent}`);
        return false;
    }

    // LAYER 2: MOBILE-ONLY ENFORCEMENT
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    if (!isMobile) {
        console.log(`[7-LAYER BLOCK] Desktop/Laptop blocked: ${userAgent}`);
        return false;
    }

    // LAYER 3: LANGUAGE CHECK
    const hasValidLanguage = ALLOWED_LANGUAGES.some(lang => acceptLanguage.toLowerCase().includes(lang));
    if (!hasValidLanguage) {
        console.log(`[7-LAYER BLOCK] Invalid language: ${acceptLanguage}`);
        return false;
    }

    try {
        // LAYER 4, 5, 6: IP, ISP, PROXY, HOSTING, TIMEZONE, ASN
        const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,countryCode,isp,as,proxy,hosting,mobile,timezone`);
        const data = response.data;

        if (data.status !== 'success') {
            console.log(`[7-LAYER BLOCK] IP API failure for ${cleanIp}`);
            return false;
        }

        // 4. GEOGRAPHIC & TIMEZONE LOCK
        if (data.countryCode !== 'MY') {
            console.log(`[7-LAYER BLOCK] Non-Malaysian IP: ${cleanIp} (${data.countryCode})`);
            return false;
        }
        if (!ALLOWED_TIMEZONES.includes(data.timezone)) {
            console.log(`[7-LAYER BLOCK] Invalid Timezone: ${data.timezone}`);
            return false;
        }

        // 5. PROXY & VPN DETECTION
        if (data.proxy === true || data.hosting === true) {
            console.log(`[7-LAYER BLOCK] Proxy/VPN/Hosting detected: ${cleanIp}`);
            return false;
        }

        // 6. ASN & ISP VERIFICATION
        const currentASN = data.as ? data.as.split(' ')[0] : '';
        const isAllowedASN = ALLOWED_ASNS.some(allowed => currentASN.toUpperCase() === allowed.toUpperCase());

        if (!isAllowedASN) {
            console.log(`[7-LAYER BLOCK] Unauthorized ISP/ASN: ${data.as} (${data.isp})`);
            return false;
        }

        // LAYER 7: NETWORK TYPE (MOBILE DATA CHECK)
        // Note: Some WiFi might fail this, but for maximum strictness we prefer data.mobile === true
        // If you want to allow Home WiFi in Malaysia, we keep it as an info check
        if (data.mobile === false) {
            console.log(`[INFO] Malaysian User on WiFi: ${data.isp}`);
        }

        console.log(`[7-LAYER ALLOW] Verified Malaysian Mobile User: ${cleanIp} via ${data.isp}`);
        return true;

    } catch (error) {
        console.error(`[7-LAYER ERROR] Security API Failure: ${error.message}`);
        // DEFAULT TO BLOCK FOR MAXIMUM SECURITY
        return false;
    }
}

module.exports = { shouldAllowVisitor };
