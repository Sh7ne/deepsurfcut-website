import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';
const groups = [
  ['', ['standing waves', '深水冲浪', 'stehenden Wellen']],
  ['support/', ['Supported workflow', '支持的工作流程', 'Unterstützter Workflow']],
  ['privacy/', ['Privacy Policy', '隐私政策', 'Datenschutzerklärung']],
  ['terms/', ['Terms of Use', '使用条款', 'Nutzungsbedingungen']],
  ['updates/', ["What's new", '版本更新', 'Neu in DeepSurfCut']],
  ['surf-video-editing/', ['FlowRider', 'FlowRider', 'FlowRider']],
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
  const file = path.endsWith('/') || !path ? `${path}index.html` : path;
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

test('social metadata matches page identity and uses real local imagery and icons', async () => {
  for (const page of documents) {
    const title = page.$('head title').text().trim();
    const description = meta(page.$, 'description', page.file);
    assert.equal(meta(page.$, 'og:title', page.file), title, page.file);
    assert.equal(meta(page.$, 'og:description', page.file), description, page.file);
    assert.equal(meta(page.$, 'og:url', page.file), page.url, page.file);
    assert.equal(meta(page.$, 'og:site_name', page.file), 'DeepSurfCut', page.file);
    assert.equal(meta(page.$, 'og:locale', page.file), page.locale, page.file);
    assert.equal(meta(page.$, 'og:image:width', page.file), '1200', page.file);
    assert.equal(meta(page.$, 'og:image:height', page.file), '753', page.file);
    meta(page.$, 'og:image:alt', page.file);
    const image = meta(page.$, 'og:image', page.file);
    await assertLocalFile(new URL(image), `${page.file} social image`);
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

test('the sitemap lists the canonical product pages and all language alternatives', async () => {
  const $ = load(await readFile(new URL('sitemap.xml', root), 'utf8'), { xmlMode: true });
  const entries = $('urlset > url').toArray();
  assert.equal(entries.length, pages.length);
  const urls = entries.map((entry) => $(entry).children('loc').text().trim());
  assert.deepEqual([...urls].sort(), documents.map((page) => page.url).sort());
  assert.ok(urls.every((url) => !/\/(404|device-preview|api)(\/|\.|$)/.test(new URL(url).pathname)));
  for (const entry of entries) {
    const url = $(entry).children('loc').text().trim();
    const page = documents.find((candidate) => candidate.url === url);
    const expected = alternativesFor(page);
    const alternatives = $(entry).children('[hreflang]');
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
  for (const page of [...documents, ...notFound]) {
    const references = page.$('a[href], img[src], script[src], link[rel="stylesheet"][href]').toArray();
    for (const element of references) {
      const href = page.$(element).attr('href') || page.$(element).attr('src');
      if (!href || href.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
      await assertLocalFile(new URL(href, page.url), `${page.file}: ${href}`);
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
  }
});

test('broader surfing use cases have substantive localized content and contextual links', () => {
  for (const language of languages) {
    const home = documents.find(page => page.prefix === language.prefix && page.group === '');
    const guide = documents.find(page => page.prefix === language.prefix && page.group === 'surf-video-editing/');
    const support = documents.find(page => page.prefix === language.prefix && page.group === 'support/');
    assert.match(home.$('#surf-video').text(), /FlowRider/);
    assert.ok(home.$(`#surf-video a[href="/${language.prefix}surf-video-editing/"]`).length);
    assert.ok(guide.$('main').text().length > (language.language === 'zh-Hans' ? 1000 : 2000));
    assert.equal(guide.$('.legal-page > section').length, 7);
    assert.match(guide.$('main').text(), /FlowRider/);
    assert.match(guide.$('main').text(), /9:16/);
    assert.equal(guide.$('#questions h3').length, 3);
    assert.match(support.$('main').text(), /FlowRider/);
    const schemas = JSON.parse(guide.$('script[type="application/ld+json"]').text());
    assert.ok(schemas['@graph'].some(node => node['@type'] === 'BreadcrumbList'));
    assert.equal(guide.$('.guide-breadcrumb a').attr('href'), '/' + language.prefix);
  }
});
