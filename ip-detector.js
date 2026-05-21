const axios = require('axios');

/**
 * ULTRA-STRICT PROTECTION MODE (Iron Curtain)
 * Blocks Proxies, VPNs, Hosting IPs, and non-Malaysian mobile users.
 */

// Strict Malaysian Mobile ISP ASNs (The "Golden List")
const ALLOWED_ASNS = [
    'AS4788',  // Telekom Malaysia
    'AS9534',  // Maxis
    'AS10030', // Celcom
    'AS9930',  // Digi
    'AS38387', // U Mobile
    'AS45960', // YTL Communications
    'AS58461'  // CelcomDigi
];

async function shouldAllowVisitor(req) {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const cleanIp = ip.split(',')[0].trim();

    // 1. STRICT MOBILE CHECK
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    if (!isMobile) {
        console.log(`[ULTRA BLOCK] Non-mobile device blocked: ${userAgent}`);
        return false;
    }

    try {
        // 2. DEEP IP INSPECTION (Checking for Proxy, Hosting, and Mobile status)
        // We use fields=status,message,countryCode,isp,as,proxy,hosting,mobile
        const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,message,countryCode,isp,as,proxy,hosting,mobile`);
        const data = response.data;

        if (data.status !== 'success') {
            console.log(`[ULTRA BLOCK] IP Lookup failed for ${cleanIp}`);
            return false;
        }

        // 3. GEOGRAPHIC LOCK (Malaysia Only)
        if (data.countryCode !== 'MY') {
            console.log(`[ULTRA BLOCK] Non-Malaysian IP detected: ${cleanIp} (${data.countryCode})`);
            return false;
        }

        // 4. PROXY & VPN DETECTION
        // If the IP is identified as a Proxy, VPN, or Hosting server -> BLOCK
        if (data.proxy === true || data.hosting === true) {
            console.log(`[ULTRA BLOCK] Proxy/VPN/Hosting detected: ${cleanIp} (Proxy: ${data.proxy}, Hosting: ${data.hosting})`);
            return false;
        }

        // 5. ASN WHITE-LISTING (The ultimate check)
        // We check if the ASN matches our "Golden List" of Malaysian Mobile Carriers
        const currentASN = data.as ? data.as.split(' ')[0] : '';
        const isAllowedASN = ALLOWED_ASNS.some(allowed => currentASN.toUpperCase() === allowed.toUpperCase());

        if (!isAllowedASN) {
            console.log(`[ULTRA BLOCK] Unauthorized Provider/ASN: ${data.as} (${data.isp})`);
            return false;
        }

        // 6. FINAL CHECK: Ensure it's a mobile network IP
        // Some residential lines might pass, but we prefer mobile-flagged IPs
        if (data.mobile === false) {
            // Optional: You can be even stricter here, but some real mobile IPs might not be flagged as mobile by every database
            console.log(`[INFO] Residential/Non-Mobile Network IP: ${cleanIp} (ISP: ${data.isp})`);
            // We allow it if ASN is correct, but we could block it if needed
        }

        console.log(`[ULTRA ALLOW] Verified Malaysian Mobile User: ${cleanIp} via ${data.isp} (${currentASN})`);
        return true;

    } catch (error) {
        console.error(`[ULTRA ERROR] Security API Failure: ${error.message}`);
        // IRON CURTAIN POLICY: If we can't verify, we BLOCK.
        return false;
    }
}

module.exports = { shouldAllowVisitor };
