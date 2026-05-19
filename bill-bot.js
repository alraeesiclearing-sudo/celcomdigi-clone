/**
 * CelcomDigi Bill Payment Bot
 * Uses @sparticuz/chromium + puppeteer-core (works on Render Free tier)
 * Fetches real bill data from get.celcomdigi.com
 */

let chromium, puppeteer;
try {
  chromium = require('@sparticuz/chromium');
  puppeteer = require('puppeteer-core');
} catch(e) {
  try {
    puppeteer = require('puppeteer');
    chromium = null;
  } catch(e2) {
    console.error('No puppeteer available');
  }
}

/**
 * Launch browser with appropriate settings for environment
 */
async function launchBrowser() {
  if (chromium) {
    return await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 800 }
    });
  } else {
    return await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1280, height: 800 }
    });
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch real bill data from get.celcomdigi.com
 */
async function fetchBillData(mobileNumber, useAccountNumber = false) {
  let browser = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://get.celcomdigi.com/bill-payment/en', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('#mobile_number_input, input[wire\\:model="mobileNumber"]', { timeout: 15000 });

    if (useAccountNumber) {
      // Click "Use account number instead" link
      const accountLink = await page.$('a[wire\\:click*="accountType"]') ||
                          await page.$('a[x-on\\:click*="accountType"]');
      if (accountLink) {
        await accountLink.click();
        await sleep(500);
      }
      // Fill account number
      const accountInput = await page.$('input[wire\\:model="accountNumber"]') ||
                           await page.$('#account_number_input');
      if (accountInput) {
        await accountInput.click({ clickCount: 3 });
        await accountInput.type(mobileNumber, { delay: 50 });
      }
    } else {
      // Fill mobile number
      const mobileInput = await page.$('#mobile_number_input') ||
                          await page.$('input[wire\\:model="mobileNumber"]');
      if (mobileInput) {
        await mobileInput.click({ clickCount: 3 });
        await mobileInput.type(mobileNumber, { delay: 50 });

        // Trigger Alpine.js/Livewire update
        await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, '#mobile_number_input');

        await sleep(300);
      }
    }

    // Wait for submit button to be enabled
    await sleep(500);

    // Click submit button
    const submitBtn = await page.$('#submit_button') ||
                      await page.$('button[type="submit"]');

    if (submitBtn) {
      const isDisabled = await page.evaluate(btn => btn.disabled, submitBtn);
      if (!isDisabled) {
        await submitBtn.click();
      } else {
        await page.evaluate(btn => btn.click(), submitBtn);
      }
    }

    // Wait for response
    await sleep(3000);

    // Check for error messages
    const errorMsg = await page.evaluate(() => {
      const errorEls = document.querySelectorAll('.text-error-red, .text-red-500');
      for (const el of errorEls) {
        if (el.textContent.trim()) return el.textContent.trim();
      }
      const allText = document.body.innerText;
      const errorMatch = allText.match(/Please enter[^\n]+/);
      if (errorMatch) return errorMatch[0].trim();
      return null;
    });

    if (errorMsg) {
      return { success: false, error: errorMsg };
    }

    // Check for bill amount in page
    const pageContent = await page.evaluate(() => document.body.innerText);
    const amountMatch = pageContent.match(/RM\s*[\d,]+\.?\d*/g);
    const dueDateMatch = pageContent.match(/Due\s+(?:date|Date)[:\s]+([^\n]+)/);

    if (amountMatch && amountMatch.length > 0) {
      const amounts = [...new Set(amountMatch)];
      return {
        success: true,
        mobileNumber,
        totalAmount: amounts[0],
        allAmounts: amounts,
        dueDate: dueDateMatch ? dueDateMatch[1].trim() : null
      };
    }

    if (pageContent.includes('Amount') || pageContent.includes('payment')) {
      return {
        success: true,
        mobileNumber,
        message: 'Bill information retrieved',
        pageContent: pageContent.substring(0, 300)
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
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
  }
}

/**
 * Validate prepaid mobile number for reload
 */
async function fetchReloadData(mobileNumber) {
  let browser = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://get.celcomdigi.com/reload/en', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('input[wire\\:model="mobileNumber"], #mobile_number_input', { timeout: 15000 });

    const mobileInput = await page.$('input[wire\\:model="mobileNumber"]') ||
                        await page.$('#mobile_number_input');

    if (mobileInput) {
      await mobileInput.click({ clickCount: 3 });
      await mobileInput.type(mobileNumber, { delay: 50 });
      await page.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, mobileInput);
      await sleep(300);
    }

    const submitBtn = await page.$('#submit_button') || await page.$('button[type="submit"]');
    if (submitBtn) {
      await page.evaluate(btn => btn.click(), submitBtn);
    }

    await sleep(3000);

    const pageContent = await page.evaluate(() => document.body.innerText);

    const errorMatch = pageContent.match(/Please enter[^\n]+/);
    if (errorMatch) {
      return { success: false, error: errorMatch[0].trim() };
    }

    if (pageContent.includes('RM') || pageContent.includes('Select') || pageContent.includes('amount')) {
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
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
  }
}

module.exports = { fetchBillData, fetchReloadData };
