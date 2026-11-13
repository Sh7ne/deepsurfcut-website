import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderVenuePages } from '../scripts/render-venues.mjs';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';
const source = JSON.parse(await readFile(new URL('content/venues.json', root), 'utf8'));
const extras = JSON.parse(await readFile(new URL('content/venue-directory-details.json', root), 'utf8'));
const detailPath = (venue, lang) => `${lang === 'zh' ? '/zh' : lang === 'de' ? '/de' : ''}/rapid-surf-map/venues/${venue.id}/`;
const pages = await Promise.all([
  { lang: 'zh', htmlLang: 'zh-Hans', region: 'china', path: '/RapidSurfingMap?region=china', file: 'RapidSurfingMap.html', dataFile: 'venues.json', home: '/zh/' },
  { lang: 'en', htmlLang: 'en', region: 'europe', path: '/RapidSurfingMap?region=europe', file: 'venues/editions/europe-en.txt', dataFile: 'venues-europe.json', home: '/' },
  { lang: 'de', htmlLang: 'de', region: 'europe', path: '/RapidSurfingMap?region=europe&lang=de', file: 'venues/editions/europe-de.txt', dataFile: 'venues-europe.json', home: '/de/' },
  { lang: 'en', htmlLang: 'en', region: 'north-america', path: '/RapidSurfingMap?region=north-america', file: 'venues/editions/north-america-en.txt', dataFile: 'venues-north-america.json', home: '/' },
].map(async (page) => ({
  ...page,
  source: JSON.parse(await readFile(new URL(`content/${page.dataFile}`, root), 'utf8')),
  $: load(await readFile(new URL(page.file, root), 'utf8'), { scriptingEnabled: false }),
})));
const detailPages = await Promise.all(pages.flatMap((edition) => edition.source.venues.map(async (venue) => {
  const path = detailPath(venue, edition.lang);
  return { ...edition, venue, copy: { ...venue, ...venue.i18n?.[edition.lang] }, path, url: origin + path,
    $: load(await readFile(new URL(path.slice(1) + 'index.html', root), 'utf8'), { scriptingEnabled: false }) };
})));

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

test('all generated venue views and public data are current', async () => {
  await renderVenuePages({ check: true });
});

