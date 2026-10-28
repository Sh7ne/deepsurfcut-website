// Browser keys are intentionally public. The Amap security code is only read
// here, and is attached solely to requests sent to fixed Amap service endpoints.
const SERVICE_PREFIX = '/api/maps/amap/_AMapService';
const MAX_URL_LENGTH = 16 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PARAMETER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const CALLBACK_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

// These are the services used by the venue map, not a general Web Services
// proxy. Keep additions explicit when enabling another SDK feature.
const UPSTREAMS = new Map([
  ['/v4/maps', 'https://restapi.amap.com'],
  ['/v4/map/styles', 'https://webapi.amap.com'],
  ['/v3/assistant/coordinate/convert', 'https://restapi.amap.com'],
]);

function responseHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extra,
  };
}

function fail(status, error, extra) {
  return Response.json({ error }, { status, headers: responseHeaders(extra) });
}

function credential(env, name) {
  const value = typeof env?.[name] === 'string' ? env[name].trim() : '';
  return KEY_PATTERN.test(value) ? value : '';
}

function allowedOrigin(request, { requireEvidence = false } = {}) {
  const expected = new URL(request.url).origin;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  let evidence = fetchSite === 'same-origin';
  for (const name of ['Origin', 'Referer']) {
    const value = request.headers.get(name);
    if (!value) continue;
    try {
      if (new URL(value).origin !== expected) return false;
      evidence = true;
    } catch { return false; }
  }
  return !requireEvidence || evidence;
}

export function mapConfig({ request, env }) {
  if (request.method !== 'GET') return fail(405, 'method_not_allowed', { Allow: 'GET' });
  if (!allowedOrigin(request)) return fail(403, 'origin_not_allowed');
  const ak = credential(env, 'BAIDU_MAP_AK');
  const key = credential(env, 'AMAP_MAP_KEY');
  const secret = credential(env, 'AMAP_SECURITY_JSCODE');
  const amapEnabled = env?.AMAP_MAP_ENABLED === 'true' && Boolean(key && secret);
  return Response.json({
    baidu: { ak, enabled: Boolean(ak) },
    amap: { key: amapEnabled ? key : '', enabled: amapEnabled, serviceHost: SERVICE_PREFIX },
  }, { headers: responseHeaders() });
}

async function boundedBody(response) {
  if (Number(response.headers.get('Content-Length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function createAmapProxyHandler(fetcher = globalThis.fetch) {
  return async function amapProxy({ request, env }) {
    if (request.method !== 'GET') return fail(405, 'method_not_allowed', { Allow: 'GET' });
    if (!allowedOrigin(request, { requireEvidence: true })) return fail(403, 'origin_not_allowed');
    if (request.url.length > MAX_URL_LENGTH) return fail(414, 'request_too_large');
    const url = new URL(request.url);
    const path = url.pathname.startsWith(`${SERVICE_PREFIX}/`) ? url.pathname.slice(SERVICE_PREFIX.length) : '';
    const origin = UPSTREAMS.get(path);
    if (!origin) return fail(404, 'map_service_not_found');
    if (env?.AMAP_MAP_ENABLED !== 'true') return fail(503, 'map_service_disabled');
    const key = credential(env, 'AMAP_MAP_KEY');
    const secret = credential(env, 'AMAP_SECURITY_JSCODE');
    if (!key || !secret) return fail(503, 'map_service_unconfigured');

    const upstream = new URL(path, origin);
    let count = 0;
    const callbackNames = new Set();
    for (const [name, value] of url.searchParams) {
      if (++count > 80 || !PARAMETER_PATTERN.test(name)) return fail(400, 'invalid_map_request');
      const lower = name.toLowerCase();
      // Replace every spelling and duplicate with the configured credentials.
      if (['key', 'jscode', 'securityjscode'].includes(lower)) continue;
      if (['callback', 'cb', 'jsonp'].includes(lower)) {
        if (callbackNames.has(lower) || value.length > 128 || !CALLBACK_PATTERN.test(value)) return fail(400, 'invalid_map_request');
        callbackNames.add(lower);
      }
      upstream.searchParams.append(name, value);
    }
    upstream.searchParams.set('key', key);
    upstream.searchParams.set('jscode', secret);

    const headers = new Headers({ Accept: '*/*' });
    // Preserve the validated site identity for the provider's browser-key
    // restrictions. Never forward browser cookies or Authorization headers.
    for (const name of ['Origin', 'Referer']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const response = await fetcher(upstream.href, {
        method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return fail(502, 'map_service_unavailable');
      }
      const type = response.headers.get('Content-Type') || 'application/octet-stream';
      if (!/^(?:application\/(?:json|javascript|x-javascript|octet-stream|x-protobuf)|text\/(?:javascript|plain)|image\/(?:png|jpeg|webp))(?:\s*;|$)/i.test(type)) {
        await response.body?.cancel();
        return fail(502, 'invalid_map_response');
      }
      const body = await boundedBody(response);
      // Provider failures can contain reflected request URLs. Neither those
      // bodies nor response headers are allowed to disclose the server secret.
      const text = new TextDecoder().decode(body);
      if (text.includes(secret) || text.includes(key)) return fail(502, 'invalid_map_response');
      return new Response(body, {
        status: 200,
        headers: responseHeaders({ 'Content-Type': type }),
      });
    } catch {
      // Do not log or relay exceptions: fetch errors may include the full URL.
      return fail(502, 'map_service_unavailable');
    }
  };
}
