/**
 * CelcomDigi Bill Payment Bot
 * Uses playwright-chromium with browser pool (stays open) for fast response
 * Fetches real bill data from get.celcomdigi.com
 */
const { chromium } = require('playwright-chromium');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Minimal browser args to reduce memory usage on Render Starter (512MB)
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--disable-images',
  '--blink-settings=imagesEnabled=false',
  '--js-flags=--max-old-space-size=256',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process',
  '--memory-pressure-off',
];

// Browser pool - keep browser open between requests
let browserInstance = null;
let browserLaunchTime = null;
const BROWSER_MAX_AGE = 10 * 60 * 1000; // 10 minutes

async function getBrowser() {
  const now = Date.now();
  // Reuse browser if it's less than 10 minutes old
  if (browserInstance && browserLaunchTime && (now - browserLaunchTime) < BROWSER_MAX_AGE) {
    try {
      // Test if browser is still alive
      const pages = await browserInstance.pages();
      console.log('[Bot] Reusing existing browser, pages:', pages.length);
      return browserInstance;
    } catch (e) {
      console.log('[Bot] Browser died, launching new one');
      browserInstance = null;
    }
  }

  console.log('[Bot] Launching new playwright-chromium browser...');
  browserInstance = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
  });
  browserLaunchTime = now;
  console.log('[Bot] Browser launched successfully');
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch(e) {}
    browserInstance = null;
    browserLaunchTime = null;
  }
}

/**
 * Fetch real bill data from get.celcomdigi.com
 * @param {string} mobileNumber - Malaysian mobile number (e.g., 60123456789)
 * @param {boolean} useAccountNumber - Whether to use account number instead
 * @returns {object} - { success, data } or { success: false, error }
 */
async function fetchBillData(mobileNumber, useAccountNumber = false) {
  let page = null;
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 390, height: 844 },
    });

    // Block unnecessary resources to speed up loading
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot}', route => route.abort());
    await context.route('**/analytics**', route => route.abort());
    await context.route('**/gtag**', route => route.abort());
    await context.route('**/google-analytics**', route => route.abort());
    await context.route('**/facebook**', route => route.abort());
    await context.route('**/hotjar**', route => route.abort());

    page = await context.newPage();
    page.setDefaultTimeout(30000);

    console.log('[Bill Bot] Navigating to bill payment page...');
    await page.goto('https://get.celcomdigi.com/bill-payment/en', {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });

    // Wait for the form to be ready - wait for visible text input
    await page.waitForSelector('input:not([type="hidden"]):not([type="submit"])', { timeout: 15000, state: 'visible' });
    await sleep(1500);

    console.log('[Bill Bot] Form ready, entering number...');

    // Handle account number toggle
    if (useAccountNumber) {
      try {
        await page.click('text=Use account number instead');
        await sleep(500);
      } catch (e) {}
    }

    // Find input field
    const selectors = [
      'input[wire\\:model="mobileNumber"]',
      'input[wire\\:model]',
      'input[type="tel"]',
      'input[placeholder*="number" i]',
      'input[placeholder*="mobile" i]',
      'input:not([type="hidden"]):not([type="submit"])',
    ];

    let foundSelector = null;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) { foundSelector = sel; break; }
      } catch (e) {}
    }

    if (!foundSelector) throw new Error('Input field not found');

    // Clear and type the number
    await page.click(foundSelector, { clickCount: 3 });
    await page.fill(foundSelector, '');
    await sleep(200);
    await page.type(foundSelector, mobileNumber, { delay: 40 });

    // Trigger Livewire/Alpine.js events
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
      }
    }, foundSelector);

    await sleep(600);

    // Click Submit
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Submit")',
      '#submit_button',
    ];

    for (const btnSel of submitSelectors) {
      try {
        const btn = await page.$(btnSel);
        if (btn) {
          await page.evaluate((sel) => {
            const b = document.querySelector(sel);
            if (b) { b.removeAttribute('disabled'); b.click(); }
          }, btnSel);
          console.log('[Bill Bot] Submit clicked');
          break;
        }
      } catch (e) {}
    }

    // Wait for response
    await sleep(4000);

    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('[Bill Bot] Page text (first 500):', pageText.substring(0, 500));

    await context.close();
    return parseBillData(pageText, mobileNumber);

  } catch (error) {
    console.error('[Bill Bot] Error:', error.message);
    if (context) {
      try { await context.close(); } catch(e) {}
    }
    // If browser crashed, reset it
    if (error.message.includes('Target closed') || error.message.includes('Browser closed') ||
        error.message.includes('Connection closed')) {
      browserInstance = null;
      browserLaunchTime = null;
    }
    return {
      success: false,
      error: 'Unable to fetch bill data. Please try again later.'
    };
  }
}

/**
 * Parse bill data from page text
 */
