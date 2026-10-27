/**
 * Captures mobile screenshots of the running app into screenshots/.
 * Usage: CHROME_PATH=/usr/bin/chromium BASE=http://localhost:8787 npx tsx scripts/screenshots.ts [phase]
 * Optional: BUYER_EMAIL=<sandbox buyer email> (defaults to buyer@example.com)
 * phase: chat | pages | all (default all)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:8787';
const phase = process.argv[2] || 'all';
const BUYER_EMAIL = process.env.BUYER_EMAIL || 'buyer@example.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  headless: 'shell',
  userDataDir: process.env.PROFILE_DIR || '/tmp/sellerpilot-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROME_PROXY ? [`--proxy-server=${process.env.CHROME_PROXY}`] : [])],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const shot = async (name: string, full = false) => {
  await sleep(400);
  if (full) {
    // grow the viewport instead of fullPage so sticky header / tab bar render in the right place
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: 390, height: Math.min(h, 2600), deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
  }
  await page.screenshot({ path: `screenshots/${name}.png` });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  console.log('saved', name);
};

async function send(text: string, waitMs = 15000) {
  await page.type('.composer textarea', text, { delay: 0 });
  const before = await page.$$eval('.msg.assistant', (e) => e.length);
  await page.click('.composer button');
  await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bubble:not(.typing)').length > n, { timeout: waitMs }, before);
  await sleep(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

if (phase === 'chat' || phase === 'all') {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await shot('01-copilot-empty');
  await send('Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock. Delivery within Lagos 1-2 days, nationwide 3-5 days');
  await shot('02-copilot-listing', true);
  await send('Send a payment link for 2 tote bags', 30000);
  await send('Customer asked: "abeg how much e be, una dey deliver to Abuja?"');
  await shot('03-copilot-paylink-reply', true);
}
if (phase === 'invoice' || phase === 'all') {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await send(`Invoice Chioma Okafor ${BUYER_EMAIL} for 2 tote bags`, 60000);
  await page.evaluate(() => { const els = document.querySelectorAll('.msg'); els[els.length - 2]?.scrollIntoView(); });
  await shot('04-copilot-invoice');
}
if (phase === 'paid' && process.env.PAID_PATH) {
  await page.goto(BASE + process.env.PAID_PATH, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.success h2');
  await sleep(1500);
  await shot('09-paid-confirmation');
}
if (phase === 'pages' || phase === 'all') {
  if (process.env.SEED) await fetch(BASE + '/api/demo/seed', { method: 'POST' });
  await page.goto(BASE + '/products', { waitUntil: 'networkidle0' });
  await page.click('.product .plain');
  await sleep(800);
  await shot('05-products');
  const slug = await page.evaluate(async () => (await (await fetch('/api/products')).json()).find((p: any) => !p.sample)?.slug);
  await page.goto(`${BASE}/p/${slug}`, { waitUntil: 'networkidle2' });
  await sleep(4000);
  await page.type('.ask input', 'Do you deliver to Abuja?');
  await page.click('.ask button');
  await sleep(1200);
  await shot('06-storefront-buyer', true);
  await page.goto(BASE + '/sales', { waitUntil: 'networkidle0' });
  await shot('07-sales-dashboard', true);
  await page.goto(BASE + '/about', { waitUntil: 'networkidle0' });
  await shot('08-about', true);
}
await browser.close();
