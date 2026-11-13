import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';

test('footer navigation centers its controls without leaking layout into language menus', async () => {
  const css = await readFile(new URL('home.css', root), 'utf8');
  assert.match(css, /\.site-footer\s*>\s*nav\s*\{[^}]*align-items:\s*center/);
  assert.doesNotMatch(css, /\.site-footer\s+nav\s*\{/, 'footer layout rules must target only its direct navigation');
});
const groups = [
  ['', ['standing waves', '深水冲浪', 'stehenden Wellen']],
  ['support/', ['Supported workflow', '支持的工作流程', 'Unterstützter Workflow']],
  ['privacy/', ['Privacy Policy', '隐私政策', 'Datenschutzerklärung']],
  ['terms/', ['Terms of Use', '使用条款', 'Nutzungsbedingungen']],
  ['updates/', ["What's new", '版本更新', 'Neu in DeepSurfCut']],
  ['surf-video-editing/', ['FlowRider', 'FlowRider', 'FlowRider']],
  ['portrait-follow/', ['Portrait Follow', '竖屏跟拍', 'Portrait Follow']],
];
const languages = [
  { prefix: '', language: 'en', locale: 'en_US' },
  { prefix: 'zh/', language: 'zh-Hans', locale: 'zh_CN' },
  { prefix: 'de/', language: 'de', locale: 'de_DE' },
];
const pages = groups.flatMap(([group, content]) => languages.map((language, index) => ({
  ...language, group, file: language.prefix + group + 'index.html',
  path: '/' + language.prefix + group, content: content[index],
})));
const alternativesFor = (page) => Object.fromEntries([
  ...languages.map((language) => [language.language, origin + '/' + language.prefix + page.group]),
  ['x-default', origin + '/' + page.group],
]);

const documents = await Promise.all(pages.map(async (page) => {
  const html = await readFile(new URL(page.file, root), 'utf8');
  return { ...page, url: `${origin}${page.path}`, html, $: load(html) };
}));
const mapDocuments = await Promise.all([
  { file: 'RapidSurfingMap.html', path: '/RapidSurfingMap?region=china', language: 'zh-Hans', locale: 'zh_CN', home: '/zh/' },
  { file: 'venues/editions/europe-en.txt', path: '/RapidSurfingMap?region=europe', language: 'en', locale: 'en_US', home: '/' },
  { file: 'venues/editions/europe-de.txt', path: '/RapidSurfingMap?region=europe&lang=de', language: 'de', locale: 'de_DE', home: '/de/' },
  { file: 'venues/editions/north-america-en.txt', path: '/RapidSurfingMap?region=north-america', language: 'en', locale: 'en_US', home: '/' },
].map(async (page) => {
  const html = await readFile(new URL(page.file, root), 'utf8');
  return { ...page, url: origin + page.path, html, $: load(html) };
}));
const mapAlternatives = {
  en: `${origin}/RapidSurfingMap?region=europe`,
  de: `${origin}/RapidSurfingMap?region=europe&lang=de`,
  'x-default': `${origin}/RapidSurfingMap?region=europe`,
};
const venueDocuments = (await Promise.all([
  ['venues.json', 'zh', 'zh-Hans', 'zh_CN', 'china'],
  ['venues-europe.json', 'en', 'en', 'en_US', 'europe'],
  ['venues-europe.json', 'de', 'de', 'de_DE', 'europe'],
  ['venues-north-america.json', 'en', 'en', 'en_US', 'north-america'],
].map(async ([file, lang, language, locale, region]) => {
  const data = JSON.parse(await readFile(new URL(`content/${file}`, root), 'utf8'));
  return Promise.all(data.venues.map(async (venue) => {
    const path = `${lang === 'zh' ? '/zh' : lang === 'de' ? '/de' : ''}/rapid-surf-map/venues/${venue.id}/`;
    const file = path.slice(1) + 'index.html';
    const html = await readFile(new URL(file, root), 'utf8');
    return { file, path, url: origin + path, language, locale, region, venue, html, $: load(html) };
  }));
}))).flat();
const venueAlternativesFor = (page) => page.region === 'europe' ? {
  en: `${origin}/rapid-surf-map/venues/${page.venue.id}/`,
  de: `${origin}/de/rapid-surf-map/venues/${page.venue.id}/`,
  'x-default': `${origin}/rapid-surf-map/venues/${page.venue.id}/`,
} : {};

const single = ($, selector, label) => {
  const elements = $(selector);
  assert.equal(elements.length, 1, `${label}: expected one ${selector}`);
  return elements;
};

const meta = ($, name, label) => {
  const value = single($, `head meta[name="${name}"], head meta[property="${name}"]`, label).attr('content');
  assert.ok(value?.trim(), `${label}: ${name} must not be empty`);
  return value.trim();
};

const canonical = ($, label) => single($, 'head link[rel="canonical"]', label).attr('href');
const hasType = (node, type) => [node?.['@type']].flat().includes(type);

const assertLocalFile = async (url, label) => {
  assert.equal(url.origin, origin, `${label}: expected a local website resource`);
  const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const view = path === 'RapidSurfingMap' && url.search
    ? mapDocuments.find((page) => page.url === url.origin + url.pathname + url.search) : null;
  if (path === 'RapidSurfingMap' && url.search) assert.ok(view, `${label}: unknown map view ${url.search}`);
  const file = path === 'RapidSurfingMap' ? view?.file || 'RapidSurfingMap.html'
    : path.endsWith('/') || !path ? `${path}index.html` : path;
  const location = new URL(file, root);
  assert.ok(location.href.startsWith(root.href), `${label}: resource must stay within the website`);
  const info = await stat(location).catch(() => null);
  assert.ok(info?.isFile(), `${label}: missing ${fileURLToPath(location)}`);
  return location;
};

test('all public pages have unique titles, descriptions, and crawlable primary content', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of documents) {
    const title = single(page.$, 'head title', page.file).text().trim();
    const description = meta(page.$, 'description', page.file);
    const heading = single(page.$, 'main h1', page.file).text().trim();
    assert.ok(title && heading, `${page.file}: title and H1 must not be empty`);
    const robots = meta(page.$, 'robots', page.file).toLowerCase().split(/\s*,\s*/);
    assert.ok(robots.includes('index') && robots.includes('follow'), `${page.file}: public pages must remain indexable`);
    assert.ok(!robots.includes('noindex'), `${page.file}: public pages must not be excluded`);
    assert.ok(!titles.has(title), `${page.file}: duplicate title`);
    assert.ok(!descriptions.has(description), `${page.file}: duplicate description`);
    titles.add(title);
    descriptions.add(description);
    const content = single(page.$, 'main', page.file).text().replace(/\s+/g, ' ').trim();
    assert.ok(content.length > 100, `${page.file}: primary content must be present in the original HTML`);
    assert.ok(content.includes('DeepSurfCut'), `${page.file}: product identity must be crawlable`);
    assert.ok(content.toLowerCase().includes(page.content.toLowerCase()), `${page.file}: expected product or policy content`);
  }
});

