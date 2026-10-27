import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseStore, makeRelease, planSync, splitNotes, validateCopy, updateSitemap, storeURLs } from '../scripts/sync-app-store.mjs';

const now = new Date('2026-11-05T12:00:00Z');
const old = { version: '1.4.0', releasedAt: '2026-10-27T00:13:19Z', title: { en: 'Existing', zh: '原有', de: 'Bisher' }, notes: [] };
const website = { updated: '2026-10-27', platforms: { ios: [old], macos: [{ ...old, releasedAt: '2026-10-26T22:49:20Z' }] } };
const texts = {
  en: '• Improved video import.\n• More reliable editing.',
  zh: '• 改进视频导入。\n• 提高编辑可靠性。',
  de: '• Verbesserter Videoimport und klarere Hinweise.\n• Zuverlässigere Bearbeitung der Videos.',
};
const histories = (version = '1.5.0', date = '2026-11-04T18:23:45Z', previousDate = old.releasedAt) => Object.fromEntries(['en', 'zh', 'de'].map((language) => [language, [{ version, releasedAt: date, text: texts[language] }, { version: old.version, releasedAt: previousDate, text: '' }]]));
const fixture = (language = 'en', items = [{ primarySubtitle: '1.5.0', secondarySubtitle: '2026-11-04T18:23:45Z', text: texts.en }], extra = {}) => {
  const page = { title: 'DeepSurfCut', canonicalURL: 'https://apps.apple.com/app/deepsurfcut/id6776393723', shelfMapping: { mostRecentVersion: { seeAllAction: { pageData: { shelves: [{ items }] } } } }, ...extra };
  return `<html lang="${language}"><script id="serialized-server-data" type="application/json">${JSON.stringify({ data: [{ data: page }] })}</script></html>`;
};

test('public store parsing preserves real timestamps and rejects wrong apps and fallback languages', () => {
  assert.deepEqual(parseStore(fixture(), 'en', now)[0], { version: '1.5.0', releasedAt: '2026-11-04T18:23:45Z', text: texts.en });
  assert.throws(() => parseStore(fixture(), 'de', now), /fallback/);
  assert.throws(() => parseStore(fixture('en', [], { title: 'Other' }), 'en', now), /unexpected app/);
  assert.throws(() => parseStore(fixture('en', [], { canonicalURL: 'https://example.com/id6776393723' }), 'en', now));
  assert.throws(() => parseStore('<html></html>', 'en', now));
  assert.throws(() => parseStore(fixture('en', []), 'en', now), /missing release/);
  assert.ok(storeURLs.de.includes('/de/') && storeURLs.de.includes('l=de-DE'));
});

test('public store dates, unique marketing versions and history order are verified', () => {
  const release = { primarySubtitle: '1.5.0', secondarySubtitle: '2026-11-04T18:23:45Z', text: '' };
  assert.throws(() => parseStore(fixture('en', [{ ...release, primarySubtitle: '1.5.0-build.1' }]), 'en', now));
  assert.throws(() => parseStore(fixture('en', [{ ...release, secondarySubtitle: 'invalid' }]), 'en', now));
  assert.throws(() => parseStore(fixture('en', [{ ...release, secondarySubtitle: '2027-01-01T00:00:00Z' }]), 'en', now));
  assert.throws(() => parseStore(fixture('en', [release, release]), 'en', now), /duplicate/);
  assert.throws(() => parseStore(fixture('en', [{ ...release, primarySubtitle: '1.4.0', secondarySubtitle: '2026-10-27T00:00:00Z' }, release]), 'en', now));
});

test('release notes require matching versions, dates and real translations in all three languages', () => {
  const input = histories();
  const result = makeRelease('1.5.0', input);
  assert.deepEqual(result.title, { en: 'Version 1.5.0', zh: '版本 1.5.0', de: 'Version 1.5.0' });
  assert.equal(result.notes.length, 2);
  assert.deepEqual(result.notes[0], { en: 'Improved video import.', zh: '改进视频导入。', de: 'Verbesserter Videoimport und klarere Hinweise.' });
  for (const mutate of [
    input => { input.de = []; },
    input => { input.de[0].releasedAt = old.releasedAt; },
    input => { input.zh[0].text = texts.en; },
    input => { input.de[0].text = texts.en; },
    input => { input.zh[0].text += '\n其他内容。'; },
  ]) {
    const copy = structuredClone(input); mutate(copy);
    assert.throws(() => makeRelease('1.5.0', copy));
  }
});

