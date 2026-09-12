import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600)));
await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
console.log('__TF:', await page.evaluate(() => typeof window.__TF));
console.log('canvas:', await page.evaluate(() => document.querySelectorAll('canvas').length));
await page.screenshot({ path: 'qa/shots/debug.png' });
await browser.close();
