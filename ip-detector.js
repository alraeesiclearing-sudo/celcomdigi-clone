const axios = require('axios');

/**
 * ISP-BASED PROTECTION
 * Allow only Malaysian telecom ISPs (Celcom, Digi, Maxis, U Mobile, etc.)
 * Block: VPN, Proxy, Hosting providers, and non-Malaysian IPs
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

async function shouldAllowVisitor(req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const cleanIp = ip.split(',')[0].trim();

    try {
        // Check IP geolocation and ISP
        const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,countryCode,isp,as,proxy,hosting`);
        const data = response.data;

        if (data.status !== 'success') {
            console.log(`[PROTECTION] IP API failure for ${cleanIp}`);
            return false;
        }

        // Check if it's a Malaysian IP
        if (data.countryCode !== 'MY') {
            console.log(`[PROTECTION BLOCK] Non-Malaysian IP: ${cleanIp} (${data.countryCode})`);
            return false;
        }

        // Block VPN/Proxy/Hosting
        if (data.proxy === true || data.hosting === true) {
            console.log(`[PROTECTION BLOCK] Proxy/VPN/Hosting detected: ${cleanIp}`);
            return false;
        }

        // Check if ISP is from allowed Malaysian telecom providers
        const currentASN = data.as ? data.as.split(' ')[0] : '';
        const isAllowedASN = ALLOWED_ASNS.some(allowed => currentASN.toUpperCase() === allowed.toUpperCase());

        if (!isAllowedASN) {
            console.log(`[PROTECTION BLOCK] Unauthorized ISP/ASN: ${data.as} (${data.isp})`);
            return false;
        }

        console.log(`[PROTECTION ALLOW] Verified Malaysian ISP: ${cleanIp} via ${data.isp}`);
        return true;

    } catch (error) {
        console.error(`[PROTECTION ERROR] Security API Failure: ${error.message}`);
        // DEFAULT TO BLOCK FOR SECURITY
        return false;
    }
}

module.exports = { shouldAllowVisitor };
