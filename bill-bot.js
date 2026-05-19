/**
 * CelcomDigi Bill Payment Bot
 * Uses playwright-chromium (lighter than puppeteer) for Render Starter (512MB)
 * Fetches real bill data from get.celcomdigi.com
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Minimal browser args to reduce memory usage
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
  '--js-flags=--max-old-space-size=200',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process',
];

async function launchBrowser() {
  // Try playwright-chromium first (lighter)
  try {
    const { chromium } = require('playwright-chromium');
    const browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });
    console.log('[Bot] Using playwright-chromium');
    return { browser, type: 'playwright' };
  } catch (e) {
    console.log('[Bot] playwright-chromium not available, trying puppeteer...');
  }

  // Fallback to puppeteer
  try {
    const puppeteer = require('puppeteer');
    const fs = require('fs');
    const possiblePaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ];
    let executablePath;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) { executablePath = p; break; }
    }
    const options = { headless: 'new', args: BROWSER_ARGS };
    if (executablePath) options.executablePath = executablePath;
    const browser = await puppeteer.launch(options);
    console.log('[Bot] Using puppeteer');
    return { browser, type: 'puppeteer' };
  } catch (e) {
    throw new Error('No browser available: ' + e.message);
  }
}

async function getPage(browser, type) {
  if (type === 'playwright') {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 390, height: 844 },
    });
    // Block images and fonts to save memory
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,otf,eot}', r => r.abort());
    return { page: await context.newPage(), context };
  } else {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    return { page, context: null };
  }
}

async function fillAndSubmit(page, type, selector, value) {
  // Wait for input
  if (type === 'playwright') {
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value, { delay: 30 });
    await page.evaluate(({ sel }) => {
      const el = document.querySelector(sel);
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { sel: selector });
  } else {
    await page.waitForSelector(selector, { timeout: 15000 });
    const el = await page.$(selector);
    await el.click({ clickCount: 3 });
    await el.type(value, { delay: 30 });
      await page.evaluate(({ sel }) => {
            const el = document.querySelector(sel);
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { sel: selector });
  }

  await sleep(800);

  // Click submit
    const submitSelectors = ['button[type="submit"]', '#submit_button', 'button.btn-primary'];
    for (const btnSel of submitSelectors) {
      try {
        if (type === 'playwright') {
          const btn = await page.$(btnSel);
          if (btn) {
            await page.evaluate(({ sel }) => {
              const b = document.querySelector(sel);
              if (b) { b.removeAttribute('disabled'); b.click(); }
            }, { sel: btnSel });
            break;
          }
      } else {
        const btn = await page.$(btnSel);
        if (btn) {
          await page.evaluate(b => { b.removeAttribute('disabled'); b.click(); }, btn);
          break;
        }
      }
    } catch (e) {}
  }
}

async function getPageText(page, type) {
  if (type === 'playwright') {
    return await page.evaluate(() => document.body.innerText);
  } else {
    return await page.evaluate(() => document.body.innerText);
  }
}

/**
 * Fetch real bill data from get.celcomdigi.com
 */
