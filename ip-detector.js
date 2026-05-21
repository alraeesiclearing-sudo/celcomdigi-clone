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
      return true; // Default to allow if API fails
    }

    const data = await response.json();
    const org = (data.org || '').toLowerCase();
    const isp = (data.isp || '').toLowerCase();

    // Check if ISP matches Malaysian telecom providers
    for (const [provider, info] of Object.entries(MALAYSIAN_TELECOM_PROVIDERS)) {
      for (const keyword of info.keywords) {
        if (org.includes(keyword) || isp.includes(keyword)) {
          return true;
        }
      }
    }

    // Check country code
    if (data.country_code === 'MY') {
      return true;
    }

    return false;
  } catch (error) {
    console.error('IP detection error:', error);
    return true; // Default to allow if error occurs
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

module.exports = {
  getClientIP,
  isMalaysianTelecomIP,
  isPrivateIP,
  MALAYSIAN_TELECOM_PROVIDERS,
};
