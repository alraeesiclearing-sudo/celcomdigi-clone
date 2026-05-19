/**
 * CelcomDigi Bill Payment Bot
 * Uses Puppeteer to scrape real bill data from get.celcomdigi.com
 * Supports Livewire wire:model inputs
 */

const puppeteer = require('puppeteer');

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--single-process',
        '--disable-extensions'
      ]
    });
  }
  return browserInstance;
}

/**
 * Fill a Livewire input using native value setter
 */
async function fillLivewireInput(page, selector, value) {
  await page.evaluate((sel, val) => {
    const input = document.querySelector(sel);
    if (!input) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

/**
 * Fetch real bill data from get.celcomdigi.com
 */
async function fetchBillData(mobileNumber, useAccountNumber = false) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://get.celcomdigi.com/bill-payment/en', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for Livewire to initialize
    await new Promise(r => setTimeout(r, 3000));

    // If using account number, click toggle
    if (useAccountNumber) {
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button, span, p'));
        const toggle = links.find(el => el.textContent.toLowerCase().includes('account number'));
        if (toggle) toggle.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // Fill the input using native setter (works with Livewire)
    const inputSelector = useAccountNumber ? '#account_number_input' : '#mobile_number_input';
    await fillLivewireInput(page, inputSelector, mobileNumber);
    await new Promise(r => setTimeout(r, 500));

    // Click Submit
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submit = btns.find(b => b.textContent.trim().toLowerCase() === 'submit');
      if (submit) submit.click();
    });

    // Wait for Livewire response
    await new Promise(r => setTimeout(r, 5000));

    // Extract page content
    const pageData = await page.evaluate(() => ({
      content: document.body.innerText,
      html: document.body.innerHTML,
      url: window.location.href
    }));

    // Take screenshot
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
    await page.close();

    return parseBillData(pageData, mobileNumber, screenshot);

  } catch (error) {
    try { await page.close(); } catch(e) {}
    throw error;
  }
}

/**
 * Parse raw page data into structured bill information
 */
function parseBillData(rawData, mobileNumber, screenshot) {
  const { content, html, url } = rawData;

  // Check for error messages from CelcomDigi
  const errorPatterns = [
    /Please enter a valid/i,
    /Please enter an active/i,
    /invalid.*number/i,
    /not.*found/i,
    /not a valid/i,
    /cannot be found/i,
    /not.*registered/i
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(content)) {
      // Extract the actual error message
      const match = content.match(/Please[^.!?]+[.!?]/) || 
                    content.match(/Invalid[^.!?]+[.!?]/) ||
                    content.match(/cannot[^.!?]+[.!?]/i);
      return {
        success: false,
        error: match ? match[0].trim() : 'Please enter a valid/active Celcom or Digi postpaid mobile number.',
        screenshot
      };
    }
  }

  // Extract amounts
  const amountMatches = content.match(/RM\s*[\d,]+\.?\d*/g) || [];
  const allAmounts = [...new Set(amountMatches)];

  // Extract structured info from page sections
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 300);
  
  const billInfo = {
    success: true,
    mobileNumber,
    screenshot,
    rawSections: lines.slice(0, 60),
    currentUrl: url,
    totalAmount: allAmounts[0] || null,
    allAmounts
  };

  // Find specific fields
  lines.forEach(text => {
    if (/due date|due by|payment due/i.test(text)) billInfo.dueDate = text;
    if (/account.*number|acc.*no/i.test(text)) billInfo.accountNumber = text;
    if (/outstanding|overdue/i.test(text)) billInfo.outstandingAmount = text;
    if (/plan|package/i.test(text) && text.length < 50) billInfo.planName = text;
  });

  return billInfo;
}

/**
 * Fetch real reload validation from get.celcomdigi.com
 */
async function fetchReloadData(mobileNumber) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://get.celcomdigi.com/reload/en', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 3000));

    // Fill input
    await fillLivewireInput(page, '#mobile_number_input, input[type="tel"]', mobileNumber);
    await new Promise(r => setTimeout(r, 500));

    // Click submit
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submit = btns.find(b => b.textContent.trim().toLowerCase() === 'submit');
      if (submit) submit.click();
    });

    await new Promise(r => setTimeout(r, 4000));

    const pageData = await page.evaluate(() => ({
      content: document.body.innerText,
      url: window.location.href
    }));

    const screenshot = await page.screenshot({ encoding: 'base64' });
    await page.close();

    // Check for errors
    if (/Please enter a valid/i.test(pageData.content) || /Please enter an active/i.test(pageData.content)) {
      const match = pageData.content.match(/Please[^.!?]+[.!?]/);
      return {
        success: false,
        error: match ? match[0].trim() : 'Please enter a valid/active Celcom or Digi prepaid mobile number.',
        screenshot
      };
    }

    const amounts = pageData.content.match(/RM\s*[\d]+/g) || [];
    
    return {
      success: true,
      mobileNumber,
      availableAmounts: [...new Set(amounts)],
      screenshot,
      pageUrl: pageData.url
    };

  } catch (error) {
    try { await page.close(); } catch(e) {}
    throw error;
  }
}

module.exports = { fetchBillData, fetchReloadData };