test('every map view exposes reviewed venue details and working deep links without JavaScript', () => {
  for (const page of pages) {
    const $ = page.$;
    assert.equal($('html').attr('lang'), page.htmlLang);
    assert.equal($('body').attr('data-lang'), page.lang);
    const venues = page.source.venues;
    assert.equal($('.venue-card').length, venues.length);
    assert.equal($('.venue-card[hidden]').length, 0);
    assert.equal($('.static-details').length, venues.length);
    const ids = $('[id]').toArray().map(element => $(element).attr('id'));
    assert.equal(new Set(ids).size, ids.length, `${page.path}: duplicate DOM IDs`);
    for (const venue of venues) {
      const copy = { ...venue, ...venue.i18n?.[page.lang] };
      const card = $(`#venue-${venue.id}`);
      assert.equal(card.length, 1);
      assert.equal(card.find(`[data-open="${venue.id}"]`).attr('href'), detailPath(venue, page.lang), 'the original HTML links to a crawlable venue page');
      const detail = card.find('.static-details');
      assert.ok(detail.text().includes(copy.description), `${page.path}: ${venue.id} description`);
      assert.ok(detail.text().includes(copy.address), `${page.path}: ${venue.id} address`);
      assert.ok(detail.text().includes(copy.seasonNote), `${page.path}: ${venue.id} opening information`);
      assert.ok(detail.find('.position-note').text().trim(), `${page.path}: ${venue.id} position accuracy explanation`);
      assert.equal(detail.find('time').attr('datetime'), venue.verifiedAt, `${page.path}: preserve source check date`);
      for (const item of venue.sources) assert.ok(detail.find(`a[href="${item.url}"]`).length);
      assert.ok(detail.find(`a.external-navigation[href^="${page.region === 'china' ? 'https://api.map.baidu.com/place/search?' : 'https://www.google.com/maps/search/?'}"]`).length);
    }
    const config = JSON.parse($('#map-config').text());
    assert.equal(config.lang, page.lang);
    assert.equal(config.venues.length, venues.length);
    assert.equal(config.url, origin + page.path);
    for (const venue of venues) {
      const record = config.venues.find(item => item.id === venue.id);
      assert.equal(record.verifiedAt, venue.verifiedAt, `${page.path}: keep venue verification independent of page revisions`);
      assert.equal(new URL(record.detailUrl, origin).href, origin + detailPath(venue, page.lang), `${venue.id}: sharing uses the matching language detail page`);
      for (const field of ['lat', 'lng', 'accuracy']) assert.equal(record.position[field], venue.position[field], `${venue.id}: preserve ${field}`);
      assert.deepEqual(record.sources.map(item => item.url), venue.sources.map(item => item.url));
    }
    assert.equal($('#result-count').text(), String(venues.length));
    assert.equal($('#city-filters [data-city]').length, new Set(venues.map(venue => venue.city)).size + 1);
    assert.ok($('#search').attr('aria-label'));
    assert.ok($('#filter-open').attr('aria-label'));
    assert.ok($('.map-attribution a[href="https://www.openstreetmap.org/copyright"]').length);
    assert.equal($('[data-map-language], .language-menu, .detail-languages').length, 0);
    assert.equal($('header').length, 0);
    assert.match($('main h1').text(), /Rapid Surf Map/);
    assert.equal($('.map-stage #about-open').attr('aria-controls'), 'about-dialog');
    assert.equal($('#about-dialog #map-provider').length, 1);
    assert.equal($('#about-dialog #provider-legal-attribution[hidden]').length, 1, 'native legal text belongs in the initially empty About host');
    assert.equal($('#provider-attribution').length, 1);
    assert.equal($('.map-stage > div#provider-attribution[hidden]').length, 1, 'the floating map logo is hosted directly on the map');
    assert.equal($('footer#provider-attribution, .tab-bar #provider-attribution').length, 0, 'the logo is outside the page footer and navigation row');
    assert.equal($('#about-dialog #provider-attribution').length, 0, 'the map logo keeps its independent map host');
    assert.equal($('#provider-legal-attribution').children().length, 0, 'provider legal text must come from the original SDK nodes');
    assert.equal($('#about-dialog .about-home-link').attr('href'), page.home);
    assert.equal($('script:not([src]):not([type="application/json"]):not([type="application/ld+json"])').length, 0,
      'the strict local-script CSP must not require inline executable scripts');
  }
});

test('venue metadata identifies each explicit view and preserves local assets', async () => {
  const titles = new Set();
  for (const page of pages) {
    const $ = page.$;
    const title = $('title').text();
    assert.ok(title && !titles.has(title));
    titles.add(title);
    assert.equal($('h1').length, 1);
    assert.equal($('link[rel="canonical"]').attr('href'), origin + page.path);
    assert.equal($('meta[property="og:url"]').attr('content'), origin + page.path);
    assert.equal($('link[rel="alternate"][hreflang]').length, page.region === 'europe' ? 3 : 0);
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    assert.equal(schema.url, origin + page.path);
    assert.equal(schema['@type'], 'CollectionPage');
    assert.equal(schema.description, $('meta[name="description"]').attr('content'));
    assert.equal(schema.inLanguage, page.htmlLang);
    assert.match(schema.dateModified, /^\d{4}-\d{2}-\d{2}/);
    assert.ok(Date.parse(schema.dateModified) >= Date.parse(page.source.updatedAt));
    assert.equal(schema.mainEntity.numberOfItems, page.source.venues.length);
    assert.equal(schema.mainEntity.itemListElement.length, page.source.venues.length);
    for (const [index, item] of schema.mainEntity.itemListElement.entries()) {
      const venue = page.source.venues[index];
      const copy = { ...venue, ...venue.i18n?.[page.lang] };
      const target = new URL(item.url);
      assert.equal(target.href, origin + detailPath(venue, page.lang));
      assert.equal(item.name, copy.name);
      assert.equal(item.position, index + 1);
      assert.ok(item.item?.['@id'], `${venue.id}: directory item identifies the stable Place entity`);
      if (venue.position.accuracy !== 'venue') assert.equal(item.item.geo, undefined, `${venue.id}: directory Place must not imply exact venue geometry`);
      if (extras[venue.id]?.contact?.parkPhone) assert.equal(item.item.telephone, undefined, `${venue.id}: directory Place must not label a park telephone as the venue`);
      const detail = detailPages.find((candidate) => candidate.url === target.href);
      const graph = JSON.parse(detail.$('script[type="application/ld+json"]').text())['@graph'];
      assert.equal(item.item['@id'], graph.find((node) => [node['@type']].flat().includes('Place'))['@id']);
    }
    for (const element of $('script[src], link[rel="stylesheet"]').toArray()) {
      const path = $(element).attr('src') || $(element).attr('href');
      assert.ok(path.startsWith('/'), `${page.path}: script and stylesheet must be local`);
      assert.ok((await stat(new URL(path.slice(1), root))).isFile(), path);
    }
  }
});