test('each page declares its canonical URL and reciprocal language alternatives', () => {
  for (const page of documents) {
    assert.equal(canonical(page.$, page.file), page.url, page.file);
    const expected = alternativesFor(page);
    const alternatives = page.$('head link[rel="alternate"][hreflang]');
    assert.equal(alternatives.length, 4, `${page.file}: expected four language alternatives`);
    for (const [language, url] of Object.entries(expected)) {
      assert.equal(single(page.$, `head link[rel="alternate"][hreflang="${language}"]`, page.file).attr('href'), url, page.file);
      assert.ok(documents.some((target) => target.url === url), `${page.file}: alternative points to an unpublished page`);
    }
  }
});

test('each regional map has a distinct crawlable identity and only equivalent European language alternatives', () => {
  const titles = new Set(documents.map((page) => page.$('title').text().trim()));
  const descriptions = new Set(documents.map((page) => meta(page.$, 'description', page.file)));
  for (const { $, file, url, language, home, html } of mapDocuments) {
    assert.equal($('html').attr('lang'), language, file);
    assert.equal(canonical($, file), url, file);
    assert.equal(meta($, 'og:url', file), url, file);
    const expected = new URL(url).searchParams.get('region') === 'europe' ? mapAlternatives : {};
    assert.equal($('head link[hreflang]').length, Object.keys(expected).length, file);
    for (const [lang, href] of Object.entries(expected)) {
      assert.equal(single($, `head link[rel="alternate"][hreflang="${lang}"]`, file).attr('href'), href, file);
    }
    assert.equal(single($, '#about-dialog .about-home-link', file).attr('href'), home, file);
    const withoutScripts = load(html, { scriptingEnabled: false });
    assert.ok(single(withoutScripts, `noscript a[href="${home}"]`, file).text().trim(), file);
    assert.match(single($, 'main h1', file).text(), /Rapid Surf Map/, file);
    assert.match(single($, '.sheet-subtitle', file).text(), /Rapid Surf Map/, file);
    const title = single($, 'head title', file).text().trim();
    const description = meta($, 'description', file);
    assert.match(title, /Rapid Surf Map/, file);
    assert.ok(!titles.has(title), `${file}: duplicate title`);
    assert.ok(!descriptions.has(description), `${file}: duplicate description`);
    titles.add(title);
    descriptions.add(description);
    const robots = meta($, 'robots', file).toLowerCase().split(/\s*,\s*/);
    assert.ok(robots.includes('index') && robots.includes('follow') && !robots.includes('noindex'), file);
  }
});

