import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createTestHarness } from 'wrangler';
import { load } from 'cheerio';
import { bindings, createTestChain, MESSAGE_ID, signedPayload } from './helpers.mjs';

const venuePagePaths = (await Promise.all([
  ['venues.json', '/zh'], ['venues-europe.json', ''], ['venues-europe.json', '/de'], ['venues-north-america.json', ''],
].map(async ([file, prefix]) => {
  const data = JSON.parse(await readFile(`content/${file}`, 'utf8'));
  return data.venues.map((venue) => `${prefix}/rapid-surf-map/venues/${venue.id}/`);
}))).flat();

test('Pages deployment and Apple verification run in the Cloudflare runtime', { timeout: 120_000 }, async (t) => {
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
  execFileSync(process.execPath, [
    'node_modules/wrangler/bin/wrangler.js', 'pages', 'functions', 'build',
    '--outdir', '.test-worker', '--build-output-directory', 'dist',
    '--compatibility-date', config.compatibility_date,
    '--compatibility-flags', ...config.compatibility_flags,
  ], { stdio: 'pipe' });

  await mkdir('.test-worker', { recursive: true });
  const runtimeConfig = {
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    vars: bindings,
  };
  const deployed = createTestHarness({
    workers: [{ config: {
      ...runtimeConfig,
      name: 'retention-deployed-test', main: '.test-worker/index.js',
      assets: { directory: 'dist', binding: 'ASSETS', run_worker_first: true },
    } }],
  });
  t.after(() => deployed.close());
  await deployed.listen();
  const chain = createTestChain();
  const post = (worker, path, token) => worker.fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedPayload: token }),
  });

  await t.test('compiled production and sandbox routes reject untrusted roots', async () => {
    for (const [path, environment] of [['/api/retention', 'Production'], ['/api/retention/sandbox', 'Sandbox']]) {
      assert.equal((await deployed.fetch(path)).status, 405);
      const response = await post(deployed, path, signedPayload(chain, { environment }));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'invalid_signed_payload' });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    assert.equal((await post(deployed, '/api/retention/', 'invalid')).status, 400);
  });

  await t.test('existing pages and assets are preserved and private files are excluded', async () => {
    for (const [url, file] of [['/', 'index.html'], ['/zh/', 'zh/index.html'], ['/privacy/', 'privacy/index.html'], ['/home.css', 'home.css'], ['/updates/', 'updates/index.html'], ['/zh/updates/', 'zh/updates/index.html'], ['/de/', 'de/index.html'], ['/de/updates/', 'de/updates/index.html'], ['/de/surf-video-editing/', 'de/surf-video-editing/index.html'], ['/portrait-follow/', 'portrait-follow/index.html'], ['/zh/portrait-follow/', 'zh/portrait-follow/index.html'], ['/de/portrait-follow/', 'de/portrait-follow/index.html'], ['/portrait-follow.css', 'portrait-follow.css'], ['/assets/icons-20261015.js', 'assets/icons-20261015.js'], ['/venues/map.js', 'venues/map.js'], ['/venues/map.css', 'venues/map.css'], ['/venues/data.json', 'venues/data.json']]) {
      const response = await deployed.fetch(url);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(file, 'utf8'));
    }
    const output = await readdir('dist', { recursive: true });
    assert.match(await readFile('design/rapid-surf-map-social.svg', 'utf8'), /<svg\b/, 'the editable social source exists outside public assets');
    for (const name of output) {
      assert.ok(!/(^|\/)(server|tests|node_modules|functions|scripts|content|docs|\.git|\.DS_Store|\.dev\.vars)(\/|$)/.test(name), name);
      assert.ok(!['AGENTS.md', 'README.md', 'package.json', 'package-lock.json', 'wrangler.jsonc'].includes(name), name);
      assert.ok(!['venues/index.html', 'zh/venues/index.html', 'de/venues/index.html'].includes(name), `${name}: legacy map pages must redirect instead`);
      assert.ok(!/rapid.*surf.*map.*\.svg$/i.test(name), `${name}: editable social-card SVG source must not enter the public build`);
    }
    assert.deepEqual(JSON.parse(await readFile('dist/_routes.json', 'utf8')), {
      version: 1, include: ['/api/retention', '/api/retention/*', '/api/maps/*', '/RapidSurfingMap'], exclude: [],
    });
  });

  await t.test('all 46 venue pages are crawlable static assets with ordinary site policies', async () => {
    assert.equal(venuePagePaths.length, 46);
    for (const path of venuePagePaths) {
      const response = await deployed.fetch(path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.equal(html, await readFile(path.slice(1) + 'index.html', 'utf8'), path);
      const $ = load(html, { scriptingEnabled: false });
      assert.equal($('link[rel="canonical"]').attr('href'), `https://deepsurf.app${path}`, path);
      assert.ok($('main').text().trim().length > 100, path);
      assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()', path);
      assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /tile\.openstreetmap\.org|unsafe-eval/, path);
      assert.doesNotMatch(response.headers.get('X-Robots-Tag') || '', /noindex/i, path);
      const head = await deployed.fetch(path, { method: 'HEAD' });
      assert.equal(head.status, 200, path); assert.equal(await head.text(), '', path);
    }
    const style = await deployed.fetch('/venues/venue.css');
    assert.equal(style.status, 200); assert.match(style.headers.get('Content-Type'), /text\/css/);
    const social = await deployed.fetch('/assets/rapid-surf-map-social-20261114.png');
    assert.equal(social.status, 200); assert.match(social.headers.get('Content-Type'), /image\/png/);
    const sitemap = await deployed.fetch('/sitemap.xml');
    const $ = load(await sitemap.text(), { xmlMode: true });
    const urls = $('urlset > url > loc').toArray().map((node) => $(node).text());
    assert.equal(new Set(urls).size, 71);
    const statuses = await Promise.all(urls.map(async (url) => [url, (await deployed.fetch(new URL(url).pathname + new URL(url).search)).status]));
    for (const [url, status] of statuses) assert.equal(status, 200, `${url}: every sitemap canonical is actually served`);
  });

  await t.test('unknown pages do not return a successful copy of the homepage', async () => {
    for (const path of ['/not-a-real-page/', '/zh/not-a-real-page/', '/de/not-a-real-page/',
      '/rapid-surf-map/venues/not-a-real-venue/', '/zh/rapid-surf-map/venues/not-a-real-venue/', '/de/rapid-surf-map/venues/not-a-real-venue/',
      '/de/rapid-surf-map/venues/wai-kai/', '/zh/rapid-surf-map/venues/wellenwerk-berlin/']) {
      const response = await deployed.fetch(path);
      assert.equal(response.status, 404, path);
      assert.notEqual(await response.text(), await readFile('index.html', 'utf8'));
    }
  });

  await t.test('the runtime serves distinct indexable map views with stable canonical and language identity', async () => {
    const views = [
      ['?region=china', 'RapidSurfingMap.html', 'zh-Hans', 'venues.json'],
      ['?region=europe', 'venues/editions/europe-en.txt', 'en', 'venues-europe.json'],
      ['?region=europe&lang=de', 'venues/editions/europe-de.txt', 'de', 'venues-europe.json'],
      ['?region=north-america', 'venues/editions/north-america-en.txt', 'en', 'venues-north-america.json'],
    ];
    for (const [query, file, language, dataFile] of views) {
      const path = '/RapidSurfingMap' + query;
      const response = await deployed.fetch(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('Content-Language'), language, path);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store', path);
      assert.doesNotMatch(response.headers.get('X-Robots-Tag') || '', /noindex/i, path);
      const policy = response.headers.get('Content-Security-Policy');
      assert.ok(policy.includes('https://tile.openstreetmap.org'), path);
      assert.equal(policy.match(/default-src/g).length, 1, 'inherited CSP must be replaced, not combined');
      assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(self)');
      const html = await response.text();
      assert.ok(html === await readFile(file, 'utf8'), `${path}: runtime must serve the generated ${language} view`);
      const $ = load(html, { scriptingEnabled: false });
      const canonical = 'https://deepsurf.app' + path;
      assert.equal($('link[rel="canonical"]').attr('href'), canonical, path);
      assert.equal($('meta[property="og:url"]').attr('content'), canonical, path);
      assert.equal($('html').attr('lang'), language, path);
      assert.match($('title').text(), /Rapid Surf Map/, path);
      assert.equal($('#venue-list > details#map-guide').length, 1, path);
      const data = JSON.parse(await readFile('content/' + dataFile, 'utf8'));
      assert.equal($('.venue-card').length, data.venues.length, path);
      for (const venue of data.venues) assert.equal($(`#venue-${venue.id}`).length, 1, `${path}: ${venue.id}`);
      const head = await deployed.fetch(path, { method: 'HEAD' });
      assert.equal(head.status, 200, path);
      assert.equal(head.headers.get('Content-Language'), language, path);
      assert.equal(await head.text(), '', path);
    }
    const negotiated = await deployed.fetch('/RapidSurfingMap');
    assert.equal(negotiated.status, 200);
    const $ = load(await negotiated.text());
    const selected = JSON.parse($('#map-config').text());
    const edition = views.find(([query]) => new URLSearchParams(query).get('region') === selected.edition);
    assert.ok(edition, `default must select a configured edition, got ${selected.edition}`);
    assert.equal(negotiated.headers.get('Content-Language'), edition[2]);
    assert.equal($('link[rel="canonical"]').attr('href'), 'https://deepsurf.app/RapidSurfingMap' + edition[0]);
    assert.equal(selected.url, $('link[rel="canonical"]').attr('href'));
  });

  await t.test('legacy map routes redirect and private map sources remain unpublished', async () => {
    const aliases = ['', 'zh/', 'de/'].flatMap((prefix) => ['', '/', '/index.html'].map((suffix) => `/${prefix}venues${suffix}`));
    for (const path of [...aliases, '/RapidSurfingMap.html']) {
      const redirect = await deployed.fetch(path, { redirect: 'manual' });
      assert.equal(redirect.status, 301, path);
      assert.ok(redirect.headers.get('Location'), `${path}: redirect needs a destination`);
      assert.equal(new URL(redirect.headers.get('Location'), 'https://deepsurf.app').pathname, '/RapidSurfingMap', path);
    }
    for (const method of ['GET', 'HEAD']) {
      const path = '/RapidSurfingMap/?region=europe&lang=de';
      const redirect = await deployed.fetch(path, { method, redirect: 'manual' });
      assert.equal(redirect.status, 301, `${method} ${path}`);
      const target = new URL(redirect.headers.get('Location'), 'https://deepsurf.app');
      assert.equal(target.pathname, '/RapidSurfingMap');
      assert.equal(target.search, '?region=europe&lang=de', 'canonical path redirect preserves the requested view');
    }
    for (const [path, region] of [['/RapidSurfingMap-Europe', 'europe'], ['/RapidSurfingMap-USA', 'north-america']]) {
      const response = await deployed.fetch(path, { redirect: 'manual' });
      assert.equal(response.status, 301, path);
      const target = new URL(response.headers.get('Location'), 'https://deepsurf.app');
      assert.equal(target.pathname, '/RapidSurfingMap', path);
      assert.equal(target.searchParams.get('region'), region, path);
    }
    for (const path of ['/', '/zh/', '/de/', '/venues/map.js']) {
      const ordinary = await deployed.fetch(path);
      assert.equal(ordinary.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()', path);
      assert.ok(!ordinary.headers.get('Content-Security-Policy').includes('tile.openstreetmap.org'), path);
    }
    for (const path of ['/content/venues.json', '/content/venue-directory-details.json', '/docs/venue-sources.md',
      '/scripts/render-venues.mjs', '/scripts/venue-pages.mjs', '/scripts/render-map-social.mjs', '/design/rapid-surf-map-social.svg', '/tests/venues.test.mjs']) {
      assert.equal((await deployed.fetch(path)).status, 404, path);
    }
  });

  // Only this temporary test entry trusts our ephemeral test CA. The deployed
  // Pages entry points above are built and tested with the real Apple roots.
  await writeFile('.test-worker/test-entry.mjs', `
    import { Buffer } from 'node:buffer';
    import { createRetentionHandler } from '../server/retention.js';
    const roots = [Buffer.from('${chain.root.toString('base64')}', 'base64')];
    const sandbox = createRetentionHandler('Sandbox', roots);
    const production = createRetentionHandler('Production', roots);
    export default { fetch(request, env) {
      const handler = new URL(request.url).pathname.endsWith('/sandbox') ? sandbox : production;
      return handler({ request, env });
    } };
  `);
  const verified = createTestHarness({
    workers: [{ config: {
      ...runtimeConfig, name: 'retention-fixture-test', main: '.test-worker/test-entry.mjs',
    } }],
  });
  t.after(() => verified.close());
  await verified.listen();

  await t.test('real certificate and signature verification succeeds in workerd', async () => {
    for (const [path, environment] of [['/api/retention', 'Production'], ['/api/retention/sandbox', 'Sandbox']]) {
      const started = performance.now();
      const response = await post(verified, path, signedPayload(chain, { environment }));
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { message: { messageIdentifier: MESSAGE_ID } });
      t.diagnostic(`${environment} local request including signature verification: ${(performance.now() - started).toFixed(1)} ms`);
      assert.equal((await post(verified, path, signedPayload(chain, { environment, appAppleId: 123 }))).status, 401);
      assert.equal((await post(verified, path, signedPayload(chain, { environment, userLocale: 'fr-FR' }))).status, 503);
    }
  });
});