test('missing historical notes remain empty rather than invented or translated from private records', () => {
  const input = histories();
  for (const language of Object.keys(input)) input[language][0].text = '';
  assert.deepEqual(makeRelease('1.5.0', input).notes, []);
  assert.deepEqual(splitNotes('• First\n\n- Second\n3. Third'), ['First', 'Second', 'Third']);
});

test('public copy rejects private data, commercial claims, restricted branding and geographic references', () => {
  const country = new Intl.DisplayNames(['en'], { type: 'region' }).of('DE');
  const brand = ['yo', 'lo', 'v99'].join('');
  for (const text of [
    '<img src=x onerror=alert(1)>', 'Read https://example.com', '/Users/private/source',
    'Build 108 is waiting for review', `Improved ${brand} detection`,
    'Free trial for 7 days', 'Price $9', '50% faster processing', `Improved tracking in ${country}`,
  ]) assert.throws(() => validateCopy(text, 'en'));
  for (const language of ['en', 'zh', 'de']) validateCopy(texts[language], language);
  validateCopy('Improved WaveSight recognition and Portrait Follow exports.', 'en');
});

test('only a newly public platform advances and existing curated copy is preserved', () => {
  const prior = structuredClone(website);
  const input = { ios: histories(), macos: histories('1.4.0', website.platforms.macos[0].releasedAt) };
  for (const lang of ['en', 'zh', 'de']) input.macos[lang].pop();
  const result = planSync(prior, input, now);
  assert.deepEqual(result.added, [{ platform: 'ios', version: '1.5.0' }]);
  assert.equal(result.data.updated, '2026-11-05');
  assert.deepEqual(result.data.platforms.macos, website.platforms.macos);
  assert.deepEqual(result.data.platforms.ios[1], old);
  assert.deepEqual(prior, website, 'planning must not mutate the caller');
  const again = planSync(result.data, input, now, result.state);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.data, result.data);
  assert.deepEqual(again.state, result.state);
});

test('each platform keeps its own date and multiple missed public versions are sorted and unique', () => {
  const input = { ios: histories(), macos: histories('1.5.0', '2026-11-03T10:20:30Z', website.platforms.macos[0].releasedAt) };
  for (const lang of ['en', 'zh', 'de']) input.ios[lang].unshift({ version: '1.5.1', releasedAt: '2026-11-05T10:00:00Z', text: texts[lang] });
  const result = planSync(website, input, now);
  assert.deepEqual(result.data.platforms.ios.map(r => r.version), ['1.5.1', '1.5.0', '1.4.0']);
  assert.notEqual(result.data.platforms.ios.find(r => r.version === '1.5.0').releasedAt, result.data.platforms.macos[0].releasedAt);
  const edited = structuredClone(input);
  edited.ios.en[0].text += '\nAdditional public text.';
  assert.throws(() => planSync(result.data, edited, now, result.state));
});

test('malformed one-platform translations cannot produce a partially validated publication', () => {
  const input = { ios: histories(), macos: histories() };
  input.macos.de = [];
  assert.throws(() => planSync(website, input, now));
  assert.equal(website.platforms.ios.length, 1);
});

test('known timestamps prevent a storefront ignoring its requested platform from mixing histories', () => {
  const input = { ios: histories(), macos: histories() };
  assert.throws(() => planSync(website, input, now), /wrong platform response/);
});

test('sitemap changes only the three actual update pages', async () => {
  const original = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
  const { load } = await import('cheerio');
  const before = load(original, { xmlMode: true });
  const after = load(updateSitemap(original, '2026-11-05'), { xmlMode: true });
  for (const element of before('url').toArray()) {
    const url = before(element).children('loc').text();
    const entry = after('url').filter((_, el) => after(el).children('loc').text() === url);
    if (new URL(url).pathname.endsWith('/updates/')) assert.equal(entry.children('lastmod').text(), '2026-11-05');
    else assert.equal(entry.toString(), before(element).toString());
  }
});
