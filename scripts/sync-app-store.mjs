import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';
import { updatePages } from './render-updates.mjs';

const root = new URL('../', import.meta.url);
const exec = promisify(execFile);
const languages = ['en', 'zh', 'de'];
export const storeURLs = {
  en: 'https://apps.apple.com/app/deepsurfcut/id6776393723?l=en-US',
  zh: 'https://apps.apple.com/app/deepsurfcut/id6776393723?l=zh-Hans',
  de: 'https://apps.apple.com/de/app/deepsurfcut/id6776393723?l=de-DE',
};
const labels = { en: 'Version', zh: '版本', de: 'Version' };
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export async function fetchStore(url) {
  const target = new URL(url);
  assert.equal(target.origin, 'https://apps.apple.com');
  assert.ok(target.pathname.endsWith('/id6776393723'));
  const { stdout } = await exec('curl', [
    '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https',
    '--max-time', '35', '--retry', '2', '--retry-all-errors', '--retry-delay', '2',
    '--max-filesize', '4194304', url,
  ], { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 });
  return stdout;
}

export function parseStore(html, language, now = new Date()) {
  assert.ok(languages.includes(language));
  const $ = load(html);
  const lang = $('html').attr('lang') || '';
  const expectedLanguage = language === 'zh' ? /^zh-Hans(?:-|$)/i : new RegExp(`^${language}(?:-|$)`, 'i');
  assert.ok(expectedLanguage.test(lang), `${language}: storefront language fallback`);
  assert.equal($('#serialized-server-data').length, 1, 'missing store data');
  const page = JSON.parse($('#serialized-server-data').text()).data?.[0]?.data;
  assert.equal(page?.title, 'DeepSurfCut', 'unexpected app');
  const canonical = new URL(page.canonicalURL);
  assert.equal(canonical.origin, 'https://apps.apple.com');
  assert.ok(canonical.pathname.endsWith('/id6776393723'), 'unexpected app ID');
  const items = page.shelfMapping?.mostRecentVersion?.seeAllAction?.pageData?.shelves?.[0]?.items;
  assert.ok(Array.isArray(items) && items.length > 0 && items.length < 200, 'missing release history');
  const seen = new Set();
  let previousTime = Infinity;
  return items.map((item) => {
    const version = item.primarySubtitle;
    assert.ok(versionPattern.test(version), 'invalid marketing version');
    assert.ok(!seen.has(version), 'duplicate public marketing version');
    seen.add(version);
    const time = Date.parse(item.secondarySubtitle);
    assert.ok(Number.isFinite(time) && time <= now.getTime() && time <= previousTime, 'invalid public release date');
    previousTime = time;
    assert.ok(item.text === undefined || typeof item.text === 'string', 'invalid release text');
    return { version, releasedAt: new Date(time).toISOString().replace('.000Z', 'Z'), text: item.text?.trim() || '' };
  });
}

const countryNames = languages.flatMap((language) => {
  const display = new Intl.DisplayNames([language], { type: 'region', fallback: 'code' });
  return Array.from({ length: 26 * 26 }, (_, index) => {
    const code = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
    const name = display.of(code);
    return name === code || name.length < 3 ? null : { language, name };
  }).filter(Boolean);
});
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countryPatterns = countryNames.map(({ language, name }) => new RegExp(language === 'zh'
  ? escapePattern(name) : `(?<![\\p{L}])${escapePattern(name)}(?![\\p{L}])`, 'iu'));

export function validateCopy(text, language) {
  assert.ok(typeof text === 'string' && text.length <= 12_000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text), 'invalid public text');
  const reject = (pattern, message) => { if (pattern.test(text)) throw new Error(message); };
  reject(/<\/?[a-z][^>]*>|https?:\/\/|mailto:|\/Users\/|(?:[a-z]:)?\\Users\\/i, 'public copy contains markup, links or private paths');
  reject(/\b(?:build[ -]?\d+|testflight|waiting for review|pending developer release|benchmark|github|commit|pull request|api key)\b|待审核|内部验收|构建号/i, 'internal or unapproved release text');
  reject(/\b(?:y[o]lo\w*|ultral[y]tics|osn[e]t|torchre[i]d|re[- ]?id)\b/i, 'restricted upstream branding');
  reject(/[$€£¥￥]|\b(?:price|pricing|subscription|free trial|trial period|USD|EUR|RMB|discount|rating)\b|订阅|价格|试用|折扣|Abonnement|kostenlos.*testen/i, 'commercial claims require editorial review');
  reject(/\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*[x×]\s*(?:faster|speed)|\b(?:guaranteed|always perfect)\b|百分之|保证.*准确/i, 'unapproved performance or guarantee claim');
  assert.ok(!countryPatterns.some((pattern) => pattern.test(text)), 'geographic reference requires editorial review');
  reject(/\b(?:in|at|near|from|bei|aus)\s+(?:Berlin|Munich|München|Tokyo|Beijing|Shanghai|London|Paris|Sydney|Vienna|Bangkok|Singapore|[A-Z][\p{L}]+\s+(?:Arena|Resort|Park|Club|Wave))\b|北京|上海|东京|慕尼黑|柏林|新加坡/iu, 'location or venue requires editorial review');
  if (text && language === 'zh') assert.ok(/\p{Script=Han}/u.test(text), 'Chinese release notes are unavailable');
  if (text && language === 'de') assert.ok(/\b(?:und|für|mit|der|die|das|von|auf|bei|im|eine|einer|des|zu|zum)\b|[äöüß]/i.test(text), 'German release notes are unavailable');
}

