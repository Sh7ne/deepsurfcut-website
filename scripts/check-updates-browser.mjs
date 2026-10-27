import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = JSON.parse(await readFile(resolve(root, 'content/releases.json'), 'utf8'));
const publicRoot = resolve(root, 'dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' };
let server;
const base = process.env.SITE_URL || await new Promise((done) => {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(publicRoot, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(publicRoot + sep)) throw new Error('outside preview');
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`));
});
const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {});
const errors = [];
try {
  for (const width of [1440, 390]) for (const prefix of ['/', '/zh/', '/de/']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    for (const platform of ['ios', 'macos']) {
      const release = data.platforms[platform][0];
      await page.goto(`${base}${prefix}updates/?sync=${process.env.SYNC_COMMIT || 'preview'}#${platform}-${release.version}`, { waitUntil: 'domcontentloaded' });
      const article = page.locator(`[id="${platform}-${release.version}"]`);
      await page.locator(`#tab-${platform}[aria-selected="true"]`).waitFor();
      assert.ok(await article.isVisible());
      assert.equal(await article.locator('time').getAttribute('datetime'), release.releasedAt);
      assert.equal(await article.locator('.release-content li').count(), release.notes.length);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      for (const link of await page.locator('header [data-updates-language]').all()) assert.ok((await link.getAttribute('href')).endsWith(`#${platform}-${release.version}`));
      const language = await page.locator('header [data-updates-language]').filter({ hasText: prefix === '/de/' ? 'English' : 'Deutsch' }).getAttribute('href');
      await page.goto(new URL(language, base).href, { waitUntil: 'domcontentloaded' });
      await page.locator(`#tab-${platform}[aria-selected="true"]`).waitFor();
      assert.ok(await page.locator(`[id="${platform}-${release.version}"]`).isVisible());
      await page.locator('#tab-ios').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#tab-macos').getAttribute('aria-selected'), 'true');
    }
    await page.close();
    console.log(`PASS updates: ${prefix} at ${width}px`);
  }
  const plain = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  for (const prefix of ['/', '/zh/', '/de/']) {
    await plain.goto(`${base}${prefix}updates/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await plain.locator('.release:visible').count(), Object.values(data.platforms).reduce((count, entries) => count + entries.length, 0));
  }
  await plain.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
