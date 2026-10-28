import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderVenuePages } from '../scripts/render-venues.mjs';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';
const source = JSON.parse(await readFile(new URL('content/venues.json', root), 'utf8'));
const pages = [{
  lang: 'zh', htmlLang: 'zh-Hans', path: '/RapidSurfingMap',
  $: load(await readFile(new URL('RapidSurfingMap.html', root), 'utf8')),
}];

test('the venue directory retains eleven distinct reviewed sites with honest seasonal and position data', () => {
  assert.equal(source.coordinateSystem, 'WGS84');
  assert.equal(source.venues.length, 11);
  const ids = new Set();
  const positions = new Set();
  const byCity = {};
  for (const venue of source.venues) {
    assert.match(venue.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(venue.id), `duplicate public identity: ${venue.id}`);
    ids.add(venue.id);
    byCity[venue.city] = (byCity[venue.city] || 0) + 1;
    for (const key of ['name', 'shortName', 'description', 'summary', 'address', 'seasonNote']) {
      assert.ok(typeof venue[key] === 'string' && venue[key].trim(), `${venue.id}: missing ${key}`);
    }
    assert.ok(['indoor', 'outdoor'].includes(venue.environment));
    assert.equal(typeof venue.seasonal, 'boolean');
    assert.match(venue.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Date.parse(venue.verifiedAt) <= Date.parse(source.updatedAt));
    assert.ok(venue.sources.length > 0, `${venue.id}: preserve source attribution`);
    for (const item of venue.sources) {
      assert.ok(item.label.trim());
      assert.equal(new URL(item.url).protocol, 'https:');
    }
    const position = venue.position;
    assert.ok(Number.isFinite(position.lat) && position.lat > 18 && position.lat < 54, venue.id);
    assert.ok(Number.isFinite(position.lng) && position.lng > 73 && position.lng < 135, venue.id);
    assert.ok(['venue', 'site', 'approximate'].includes(position.accuracy));
    assert.ok(position.label.trim(), `${venue.id}: explain position accuracy`);
    assert.equal(new URL(position.sourceUrl).protocol, 'https:');
    assert.ok(!positions.has(`${position.lat},${position.lng}`), `${venue.id}: duplicate position`);
    positions.add(`${position.lat},${position.lng}`);
  }
  assert.deepEqual(byCity, { '北京': 3, '上海': 4, '湖州': 1, '成都': 1, '杭州·建德': 1, '昆明': 1 });
  assert.deepEqual(source.venues.filter(venue => venue.seasonal).map(venue => venue.id).sort(),
    ['hala-huzhou', 'panda-chengdu', 'qingyuwan-kunming']);
  assert.ok(source.venues.filter(venue => venue.seasonal).every(venue => venue.environment === 'outdoor'));
  assert.doesNotMatch(source.venues.find(venue => venue.id === 'panda-chengdu').name, /SURFPARK/i);
  const publicText = JSON.stringify(source);
  assert.doesNotMatch(publicText, /libfile_|library_file_id|用户原话|本轮修订依据|内部笔记|实时营业中|openNow|"(?:price|offers|aggregateRating|apiKey|token)"/i);
});

test('the generated Chinese venue page and public data are current', async () => {
  await renderVenuePages({ check: true });
});

