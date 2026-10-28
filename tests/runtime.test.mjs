import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createTestHarness } from 'wrangler';
import { bindings, createTestChain, MESSAGE_ID, signedPayload } from './helpers.mjs';

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
    for (const [url, file] of [['/', 'index.html'], ['/zh/', 'zh/index.html'], ['/privacy/', 'privacy/index.html'], ['/home.css', 'home.css'], ['/updates/', 'updates/index.html'], ['/zh/updates/', 'zh/updates/index.html'], ['/de/', 'de/index.html'], ['/de/updates/', 'de/updates/index.html'], ['/de/surf-video-editing/', 'de/surf-video-editing/index.html'], ['/portrait-follow/', 'portrait-follow/index.html'], ['/zh/portrait-follow/', 'zh/portrait-follow/index.html'], ['/de/portrait-follow/', 'de/portrait-follow/index.html'], ['/portrait-follow.css', 'portrait-follow.css'], ['/assets/icons-20261015.js', 'assets/icons-20261015.js'], ['/RapidSurfingMap', 'RapidSurfingMap.html'], ['/venues/map.js', 'venues/map.js'], ['/venues/map.css', 'venues/map.css'], ['/venues/data.json', 'venues/data.json']]) {
      const response = await deployed.fetch(url);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(file, 'utf8'));
    }
    const output = await readdir('dist', { recursive: true });
    for (const name of output) {
      assert.ok(!/(^|\/)(server|tests|node_modules|functions|scripts|content|docs|\.git|\.DS_Store|\.dev\.vars)(\/|$)/.test(name), name);
      assert.ok(!['AGENTS.md', 'README.md', 'package.json', 'package-lock.json', 'wrangler.jsonc'].includes(name), name);
      assert.ok(!['venues/index.html', 'zh/venues/index.html', 'de/venues/index.html'].includes(name), `${name}: legacy map pages must redirect instead`);
    }
    assert.deepEqual(JSON.parse(await readFile('dist/_routes.json', 'utf8')), {
      version: 1, include: ['/api/retention', '/api/retention/*', '/api/maps/*'], exclude: [],
    });
  });

  await t.test('unknown pages do not return a successful copy of the homepage', async () => {
    for (const path of ['/not-a-real-page/', '/zh/not-a-real-page/', '/de/not-a-real-page/']) {
      const response = await deployed.fetch(path);
      assert.equal(response.status, 404, path);
      assert.notEqual(await response.text(), await readFile('index.html', 'utf8'));
    }
  });

  await t.test('the standalone map has one effective tile policy and legacy maps redirect to it', async () => {
    const response = await deployed.fetch('/RapidSurfingMap');
    assert.equal(response.status, 200);
    const policy = response.headers.get('Content-Security-Policy');
    assert.ok(policy.includes('https://tile.openstreetmap.org'));
    assert.equal(policy.match(/default-src/g).length, 1, 'inherited CSP must be replaced, not combined');
    assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(self)');
    assert.match(await response.text(), /id="venue-back-to-sea"/);
    const aliases = ['', 'zh/', 'de/'].flatMap((prefix) => ['', '/', '/index.html'].map((suffix) => `/${prefix}venues${suffix}`));
    for (const path of [...aliases, '/RapidSurfingMap/', '/RapidSurfingMap.html']) {
      const redirect = await deployed.fetch(path, { redirect: 'manual' });
      assert.equal(redirect.status, 301, path);
      assert.ok(redirect.headers.get('Location'), `${path}: redirect needs a destination`);
      assert.equal(new URL(redirect.headers.get('Location'), 'https://deepsurf.app').pathname, '/RapidSurfingMap', path);
    }
    for (const path of ['/', '/zh/', '/de/', '/venues/map.js']) {
      const ordinary = await deployed.fetch(path);
      assert.equal(ordinary.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()', path);
      assert.ok(!ordinary.headers.get('Content-Security-Policy').includes('tile.openstreetmap.org'), path);
    }
    for (const path of ['/content/venues.json', '/docs/venue-sources.md', '/scripts/render-venues.mjs', '/tests/venues.test.mjs']) {
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