function parseBillData(pageText, mobileNumber) {
  // Check for error messages from CelcomDigi
  const errorPatterns = [
    /Please enter an active Celcom or Digi postpaid mobile number[^.]*\./i,
    /Please enter a valid[^.]*mobile number[^.]*\./i,
    /Please enter[^.]+\./i,
    /invalid.*number/i,
    /number.*not found/i,
    /not a valid/i,
    /unable to process/i,
  ];

  for (const pattern of errorPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      return {
        success: false,
        error: match[0].trim()
      };
    }
  }

  // Check for bill amount
  const amountMatch = pageText.match(/RM\s*([\d,]+\.?\d*)/i) ||
                      pageText.match(/Total.*?RM\s*([\d,]+\.?\d*)/i) ||
                      pageText.match(/Amount.*?RM\s*([\d,]+\.?\d*)/i) ||
                      pageText.match(/Outstanding.*?RM\s*([\d,]+\.?\d*)/i);

  if (amountMatch) {
    const amount = amountMatch[1];
    const dueDateMatch = pageText.match(/due.*?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4})/i) ||
                         pageText.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
    const accountMatch = pageText.match(/account.*?(\d{10,15})/i);

    return {
      success: true,
      data: {
        mobileNumber: mobileNumber,
        amount: `RM ${amount}`,
        dueDate: dueDateMatch ? dueDateMatch[1] : null,
        accountNumber: accountMatch ? accountMatch[1] : null,
        rawText: pageText.substring(0, 1000)
      }
    };
  }

  // Check for success without amount (showing payment options)
  if (pageText.includes('Pay Now') || pageText.includes('Payment Method') ||
      pageText.includes('Select Amount') || pageText.includes('Proceed')) {
    return {
      success: true,
      data: {
        mobileNumber: mobileNumber,
        amount: null,
        message: 'Bill found - proceed to payment',
        rawText: pageText.substring(0, 1000)
      }
    };
  }

  // Unknown state
  return {
    success: false,
    error: 'Unable to retrieve bill information. Please check your number and try again.',
    debug: pageText.substring(0, 300)
  };
}

/**
 * Fetch reload data from get.celcomdigi.com
 */
async function fetchReloadData(mobileNumber) {
  let page = null;
  let context = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 390, height: 844 },
    });

    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot}', route => route.abort());
    await context.route('**/analytics**', route => route.abort());

    page = await context.newPage();
    page.setDefaultTimeout(30000);

    console.log('[Reload Bot] Navigating to reload page...');
    await page.goto('https://get.celcomdigi.com/reload/en', {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });

    await page.waitForSelector('input:not([type="hidden"]):not([type="submit"])', { timeout: 15000, state: 'visible' });
    await sleep(1500);

    const selectors = [
      'input[wire\\:model="mobileNumber"]',
      'input[wire\\:model]',
      'input[type="tel"]',
      'input:not([type="hidden"]):not([type="submit"])',
    ];

    let foundSelector = null;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) { foundSelector = sel; break; }
      } catch (e) {}
    }

    if (!foundSelector) throw new Error('Input field not found');

    await page.click(foundSelector, { clickCount: 3 });
    await page.fill(foundSelector, '');
    await sleep(200);
    await page.type(foundSelector, mobileNumber, { delay: 40 });

    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, foundSelector);

    await sleep(600);

    const submitSelectors = ['button[type="submit"]', 'button:has-text("Submit")'];
    for (const btnSel of submitSelectors) {
      try {
        const btn = await page.$(btnSel);
        if (btn) {
          await page.evaluate((sel) => {
            const b = document.querySelector(sel);
            if (b) { b.removeAttribute('disabled'); b.click(); }
          }, btnSel);
          break;
        }
      } catch (e) {}
    }

    await sleep(4000);

    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('[Reload Bot] Page text (first 300):', pageText.substring(0, 300));

    await context.close();
    return parseReloadData(pageText, mobileNumber);

  } catch (error) {
    console.error('[Reload Bot] Error:', error.message);
    if (context) {
      try { await context.close(); } catch(e) {}
    }
    if (error.message.includes('Target closed') || error.message.includes('Browser closed') ||
        error.message.includes('Connection closed')) {
      browserInstance = null;
      browserLaunchTime = null;
    }
    return {
      success: false,
      error: 'Unable to check reload. Please try again later.'
    };
  }
}

function parseReloadData(pageText, mobileNumber) {
  const errorPatterns = [
    /Please enter a valid.*active.*Celcom or Digi prepaid[^.]*\./i,
    /Please enter a valid[^.]*mobile number[^.]*\./i,
    /Please enter[^.]+\./i,
    /invalid.*number/i,
    /not a valid/i,
  ];

  for (const pattern of errorPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      return {
        success: false,
        error: match[0].trim()
      };
    }
  }

  if (pageText.includes('RM5') || pageText.includes('RM10') || pageText.includes('Select Amount') ||
      pageText.includes('Reload Amount') || pageText.includes('Choose Amount')) {
    return {
      success: true,
      data: {
        mobileNumber: mobileNumber,
        message: 'Valid prepaid number - proceed to select reload amount',
        amounts: ['RM5', 'RM10', 'RM20', 'RM30', 'RM50', 'RM100']
      }
    };
  }

  return {
    success: false,
    error: 'Unable to verify mobile number. Please try again.',
    debug: pageText.substring(0, 300)
  };
}

// Graceful shutdown
process.on('SIGTERM', async () => { await closeBrowser(); });
process.on('SIGINT', async () => { await closeBrowser(); });

module.exports = { fetchBillData, fetchReloadData, closeBrowser };