test('the Chinese map exposes complete venue details and working deep links without JavaScript', () => {
  for (const page of pages) {
    const $ = page.$;
    assert.equal($('html').attr('lang'), page.htmlLang);
    assert.equal($('body').attr('data-lang'), page.lang);
    assert.equal($('.venue-card').length, source.venues.length);
    assert.equal($('.venue-card[hidden]').length, 0);
    assert.equal($('.static-details').length, source.venues.length);
    const ids = $('[id]').toArray().map(element => $(element).attr('id'));
    assert.equal(new Set(ids).size, ids.length, `${page.path}: duplicate DOM IDs`);
    for (const venue of source.venues) {
      const card = $(`#venue-${venue.id}`);
      assert.equal(card.length, 1);
      assert.equal(card.find(`[data-open="${venue.id}"]`).attr('href'), `#venue-${venue.id}`);
      const detail = card.find('.static-details');
      assert.ok(detail.text().includes(venue.description));
      assert.ok(detail.text().includes(venue.address));
      assert.ok(detail.text().includes(venue.seasonNote));
      assert.ok(detail.text().includes(venue.position.label));
      assert.equal(detail.find('time').attr('datetime'), venue.verifiedAt);
      for (const item of venue.sources) assert.ok(detail.find(`a[href="${item.url}"]`).length);
      assert.ok(detail.find('a.external-navigation[href^="https://api.map.baidu.com/place/search?"]').length);
    }
    const config = JSON.parse($('#map-config').text());
    assert.equal(config.lang, page.lang);
    assert.equal(config.venues.length, source.venues.length);
    assert.equal($('#result-count').text(), '11');
    assert.equal($('#city-filters [data-city]').length, 7);
    assert.ok($('#search').attr('aria-label'));
    assert.ok($('#filter-open').attr('aria-label'));
    assert.ok($('.map-attribution a[href="https://www.openstreetmap.org/copyright"]').length);
    assert.equal($('[data-map-language], .language-menu, .detail-languages').length, 0);
    assert.equal($('header').length, 0);
    assert.equal($('h1.sr-only').text(), '中国深水冲浪场馆地图');
    assert.equal($('.map-stage #about-open').attr('aria-controls'), 'about-dialog');
    assert.equal($('#about-dialog #map-provider').length, 1);
    assert.equal($('#about-dialog #provider-legal-attribution[hidden]').length, 1, 'native legal text belongs in the initially empty About host');
    assert.equal($('#provider-attribution').length, 1);
    assert.equal($('.map-stage > div#provider-attribution[hidden]').length, 1, 'the floating map logo is hosted directly on the map');
    assert.equal($('footer#provider-attribution, .tab-bar #provider-attribution').length, 0, 'the logo is outside the page footer and navigation row');
    assert.equal($('#about-dialog #provider-attribution').length, 0, 'the map logo keeps its independent map host');
    assert.equal($('#provider-legal-attribution').children().length, 0, 'provider legal text must come from the original SDK nodes');
    assert.equal($('#about-dialog .about-home-link').attr('href'), '/zh/');
    assert.equal($('script:not([src]):not([type="application/json"]):not([type="application/ld+json"])').length, 0,
      'the strict local-script CSP must not require inline executable scripts');
  }
});

test('venue metadata identifies one Chinese canonical page and preserves local assets', async () => {
  const titles = new Set();
  for (const page of pages) {
    const $ = page.$;
    const title = $('title').text();
    assert.ok(title && !titles.has(title));
    titles.add(title);
    assert.equal($('h1').length, 1);
    assert.equal($('link[rel="canonical"]').attr('href'), origin + page.path);
    assert.equal($('meta[property="og:url"]').attr('content'), origin + page.path);
    assert.equal($('link[rel="alternate"]').length, 0);
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    assert.equal(schema.url, origin + page.path);
    assert.equal(schema.mainEntity.numberOfItems, 11);
    for (const item of schema.mainEntity.itemListElement) {
      assert.equal(new URL(item.url).pathname, page.path);
      assert.equal($(new URL(item.url).hash).length, 1);
    }
    for (const element of $('script[src], link[rel="stylesheet"]').toArray()) {
      const path = $(element).attr('src') || $(element).attr('href');
      assert.ok(path.startsWith('/'), `${page.path}: script and stylesheet must be local`);
      assert.ok((await stat(new URL(path.slice(1), root))).isFile(), path);
    }
  }
});

test('tile and location permissions are confined to map routes', async () => {
  const headers = await readFile(new URL('_headers', root), 'utf8');
  const blocks = headers.split(/\n\s*\n/);
  const global = blocks.find(block => block.startsWith('/*\n'));
  assert.ok(global.includes('geolocation=()'));
  assert.ok(!global.includes('tile.openstreetmap.org'));
  assert.doesNotMatch(global, /unsafe-eval|unsafe-inline|http:\/\/api\.map\.baidu\.com/);
  for (const page of pages) {
    const block = blocks.find(block => block.split('\n').includes(page.path));
    assert.ok(block, `${page.path}: missing map headers`);
    assert.ok(block.includes('! Content-Security-Policy'));
    assert.ok(block.includes('! Permissions-Policy'));
    assert.match(block, /img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
    assert.match(block, /script-src 'self' 'unsafe-eval' https:\/\/webapi\.amap\.com https:\/\/api\.map\.baidu\.com https:\/\/\*\.bdimg\.com https:\/\/dlswbr\.baidu\.com;/);
    assert.match(block, /style-src 'self' 'unsafe-inline' https:\/\/api\.map\.baidu\.com;/);
    assert.match(block, /worker-src 'self' blob:;/);
    assert.match(block, /geolocation=\(self\)/);
    assert.doesNotMatch(block, /script-src[^;]*unsafe-inline/);
    assert.doesNotMatch(block, /http:\/\//);
  }
});
