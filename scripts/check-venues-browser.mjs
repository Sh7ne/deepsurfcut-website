import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'dist');
const mapPath = '/RapidSurfingMap';
const data = JSON.parse(await readFile(resolve(root, 'content/venues.json'), 'utf8'));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const headerRules = (await readFile(resolve(publicRoot, '_headers'), 'utf8')).split(/\r?\n/).reduce((rules, line) => {
  if (!line.trim() || line.trim().startsWith('#')) return rules;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
  else rules.at(-1)?.headers.push(line.trim());
  return rules;
}, []);
let server;
const base = process.env.SITE_URL || await new Promise((done, reject) => {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(publicRoot, '.' + (path === mapPath ? `${path}.html` : path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(publicRoot + sep)) throw new Error('outside preview');
      for (const rule of headerRules) {
        if (!rule.path.startsWith('/')) continue;
        const matches = rule.path.endsWith('*') ? path.startsWith(rule.path.slice(0, -1)) : path === rule.path;
        if (!matches) continue;
        for (const header of rule.headers) {
          if (header.startsWith('! ')) { response.removeHeader(header.slice(2)); continue; }
          const separator = header.indexOf(':');
          if (separator > 0) response.setHeader(header.slice(0, separator), header.slice(separator + 1).trim());
        }
      }
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end('Not found'); }
  });
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${server.address().port}`));
});

let executablePath = process.env.BROWSER_PATH;
if (!executablePath && process.platform === 'darwin') {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await access(chrome); executablePath = chrome; } catch { /* Fall back to installed Playwright Chromium. */ }
}
let browser;
try { browser = await chromium.launch(executablePath ? { executablePath } : {}); }
catch (error) {
  if (server) await new Promise((done) => server.close(done));
  throw error;
}
const errors = [], unexpectedRequests = [];
// Deterministic rendering tests do not repeatedly download public map tiles.
// A separate case below exercises a failed tile request and successful retry.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZk0AAAAASUVORK5CYII=', 'base64');
const tiles = 'https://tile.openstreetmap.org/**';
const fulfillTile = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
const count = async (page, expected) => {
  await page.waitForFunction((n) => document.getElementById('result-count')?.textContent === String(n), expected);
  assert.equal(await page.locator('.venue-card:not([hidden])').count(), expected);
};
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `horizontal overflow at ${page.url()}`);
const ready = async (page, path = mapPath) => {
  await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('html.enhanced').waitFor();
  await page.locator('.surf-marker').first().waitFor();
};
const newContext = async (options = {}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`)));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin) {
      if (url.pathname === '/api/maps/config') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        baidu: { enabled: false, ak: '' }, amap: { enabled: false, key: '', serviceHost: '/api/maps/amap/_AMapService' },
      }) });
      return route.continue();
    }
    unexpectedRequests.push(url.origin + url.pathname);
    return route.abort();
  });
  await context.route(tiles, fulfillTile);
  return context;
};

