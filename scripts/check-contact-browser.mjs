import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist');
const evidence = process.env.EVIDENCE_DIR || '/private/tmp/deepsurf-email-evidence-20261118';
await mkdir(evidence, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/html' };
let server;
const base = process.env.SITE_URL || await new Promise((done) => {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(root + sep)) throw Error('outside preview');
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`));
});
const paths = ['', 'zh/', 'de/'].flatMap((prefix) => ['support', 'privacy', 'terms'].map((page) => `/${prefix}${page}/`));
paths.push('/deepfollow/support/', '/deepfollow/privacy/', '/rapid-surf-map/venues/wai-kai/', '/de/rapid-surf-map/venues/wellenwerk-berlin/');
const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {});
const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const errors = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of paths) {
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, path);
      const button = page.locator('button.contact-email').first();
      await button.waitFor();
      assert.match(await button.textContent(), / \[at\] .* \[dot\] /);
      assert.doesNotMatch(await page.content(), emailPattern, path);
      await button.focus();
      assert.equal(await button.evaluate((element) => element === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, path);
      if (path === '/zh/support/' || path === '/deepfollow/support/') {
        await button.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${evidence}/${path.includes('deepfollow') ? 'deepfollow' : 'zh'}-${width}.png` });
      }
    }
    // Observe the real browser navigation without launching a user's mail client.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const requested = new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(Error('No email navigation after keyboard activation')), 5000);
      cdp.on('Page.frameRequestedNavigation', (event) => {
        if (event.url.startsWith('mailto:')) { clearTimeout(timeout); done(event.url); }
      });
    });
    await page.locator('button.contact-email').first().press('Enter');
    const destination = await requested;
    assert.equal(destination, 'mailto:' + ['info', 'wellenwerk-berlin.de'].join(String.fromCharCode(64)));
    assert.doesNotMatch(await page.content(), emailPattern);
    await page.close();
    console.log(`PASS contact controls, labels, keyboard email navigation and layout at ${width}px`);
  }
  const plain = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  for (const path of paths) {
    await plain.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert.match(await plain.locator('[data-contact-email]').first().textContent(), / \[at\] .* \[dot\] /);
    assert.doesNotMatch(await plain.content(), emailPattern);
  }
  await plain.close();
  assert.deepEqual(errors, []);
  console.log('PASS no-JavaScript readability and no standard email in rendered DOM');
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
