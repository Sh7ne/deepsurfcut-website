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
    for (const [url, file] of [['/', 'index.html'], ['/zh/', 'zh/index.html'], ['/privacy/', 'privacy/index.html'], ['/home.css', 'home.css']]) {
      const response = await deployed.fetch(url);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), await readFile(file, 'utf8'));
    }
    const output = await readdir('dist', { recursive: true });
    for (const name of output) {
      assert.ok(!/(^|\/)(server|tests|node_modules|functions|scripts|\.git|\.DS_Store|\.dev\.vars)(\/|$)/.test(name), name);
      assert.ok(!['package.json', 'package-lock.json', 'wrangler.jsonc'].includes(name), name);
    }
    assert.deepEqual(JSON.parse(await readFile('dist/_routes.json', 'utf8')), {
      version: 1, include: ['/api/retention', '/api/retention/*'], exclude: [],
    });
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
