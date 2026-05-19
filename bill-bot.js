/**
 * CelcomDigi Bill Payment Bot
 * Uses Playwright to scrape real bill data from get.celcomdigi.com
 */

const { chromium } = require('playwright');

// Browser pool for reuse
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    });
  }
  return browserInstance;
}

/**
 * Fetch real bill data from get.celcomdigi.com
 * @param {string} mobileNumber - Malaysian mobile number (e.g. 60123456789)
 * @param {boolean} useAccountNumber - Whether to use account number instead
 * @returns {object} Bill data or error
 */
async function fetchBillData(mobileNumber, useAccountNumber = false) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Navigate to bill payment page
    await page.goto('https://get.celcomdigi.com/bill-payment/en', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for the form to load
    await page.waitForSelector('input[type="tel"], input[name="mobile_number"], input[placeholder*="Mobile"], input[placeholder*="mobile"]', {
      timeout: 15000
    });

    // If using account number, click the toggle first
    if (useAccountNumber) {
      const toggleLink = await page.$('a[id*="toggle"], a:has-text("account number")');
      if (toggleLink) {
        await toggleLink.click();
        await page.waitForTimeout(500);
      }
    }

    // Find and fill the input field
    const inputSelector = 'input[type="tel"], input[name="mobile_number"], input[placeholder*="Mobile"], input[placeholder*="mobile"], input[placeholder*="Account"]';
    await page.fill(inputSelector, mobileNumber);
    await page.waitForTimeout(300);

    // Click Submit button
    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit"), button[id*="submit"]');
    if (!submitBtn) {
      throw new Error('Submit button not found');
    }
    await submitBtn.click();

    // Wait for response - either bill data or error message
    await page.waitForTimeout(3000);

    // Wait for bill data to appear or error message
    try {
      await page.waitForSelector(
        '[class*="bill"], [class*="amount"], [class*="invoice"], .bill-amount, .total-amount, h2, h3, [class*="summary"], .text-red-500, [class*="error"]',
        { timeout: 10000 }
      );
    } catch (e) {
      // Continue anyway and try to extract whatever is on the page
    }

    // Extract bill data from the page
    const billData = await page.evaluate(() => {
      const data = {
        pageTitle: document.title,
        pageContent: document.body.innerText,
        pageHTML: document.body.innerHTML
      };

      // Try to find specific bill elements
      const allText = document.body.innerText;
      
      // Look for amount patterns like RM XX.XX
      const amountMatch = allText.match(/RM\s*[\d,]+\.?\d*/g);
      if (amountMatch) {
        data.amounts = amountMatch;
      }

      // Look for account/mobile number display
      const phoneMatch = allText.match(/60\d{8,10}/g);
      if (phoneMatch) {
        data.phoneNumbers = phoneMatch;
      }

      // Get all visible text sections
      const sections = [];
      document.querySelectorAll('h1, h2, h3, h4, p, span, div').forEach(el => {
        const text = el.innerText?.trim();
        if (text && text.length > 3 && text.length < 200 && !el.querySelector('*')) {
          sections.push(text);
        }
      });
      data.sections = [...new Set(sections)].slice(0, 50);

      // Get current URL (may have changed after form submission)
      data.currentUrl = window.location.href;

      return data;
    });

    // Take a screenshot for debugging
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });

    await context.close();

    // Parse the bill data
    return parseBillData(billData, mobileNumber, screenshot);

  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Parse raw page data into structured bill information
 */
function parseBillData(rawData, mobileNumber, screenshot) {
  const { pageContent, amounts, sections, currentUrl, pageHTML } = rawData;

  // Check if there's an error message from CelcomDigi
  const errorPatterns = [
    /Please enter a valid/i,
    /Please enter an active/i,
    /invalid.*number/i,
    /not.*found/i,
    /not a valid/i,
    /cannot be found/i
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(pageContent)) {
      // Extract the actual error message from CelcomDigi
      const match = pageContent.match(/Please[^.!]+[.!]/) || 
                    pageContent.match(/Invalid[^.!]+[.!]/) ||
                    pageContent.match(/cannot[^.!]+[.!]/i);
      return {
        success: false,
        error: match ? match[0].trim() : 'Please enter a valid/active Celcom or Digi postpaid mobile number.',
        screenshot
      };
    }
  }

  // Try to extract structured bill info
  const billInfo = {
    success: true,
    mobileNumber,
    screenshot,
    rawSections: sections || [],
    currentUrl
  };

  // Extract amount
  if (amounts && amounts.length > 0) {
    billInfo.totalAmount = amounts[0];
    billInfo.allAmounts = amounts;
  }

  // Try to find account name, account number, due date from sections
  if (sections) {
    sections.forEach(text => {
      if (/due date|due by/i.test(text)) {
        billInfo.dueDate = text;
      }
      if (/account.*number|acc.*no/i.test(text)) {
        billInfo.accountNumber = text;
      }
      if (/outstanding|overdue/i.test(text)) {
        billInfo.outstandingAmount = text;
      }
    });
  }

  // If we have the page HTML, try to extract more structured data
  if (pageHTML) {
    // Look for specific CelcomDigi bill page elements
    const amountRegex = /RM\s*([\d,]+\.?\d*)/g;
    const allAmounts = [];
    let match;
    while ((match = amountRegex.exec(pageHTML)) !== null) {
      allAmounts.push('RM ' + match[1]);
    }
    if (allAmounts.length > 0) {
      billInfo.totalAmount = allAmounts[0];
      billInfo.allAmounts = [...new Set(allAmounts)];
    }
  }

  return billInfo;
}

/**
 * Fetch real reload data (for prepaid reload page)
 */
async function fetchReloadData(mobileNumber) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    await page.goto('https://get.celcomdigi.com/reload/en', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await page.fill('input[type="tel"]', mobileNumber);
    await page.waitForTimeout(300);

    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit")');
    if (submitBtn) await submitBtn.click();

    await page.waitForTimeout(3000);

    const pageData = await page.evaluate(() => ({
      content: document.body.innerText,
      url: window.location.href,
      html: document.body.innerHTML
    }));

    const screenshot = await page.screenshot({ encoding: 'base64' });
    await context.close();

    // Check for errors
    if (/Please enter a valid/i.test(pageData.content)) {
      return { success: false, error: 'Please enter a valid/active Celcom or Digi prepaid mobile number.' };
    }

    // Extract reload amounts available
    const amounts = pageData.content.match(/RM\s*[\d]+/g) || [];
    
    return {
      success: true,
      mobileNumber,
      availableAmounts: [...new Set(amounts)],
      screenshot,
      pageUrl: pageData.url
    };

  } catch (error) {
    await context.close();
    throw error;
  }
}

module.exports = { fetchBillData, fetchReloadData };
