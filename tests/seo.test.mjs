import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';
const pages = [
  { file: 'index.html', path: '/', pair: '/zh/', language: 'en', locale: 'en_US', content: 'standing waves' },
  { file: 'zh/index.html', path: '/zh/', pair: '/', language: 'zh-Hans', locale: 'zh_CN', content: '\u6df1\u6c34\u51b2\u6d6a' },
  { file: 'privacy/index.html', path: '/privacy/', pair: '/zh/privacy/', language: 'en', locale: 'en_US', content: 'Privacy Policy' },
  { file: 'zh/privacy/index.html', path: '/zh/privacy/', pair: '/privacy/', language: 'zh-Hans', locale: 'zh_CN', content: '\u9690\u79c1\u653f\u7b56' },
  { file: 'terms/index.html', path: '/terms/', pair: '/zh/terms/', language: 'en', locale: 'en_US', content: 'Terms of Use' },
  { file: 'zh/terms/index.html', path: '/zh/terms/', pair: '/terms/', language: 'zh-Hans', locale: 'zh_CN', content: '\u4f7f\u7528\u6761\u6b3e' },
  { file: 'support/index.html', path: '/support/', pair: '/zh/support/', language: 'en', locale: 'en_US', content: 'Supported workflow' },
  { file: 'zh/support/index.html', path: '/zh/support/', pair: '/support/', language: 'zh-Hans', locale: 'zh_CN', content: '\u652f\u6301\u7684\u5de5\u4f5c\u6d41\u7a0b' },
];

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
    const english = page.language === 'en' ? page.path : page.pair;
    const chinese = page.language === 'zh-Hans' ? page.path : page.pair;
    const expected = { en: `${origin}${english}`, 'zh-Hans': `${origin}${chinese}`, 'x-default': `${origin}${english}` };
    const alternatives = page.$('head link[rel="alternate"][hreflang]');
    assert.equal(alternatives.length, 3, `${page.file}: expected three language alternatives`);
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
    if (page.path === '/' || page.path === '/zh/') {
      assert.ok(schemas.some((schema) => Array.isArray(schema['@graph'])), `${page.file}: homepage entities must form a graph`);
      assert.ok(nodes.some((node) => hasType(node, 'WebSite')), `${page.file}: missing WebSite entity`);
      assert.ok(nodes.some((node) => hasType(node, 'SoftwareApplication') && node.name === 'DeepSurfCut'), `${page.file}: missing application entity`);
    }
  }
});

test('the sitemap lists only the eight canonical pages and all language alternatives', async () => {
  const $ = load(await readFile(new URL('sitemap.xml', root), 'utf8'), { xmlMode: true });
  const entries = $('urlset > url').toArray();
  assert.equal(entries.length, pages.length);
  const urls = entries.map((entry) => $(entry).children('loc').text().trim());
  assert.deepEqual([...urls].sort(), documents.map((page) => page.url).sort());
  assert.ok(urls.every((url) => !/\/(404|device-preview|api)(\/|\.|$)/.test(new URL(url).pathname)));
  for (const entry of entries) {
    const url = $(entry).children('loc').text().trim();
    const page = documents.find((candidate) => candidate.url === url);
    const english = page.language === 'en' ? page.path : page.pair;
    const chinese = page.language === 'zh-Hans' ? page.path : page.pair;
    const expected = { en: `${origin}${english}`, 'zh-Hans': `${origin}${chinese}`, 'x-default': `${origin}${english}` };
    const alternatives = $(entry).children('[hreflang]');
    assert.equal(alternatives.length, 3, `${url}: expected three sitemap alternatives`);
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
  for (const file of ['404.html', 'zh/404.html']) {
    const $ = load(await readFile(new URL(file, root), 'utf8'));
    const robots = meta($, 'robots', file).toLowerCase().split(/[\s,]+/);
    assert.ok(robots.includes('noindex'), `${file}: must not be indexed`);
  }
  const build = await readFile(new URL('scripts/build.mjs', root), 'utf8');
  assert.match(build, /['"]404\.html['"]/, 'root 404 page must be included in the build allowlist');
  assert.match(build, /['"]zh['"]/, 'localized 404 page must be published with the Chinese directory');
});

test('public pages reference only existing local navigation and static resources', async () => {
  const notFound = await Promise.all(['404.html', 'zh/404.html'].map(async (file) => ({
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
