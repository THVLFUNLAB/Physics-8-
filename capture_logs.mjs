import { webkit } from 'playwright';

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));

  await page.goto('http://localhost:3000', { waitUntil: 'load' });
  
  // wait a bit for react to render and crash
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