test('every homepage links to the map from desktop navigation, mobile navigation, and the footer', () => {
  const labels = { en: 'Rapid Surf Map', 'zh-Hans': '深水冲浪地图', de: 'Rapid Surf Map' };
  for (const page of documents.filter((candidate) => candidate.group === '')) {
    const target = page.language === 'zh-Hans' ? '/RapidSurfingMap?region=china'
      : page.language === 'de' ? '/RapidSurfingMap?region=europe&lang=de' : '/RapidSurfingMap';
    const links = page.$(`a[href="${target}"]`);
    assert.equal(links.length, 3, page.file);
    for (const selector of ['.desktop-nav', '#mobile-nav', '.site-footer > nav']) {
      const link = single(page.$, `${selector} > a[href="${target}"]`, page.file);
      assert.equal(link.text().trim(), labels[page.language], page.file);
    }
  }
});

test('social metadata matches page identity and uses real local imagery and icons', async () => {
  for (const page of [...documents, ...mapDocuments, ...venueDocuments]) {
    const title = page.$('head title').text().trim();
    const description = meta(page.$, 'description', page.file);
    assert.equal(meta(page.$, 'og:title', page.file), title, page.file);
    assert.equal(meta(page.$, 'og:description', page.file), description, page.file);
    assert.equal(meta(page.$, 'og:url', page.file), page.url, page.file);
    assert.equal(meta(page.$, 'og:site_name', page.file), 'DeepSurfCut', page.file);
    assert.equal(meta(page.$, 'og:locale', page.file), page.locale, page.file);
    assert.equal(meta(page.$, 'og:image:width', page.file), '1200', page.file);
    const mapSocial = mapDocuments.includes(page) || venueDocuments.includes(page);
    assert.equal(meta(page.$, 'og:image:height', page.file), mapSocial ? '630' : '753', page.file);
    meta(page.$, 'og:image:alt', page.file);
    const image = meta(page.$, 'og:image', page.file);
    const imageFile = await assertLocalFile(new URL(image), `${page.file} social image`);
    if (mapSocial) {
      assert.equal(new URL(image).pathname.endsWith('.png'), true, page.file);
      const bytes = await readFile(imageFile);
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${page.file}: social image is an actual PNG`);
      assert.equal(bytes.readUInt32BE(16), 1200, page.file);
      assert.equal(bytes.readUInt32BE(20), 630, page.file);
    }
    assert.equal(meta(page.$, 'twitter:card', page.file), 'summary_large_image', page.file);
    assert.equal(meta(page.$, 'twitter:title', page.file), title, page.file);
    assert.equal(meta(page.$, 'twitter:description', page.file), description, page.file);
    assert.equal(meta(page.$, 'twitter:image', page.file), image, page.file);
    for (const [relation, size] of [['icon', '96x96'], ['apple-touch-icon', '180x180']]) {
      const href = single(page.$, `head link[rel="${relation}"][sizes="${size}"]`, page.file).attr('href');
      assert.ok(href, `${page.file}: missing ${relation} resource`);
      await assertLocalFile(new URL(href, page.url), `${page.file} ${relation}`);
    }
  }
});

test('all 46 venue documents have distinct canonical identities and reciprocal European language links', () => {
  assert.equal(venueDocuments.length, 46);
  const titles = new Set([...documents, ...mapDocuments].map((page) => page.$('title').text().trim()));
  const descriptions = new Set([...documents, ...mapDocuments].map((page) => meta(page.$, 'description', page.file)));
  for (const page of venueDocuments) {
    const { $, url, file } = page;
    assert.equal(canonical($, file), url, file);
    assert.equal($('html').attr('lang'), page.language, file);
    assert.ok(!new URL(url).search && !new URL(url).hash && url.endsWith('/'), file);
    const title = single($, 'title', file).text().trim(), description = meta($, 'description', file);
    assert.ok(!titles.has(title) && !descriptions.has(description), `${file}: duplicate public title or description`);
    titles.add(title); descriptions.add(description);
    const robots = meta($, 'robots', file).toLowerCase();
    assert.match(robots, /index/); assert.doesNotMatch(robots, /noindex/);
    assert.ok(single($, 'main', file).text().trim().length > 100, `${file}: substantial original HTML`);
    const expected = venueAlternativesFor(page);
    assert.equal($('head link[rel="alternate"][hreflang]').length, Object.keys(expected).length, file);
    for (const [lang, target] of Object.entries(expected)) {
      assert.equal(single($, `head link[hreflang="${lang}"]`, file).attr('href'), target, file);
      const counterpart = venueDocuments.find((candidate) => candidate.url === target);
      assert.ok(counterpart, `${file}: alternative exists`);
      assert.equal(counterpart.$(`head link[hreflang="${page.language}"]`).attr('href'), url, `${file}: reciprocal alternative`);
    }
  }
});

test('structured data describes the real website and application without invented commercial claims', () => {
  const inspectClaims = (value, label) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['offers', 'aggregateRating', 'review'].includes(key), `${label}: do not invent ${key}`);
      inspectClaims(child, label);
    }
  };
  for (const page of documents) {
    const blocks = page.$('script[type="application/ld+json"]');
    assert.ok(blocks.length, `${page.file}: missing structured data`);
    const schemas = blocks.toArray().map((element) => JSON.parse(page.$(element).text()));
    schemas.forEach((schema) => inspectClaims(schema, page.file));
    const nodes = schemas.flatMap((schema) => schema['@graph'] || [schema]);
    assert.ok(nodes.some((node) => hasType(node, 'WebPage') && node.url === page.url), `${page.file}: missing canonical WebPage entity`);
    if (page.group === '') {
      assert.ok(schemas.some((schema) => Array.isArray(schema['@graph'])), `${page.file}: homepage entities must form a graph`);
      assert.ok(nodes.some((node) => hasType(node, 'WebSite')), `${page.file}: missing WebSite entity`);
      assert.ok(nodes.some((node) => hasType(node, 'SoftwareApplication') && node.name === 'DeepSurfCut'), `${page.file}: missing application entity`);
    }
  }
});

test('all three homepages expose Portrait Follow with an honest visual and matching metadata', async () => {
  for (const page of documents.filter((candidate) => candidate.group === '')) {
    const $ = page.$;
    const section = single($, '#portrait-follow', page.file);
    assert.equal(section.attr('hidden'), undefined, 'the feature is not hidden behind a tab');
    assert.equal(section.closest('[role="tabpanel"]').length, 0);
    assert.ok(section.find('h2').text().trim());
    assert.match(section.text(), /9:16/);
    assert.match(meta($, 'description', page.file), /9:16/);
    assert.match($('.hero-description').text(), /9:16/);
    assert.match($('#editor-export').text(), /9:16/);
    assert.ok($('.editor-follow-link[href="#portrait-follow"]').length);
    const videos = section.find('video');
    assert.equal(videos.length, 2);
    assert.notEqual(videos.eq(0).find('source').attr('src'), videos.eq(1).find('source').attr('src'));
    for (const element of videos.toArray()) {
      const video = $(element);
      assert.ok(video.is('[controls][playsinline]'), 'native playback is available without JavaScript');
      await assertLocalFile(new URL(video.find('source').attr('src'), page.url), page.file);
      await assertLocalFile(new URL(video.attr('poster'), page.url), page.file);
    }
    assert.match(section.find('figcaption').text(), page.language === 'en' ? /actual Portrait Follow export/ : page.language === 'de' ? /tatsächlicher Portrait-Follow-Export/ : /实际竖屏跟拍导出/);
    assert.match(section.find('.follow-note').text(), page.language === 'en' ? /analyzed again/ : page.language === 'de' ? /erneut analysiert/ : /重新分析/);
    const schema = JSON.parse($('script[type="application/ld+json"]').text());
    const app = schema['@graph'].find((node) => node['@type'] === 'SoftwareApplication');
    assert.ok(app.featureList.some((feature) => feature.includes('9:16')));
    assert.equal($('.editor .phone-bezel[src="/assets/iphone-air-base-20260912.webp"]').length, 3);
    assert.equal(section.find('.follow-phone .phone-bezel[src="/assets/iphone-air-base-20260912.webp"]').length, 1);
    const track = JSON.parse(await readFile(await assertLocalFile(new URL(section.find('[data-follow-player]').attr('data-follow-crop-url'), page.url), page.file), 'utf8'));
    assert.equal(track.positions.length, 18 * track.fps);
    assert.ok(Math.abs((track.width * 1280) / (track.height * 720) - 9 / 16) < .000001);
    assert.ok(track.positions.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x + track.width <= 1 && y + track.height <= 1));
  }
});

test('the sitemap lists all 71 canonical product, map and static venue pages', async () => {
  const $ = load(await readFile(new URL('sitemap.xml', root), 'utf8'), { xmlMode: true });
  const sitemapPages = [...documents, ...mapDocuments.map(page => ({ ...page, standalone: true })), ...venueDocuments.map(page => ({ ...page, standaloneVenue: true }))];
  const entries = $('urlset > url').toArray();
  assert.equal(entries.length, sitemapPages.length);
  assert.equal(entries.length, 71);
  const urls = entries.map((entry) => $(entry).children('loc').text().trim());
  assert.deepEqual([...urls].sort(), sitemapPages.map((page) => page.url).sort());
  assert.ok(urls.every((url) => !/\/(404|device-preview|api)(\/|\.|$)/.test(new URL(url).pathname)));
  for (const entry of entries) {
    const url = $(entry).children('loc').text().trim();
    const page = sitemapPages.find((candidate) => candidate.url === url);
    const alternatives = $(entry).children('[hreflang]');
    if (page.standalone || page.standaloneVenue) {
      const expected = page.standaloneVenue ? venueAlternativesFor(page)
        : new URL(url).searchParams.get('region') === 'europe' ? mapAlternatives : {};
      assert.equal(alternatives.length, Object.keys(expected).length, `${url}: regions are not language alternatives`);
      for (const [language, target] of Object.entries(expected)) {
        assert.equal(alternatives.filter(`[hreflang="${language}"]`).attr('href'), target, url);
      }
      if (page.standalone) assert.equal($(entry).children('lastmod').text(), '2026-11-13', `${url}: substantive map revision uses the source UTC date`);
      continue;
    }
    const expected = alternativesFor(page);
    assert.equal(alternatives.length, 4, `${url}: expected four sitemap alternatives`);
    for (const [language, target] of Object.entries(expected)) {
      const link = alternatives.filter(`[hreflang="${language}"]`);
      assert.equal(link.length, 1, `${url}: missing or duplicate ${language}`);
      assert.equal(link.attr('href'), target, url);
      assert.equal(link.attr('rel'), 'alternate', url);
    }
  }
});

test('robots allows the website and assets while excluding only API routes', async () => {
  const directives = (await readFile(new URL('robots.txt', root), 'utf8'))
    .split(/\r?\n/).map((line) => line.split('#')[0].trim()).filter(Boolean)
    .map((line) => { const separator = line.indexOf(':'); return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()]; });
  assert.ok(directives.some(([name, value]) => name === 'user-agent' && value === '*'));
  assert.ok(directives.some(([name, value]) => name === 'allow' && value === '/'));
  assert.deepEqual(directives.filter(([name]) => name === 'disallow').map(([, value]) => value), ['/api/']);
  assert.ok(directives.some(([name, value]) => name === 'sitemap' && value === `${origin}/sitemap.xml`));
});

test('localized 404 pages are not indexable and are included in the public build', async () => {
  for (const file of ['404.html', 'zh/404.html', 'de/404.html']) {
    const $ = load(await readFile(new URL(file, root), 'utf8'));
    const robots = meta($, 'robots', file).toLowerCase().split(/[\s,]+/);
    assert.ok(robots.includes('noindex'), `${file}: must not be indexed`);
  }
  const build = await readFile(new URL('scripts/build.mjs', root), 'utf8');
  assert.match(build, /['"]404\.html['"]/, 'root 404 page must be included in the build allowlist');
  assert.match(build, /['"]zh['"]/, 'localized 404 page must be published with the Chinese directory');
});

test('public pages reference only existing local navigation and static resources', async () => {
  const notFound = await Promise.all(['404.html', 'zh/404.html', 'de/404.html'].map(async (file) => ({
    file, url: `${origin}/${file}`, $: load(await readFile(new URL(file, root), 'utf8')),
  })));
  for (const page of [...documents, ...mapDocuments, ...venueDocuments, ...notFound]) {
    const references = page.$('a[href], img[src], script[src], link[rel="stylesheet"][href]').toArray();
    for (const element of references) {
      const href = page.$(element).attr('href') || page.$(element).attr('src');
      if (!href) continue;
      const url = new URL(href, page.url);
      if (url.origin !== origin) continue;
      const target = await assertLocalFile(url, `${page.file}: ${href}`);
      if (url.hash && page.$(element).is('a')) {
        const $target = load(await readFile(target, 'utf8'));
        const ids = new Set($target('[id]').toArray().map(node => $target(node).attr('id')));
        assert.ok(ids.has(decodeURIComponent(url.hash.slice(1))), `${page.file}: missing anchor ${href}`);
      }
    }
  }
});

test('language navigation offers every locale on the equivalent page without JavaScript', () => {
  for (const page of documents) {
    const menu = single(page.$, 'header .language-menu', page.file);
    assert.ok(menu.is('details') && menu.find('summary').length === 1);
    assert.equal(menu.find('a[data-language-link]').length, 3);
    for (const language of languages) {
      assert.equal(menu.find(`a[hreflang="${language.language}"]`).attr('href'), '/' + language.prefix + page.group);
    }
    assert.equal(menu.find('[aria-current]').attr('hreflang'), page.language);
    assert.equal(page.$('.language-menu .language-menu').length, 0);
    page.$('.language-menu').each((_, element) => {
      const links = page.$(element).find('nav > a');
      assert.equal(links.length, 3, page.file + ': each menu contains only the three languages');
      assert.ok(links.toArray().every(link => page.$(link).is('[data-language-link]')));
    });
  }
});

test('broader surfing use cases have substantive localized content and contextual links', () => {
  for (const language of languages) {
    const home = documents.find(page => page.prefix === language.prefix && page.group === '');
    const guide = documents.find(page => page.prefix === language.prefix && page.group === 'surf-video-editing/');
    const support = documents.find(page => page.prefix === language.prefix && page.group === 'support/');
    assert.match(home.$('#surf-video').text(), /FlowRider/);
    assert.match(home.$('#surf-video').text(), /Rapid Surfing/);
    assert.match(meta(home.$, 'description', home.file), /Rapid Surfing/);
    assert.ok(home.$(`#surf-video a[href="/${language.prefix}surf-video-editing/"]`).length);
    assert.ok(guide.$('main').text().length > (language.language === 'zh-Hans' ? 1000 : 2000));
    assert.equal(guide.$('.legal-page > section').length, 7);
    assert.match(guide.$('main').text(), /FlowRider/);
    assert.match(guide.$('head title').text(), /Rapid Surfing/);
    assert.match(meta(guide.$, 'description', guide.file), /Rapid Surfing/);
    assert.match(guide.$('#rapid-surfing h2').text(), /Rapid Surfing/);
    assert.match(guide.$('main').text(), /9:16/);
    assert.equal(guide.$('#questions h3').length, 3);
    assert.match(support.$('main').text(), /FlowRider/);
    assert.match(support.$('main').text(), /Rapid Surfing/);
    assert.ok(support.$(`main a[href="/${language.prefix}surf-video-editing/#rapid-surfing"]`).length);
    const schemas = JSON.parse(guide.$('script[type="application/ld+json"]').text());
    assert.ok(schemas['@graph'].some(node => node['@type'] === 'BreadcrumbList'));
    assert.equal(guide.$('.guide-breadcrumb a').attr('href'), '/' + language.prefix);
  }
});

test('Portrait Follow tutorials work as static instructions with localized entry points and real media', async () => {
  for (const language of languages) {
    const guide = documents.find(page => page.prefix === language.prefix && page.group === 'portrait-follow/');
    const $ = guide.$;
    assert.equal($('#steps .tutorial-steps > li').length, 5);
    for (const id of ['before-you-start', 'example', 'steps', 'check-your-export', 'questions']) {
      assert.equal($(`section#${id}[hidden]`).length, 0);
      assert.equal($(`section#${id}`).length, 1);
      assert.equal($(`.tutorial-toc a[href="#${id}"]`).length, 1);
    }
    assert.match($('#before-you-start').text(), /DeepSurfCut Pro/);
    assert.match($('#steps').text(), /iPhone/);
    assert.match($('#steps').text(), /Mac/);
    assert.equal($('#example video[controls][playsinline][preload="none"]').length, 2);
    assert.equal($('#example video[autoplay]').length, 0);
    for (const video of $('#example video').toArray()) {
      await assertLocalFile(new URL($(video).attr('poster'), guide.url), guide.file);
      await assertLocalFile(new URL($(video).find('source').attr('src'), guide.url), guide.file);
    }
    const graph = JSON.parse($('script[type="application/ld+json"]').text())['@graph'];
    const breadcrumb = graph.find(node => node['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement.at(-1).item, guide.url);
    for (const group of ['', 'support/', 'surf-video-editing/', 'updates/']) {
      const source = documents.find(page => page.prefix === language.prefix && page.group === group);
      assert.ok(source.$(`main a[href="${guide.path}"]`).length, `${source.file}: tutorial must be discoverable in context`);
    }
  }
});
