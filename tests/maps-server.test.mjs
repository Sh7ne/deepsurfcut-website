import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAmapProxyHandler, mapConfig } from '../server/maps.js';

const env = {
  BAIDU_MAP_AK: 'test-baidu-browser-key-0001',
  AMAP_MAP_ENABLED: 'true',
  AMAP_MAP_KEY: 'test-amap-browser-key-0001',
  AMAP_SECURITY_JSCODE: 'test-server-secret-code-0001',
  OTHER_SECRET: 'not-a-public-map-setting',
};
const base = 'https://deepsurf.app';
const service = '/api/maps/amap/_AMapService';
const context = (path = `${service}/v4/maps`, options = {}, bindings = env) => ({
  request: new Request(new URL(path, base), { headers: { Referer: `${base}/zh/venues/` }, ...options }),
  env: bindings,
});

test('map bootstrap returns only public browser credentials and configuration status', async () => {
  const response = mapConfig(context('/api/maps/config'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const text = await response.text();
  assert.ok(!text.includes(env.AMAP_SECURITY_JSCODE));
  assert.ok(!text.includes(env.OTHER_SECRET));
  assert.deepEqual(JSON.parse(text), {
    baidu: { ak: env.BAIDU_MAP_AK, enabled: true },
    amap: { key: env.AMAP_MAP_KEY, enabled: true, serviceHost: service },
  });
  const missing = await mapConfig(context('/api/maps/config', {}, { AMAP_MAP_ENABLED: 'true', AMAP_MAP_KEY: env.AMAP_MAP_KEY })).json();
  assert.equal(missing.baidu.enabled, false);
  assert.equal(missing.amap.enabled, false);
  assert.equal(missing.amap.key, '');
  assert.equal(mapConfig(context('/api/maps/config', { method: 'POST' })).status, 405);
  assert.equal(mapConfig(context('/api/maps/config', { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
});

test('Amap stays private and makes no upstream requests until explicitly enabled', async () => {
  let calls = 0;
  const handler = createAmapProxyHandler(async () => { calls++; return Response.json({ status: '1' }); });
  const { AMAP_MAP_ENABLED, ...disabled } = env;
  for (const bindings of [disabled, { ...env, AMAP_MAP_ENABLED: 'false' }]) {
    const config = await mapConfig(context('/api/maps/config', {}, bindings)).json();
    assert.deepEqual(config.amap, { key: '', enabled: false, serviceHost: service });
    assert.equal(config.baidu.enabled, true);
    const response = await handler(context(undefined, {}, bindings));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'map_service_disabled' });
  }
  assert.equal(calls, 0);
  assert.equal((await mapConfig(context('/api/maps/config')).json()).amap.enabled, true);
  assert.equal((await handler(context())).status, 200);
  assert.equal(calls, 1);
  const unconfigured = await handler(context(undefined, {}, { AMAP_MAP_ENABLED: 'true' }));
  assert.equal(unconfigured.status, 503);
  assert.deepEqual(await unconfigured.json(), { error: 'map_service_unconfigured' });
  assert.equal(calls, 1);
});

test('proxy attaches configured credentials once, preserves SDK parameters and forwards no cookies', async () => {
  let call;
  const handler = createAmapProxyHandler(async (url, options) => {
    call = { url: new URL(url), options };
    return new Response('sdkCallback({"status":"1"})', { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Set-Cookie': 'provider-session=x', 'Location': 'https://other.example', 'X-Upstream': env.AMAP_SECURITY_JSCODE } });
  });
  const response = await handler(context(`${service}/v4/maps?key=wrong&KEY=other&jscode=bad&JSCODE=bad2&securityJsCode=bad3&callback=sdkCallback&z=5`, {
    headers: { Referer: `${base}/zh/venues/`, Origin: base, Cookie: 'session=private', Authorization: 'Bearer private' },
  }));
  assert.equal(call.url.origin, 'https://restapi.amap.com');
  assert.equal(call.url.pathname, '/v4/maps');
  assert.deepEqual(call.url.searchParams.getAll('key'), [env.AMAP_MAP_KEY]);
  assert.deepEqual(call.url.searchParams.getAll('jscode'), [env.AMAP_SECURITY_JSCODE]);
  assert.equal(call.url.searchParams.get('KEY'), null);
  assert.equal(call.url.searchParams.get('JSCODE'), null);
  assert.equal(call.url.searchParams.get('securityJsCode'), null);
  assert.equal(call.url.searchParams.get('z'), '5');
  assert.equal(call.options.redirect, 'manual');
  assert.equal(call.options.headers.get('Referer'), `${base}/zh/venues/`);
  assert.equal(call.options.headers.get('Cookie'), null);
  assert.equal(call.options.headers.get('Authorization'), null);
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/javascript; charset=utf-8');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.get('X-Upstream'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(await response.text(), 'sdkCallback({"status":"1"})');
});

test('styles and coordinate conversion route only to documented Amap hosts', async () => {
  const seen = [];
  const handler = createAmapProxyHandler(async (url) => { seen.push(new URL(url)); return Response.json({ status: '1' }); });
  await handler(context(`${service}/v4/map/styles?id=test`));
  await handler(context(`${service}/v3/assistant/coordinate/convert?locations=116.5,39.9&coordsys=gps`));
  assert.equal(seen[0].origin, 'https://webapi.amap.com');
  assert.equal(seen[0].pathname, '/v4/map/styles');
  assert.equal(seen[1].origin, 'https://restapi.amap.com');
  assert.equal(seen[1].pathname, '/v3/assistant/coordinate/convert');
  assert.equal(seen[1].searchParams.get('locations'), '116.5,39.9');
});

test('arbitrary paths, methods, origins and callback code cannot reach the upstream', async () => {
  let calls = 0;
  const handler = createAmapProxyHandler(async () => { calls++; return Response.json({}); });
  for (const path of [`${service}/v3/place/text`, `${service}/https://elsewhere.example`, `${service}//elsewhere.example/maps`, `${service}/v4%2Fmaps`, '/api/maps/amap/v4/maps']) {
    assert.equal((await handler(context(path))).status, 404, path);
  }
  for (const headers of [{}, { Origin: 'https://elsewhere.example' }, { Referer: 'https://elsewhere.example/venues/' }, { Origin: base, 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }]) {
    assert.equal((await handler(context(undefined, { headers }))).status, 403);
  }
  assert.equal((await handler(context(undefined, { method: 'POST' }))).status, 405);
  for (const query of ['callback=alert(1)', 'callback=ok&callback=again', 'callback=ok%5B%22run%22%5D', 'jscode%5B%5D=bad']) {
    assert.equal((await handler(context(`${service}/v4/maps?${query}`))).status, 400, query);
  }
  assert.equal((await handler(context(`${service}/v4/maps?x=${'a'.repeat(17000)}`))).status, 414);
  assert.equal((await handler(context(undefined, {}, {}))).status, 503);
  assert.equal(calls, 0);
});

test('upstream redirects, errors and reflected credentials return bounded generic failures', async () => {
  const upstreams = [
    () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/collect' } }),
    () => new Response(env.AMAP_SECURITY_JSCODE, { status: 401 }),
    () => Response.json({ url: `https://restapi.amap.com/?jscode=${env.AMAP_SECURITY_JSCODE}` }),
    () => Response.json({ key: env.AMAP_MAP_KEY }),
    () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('too large', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(5 * 1024 * 1024) } }),
    () => new Response(new Uint8Array(5 * 1024 * 1024), { headers: { 'Content-Type': 'application/octet-stream' } }),
    () => { throw new Error(`request failed with secret ${env.AMAP_SECURITY_JSCODE}`); },
  ];
  for (const upstream of upstreams) {
    const response = await createAmapProxyHandler(upstream)(context());
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.ok(!body.includes(env.AMAP_SECURITY_JSCODE));
    assert.ok(!body.includes(env.AMAP_MAP_KEY));
    assert.ok(body.length < 100);
  }
});

test('successful binary map responses retain their bytes and MIME type', async () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 255]);
  const handler = createAmapProxyHandler(async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  const response = await handler(context());
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
