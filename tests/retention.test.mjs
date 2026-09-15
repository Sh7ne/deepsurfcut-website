import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRetentionHandler } from '../server/retention.js';
import { onRequest as deployedSandbox } from '../functions/api/retention/sandbox.js';
import { onRequest as deployedProduction } from '../functions/api/retention.js';
import { appleRootCertificates } from '../server/apple-roots.js';
import { createHash, X509Certificate } from 'node:crypto';
import { bindings, createTestChain, MESSAGE_ID, CHINESE_MESSAGE_ID, request, signedPayload } from './helpers.mjs';

const chain = createTestChain();
const sandbox = createRetentionHandler('Sandbox', [chain.root]);
const production = createRetentionHandler('Production', [chain.root]);
const call = (token, env = bindings, handler = sandbox, options) => handler({ request: request(token, options), env });

test('verified requests return the exact Apple response and do not cache customer responses', async () => {
  for (const [handler, environment] of [[sandbox, 'Sandbox'], [production, 'Production']]) {
    for (const [userLocale, messageIdentifier] of [['en-US', MESSAGE_ID], ['zh-Hans', CHINESE_MESSAGE_ID]]) {
      const response = await call(signedPayload(chain, { environment, userLocale }), bindings, handler);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { message: { messageIdentifier } });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.match(response.headers.get('Content-Type'), /application\/json/);
    }
  }
});

test('deployed routes trust Apple roots only, including when bindings contain test flags', async () => {
  for (const [handler, environment] of [[deployedSandbox, 'Sandbox'], [deployedProduction, 'Production']]) {
    const response = await call(signedPayload(chain, { environment }), {
      ...bindings, SKIP_VERIFICATION: 'true', APPLE_ROOT_CERTIFICATES: chain.root.toString('base64'),
    }, handler);
    assert.equal(response.status, 401);
  }
});

test('bundled Apple roots match the downloaded trust anchors and remain valid', () => {
  const fingerprints = [
    'b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024',
    'c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050',
    '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179',
  ];
  assert.equal(appleRootCertificates.length, fingerprints.length);
  appleRootCertificates.forEach((der, index) => {
    assert.equal(createHash('sha256').update(der).digest('hex'), fingerprints[index]);
    const certificate = new X509Certificate(der);
    assert.ok(certificate.ca && certificate.verify(certificate.publicKey));
    assert.ok(Date.parse(certificate.validFrom) < Date.now() && Date.parse(certificate.validTo) > Date.now());
  });
});

test('tampered signatures and payloads are rejected', async () => {
  const token = signedPayload(chain);
  const parts = token.split('.');
  const signature = Buffer.from(parts[2], 'base64url');
  signature[0] ^= 1;
  assert.equal((await call(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`)).status, 401);
  const forged = JSON.parse(Buffer.from(parts[1], 'base64url'));
  forged.productId = 'forged.subscription';
  assert.equal((await call(`${parts[0]}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${parts[2]}`)).status, 401);
});

test('wrong app IDs and mismatched environments fail in both environments', async () => {
  for (const [handler, environment, wrongEnvironment] of [[sandbox, 'Sandbox', 'Production'], [production, 'Production', 'Sandbox']]) {
    assert.equal((await call(signedPayload(chain, { environment, appAppleId: 123 }), bindings, handler)).status, 401);
    assert.equal((await call(signedPayload(chain, { environment: wrongEnvironment }), bindings, handler)).status, 401);
  }
  assert.throws(() => createRetentionHandler('LocalTesting', [chain.root]));
  assert.throws(() => createRetentionHandler('Xcode', [chain.root]));
});

test('stale, future, and malformed signed payloads fail', async () => {
  for (const overrides of [
    { signedDate: Date.now() - 6 * 60_000 }, { signedDate: Date.now() + 2 * 60_000 },
    { signedDate: null }, { signedDate: 1.5 }, { requestIdentifier: 'not-a-uuid' },
    { originalTransactionId: '' }, { productId: '' }, { userLocale: 12 },
  ]) assert.equal((await call(signedPayload(chain, overrides))).status, 401);
});

test('invalid chains, expired certificates, and missing Apple purpose extensions fail', async () => {
  for (const header of [{ x5c: [] }, { x5c: [chain.x5c[0]] }, { x5c: ['bad', 'bad', 'bad'] }]) {
    assert.equal((await call(signedPayload(chain, {}, header))).status, 401);
  }
  for (const options of [{ leafPurpose: false }, { intermediatePurpose: false }, { days: -1 }]) {
    const invalidChain = createTestChain(options);
    const handler = createRetentionHandler('Sandbox', [invalidChain.root]);
    assert.equal((await call(signedPayload(invalidChain), bindings, handler)).status, 401);
  }
});

test('missing, invalid, or unmatched configuration uses an explicit failure for Apple fallback', async () => {
  for (const config of [undefined, '', '{', 'null', '[]', '{}', JSON.stringify({ 'test.subscription': { 'en-US': 'placeholder' } })]) {
    const response = await call(signedPayload(chain), { RETENTION_MESSAGES_SANDBOX: config });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'message_unavailable' });
  }
  for (const overrides of [{ productId: 'unknown' }, { userLocale: 'fr-FR' }, { productId: '__proto__' }, { userLocale: 'constructor' }]) {
    assert.equal((await call(signedPayload(chain, overrides))).status, 503);
  }
  assert.equal((await call(signedPayload(chain), { RETENTION_MESSAGES_PRODUCTION: bindings.RETENTION_MESSAGES_PRODUCTION })).status, 503);
});

test('bad HTTP input, unsigned JWS, and unsupported algorithms fail cleanly', async () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await call('', bindings, sandbox, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'POST');
  }
  assert.equal((await call('', bindings, sandbox, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  for (const body of ['', '{', 'null', '[]', '{}', '{"signedPayload":null}', '{"signedPayload":"a.b.c"}']) {
    assert.equal((await call('', bindings, sandbox, { body })).status, 400);
  }
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { crit: ['unrecognized'] }]) {
    assert.equal((await call(signedPayload(chain, {}, header))).status, 400);
  }
  assert.equal((await call(signedPayload(chain), bindings, sandbox, { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } })).status, 200);
});

test('oversized requests fail even without a correct Content-Length', async () => {
  const oversized = 'x'.repeat(33 * 1024);
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': String(oversized.length) }]) {
    assert.equal((await call('', bindings, sandbox, { body: oversized, headers })).status, 413);
  }
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(33 * 1024)); },
    cancel() { cancelled = true; },
  });
  const response = await sandbox({ env: bindings, request: new Request('https://example.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
  }) });
  assert.equal(response.status, 413);
  assert.ok(cancelled);
});

test('repeated valid requests are deterministic and do not expose transaction data', async () => {
  const token = signedPayload(chain);
  const responses = await Promise.all(Array.from({ length: 10 }, () => call(token)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: { messageIdentifier: MESSAGE_ID } });
  }
});
