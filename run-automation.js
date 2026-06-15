const puppeteer = require('puppeteer');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const LOGIN_URL = 'http://localhost:3000/login';
const AUTOMATION_URL = 'http://localhost:3000/automation';
const EMAIL = process.env.DASHBOARD_EMAIL;
const PASSWORD = process.env.DASHBOARD_PASSWORD;

// --- IMPORTANT: Replace these with your actual n8n details ---
const N8N_WEBHOOK_URL = 'YOUR_N8N_WEBHOOK_URL'; // e.g., 'https://n8n.yourdomain.com/webhook/1234-5678'
const WHATSAPP_RECIPIENT = 'YOUR_WHATSAPP_NUMBER'; // e.g., 'whatsapp:+14155238886' (use international format)

async function sendToN8n(pdfPath) {
  if (N8N_WEBHOOK_URL === 'YOUR_N8N_WEBHOOK_URL') {
    console.warn('n8n webhook URL is not set. Skipping WhatsApp notification.');
    return;
  }

  console.log(`Sending PDF to n8n workflow at ${N8N_WEBHOOK_URL}...`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(pdfPath));
    form.append('recipient', WHATSAPP_RECIPIENT);

    await axios.post(N8N_WEBHOOK_URL, form, {
      headers: form.getHeaders(),
    });

    console.log('Successfully triggered n8n workflow.');
  } catch (error) {
    console.error('Failed to send data to n8n:', error.message);
  }
}

(async () => {
  let browser;
  let pdfPath = '';

  try {
    if (!EMAIL || !PASSWORD) {
      throw new Error('Set DASHBOARD_EMAIL and DASHBOARD_PASSWORD before running automation.');
    }

    console.log('Launching browser...');
    browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // --- 1. Log in ---
    console.log(`Navigating to login page at ${LOGIN_URL}...`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle0' });
    await page.type('input#email', EMAIL);
    await page.type('input#password', PASSWORD);
    console.log('Submitting login form...');
    await page.click('button[type="submit"]');
    // Wait for the main dashboard heading to appear
    console.log('Waiting for dashboard to load...');
    await page.waitForSelector('h1');
    const heading = await page.$eval('h1', el => el.textContent);

    if (!heading || !heading.includes('Taskforce Command Center')) {
      throw new Error('Login failed. Dashboard heading not found.');
    }

    // --- 2. Run Automation ---
    const downloadPath = 'c:\\downloads';
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
    });

    // Listen for the download event to get the file name
    page.on('response', async (response) => {
        const disposition = response.headers()['content-disposition'];
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filename = disposition.match(/filename="(.+)"/)[1];
            pdfPath = path.join(downloadPath, filename);
            console.log(`PDF downloading as: ${pdfPath}`);
        }
    });

    console.log(`Navigating to automation page at ${AUTOMATION_URL}...`);
    await page.goto(AUTOMATION_URL, { waitUntil: 'networkidle0' });

    console.log('Waiting for automation to complete...');
    await page.waitForFunction(
      'document.body.innerText.includes("PDF Downloaded")',
      { timeout: 300000 } // 5 minute timeout
    );
    console.log('Automation process completed successfully.');

    // Wait a moment for the download to finish writing to disk
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('An error occurred during the automation process:', error.message);
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }

  // --- 3. Trigger n8n Workflow ---
  if (pdfPath && fs.existsSync(pdfPath)) {
    await sendToN8n(pdfPath);
  } else {
    console.error(`PDF file not found at ${pdfPath}. Skipping n8n trigger.`);
  }

  console.log('Script finished.');
})();