async function fetchBillData(mobileNumber, useAccountNumber = false) {
  let browserObj = null;
  try {
    browserObj = await launchBrowser();
    const { browser, type } = browserObj;
    const { page } = await getPage(browser, type);

    console.log('[Bill Bot] Navigating to bill payment page...');
    if (type === 'playwright') {
      await page.goto('https://get.celcomdigi.com/bill-payment/en', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } else {
      await page.goto('https://get.celcomdigi.com/bill-payment/en', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }

    await sleep(2000);

    // Find the correct input
    let inputSelector = 'input[wire\\:model="mobileNumber"]';
    if (useAccountNumber) {
      // Try to click "Use account number instead"
      try {
        if (type === 'playwright') {
          await page.click('text=Use account number instead');
        } else {
          await page.evaluate(() => {
            const links = document.querySelectorAll('a, button');
            for (const l of links) {
              if (l.textContent.includes('account number')) { l.click(); break; }
            }
          });
        }
        await sleep(500);
        inputSelector = 'input[wire\\:model="accountNumber"]';
      } catch (e) {}
    }

    // Try multiple selectors
    const selectors = [
      inputSelector,
      'input[wire\\:model]',
      'input[type="tel"]',
      'input[placeholder*="mobile"]',
      'input[placeholder*="number"]',
      'input[placeholder*="60"]',
      'input:not([type="hidden"])',
    ];

    let foundSelector = null;
    for (const sel of selectors) {
      try {
        if (type === 'playwright') {
          const el = await page.$(sel);
          if (el) { foundSelector = sel; break; }
        } else {
          const el = await page.$(sel);
          if (el) { foundSelector = sel; break; }
        }
      } catch (e) {}
    }

    if (!foundSelector) throw new Error('Could not find input field');

    await fillAndSubmit(page, type, foundSelector, mobileNumber);

    // Wait for response
    await sleep(4000);

    const text = await getPageText(page, type);
    console.log('[Bill Bot] Page text (first 300):', text.substring(0, 300));

    // Check for error messages
    const errorPatterns = [
      /Please enter[^\n.]+/i,
      /Invalid[^\n.]+number/i,
      /not found[^\n.]+/i,
      /does not exist[^\n.]+/i,
      /active Celcom[^\n.]+/i,
    ];

    for (const pattern of errorPatterns) {
      const match = text.match(pattern);
      if (match) {
        return { success: false, error: match[0].trim() };
      }
    }

    // Check for bill amount
    const amountMatches = text.match(/RM\s*[\d,]+\.?\d*/g);
    const dueDateMatch = text.match(/Due\s+(?:date|Date|on)[:\s]+([^\n]+)/i) ||
                         text.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
    const accountMatch = text.match(/Account[:\s]+([^\n]+)/i);

    if (amountMatches && amountMatches.length > 0) {
      const amounts = [...new Set(amountMatches)];
      return {
        success: true,
        mobileNumber,
        totalAmount: amounts[0],
        allAmounts: amounts,
        dueDate: dueDateMatch ? dueDateMatch[1].trim() : null,
        account: accountMatch ? accountMatch[1].trim() : null,
      };
    }

    // Check if we moved to step 2
    if (text.includes('Select amount') || text.includes('Payment amount') || text.includes('Proceed to pay')) {
      return {
        success: true,
        mobileNumber,
        message: 'Mobile number validated. Ready for payment.',
      };
    }

    return {
      success: false,
      error: 'Unable to retrieve bill information. Please check your mobile number and try again.'
    };

  } catch (error) {
    console.error('[Bill Bot] Error:', error.message);
    throw error;
  } finally {
    if (browserObj && browserObj.browser) {
      try { await browserObj.browser.close(); } catch (e) {}
    }
  }
}

/**
 * Validate prepaid mobile number for reload
 */
async function fetchReloadData(mobileNumber) {
  let browserObj = null;
  try {
    browserObj = await launchBrowser();
    const { browser, type } = browserObj;
    const { page } = await getPage(browser, type);

    console.log('[Reload Bot] Navigating to reload page...');
    await page.goto('https://get.celcomdigi.com/reload/en', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await sleep(2000);

    const selectors = [
      'input[wire\\:model="mobileNumber"]',
      'input[wire\\:model]',
      'input[type="tel"]',
      'input:not([type="hidden"])',
    ];

    let foundSelector = null;
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) { foundSelector = sel; break; }
    }

    if (!foundSelector) throw new Error('Could not find input field');

    await fillAndSubmit(page, type, foundSelector, mobileNumber);
    await sleep(4000);

    const text = await getPageText(page, type);

    const errorMatch = text.match(/Please enter[^\n.]+/i) ||
                       text.match(/valid[^\n.]+number/i);
    if (errorMatch) {
      return { success: false, error: errorMatch[0].trim() };
    }

    if (text.includes('RM') || text.includes('Select') || text.includes('amount')) {
      return {
        success: true,
        mobileNumber,
        message: 'Mobile number validated. Proceed to amount selection.'
      };
    }

    return {
      success: false,
      error: 'Please enter a valid/active Celcom or Digi prepaid mobile number.'
    };

  } catch (error) {
    throw error;
  } finally {
    if (browserObj && browserObj.browser) {
      try { await browserObj.browser.close(); } catch (e) {}
    }
  }
}

module.exports = { fetchBillData, fetchReloadData };
