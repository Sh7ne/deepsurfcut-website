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

async function newCase(config, { preference, viewport = { width: 1280, height: 900 } } = {}) {
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
      if (provider) return route.fulfill({ status: 200, contentType: 'text/javascript', body: providerModule(provider) });
      return route.continue();
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
async function select(page, provider, options) {
  await page.locator('#map-provider').selectOption(provider);
  await ready(page, provider, options);
}
const plan = (page, provider, settings) => page.evaluate(({ provider, settings }) => { window.__mapSwitchProbe.plans[provider] = settings; }, { provider, settings });
const instanceEvent = (page, provider, event) => page.waitForFunction(({ provider, event }) => window.__mapSwitchProbe.instances.some((entry) => entry.provider === provider && entry.events.includes(event)), { provider, event });
async function count(page, expected) {
  await page.waitForFunction((expected) => document.getElementById('result-count').textContent === String(expected), expected);
  assert.equal(await page.locator('.venue-card:not([hidden])').count(), expected);
}

try {
  for (const [config, expected, preference] of [
    [configuration(false, false), 'osm', undefined],
    [configuration(false, true), 'baidu', 'amap'],
    [configuration(true, false), 'amap', undefined],
    [configuration(true, true), 'baidu', undefined],
  ]) {
    const { context, page } = await newCase(config, { preference });
    await go(page); await ready(page, expected);
    assert.equal(await page.locator('#map-provider option[value="amap"]').evaluate((option) => option.disabled), !config.amap.enabled, await page.locator('#map-provider').evaluate((select) => select.outerHTML));
    assert.equal(await page.locator('#map-provider option[value="amap"]').evaluate((option) => option.hidden), !config.amap.enabled);
    if (!config.amap.enabled) {
      assert.equal(await page.locator('[data-provider-info="amap"]').isVisible(), false);
      assert.equal(await page.evaluate(() => window.__mapSwitchProbe.instances.some((entry) => entry.provider === 'amap')), false);
    }
    assert.equal(await page.locator('#map-provider option[value="baidu"]').evaluate((option) => option.disabled), !config.baidu.enabled);
    assert.equal(await page.locator('#map-provider option[value="osm"]').isDisabled(), false);
    await count(page, 11);
    await context.close();
  }
  console.log('PASS configured defaults, disabled unavailable providers, stale preference fallback');

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

  for (const phase of ['load', 'prepare', 'markers']) {
    const { context, page } = await newCase(configuration(), { preference: 'osm' });
    await go(page); await ready(page, 'osm');
    await plan(page, 'amap', phase === 'load' ? { loadDelay: 250 } : phase === 'prepare' ? { prepareDelay: 250 } : { markerDelay: 250 });
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
    await page.locator('#map-provider').selectOption('amap');
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