export function splitNotes(text) {
  return text.split(/\r?\n/).map((line) => line.trim().replace(/^(?:[•●▪*-]|\d+[.)])\s+/, '')).filter(Boolean);
}

export function makeRelease(version, histories) {
  assert.match(version, versionPattern);
  const entries = Object.fromEntries(languages.map((language) => [language, histories[language].find((item) => item.version === version)]));
  assert.ok(languages.every((language) => entries[language]), `${version}: localized version not yet available`);
  const releasedAt = entries.en.releasedAt;
  assert.match(releasedAt, timestampPattern);
  assert.ok(languages.every((language) => entries[language].releasedAt === releasedAt), `${version}: localized release dates differ`);
  const lines = Object.fromEntries(languages.map((language) => {
    validateCopy(entries[language].text, language);
    return [language, splitNotes(entries[language].text)];
  }));
  assert.ok(languages.every((language) => lines[language].length === lines.en.length), `${version}: localized note structure differs; needs editorial review`);
  if (lines.en.length) {
    assert.ok(entries.en.text !== entries.zh.text && entries.en.text !== entries.de.text && entries.zh.text !== entries.de.text, `${version}: untranslated release notes`);
  }
  return {
    version, releasedAt,
    title: Object.fromEntries(languages.map((language) => [language, `${labels[language]} ${version}`])),
    notes: lines.en.map((_, index) => Object.fromEntries(languages.map((language) => [language, lines[language][index]]))),
  };
}

export function planSync(data, historiesByPlatform, now = new Date(), previousState = null) {
  const next = structuredClone(data);
  const state = { schemaVersion: 1, platforms: {} };
  const added = [];
  for (const platform of ['ios', 'macos']) {
    const histories = historiesByPlatform[platform];
    const existing = new Set(next.platforms[platform].map((item) => item.version));
    assert.equal(existing.size, next.platforms[platform].length, 'duplicate website release');
    const historyStart = next.platforms[platform].at(-1).releasedAt;
    for (const item of histories.en) {
      if (existing.has(item.version)) {
        const known = next.platforms[platform].find((release) => release.version === item.version);
        assert.equal(item.releasedAt, known.releasedAt, `${platform}: public timestamp changed or wrong platform response`);
        continue;
      }
      // Do not reconstruct history predating the website's maintained public history.
      if (item.releasedAt < historyStart) continue;
      next.platforms[platform].push(makeRelease(item.version, histories));
      added.push({ platform, version: item.version });
      existing.add(item.version);
    }
    next.platforms[platform].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
    const latest = histories.en[0];
    makeRelease(latest.version, histories);
    state.platforms[platform] = {
      version: latest.version, releasedAt: latest.releasedAt,
      sourceHashes: Object.fromEntries(languages.map((language) => {
        const source = histories[language].find((item) => item.version === latest.version);
        return [language, createHash('sha256').update(source.text).digest('hex')];
      })),
    };
    const prior = previousState?.platforms?.[platform];
    if (prior?.version === latest.version) assert.deepEqual(state.platforms[platform], prior, `${platform}: published notes changed without a new version; needs editorial review`);
  }
  if (added.length) next.updated = now.toISOString().slice(0, 10);
  return { data: next, state, added };
}

export function updateSitemap(xml, date) {
  const $ = load(xml, { xmlMode: true });
  let count = 0;
  $('url').each((_, element) => {
    const entry = $(element);
    if (['/updates/', '/zh/updates/', '/de/updates/'].includes(new URL(entry.children('loc').text()).pathname)) {
      assert.equal(entry.children('lastmod').length, 1);
      entry.children('lastmod').text(date);
      count++;
    }
  });
  assert.equal(count, 3);
  return $.xml().replaceAll('"/>', '" />').trimEnd() + '\n';
}

export async function synchronize({ fetchPage = fetchStore, now = new Date(), apply = false } = {}) {
  const original = JSON.parse(await readFile(new URL('content/releases.json', root), 'utf8'));
  const previousState = await readFile(new URL('content/app-store-sync.json', root), 'utf8').then(JSON.parse).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const histories = {};
  for (const [platform, storePlatform] of [['ios', 'iphone'], ['macos', 'mac']]) {
    histories[platform] = {};
    for (const language of languages) {
      histories[platform][language] = parseStore(await fetchPage(`${storeURLs[language]}&platform=${storePlatform}`), language, now);
    }
  }
  // Validate both platforms before any write, so a missing translation cannot cause a partial publication.
  const plan = planSync(original, histories, now, previousState);
  const stateChanged = JSON.stringify(previousState) !== JSON.stringify(plan.state);
  if (apply && plan.added.length) {
    await writeFile(new URL('content/releases.json', root), JSON.stringify(plan.data, null, 2) + '\n');
    await writeFile(new URL('sitemap.xml', root), updateSitemap(await readFile(new URL('sitemap.xml', root), 'utf8'), plan.data.updated));
    await updatePages();
  }
  if (apply && stateChanged) await writeFile(new URL('content/app-store-sync.json', root), JSON.stringify(plan.state, null, 2) + '\n');
  return { added: plan.added, changed: plan.added.length > 0 || stateChanged, applied: apply };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  assert.ok(args.every((arg) => arg === '--apply'), 'only --apply is supported');
  console.log(JSON.stringify(await synchronize({ apply: args.includes('--apply') })));
}
