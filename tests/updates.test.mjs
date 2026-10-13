import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderUpdates, updatePages } from '../scripts/render-updates.mjs';

const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('content/releases.json', root), 'utf8'));

test('release data contains only reviewed, bilingual, platform-specific public fields', () => {
  assert.deepEqual(Object.keys(data).sort(), ['platforms', 'updated']);
  assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(data.platforms).sort(), ['ios', 'macos']);
  for (const releases of Object.values(data.platforms)) {
    assert.ok(releases.length);
    const versions = new Set();
    let previousDate = Infinity;
    for (const release of releases) {
      assert.deepEqual(Object.keys(release).sort(), ['notes', 'releasedAt', 'title', 'version']);
      assert.match(release.version, /^\d+\.\d+\.\d+$/);
      assert.ok(!versions.has(release.version), 'one entry per platform and marketing version');
      versions.add(release.version);
      assert.match(release.releasedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      const date = Date.parse(release.releasedAt);
      assert.ok(Number.isFinite(date) && date <= previousDate, 'history is newest first');
      assert.ok(date < Date.parse(`${data.updated}T23:59:59Z`), 'no future releases');
      previousDate = date;
      for (const text of [release.title, ...release.notes]) {
        assert.deepEqual(Object.keys(text).sort(), ['en', 'zh']);
        assert.ok(text.en.trim() && text.zh.trim());
        assert.doesNotMatch(JSON.stringify(text), /<[^>]+>|https?:\/\/|\b(?:build|pending|benchmark)\b/i);
      }
    }
  }
});

test('the verified public histories remain independent', () => {
  assert.deepEqual(data.platforms.ios.map((release) => release.version), ['1.3.2', '1.2.2', '1.2.0', '1.0.1', '0.9.9', '0.9.3']);
  assert.deepEqual(data.platforms.macos.map((release) => release.version), ['1.2.2', '0.9.9']);
  const ios = data.platforms.ios.find((release) => release.version === '1.2.2');
  const mac = data.platforms.macos.find((release) => release.version === '1.2.2');
  assert.notEqual(ios.releasedAt, mac.releasedAt);
  assert.notDeepEqual(ios.notes, mac.notes);
  assert.deepEqual(data.platforms.ios.at(-1).notes, []);
  assert.deepEqual(data.platforms.macos.at(-1).notes, []);
});

test('both generated pages are current, static, and honest about missing notes', async () => {
  await updatePages({ check: true });
  for (const language of ['en', 'zh']) {
    const html = renderUpdates(data, language);
    assert.doesNotMatch(html, /[\t ]+\n/, 'generated pages have no trailing whitespace');
    const $ = load(html);
    assert.equal($('main h1').length, 1);
    assert.equal($('.missing-notes').length, 2);
    assert.equal($('main [hidden]').length, 0, 'both histories work without JavaScript');
    assert.equal($('.release').length, 8);
    for (const [platform, releases] of Object.entries(data.platforms)) {
      assert.equal($(`#${platform} .release`).length, releases.length);
      assert.equal($(`#${platform} .latest-label`).length, 1);
      assert.equal($(`#tab-${platform}`).attr('href'), `#${platform}`);
      for (const release of releases) {
        const article = $(`[id="${platform}-${release.version}"]`);
        assert.equal(article.length, 1);
        assert.equal(article.find('time').attr('datetime'), release.releasedAt);
        assert.equal(article.find('.release-content li').length, release.notes.length);
        assert.equal(article.find('h3').text(), release.title[language]);
      }
    }
    const ids = $('[id]').map((_, element) => $(element).attr('id')).get();
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('release rendering escapes content rather than publishing markup', () => {
  const fixture = structuredClone(data);
  fixture.platforms.ios[0].notes[0].en = '<img src=x onerror=alert(1)> & "text"';
  const html = renderUpdates(fixture, 'en');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;text&quot;'));
  assert.equal(load(html)('.release img').length, 0);
});

test('product pages expose a localized update-history link', async () => {
  for (const prefix of ['', 'zh/']) {
    for (const path of ['index.html', 'support/index.html', 'privacy/index.html', 'terms/index.html']) {
      const $ = load(await readFile(new URL(prefix + path, root), 'utf8'));
      assert.ok($(`footer a[href="/${prefix}updates/"]`).length, prefix + path);
      assert.ok($(`#mobile-nav a[href="/${prefix}updates/"]`).length, prefix + path);
    }
  }
});