test('46 static venue pages retain reviewed facts, source dates and licensed photo credits without JavaScript', () => {
  assert.equal(detailPages.length, 46);
  const titles = new Set(), descriptions = new Set();
  for (const { $, venue, copy, path, url, lang, region } of detailPages) {
    const facts = extras[venue.id] || {};
    assert.equal($('html').attr('lang'), lang === 'zh' ? 'zh-Hans' : lang, path);
    assert.equal($('main h1').length, 1, path);
    assert.ok($('main h1').text().includes(copy.name), path);
    for (const text of [copy.description, copy.address, copy.seasonNote]) assert.ok($('main').text().includes(text), `${path}: reviewed body fact missing`);
    assert.ok($('time').toArray().some((node) => $(node).attr('datetime') === venue.verifiedAt), `${path}: venue check date is independent of page modification`);
    for (const item of venue.sources) assert.ok($(`main a[href="${item.url}"]`).length, `${path}: missing source ${item.url}`);
    if (facts.website) assert.ok($(`main a[href="${facts.website}"]`).length, `${path}: reviewed operator website`);
    if (facts.contact?.phone) assert.ok($(`main a[href="tel:${facts.contact.phone.replace(/[^\d+]/g, '')}"]`).length, path);
    if (facts.contact?.parkPhone) assert.match($('main').text(), /场地总机/, `${path}: park contact must stay qualified`);
    if (facts.photo) {
      assert.ok($(`main img[src="${facts.photo.url}"]`).length, path);
      assert.ok($(`main figcaption a[href="${facts.photo.source}"]`).text().includes(facts.photo.credit), path);
      assert.ok($(`main figcaption a[href="${facts.photo.licenseUrl}"]`).text().includes(facts.photo.license), path);
    }
    const title = $('title').text().trim(), description = $('meta[name="description"]').attr('content');
    assert.ok(title && description && !titles.has(title) && !descriptions.has(description), `${path}: unique public identity`);
    titles.add(title); descriptions.add(description);
    assert.equal($('link[rel="canonical"]').attr('href'), url, path);
    assert.equal($('meta[property="og:url"]').attr('content'), url, path);
    const map = new URL(`/RapidSurfingMap?region=${region}${lang === 'de' ? '&lang=de' : ''}#venue-${venue.id}`, origin);
    assert.ok($('a[href]').toArray().some((node) => new URL($(node).attr('href'), url).href === map.href), `${path}: explicit edition/language/hash return link`);
    assert.equal($('script[src*="/venues/provider-"], script[src*="leaflet"], #map').length, 0, `${path}: the static page must not initialize map SDKs`);
  }
});

