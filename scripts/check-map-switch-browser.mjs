import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'dist');
const mapPath = '/RapidSurfingMap';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let server;
const base = process.env.SITE_URL || await new Promise((done, reject) => {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(publicRoot, '.' + (path === mapPath ? `${path}.html` : path.endsWith('/') ? `${path}index.html` : path));
      if (!file.startsWith(publicRoot + sep)) throw new Error('outside preview');
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
  try { await access(chrome); executablePath = chrome; } catch { /* Use installed Playwright Chromium. */ }
}
let browser;
try { browser = await chromium.launch(executablePath ? { executablePath } : {}); }
catch (error) { if (server) await new Promise((done) => server.close(done)); throw error; }

const errors = [], unexpectedRequests = [];
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZk0AAAAASUVORK5CYII=', 'base64');
const configuration = (amap = true, baidu = true) => ({
  amap: { enabled: amap, key: amap ? 'test-only-browser-key' : '', serviceHost: '/api/maps/amap/_AMapService' },
  baidu: { enabled: baidu, ak: baidu ? 'test-only-browser-key' : '' },
});

// Only provider loading/conversion timing is simulated. The application, shared
// controls, markers and OSM adapter are the actual built files. No real SDK or
// credential is used, and every external request is blocked or fulfilled locally.
function providerModule(name) {
  const factory = name === 'amap' ? 'createAmapProvider' : 'createBaiduProvider';
  return `import { createOsmProvider } from '/venues/provider-osm.js';
export async function ${factory}(options) {
  const probe = window.__mapSwitchProbe;
  const plan = { ...probe.plans.${name} };
  const id = ++probe.sequence;
  const record = { id, provider: '${name}', events: ['loading'] };
  probe.instances.push(record);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms || 0));
  await wait(plan.loadDelay);
  if (plan.failLoad) { record.events.push('load-failed'); throw new Error('Simulated SDK load failure'); }
  const native = await createOsmProvider(options);
  if ('${name}' === 'amap') {
    // Match native credit classes, dimensions and default corner positioning;
    // the SDK, logo image and all provider network traffic remain mocked.
    const logo = document.createElement('a');
    logo.className = 'amap-logo';
    logo.href = '#';
    logo.textContent = 'Map logo';
    Object.assign(logo.style, { position: 'absolute', left: '0px', bottom: '0px', width: '73px', height: '20px', display: 'block', background: 'white', zIndex: '450' });
    const copyright = document.createElement('div');
    copyright.className = 'amap-copyright';
    copyright.textContent = '© Map provider · attribution fixture';
    Object.assign(copyright.style, { position: 'absolute', left: '0px', bottom: '0px', width: '200px', fontSize: '10px', lineHeight: '12px', background: 'white', zIndex: '450' });
    options.container.append(logo, copyright);
  }
  let destroyed = false, markerRequest = 0;
  record.events.push('created');
  return {
    ...native,
    async prepare(points) {
      record.events.push('preparing');
      await wait(plan.prepareDelay);
      if (plan.failPrepare) { record.events.push('prepare-failed'); throw new Error('Simulated conversion failure'); }
      await native.prepare(points);
      record.events.push('prepared');
    },
    async setMarkers(specs) {
      const request = ++markerRequest;
      record.events.push('marking');
      await wait(plan.markerDelay);
      if (destroyed || request !== markerRequest) { record.events.push('markers-canceled'); return; }
      native.setMarkers(specs);
      record.events.push('markers');
    },
    async fitBounds(points, fitOptions) {
      await wait(plan.fitDelay);
      if (plan.failFit || destroyed) { record.events.push('fit-rejected'); throw Object.assign(new Error('Simulated canceled conversion'), { name: 'AbortError' }); }
      native.fitBounds(points, fitOptions);
      record.events.push('fitted');
    },
    destroy() { if (!destroyed) { destroyed = true; markerRequest++; native.destroy(); record.events.push('destroyed'); } },
  };
}`;
}

// Exercise the real Baidu adapter with real browser DOM, while providing only a
// deterministic SDK boundary. Native legal nodes, links and listeners must survive
// relocation, and SDK destruction verifies they were restored first.
function nativeBaiduSDKFixture() {
  const probe = window.__nativeBaiduProbe = { maps: [], restoreErrors: [], linkClicks: 0 };
  class Point { constructor(lng, lat) { Object.assign(this, { lng, lat }); } }
  class NativeMap {
    constructor(container) {
      this.container = container; this.listeners = new Map(); this.overlays = []; this.zoom = 5;
      this.controls = document.createElement('div');
      this.copyright = document.createElement('div'); this.copyright.className = 'BMap_cpyCtrlV4';
      this.copyright.innerHTML = '©2026 Baidu - <a href="https://map.baidu.com/">百度地图</a> - <a href="https://example.test/map-review">审图号 GS(2025)1234号</a> - <a href="https://beian.miit.gov.cn/">京ICP证030173号</a> - <a href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=11000002000001">京公网安备11000002000001号</a>';
      Object.assign(this.copyright.style, { position: 'absolute', left: '0px', bottom: '0px', width: '600px', whiteSpace: 'nowrap', fontSize: '10px', lineHeight: '12px' });
      this.copyright.addEventListener('click', (event) => { if (event.target.closest('a')) { event.preventDefault(); probe.linkClicks++; } });
      this.logo = document.createElement('div'); this.logo.className = 'anchorBL';
      const image = document.createElement('img'); image.alt = 'Baidu map logo fixture'; image.width = 76; image.height = 24;
      image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="76" height="24"><text x="2" y="17" font-size="12">Baidu logo</text></svg>');
      this.logo.append(image); Object.assign(this.logo.style, { position: 'absolute', left: '0px', bottom: '8px' });
      // Some native SDK versions put copyright inside the logo wrapper. This
      // deliberately exercises that nesting with the real adapter, not a clone.
      this.logo.append(this.copyright); this.controls.append(this.logo); container.append(this.controls); probe.maps.push(this);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name) { this.listeners.delete(name); }
    centerAndZoom(center, zoom) { this.center = center; this.zoom = zoom; queueMicrotask(() => this.listeners.get('tilesloaded')?.()); }
    disableContinuousZoom() {} disableInertialDragging() {} checkResize() {}
    getZoom() { return this.zoom; }
    pointToPixel(point) { return { x: point.lng * 2, y: point.lat * 2 }; }
    getViewport(points, options = {}) { return { center: points[0], zoom: 5 + (options.zoomFactor || 0) }; }
    setViewport(viewport) { this.center = viewport.center; this.zoom = viewport.zoom; }
    setZoom(zoom) { this.zoom = zoom; }
    addOverlay(overlay) { overlay.element = overlay.factory(); this.container.append(overlay.element); this.overlays.push(overlay); }
    removeOverlay(overlay) { overlay.element?.remove(); this.overlays = this.overlays.filter((item) => item !== overlay); }
    destroy() {
      if (this.copyright.parentNode !== this.logo || this.logo.parentNode !== this.controls) probe.restoreErrors.push('native controls were not restored before SDK destruction');
      this.destroyed = true; this.container.replaceChildren();
    }
  }
  window.BMap = { Map: NativeMap, Point,
    CustomOverlay: class { constructor(factory) { this.factory = factory; } },
    Convertor: class { translate(points, _from, _to, callback) { queueMicrotask(() => callback({ status: 0, points })); } },
  };
}

async function newCase(config, { preference, viewport = { width: 1280, height: 900 }, nativeBaidu = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.addInitScript(({ preference }) => {
    window.__mapSwitchProbe = { plans: { amap: {}, baidu: {} }, instances: [], sequence: 0 };
    if (preference && /^https?:$/.test(location.protocol) && !sessionStorage.getItem('test-preference-initialized')) {
      localStorage.setItem('deepsurf.venues.provider.v1', preference);
      sessionStorage.setItem('test-preference-initialized', 'true');
    }
  }, { preference });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin) {
      if (url.pathname === '/api/maps/config') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
      const provider = url.pathname.match(/^\/venues\/provider-(amap|baidu)\.js$/)?.[1];
      if (provider && !(nativeBaidu && provider === 'baidu')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: providerModule(provider) });
      return route.continue();
    }
    if (nativeBaidu && url.origin === 'https://api.map.baidu.com' && url.pathname === '/api') {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: `(${nativeBaiduSDKFixture.toString()})();window[${JSON.stringify(url.searchParams.get('callback'))}]();` });
    }
    if (url.origin === 'https://tile.openstreetmap.org') return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
    unexpectedRequests.push(url.origin + url.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  return { context, page };
}
const go = (page) => page.goto(new URL(mapPath, base).href, { waitUntil: 'domcontentloaded' });
async function ready(page, provider, { markers = true } = {}) {
  await page.waitForFunction((expected) => document.body.dataset.mapProvider === expected
    && document.getElementById('map').getAttribute('aria-busy') === 'false'
    && document.getElementById('map-message').hidden, provider);
  if (markers) await page.locator('.surf-marker').first().waitFor();
  assert.equal(await page.locator('#map-provider').inputValue(), provider);
  assert.equal(await page.locator('#map > .provider-canvas').count(), 1);
}
async function openAbout(page) {
  if (await page.locator('#about-dialog').evaluate((node) => node.open)) return;
  if (!await page.locator('#about-open').isVisible()) {
    await page.locator('.tab-bar [data-view="map"]').click();
    if (!await page.locator('#about-open').isVisible() && await page.locator('#sheet-handle').isVisible()) await page.locator('#sheet-handle').click();
  }
  await page.locator('#about-open').click();
  await page.locator('#about-dialog[open]').waitFor();
  assert.ok(await page.locator('#about-dialog #map-provider').isVisible());
}
async function closeAbout(page) {
  await page.locator('#about-close').click();
  await page.locator('#about-dialog[open]').waitFor({ state: 'hidden' });
  assert.ok(await page.locator('#about-open').evaluate((node) => node === document.activeElement), 'closing provider settings returns focus to About');
}
async function select(page, provider, options) {
  await openAbout(page);
  await page.locator('#map-provider').selectOption(provider);
  assert.ok(await page.evaluate(() => document.getElementById('about-dialog').contains(document.activeElement)), 'provider selection keeps focus inside the settings dialog');
  await ready(page, provider, options);
  await closeAbout(page);
}
const plan = (page, provider, settings) => page.evaluate(({ provider, settings }) => { window.__mapSwitchProbe.plans[provider] = settings; }, { provider, settings });
const instanceEvent = (page, provider, event) => page.waitForFunction(({ provider, event }) => window.__mapSwitchProbe.instances.some((entry) => entry.provider === provider && entry.events.includes(event)), { provider, event });
async function count(page, expected) {
  await page.waitForFunction((expected) => document.getElementById('result-count').textContent === String(expected), expected);
  assert.equal(await page.locator('.venue-card:not([hidden])').count(), expected);
}

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
    const { context, page } = await newCase(configuration(false, true), { viewport, nativeBaidu: true });
    await go(page); await ready(page, 'baidu');
    const legal = page.locator('#provider-legal-attribution .BMap_cpyCtrlV4');
    const logo = page.locator('#provider-attribution .anchorBL');
    await logo.waitFor({ state: 'attached' });
    await legal.waitFor({ state: 'attached' });
    const phone = viewport.width < 768;
    assert.equal(await logo.isVisible(), !phone || viewport.height < 650, 'the initial mobile half panel conceals the logo while an initially collapsed or absent panel exposes it');
    if (phone && viewport.height >= 650) await page.locator('#sheet-handle').click();
    await logo.waitFor({ state: 'visible' });
    assert.ok(await page.locator('#provider-attribution').evaluate((node) => node.parentElement.classList.contains('map-stage') && !node.closest('.tab-bar, footer')), 'branding floats on the map outside the navigation row');
    assert.ok(await page.locator('#provider-attribution').evaluate((node) => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      return box.width >= 40 && box.width <= 69 && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none'
        && style.boxShadow === 'none' && parseFloat(style.borderTopWidth) === 0 && parseFloat(style.paddingTop) === 0 && parseFloat(style.paddingBottom) === 0;
    }), 'the logo host is compact and transparent without a background strip, padding or card decoration');
    assert.ok(await logo.locator('img').evaluate((image) => Math.abs(image.getBoundingClientRect().width - 68) <= 1), 'native logo is displayed at the compact 68px width');
    assert.ok(await page.locator('#provider-attribution').evaluate((node) => {
      const box = node.getBoundingClientRect();
      if (Math.abs(innerWidth - box.right - 14) > 1) return false;
      const sheet = document.getElementById('explore-sheet'), tabs = document.querySelector('.tab-bar');
      const lowerBoundary = innerWidth < 768 ? (sheet.getClientRects().length ? sheet.getBoundingClientRect().top : tabs.getBoundingClientRect().top) : innerHeight;
      const gap = lowerBoundary - box.bottom;
      if (gap < 7 || gap > 17) return false;
      return [tabs, document.getElementById('about-open')].every((control) => {
        const rect = control.getBoundingClientRect();
        return !rect.width || !rect.height || box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom;
      });
    }), 'the floating logo stays just above the sheet/tabs or desktop bottom, separate from About and navigation');
    if (phone && viewport.height > 480) {
      await page.locator('#sheet-handle').click();
      assert.equal(await page.locator('#explore-sheet').getAttribute('data-snap'), 'half');
      assert.equal(await logo.isVisible(), false, 'expanding to half hides the floating logo');
      await page.locator('#sheet-handle').press('ArrowUp');
      assert.equal(await logo.isVisible(), false, 'the full panel hides the floating logo');
      await page.locator('#sheet-handle').click();
      assert.ok(await logo.isVisible());
    }
    if (phone) {
      await page.locator('.tab-bar [data-view="list"]').click();
      assert.equal(await logo.isVisible(), false, 'List hides the floating logo');
      await page.locator('.tab-bar [data-view="saved"]').click();
      assert.equal(await logo.isVisible(), false, 'Saved hides the floating logo');
      await page.locator('.tab-bar [data-view="map"]').click();
      if (!await logo.isVisible() && await page.locator('#sheet-handle').isVisible()) await page.locator('#sheet-handle').click();
      await logo.waitFor({ state: 'visible' });
    }
    const tabsBeforeSwitch = await page.locator('.tab-bar').boundingBox();
    assert.equal(await legal.isVisible(), false, 'closed About must not expose detailed legal text on the map');
    assert.equal(await page.locator('#provider-attribution .BMap_cpyCtrl, #provider-attribution .BMap_cpyCtrlV4').count(), 0);
    assert.doesNotMatch(await page.locator('#provider-attribution').textContent(), /©2026|审图号|ICP|公网安备/);
    assert.ok(await logo.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    }), 'the original map logo remains visible inside the viewport');
    assert.ok(await page.evaluate(() => window.__nativeBaiduProbe.maps[0].copyright === document.querySelector('#provider-legal-attribution .BMap_cpyCtrlV4')
      && window.__nativeBaiduProbe.maps[0].logo === document.querySelector('#provider-attribution .anchorBL')), 'the adapter moves the original nodes');

    await openAbout(page);
    await legal.scrollIntoViewIfNeeded();
    assert.ok(await legal.isVisible());
    assert.match(await legal.textContent(), /©2026 Baidu.*审图号 GS\(2025\)1234号.*京ICP证030173号.*京公网安备11000002000001号/);
    assert.deepEqual(await legal.locator('a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))), [
      'https://map.baidu.com/', 'https://example.test/map-review', 'https://beian.miit.gov.cn/',
      'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=11000002000001',
    ]);
    assert.ok(await legal.evaluate((node) => {
      const box = node.getBoundingClientRect(), dialog = document.getElementById('about-dialog').getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left >= dialog.left && box.right <= dialog.right && node.scrollWidth <= node.clientWidth + 1;
    }), 'the complete legal notice wraps within About rather than clipping horizontally');
    for (const link of await legal.locator('a').all()) {
      await link.scrollIntoViewIfNeeded();
      assert.ok(await link.isVisible(), 'every original legal link is readable');
    }
    await legal.locator('a').first().focus();
    await page.keyboard.press('Tab');
    assert.ok(await legal.locator('a').nth(1).evaluate((node) => node === document.activeElement), 'legal links retain their normal keyboard sequence');
    await legal.locator('a').first().click();
    assert.equal(await page.evaluate(() => window.__nativeBaiduProbe.linkClicks), 1, 'the original legal-node listener remains attached');
    await page.keyboard.press('Escape');
    await page.locator('#about-dialog[open]').waitFor({ state: 'hidden' });
    assert.equal(await legal.isVisible(), false);
    assert.ok(await logo.isVisible());
    assert.ok(await page.locator('#about-open').evaluate((node) => node === document.activeElement));

    await select(page, 'osm');
    const tabsAfterSwitch = await page.locator('.tab-bar').boundingBox();
    assert.equal(tabsAfterSwitch.y, tabsBeforeSwitch.y, 'the floating logo does not reserve or shift the navigation row');
    assert.equal(await page.locator('.BMap_cpyCtrlV4, .anchorBL').count(), 0, 'switching away removes both native hosts without residual nodes');
    assert.equal(await page.locator('#provider-legal-attribution').getAttribute('hidden'), '');
    assert.equal(await page.locator('#provider-attribution').getAttribute('hidden'), '');
    assert.deepEqual(await page.evaluate(() => window.__nativeBaiduProbe.restoreErrors), []);
    await select(page, 'baidu');
    await logo.waitFor({ state: 'visible' });
    assert.equal(await legal.count(), 1); assert.equal(await logo.count(), 1);
    await page.locator('#map-message').evaluate((node) => { node.hidden = false; });
    await page.locator('#map-retry').evaluate((node) => { node.hidden = false; });
    await page.locator('#map-retry').click(); await ready(page, 'baidu');
    await logo.waitFor({ state: 'visible' });
    assert.equal(await legal.count(), 1); assert.equal(await logo.count(), 1, 'retry must not duplicate native nodes');
    await select(page, 'osm');
    await page.evaluate(() => {
      const old = window.__nativeBaiduProbe.maps[0];
      old.controls.append(old.copyright.cloneNode(true), old.logo.cloneNode(true));
    });
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#provider-legal-attribution, #provider-attribution').evaluateAll((nodes) => nodes.reduce((count, node) => count + node.childElementCount, 0)), 0, 'late mutations from a destroyed map cannot repopulate either host');
    assert.ok(await page.evaluate(() => window.__nativeBaiduProbe.maps.every((map) => map.destroyed)));
    assert.deepEqual(await page.evaluate(() => window.__nativeBaiduProbe.restoreErrors), []);
    await context.close();
  }
  console.log('PASS real Baidu adapter preserves About legal nodes/links and compact transparent map branding, follows mobile panel visibility, avoids About/navigation overlap, and restores/clears both hosts on switch and retry');

  for (const [config, expected, preference] of [
    [configuration(false, false), 'osm', undefined],
    [configuration(false, true), 'baidu', 'amap'],
    [configuration(true, false), 'amap', undefined],
    [configuration(true, true), 'baidu', undefined],
  ]) {
    const { context, page } = await newCase(config, { preference });
    await go(page); await ready(page, expected);
    assert.equal(await page.locator('#map-provider').isVisible(), false);
    await openAbout(page);
    assert.equal(await page.locator('#map-provider option[value="amap"]').evaluate((option) => option.disabled), !config.amap.enabled, await page.locator('#map-provider').evaluate((select) => select.outerHTML));
    assert.equal(await page.locator('#map-provider option[value="amap"]').evaluate((option) => option.hidden), !config.amap.enabled);
    if (!config.amap.enabled) {
      assert.equal(await page.locator('[data-provider-info="amap"]').isVisible(), false);
      assert.equal(await page.evaluate(() => window.__mapSwitchProbe.instances.some((entry) => entry.provider === 'amap')), false);
    }
    assert.equal(await page.locator('#map-provider option[value="baidu"]').evaluate((option) => option.disabled), !config.baidu.enabled);
    assert.equal(await page.locator('#map-provider option[value="osm"]').isDisabled(), false);
    await closeAbout(page);
    await count(page, 11);
    await context.close();
  }
  console.log('PASS configured defaults, disabled unavailable providers, stale preference fallback');

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
    const { context, page } = await newCase(configuration(true, false), { preference: 'amap', viewport });
    await go(page); await ready(page, 'amap');
    await openAbout(page); await closeAbout(page);
    assert.ok(await page.locator('#about-open').isVisible());
    await page.locator('#map-message').evaluate((node) => { node.hidden = false; node.classList.add('error'); });
    for (const selector of ['.provider-amap .amap-logo', '.provider-amap .amap-copyright']) {
      const credit = page.locator(selector);
      assert.ok(await credit.isVisible(), `${selector}: native attribution remains visible`);
      assert.ok(await credit.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return false;
        const blockers = [...document.querySelectorAll('#about-open, .map-controls .icon-button, #map-message')];
        return blockers.every((control) => {
          const box = control.getBoundingClientRect();
          if (!box.width || !box.height || getComputedStyle(control).visibility === 'hidden') return true;
          return rect.right <= box.left || rect.left >= box.right || rect.bottom <= box.top || rect.top >= box.bottom;
        });
      }), `${viewport.width}×${viewport.height} ${selector}: credit must stay inside the viewport and clear of About, map controls and the visible status message`);
    }
    const logo = await page.locator('.provider-amap .amap-logo').boundingBox();
    const copyright = await page.locator('.provider-amap .amap-copyright').boundingBox();
    assert.equal(logo.width, 73);
    assert.equal(logo.height, 20);
    assert.ok(logo.x + logo.width <= copyright.x || logo.x >= copyright.x + copyright.width
      || logo.y + logo.height <= copyright.y || logo.y >= copyright.y + copyright.height, 'logo and copyright must not overlap each other');
    await context.close();
  }
  console.log('PASS native-size Amap logo/copyright stay onscreen and clear of About, controls and status messages on desktop, phones and landscape');

  {
    const { context, page } = await newCase(configuration(), { preference: 'amap' });
    await go(page); await ready(page, 'amap');
    await page.locator('#city-filters [data-city="北京"]').click();
    await page.locator('#search').fill('SURFPARK');
    await count(page, 2);
    await page.locator('#filter-open').click();
    await page.locator('.environment-options label').filter({ has: page.locator('[value="indoor"]') }).click();
    await page.locator('#filter-apply').click();
    await page.locator('#sort').selectOption('name');
    await page.locator('.venue-card [data-save="surfpark-chaoyang"]').click();
    await page.locator('[data-open="surfpark-chaoyang"]').click();
    await page.locator('#show-on-map').click();
    await page.waitForURL((url) => !url.hash);
    await select(page, 'baidu');
    await count(page, 2);
    assert.equal(await page.locator('#search').inputValue(), 'SURFPARK');
    assert.equal(await page.locator('#city-filters [data-city="北京"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#active-filters').textContent(), /室内/);
    assert.equal(await page.locator('#sort').inputValue(), 'name');
    assert.equal(await page.locator('#venue-surfpark-chaoyang').getAttribute('aria-current'), 'location');
    assert.equal(await page.locator('.venue-card [data-save="surfpark-chaoyang"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-marker-venue="surfpark-chaoyang"].selected').waitFor();
    await page.locator('.tab-bar [data-view="saved"]').click();
    await count(page, 1);
    await select(page, 'osm'); await count(page, 1);
    assert.equal(await page.locator('body').getAttribute('data-view'), 'saved');
    await select(page, 'baidu');
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page, 'baidu');
    await page.locator('.tab-bar [data-view="saved"]').click(); await count(page, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('deepsurf.venues.provider.v1')), 'baidu');
    await context.close();
  }
  console.log('PASS filters, search, sort, selected venue and favorites survive switching; provider preference survives reload');

  {
    const { context, page } = await newCase(configuration(), { viewport: { width: 390, height: 844 } });
    await go(page); await ready(page, 'baidu');
    assert.equal(await page.locator('#about-open').isVisible(), false);
    await page.locator('.tab-bar [data-view="list"]').click();
    await page.locator('#city-filters [data-city="北京"]').click();
    await page.locator('#search').fill('SURFPARK'); await count(page, 2);
    await page.locator('.venue-card [data-save="surfpark-chaoyang"]').click();
    await openAbout(page);
    assert.equal(await page.locator('#explore-sheet').getAttribute('data-snap'), 'low');
    await page.locator('#map-provider').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.getElementById('about-dialog').contains(document.activeElement)), 'mobile settings retain keyboard focus inside the modal');
    await select(page, 'osm');
    assert.equal(await page.locator('#search').inputValue(), 'SURFPARK');
    assert.equal(await page.locator('#city-filters [data-city="北京"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.venue-card [data-save="surfpark-chaoyang"]').getAttribute('aria-pressed'), 'true');
    await count(page, 2);
    await page.keyboard.press('Enter');
    await page.locator('#about-dialog[open]').waitFor();
    await select(page, 'baidu');
    await page.locator('.tab-bar [data-view="saved"]').click(); await count(page, 1);
    assert.equal(await page.locator('#about-open').isVisible(), false);
    await context.close();
  }
  console.log('PASS mobile About provider settings preserve search, city filters and saved venues with modal focus return');

  for (const phase of ['load', 'prepare', 'markers']) {
    const { context, page } = await newCase(configuration(), { preference: 'osm' });
    await go(page); await ready(page, 'osm');
    await plan(page, 'amap', phase === 'load' ? { loadDelay: 250 } : phase === 'prepare' ? { prepareDelay: 250 } : { markerDelay: 250 });
    await openAbout(page);
    await page.locator('#map-provider').selectOption('amap');
    await instanceEvent(page, 'amap', phase === 'load' ? 'loading' : phase === 'prepare' ? 'preparing' : 'marking');
    await select(page, 'baidu');
    await instanceEvent(page, 'amap', phase === 'markers' ? 'markers-canceled' : 'destroyed');
    if (phase === 'prepare') {
      await instanceEvent(page, 'amap', 'prepared');
      const events = await page.evaluate(() => window.__mapSwitchProbe.instances.find((entry) => entry.provider === 'amap').events);
      assert.ok(events.indexOf('destroyed') < events.indexOf('prepared'), 'switching must destroy a pending provider before its coordinate preparation finishes');
    }
    await ready(page, 'baidu');
    assert.equal(await page.evaluate(() => localStorage.getItem('deepsurf.venues.provider.v1')), 'baidu');
    assert.equal(await page.locator('#map-message.error:visible').count(), 0);
    await context.close();
  }
  console.log('PASS latest provider wins when an earlier SDK load, coordinate preparation or marker conversion finishes late');

  {
    const { context, page } = await newCase(configuration(), { preference: 'osm' });
    await go(page); await ready(page, 'osm');
    await page.locator('#search').fill('TOSWIM'); await count(page, 1);
    await plan(page, 'amap', { failPrepare: true });
    await openAbout(page);
    await page.locator('#map-provider').selectOption('amap');
    await closeAbout(page);
    await page.locator('#map-message.error').waitFor();
    await count(page, 1);
    await page.locator('[data-open="surfpark-fengtai"]').click();
    assert.equal(await page.locator('.navigation-links a').count(), 3);
    await page.keyboard.press('Escape'); await page.waitForURL((url) => !url.hash);
    await plan(page, 'amap', {});
    await page.locator('#map-retry').click(); await ready(page, 'amap');
    await count(page, 1);
    assert.equal(await page.locator('#search').inputValue(), 'TOSWIM');
    await context.close();
  }
  console.log('PASS failed provider conversion keeps directory/navigation usable and retry restores the selected provider');

  {
    const { context, page } = await newCase(configuration(), { preference: 'osm' });
    await go(page); await ready(page, 'osm');
    await plan(page, 'amap', { fitDelay: 250, failFit: true });
    await select(page, 'amap');
    await select(page, 'baidu');
    await instanceEvent(page, 'amap', 'fit-rejected');
    assert.equal(await page.locator('#map-message.error:visible').count(), 0, 'a stale fit/conversion rejection must not replace the new provider with an error');
    await ready(page, 'baidu');
    await context.close();
  }
  console.log('PASS canceled old-provider viewport work cannot overwrite the current map status');
  assert.deepEqual(errors, [], 'switching must not create uncaught JavaScript errors');
  assert.deepEqual(unexpectedRequests, [], 'no real third-party SDK request is permitted in this suite');
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
