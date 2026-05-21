/**
 * IP Detector Module
 * Detects if a user's IP belongs to Malaysian telecom providers
 */

// Malaysian Telecom Provider ASN and IP Ranges
const MALAYSIAN_TELECOM_PROVIDERS = {
  'Telekom Malaysia': {
    asns: ['AS4788', 'AS4788'],
    keywords: ['tm', 'telekom', 'tmnet', 'unifi'],
  },
  'Maxis': {
    asns: ['AS17971', 'AS17971'],
    keywords: ['maxis', 'maxis broadband'],
  },
  'Celcom Axiata': {
    asns: ['AS9277', 'AS9277'],
    keywords: ['celcom', 'axiata'],
  },
  'Digi Telecommunications': {
    asns: ['AS17968', 'AS17968'],
    keywords: ['digi', 'digicoms'],
  },
  'CelcomDigi': {
    asns: ['AS9277', 'AS17971'],
    keywords: ['celcomdigi', 'celcom', 'digi'],
  },
  'U Mobile': {
    asns: ['AS45839', 'AS45839'],
    keywords: ['umobile', 'u mobile'],
  },
  'YTL Communications': {
    asns: ['AS3786', 'AS3786'],
    keywords: ['ytl', 'yes broadband'],
  },
};

/**
 * Get client IP from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Check if IP belongs to Malaysian telecom provider
 * @param {string} ip - IP address to check
 * @returns {Promise<boolean>} True if IP is from Malaysian telecom provider
 */
async function isMalaysianTelecomIP(ip) {
  // Skip localhost and private IPs for testing
  if (isPrivateIP(ip)) {
    return true; // Allow localhost/private IPs for development
  }

  try {
    // Try to use IP geolocation API to check ISP
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      timeout: 3000,
    }).catch(() => null);

    if (!response || !response.ok) {
      console.log(`[IP CHECK] API Failure - Falling back to Block`);
      return false; // Default to BLOCK if API fails for security
    }

    const data = await response.json();
    const org = (data.org || '').toLowerCase();
    const isp = (data.isp || '').toLowerCase();
    const country = (data.country_code || '').toUpperCase();

    console.log(`[IP CHECK] Provider: ${isp}, Org: ${org}, Country: ${country}`);

    // Check if ISP matches Malaysian telecom providers
    for (const [provider, info] of Object.entries(MALAYSIAN_TELECOM_PROVIDERS)) {
      for (const keyword of info.keywords) {
        if (org.includes(keyword) || isp.includes(keyword)) {
          console.log(`[IP CHECK] Matched Provider: ${provider}`);
          return true;
        }
      }
    }

    // Strictly only allow Malaysian IPs from these providers
    // If you want to allow ANY Malaysian IP, uncomment below:
    /*
    if (country === 'MY') {
      return true;
    }
    */

    return false;
  } catch (error) {
    console.error('IP detection error:', error);
    return false; // Default to BLOCK if error occurs
  }
}

/**
 * Check if IP is private/local
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP is private
 */
function isPrivateIP(ip) {
  const privateRanges = [
    /^127\./, // Loopback
    /^192\.168\./, // Private
    /^10\./, // Private
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private
    /^::1$/, // IPv6 loopback
    /^fc00:/i, // IPv6 private
    /^fe80:/i, // IPv6 link-local
    /^localhost$/i,
  ];

  return privateRanges.some(range => range.test(ip));
}

/**
 * Detects if the request is from a bot/crawler based on User-Agent
 * @param {string} userAgent - User-Agent header
 * @returns {boolean} True if request is from a bot
 */
function isBot(userAgent) {
  if (!userAgent) return true; // Treat empty UA as suspicious
  const botKeywords = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 
    'yandexbot', 'facebot', 'ia_archiver', 'crawler', 'spider', 
    'bot', 'curl', 'wget', 'python', 'axios', 'headless', 'puppeteer', 'playwright'
  ];
  const lowerUA = userAgent.toLowerCase();
  return botKeywords.some(keyword => lowerUA.includes(keyword));
}

module.exports = {
  getClientIP,
  isMalaysianTelecomIP,
  isPrivateIP,
  isBot,
  MALAYSIAN_TELECOM_PROVIDERS,
};
