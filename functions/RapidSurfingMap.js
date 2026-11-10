const basePath = '/RapidSurfingMap';
const chineseRegions = new Set(['CN', 'HK', 'MO', 'TW']);
const northAmericaRegions = new Set(['CA', 'US', 'AS', 'GU', 'MP', 'PR', 'VI', 'UM']);
const editions = new Set(['china', 'europe', 'north-america']);

const internationalPolicy = "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const chinaPolicy = "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.amap.com https://*.autonavi.com https://*.bdimg.com https://*.bdstatic.com https://api.map.baidu.com; media-src 'self'; script-src 'self' 'unsafe-eval' https://webapi.amap.com https://api.map.baidu.com https://*.bdimg.com https://dlswbr.baidu.com; style-src 'self' 'unsafe-inline' https://api.map.baidu.com; connect-src 'self' https://*.amap.com https://*.autonavi.com https://api.map.baidu.com https://*.bdimg.com https://*.bdstatic.com; upgrade-insecure-requests; worker-src 'self' blob:; font-src 'self' data: https://webapi.amap.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export function mapEdition(searchParams, country) {
  const requestedRegion = searchParams.get('region');
  const requested = requestedRegion === 'usa' ? 'north-america' : requestedRegion;
  const region = editions.has(requested) ? requested
    : searchParams.get('lang') === 'de' ? 'europe'
      : chineseRegions.has(country) ? 'china' : northAmericaRegions.has(country) ? 'north-america' : 'europe';
  const lang = region === 'china' ? 'zh' : region === 'europe' && searchParams.get('lang') === 'de' ? 'de' : 'en';
  return { region, lang, asset: region === 'china' ? basePath : `/venues/editions/${region}-${lang}.txt` };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const { region, lang, asset } = mapEdition(url.searchParams, request.cf?.country);
  const response = await env.ASSETS.fetch(new URL(asset, url.origin));
  if (!response.ok) return new Response('Map unavailable', { status: 503 });
  // Pages Functions set their own response headers. Region selection varies by
  // request country, so keep the negotiated HTML out of shared caches.
  const localPreview = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  const policy = region !== 'china' ? internationalPolicy : localPreview
    ? chinaPolicy.replace(/(script-src|connect-src) ([^;]+)/g, '$1 $2 http://api.map.baidu.com http://*.bdimg.com')
    : chinaPolicy;
  const headers = {
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Language': lang === 'zh' ? 'zh-Hans' : lang,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy': policy,
  };
  if (url.hostname.endsWith('.pages.dev')) headers['X-Robots-Tag'] = 'noindex, follow';
  return new Response(request.method === 'HEAD' ? null : response.body, { headers });
}