try {
  for (const width of [390, 1440]) {
    const context = await newContext({ viewport: { width, height: width < 768 ? 844 : 1000 } });
    const page = await context.newPage();
    await page.goto(new URL('/zh/', base).href, { waitUntil: 'domcontentloaded' });
    const footerEntry = page.locator(`.site-footer a[href="${mapPath}"]`);
    assert.equal(await footerEntry.count(), 1);
    await footerEntry.click();
    await page.waitForURL((url) => url.pathname === mapPath && !url.hash);
    await page.locator('html.enhanced').waitFor();
    await page.locator('.surf-marker').first().waitFor();
    await count(page, 11);
    await noOverflow(page);
    assert.ok(await page.locator('.map-attribution a[href="https://www.openstreetmap.org/copyright"]').isVisible());

    await page.locator('[data-view="list"]').click();
    await page.locator('#city-filters [data-city="北京"]').click();
    await count(page, 3);
    await page.locator('#city-filters [data-city="all"]').click();
    await page.locator('#search').fill('TOSWIM');
    await count(page, 1);
    assert.equal(await page.locator('.venue-card:not([hidden])').getAttribute('data-id'), 'surfpark-fengtai');
    await page.locator('#search').fill('no-such-venue-999');
    await count(page, 0);
    assert.ok(await page.locator('#empty-state').isVisible());
    await page.locator('#reset-filters').click();
    await count(page, 11);

    await page.locator('#filter-open').click();
    await page.locator('.environment-options label').filter({ has: page.locator('[value="outdoor"]') }).click();
    await page.locator('.switch-row').click();
    await page.locator('#filter-apply').click();
    await count(page, 3);
    await page.locator('#filter-open').click();
    await page.locator('#filter-reset').click();
    await page.locator('.environment-options label').filter({ has: page.locator('[value="indoor"]') }).click();
    await page.locator('#filter-apply').click();
    await count(page, 8);
    await page.locator('#filter-open').click();
    await page.locator('#filter-reset').click();
    await page.locator('#filter-apply').click();
    await count(page, 11);

    await page.locator('[data-open="back-to-sea"]').click();
    await page.locator('#venue-detail[open]').waitFor();
    assert.match(await page.locator('#detail-title').textContent(), /有浪岛/);
    assert.equal(new URL(page.url()).hash, '#venue-back-to-sea');
    assert.equal(await page.locator('.navigation-links a').count(), 3);
    const baiduNavigation = new URL(await page.locator('.navigation-links a').first().getAttribute('href'));
    assert.equal(baiduNavigation.hostname, 'api.map.baidu.com');
    assert.equal(baiduNavigation.searchParams.get('coord_type'), 'wgs84');
    const amapNavigation = new URL(await page.locator('.navigation-links a[href^="https://uri.amap.com/"]').getAttribute('href'));
    assert.equal(amapNavigation.hostname, 'uri.amap.com');
    assert.equal(amapNavigation.searchParams.get('coordinate'), 'wgs84');
    assert.equal(await page.locator('[data-map-language], .language-menu, .detail-languages').count(), 0);
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await page.locator('#venue-detail[open]').waitFor({ state: 'hidden' });
    await page.waitForURL((url) => url.hash === '');
    assert.equal(new URL(page.url()).hash, '');
    await ready(page, `${mapPath}#venue-hala-huzhou`);
    await page.locator('#venue-detail[open]').waitFor();
    assert.match(await page.locator('#detail-title').textContent(), /哈啦/);
    const baiduSearch = new URL(await page.locator('.navigation-links a').first().getAttribute('href'));
    assert.equal(baiduSearch.hostname, 'api.map.baidu.com');
    assert.equal(baiduSearch.pathname, '/place/search');
    const amapSearch = new URL(await page.locator('.navigation-links a[href^="https://uri.amap.com/"]').getAttribute('href'));
    assert.equal(amapSearch.hostname, 'uri.amap.com');
    assert.equal(amapSearch.pathname, '/search');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#venue-detail[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-view="list"]').click();
    await page.locator('[data-open="back-to-sea"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#venue-detail[open]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-open="back-to-sea"]').evaluate((node) => node === document.activeElement), true, 'closing detail restores keyboard focus');
    await context.close();
    console.log(`PASS Chinese footer entry, map search, city/setting filters, details, keyboard, deep links: ${width}px`);
  }

  for (const reducedMotion of ['reduce', 'no-preference']) {
    const interaction = await newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
    const phone = await interaction.newPage();
    await phone.goto(new URL('/zh/', base).href);
    await ready(phone);
    await phone.locator('#sheet-handle').click();
    assert.equal(await phone.locator('#explore-sheet').getAttribute('data-snap'), 'full');
    await phone.locator('.sheet-header h2').click();
    assert.equal(await phone.locator('#explore-sheet').getAttribute('data-snap'), 'full', 'ordinary clicks do not switch tabs');
    await phone.locator('.tab-bar [data-view="map"]').click();
    await phone.locator('#search').click();
    assert.equal(await phone.locator('#explore-sheet').getAttribute('data-snap'), 'full', 'search keeps the list expanded');
    await phone.locator('#city-filters [data-city="北京"]').click();
    await count(phone, 3);
    assert.equal(await phone.locator('#explore-sheet').getAttribute('data-snap'), 'full', 'city filtering preserves the panel position');

    for (const selector of ['#sheet-handle', '#about-open', '#map-provider', '#filter-open', '#locate', '#fit-map', '.venue-card:not([hidden]) .save-button', '.chip']) {
      const size = await phone.locator(selector).first().boundingBox();
      assert.ok(size && size.width >= 44 && size.height >= 44, `${selector}: touch target is at least 44px`);
    }
    await phone.locator('[data-open="back-to-sea"]').click();
    await phone.locator('#show-on-map').click();
    await phone.waitForURL((url) => url.hash === '');
    await phone.waitForFunction(() => {
      const pin = document.querySelector('[data-marker-venue="back-to-sea"].selected')?.getBoundingClientRect();
      const sheet = document.getElementById('explore-sheet').getBoundingClientRect();
      const header = document.querySelector('.app-header').getBoundingClientRect();
      return pin && pin.top > header.bottom && pin.bottom < sheet.top && pin.left >= 0 && pin.right <= innerWidth;
    });
    assert.equal(await phone.locator('#venue-back-to-sea').getAttribute('aria-current'), 'location');
    assert.equal(await phone.locator('#explore-sheet').getAttribute('data-snap'), 'half');

    const pin = phone.locator('[data-marker-venue="back-to-sea"]');
    await pin.focus();
    await phone.keyboard.press('Enter');
    await phone.locator('#venue-detail[open]').waitFor();
    await phone.keyboard.press('Escape');
    await phone.waitForURL((url) => url.hash === '');
    assert.ok(await pin.evaluate((node) => node === document.activeElement), 'closing a marker detail restores focus to its replacement pin');

    await pin.press('Space');
    await phone.locator('#venue-detail[open]').waitFor();
    await phone.goBack();
    await phone.locator('#venue-detail[open]').waitFor({ state: 'hidden' });
    await phone.goForward();
    await phone.locator('#venue-detail[open]').waitFor();
    assert.match(await phone.locator('#detail-title').textContent(), /有浪岛/);
    await phone.keyboard.press('Escape');
    await phone.waitForURL((url) => url.hash === '');
    await phone.goBack();
    assert.equal(new URL(phone.url()).pathname, '/zh/', 'closing details leaves no duplicate map history entries');
    await interaction.close();
    console.log(`PASS phone panel stability, touch targets, selected pin framing, marker focus and history: ${reducedMotion}`);
  }

  const context = await newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { window.testCopiedText = value; } }, configurable: true });
  });
  const page = await context.newPage();
  await ready(page);
  await page.locator('[data-view="list"]').click();
  await page.locator('[data-open="back-to-sea"]').click();
  await page.locator('#venue-detail [data-save="back-to-sea"]').click();
  assert.equal(await page.locator('#venue-detail [data-save="back-to-sea"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#share-venue').click();
  assert.equal(await page.evaluate(() => window.testCopiedText), `https://deepsurf.app${mapPath}#venue-back-to-sea`);
  await page.locator('#copy-address').click();
  assert.equal(await page.evaluate(() => window.testCopiedText), data.venues.find((v) => v.id === 'back-to-sea').address);
  await page.keyboard.press('Escape');
  await page.locator('[data-view="saved"]').click();
  await count(page, 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-view="saved"]').click();
  await count(page, 1);
  await page.goto(new URL('/zh/', base).href);
  await ready(page);
  await page.locator('[data-view="saved"]').click();
  await count(page, 1);
  await page.locator('.venue-card [data-save="back-to-sea"]').click();
  await count(page, 0);
  assert.ok(await page.locator('#empty-state').isVisible());
  await page.locator('[data-view="list"]').click();
  await page.locator('[data-open="back-to-sea"]').click();
  await page.goBack({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#venue-detail').evaluate((node) => node.open), false);
  await context.close();
  console.log('PASS favorites persist across reload/revisit, canonical sharing and address copy, browser back');

  const denied = await newContext({ viewport: { width: 390, height: 844 } });
  await denied.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => error({ code: 1 });
  });
  const deniedPage = await denied.newPage();
  await ready(deniedPage);
  await deniedPage.locator('#locate').click();
  assert.match(await deniedPage.locator('#toast').textContent(), /未获得定位权限/);
  assert.equal(await deniedPage.locator('#locate').isDisabled(), false);
  await count(deniedPage, 11);
  await denied.close();

  const located = await newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: 39.952171, longitude: 116.535415 } });
  const locatedPage = await located.newPage();
  await ready(locatedPage);
  await locatedPage.locator('#locate').click();
  await locatedPage.waitForFunction(() => document.getElementById('sort').value === 'nearest');
  assert.equal(await locatedPage.locator('.venue-card:not([hidden])').first().getAttribute('data-id'), 'back-to-sea');
  assert.match(await locatedPage.locator('.venue-card:not([hidden]) .venue-distance').first().textContent(), /0\.0 km/);
  await locatedPage.locator('.tab-bar [data-view="saved"]').click();
  await count(locatedPage, 0);
  await locatedPage.locator('#sheet-handle').click();
  assert.equal(await locatedPage.locator('body').getAttribute('data-view'), 'saved');
  await locatedPage.locator('#locate').click();
  await locatedPage.waitForFunction(() => document.body.dataset.view === 'map');
  await count(locatedPage, 11);
  await locatedPage.waitForFunction(() => {
    const point = document.querySelector('.leaflet-overlay-pane path')?.getBoundingClientRect();
    return point && point.top > document.querySelector('.app-header').getBoundingClientRect().bottom && point.bottom < document.getElementById('explore-sheet').getBoundingClientRect().top;
  });
  await located.close();
  console.log('PASS denied location fallback and granted location/nearest sorting');

  const failedTiles = await newContext({ viewport: { width: 390, height: 844 } });
  await failedTiles.unroute(tiles);
  await failedTiles.route(tiles, (route) => route.abort());
  const offline = await failedTiles.newPage();
  await ready(offline);
  await offline.locator('#map-message.error').waitFor();
  await offline.locator('[data-view="list"]').click();
  await offline.locator('#search').fill('哈啦');
  await count(offline, 1);
  await offline.locator('[data-open="hala-huzhou"]').click();
  assert.ok(await offline.locator('.navigation-links a').first().isVisible());
  await offline.keyboard.press('Escape');
  await offline.locator('[data-view="map"]').click();
  await failedTiles.unroute(tiles);
  await failedTiles.route(tiles, fulfillTile);
  await offline.locator('#map-retry').click();
  await offline.locator('#map-message').waitFor({ state: 'hidden' });
  await failedTiles.close();
  console.log('PASS failed map tiles retain search/details/navigation; retry recovers');

  const narrow = await newContext({ viewport: { width: 320, height: 568 } });
  const narrowPage = await narrow.newPage();
  for (const path of [mapPath]) {
    await ready(narrowPage, path);
    await noOverflow(narrowPage);
    await narrowPage.locator('.tab-bar [data-view="list"]').click();
    await narrowPage.locator('[data-open="back-to-sea"]').click();
    await noOverflow(narrowPage);
    await narrowPage.keyboard.press('Escape');
    await narrowPage.locator('#search').fill('no-such-venue-999');
    await count(narrowPage, 0);
    await narrowPage.locator('#reset-filters').click();
    await count(narrowPage, 11);
    await narrowPage.locator('#sheet-handle').press('ArrowDown');
    assert.equal(await narrowPage.locator('#explore-sheet').getAttribute('data-snap'), 'low');
    assert.ok(await narrowPage.locator('#search').evaluate((node) => {
      const search = node.getBoundingClientRect();
      const sheet = document.getElementById('explore-sheet').getBoundingClientRect();
      return search.top >= sheet.top && search.bottom < sheet.bottom;
    }), 'collapsed sheet keeps its search field visible');
  }
  await narrow.close();

  const shortScreen = await newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  const shortPage = await shortScreen.newPage();
  await ready(shortPage);
  await shortPage.locator('.tab-bar [data-view="list"]').click();
  await shortPage.locator('[data-open="back-to-sea"]').click();
  await shortPage.locator('#venue-detail[open]').waitFor();
  await shortPage.locator('#show-on-map').click();
  await shortPage.locator('#venue-detail[open]').waitFor({ state: 'hidden' });
  await shortPage.waitForURL((url) => !url.hash);
  assert.equal(await shortPage.locator('body').getAttribute('data-view'), 'map');
  assert.equal(await shortPage.locator('#explore-sheet').getAttribute('data-snap'), 'low');
  await shortPage.waitForFunction(() => {
    const pin = document.querySelector('[data-marker-venue="back-to-sea"].selected')?.getBoundingClientRect();
    const header = document.querySelector('.app-header').getBoundingClientRect();
    const sheet = document.getElementById('explore-sheet').getBoundingClientRect();
    return pin && pin.top > header.bottom && pin.bottom < sheet.top && pin.left >= 0 && pin.right <= innerWidth;
  });
  await shortScreen.close();
  console.log('PASS 320×568 show-on-map closes details, lowers the panel, and keeps the selected pin fully visible');

  const landscapeMap = await newContext({ viewport: { width: 667, height: 375 }, reducedMotion: 'reduce' });
  const landscapeMapPage = await landscapeMap.newPage();
  await ready(landscapeMapPage);
  await landscapeMapPage.locator('.tab-bar [data-view="list"]').click();
  await landscapeMapPage.locator('[data-open="back-to-sea"]').click();
  await landscapeMapPage.locator('#venue-detail[open]').waitFor();
  await landscapeMapPage.locator('#show-on-map').click();
  await landscapeMapPage.locator('#venue-detail[open]').waitFor({ state: 'hidden' });
  await landscapeMapPage.waitForURL((url) => !url.hash);
  assert.equal(await landscapeMapPage.locator('body').getAttribute('data-view'), 'map');
  assert.equal(await landscapeMapPage.locator('#explore-sheet').evaluate((node) => getComputedStyle(node).display), 'none');
  await landscapeMapPage.waitForFunction(() => {
    const pin = document.querySelector('[data-marker-venue="back-to-sea"].selected')?.getBoundingClientRect();
    const header = document.querySelector('.app-header').getBoundingClientRect();
    const provider = document.querySelector('.map-provider-control').getBoundingClientRect();
    const tabs = document.querySelector('.tab-bar').getBoundingClientRect();
    return pin && pin.top > Math.max(header.bottom, provider.bottom)
      && pin.bottom < tabs.top && pin.left >= 0 && pin.right <= innerWidth;
  });
  await landscapeMap.close();
  console.log('PASS 667×375 show-on-map hides the sheet and frames the selected pin between top controls and tabs');

  const landscapeList = await newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
  const landscapeListPage = await landscapeList.newPage();
  await ready(landscapeListPage);
  await landscapeListPage.locator('.tab-bar [data-view="list"]').click();
  await count(landscapeListPage, 11);
  const assertReachableVenue = async (id) => {
    const link = landscapeListPage.locator(`.venue-card [data-open="${id}"]`);
    await link.scrollIntoViewIfNeeded();
    assert.ok(await link.evaluate((node) => {
      const card = node.getBoundingClientRect();
      const sheet = document.getElementById('explore-sheet').getBoundingClientRect();
      const hit = document.elementFromPoint((card.left + card.right) / 2, (card.top + card.bottom) / 2);
      return card.width > 0 && card.height > 0
        && card.top >= Math.max(0, sheet.top) - 1 && card.bottom <= Math.min(innerHeight, sheet.bottom) + 1
        && card.left >= Math.max(0, sheet.left) - 1 && card.right <= Math.min(innerWidth, sheet.right) + 1
        && hit && node.contains(hit);
    }), `${id}: the scrolled venue link must be inside the viewport and sheet, and reachable without clipping`);
  };
  // Use the first, a middle, and the final directory venue so Saved also needs scrolling.
  for (const venueId of [data.venues[0].id, data.venues[Math.floor(data.venues.length / 2)].id, data.venues.at(-1).id]) {
    await assertReachableVenue(venueId);
    await landscapeListPage.locator(`.venue-card [data-save="${venueId}"]`).click();
  }
  assert.ok(await landscapeListPage.locator('#explore-sheet').evaluate((node) => node.scrollTop > 0), 'the short landscape sheet scrolls to later list entries');
  await landscapeListPage.locator('.tab-bar [data-view="saved"]').click();
  await count(landscapeListPage, 3);
  await assertReachableVenue('qingyuwan-kunming');
  assert.ok(await landscapeListPage.locator('#explore-sheet').evaluate((node) => node.scrollTop > 0), 'saved venues remain reachable by scrolling');
  await landscapeListPage.locator('[data-open="qingyuwan-kunming"]').click();
  await landscapeListPage.locator('#venue-detail[open]').waitFor();
  assert.match(await landscapeListPage.locator('#detail-title').textContent(), /青鱼湾/);
  await landscapeList.close();
  console.log('PASS 844×390 list and saved venues scroll into an unclipped, clickable visible area');

  const plain = await newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const plainPage = await plain.newPage();
  for (const path of [mapPath]) {
    await plainPage.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
    assert.equal(await plainPage.locator('.venue-card:visible').count(), 11);
    assert.equal(await plainPage.locator('.static-details').count(), 11);
    await plainPage.locator('.static-details summary').first().click();
    assert.ok(await plainPage.locator('.static-details[open] p').first().isVisible());
    await noOverflow(plainPage);
  }
  await plain.close();
  for (const path of ['/content/venues.json', '/docs/venue-sources.md', '/tests/venues.test.mjs', '/scripts/render-venues.mjs']) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 404, `private source must not publish: ${path}`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, [], 'the browser suite must not call real map providers');
  console.log('PASS 320px layout, Chinese no-JavaScript reading, public output boundary, no JavaScript exceptions or live provider requests');
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