test('venue Place entities preserve identity without inventing precise geometry, park telephones or business claims', () => {
  const identities = new Map();
  for (const { $, venue, path, url } of detailPages) {
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    const graph = schema['@graph'];
    assert.ok(Array.isArray(graph), path);
    const place = graph.find((node) => [node['@type']].flat().includes('Place'));
    const webpage = graph.find((node) => [node['@type']].flat().includes('WebPage'));
    const breadcrumbs = graph.find((node) => node['@type'] === 'BreadcrumbList');
    assert.ok(place?.['@id'] && webpage?.['@id'] && breadcrumbs, path);
    assert.equal(webpage.url, url, path);
    assert.equal(webpage.mainEntity['@id'], place['@id'], path);
    assert.equal(breadcrumbs.itemListElement.at(-1).item, url, path);
    if (identities.has(venue.id)) assert.equal(place['@id'], identities.get(venue.id), `${path}: translations describe the same physical Place`);
    identities.set(venue.id, place['@id']);
    if (venue.position.accuracy !== 'venue') assert.equal(place.geo, undefined, `${path}: site/approximate markers are not exact venue geometry`);
    else if (place.geo) {
      assert.equal(place.geo.latitude, venue.position.lat, path);
      assert.equal(place.geo.longitude, venue.position.lng, path);
    }
    const contact = extras[venue.id]?.contact;
    if (contact?.parkPhone || !contact?.phone) assert.equal(place.telephone, undefined, `${path}: only a reviewed direct venue telephone may be structured`);
    else if (place.telephone) assert.equal(place.telephone.replace(/[^\d+]/g, ''), contact.phone.replace(/[^\d+]/g, ''), path);
    if (place.sameAs) assert.equal(place.sameAs, extras[venue.id]?.website, `${path}: official identity is reviewed source data`);
    assert.doesNotMatch(JSON.stringify(schema), /"(?:openingHours|openingHoursSpecification|aggregateRating|review|offers|priceRange|currenciesAccepted)"/, `${path}: no inferred opening hours, ratings or commercial claims`);
  }
  assert.equal(identities.size, 32, 'translations share the 32 physical venue identities');
});

test('the map guide provides accessible static answers, source context, and localized editing links', () => {
  const terms = {
    zh: [/Rapid Surfing/, /深水/, /自然|河流/, /筛选|搜索/, /资料|来源/, /位置|入口/, /实时|预约/],
    en: [/rapid surfing/i, /deep.water/i, /river/i, /filter|search/i, /source|check/i, /position|location|entrance/i, /live|book/i],
    de: [/Rapid Surfing|Rapidsurfen/, /Tiefwasser/i, /Fluss/i, /Filter|such/i, /Quelle|Prüf/i, /Position|Gelände|Eingang/i, /live|Buch|Termin/i],
  };
  for (const page of pages) {
    const $ = page.$;
    const guide = $('#venue-list > details#map-guide');
    assert.equal(guide.length, 1, page.path);
    assert.equal(guide.closest('.venue-card, dialog').length, 0, 'guide remains readable outside venue dialogs');
    assert.equal(guide.is('[hidden], [aria-hidden="true"]'), false, page.path);
    assert.ok(guide.children('summary').text().trim(), `${page.path}: native keyboard-operable disclosure`);
    const content = guide.text().replace(/\s+/g, ' ');
    for (const term of terms[page.lang]) assert.match(content, term, page.path);
    const prefix = page.lang === 'zh' ? '/zh/' : page.lang === 'de' ? '/de/' : '/';
    assert.ok(guide.find(`a[href="${prefix}surf-video-editing/#rapid-surfing"]`).length, page.path);
    assert.ok(guide.find(`a[href="${prefix}portrait-follow/"]`).length, page.path);
  }
});

test('tile and location permissions are confined to map routes', async () => {
  const headers = await readFile(new URL('_headers', root), 'utf8');
  const blocks = headers.split(/\n\s*\n/);
  const global = blocks.find(block => block.startsWith('/*\n'));
  assert.ok(global.includes('geolocation=()'));
  assert.ok(!global.includes('tile.openstreetmap.org'));
  assert.doesNotMatch(global, /unsafe-eval|unsafe-inline|http:\/\/api\.map\.baidu\.com/);
  {
    const block = blocks.find(block => block.split('\n').includes('/RapidSurfingMap'));
    assert.ok(block, 'missing static fallback map headers');
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

test('the unified map respects country defaults and explicit regional and German links', async () => {
  const { mapEdition } = await import('../functions/RapidSurfingMap.js');
  const cases = [
    ['', 'CN', 'china', 'zh'], ['', 'US', 'north-america', 'en'], ['', 'CA', 'north-america', 'en'], ['', 'DE', 'europe', 'en'],
    ['', undefined, 'europe', 'en'], ['region=europe&lang=de', 'US', 'europe', 'de'],
    ['region=north-america&lang=de', 'DE', 'north-america', 'en'],
    ['region=usa', 'DE', 'north-america', 'en'], ['region=china', 'US', 'china', 'zh'],
    ['region=invalid', 'US', 'north-america', 'en'],
  ];
  for (const [query, country, region, lang] of cases) {
    const result = mapEdition(new URLSearchParams(query), country);
    assert.equal(result.region, region);
    assert.equal(result.lang, lang);
  }
});
