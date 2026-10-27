import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { load } from 'cheerio';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = new URL('../', import.meta.url);
const sha = process.argv[2];
assert.match(sha || '', /^[a-f0-9]{40}$/);
const repository = 'Sh7ne/deepsurfcut-website';
const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const deadline = Date.now() + 8 * 60_000;
let complete = false;
while (Date.now() < deadline) {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}/check-runs`, { headers, signal: AbortSignal.timeout(25_000) });
  assert.equal(response.status, 200, 'cannot read deployment check');
  const check = (await response.json()).check_runs.find((item) => item.name === 'Cloudflare Pages');
  if (check?.status === 'completed') {
    assert.equal(check.conclusion, 'success', 'Cloudflare deployment did not succeed');
    complete = true;
    break;
  }
  await setTimeout(15_000);
}
assert.ok(complete, 'Cloudflare did not confirm this bot commit; check the Git integration or configure an authenticated deploy trigger');
for (const path of ['updates/', 'zh/updates/', 'de/updates/']) {
  const url = `https://deepsurf.app/${path}`;
  const { stdout } = await exec('curl', ['--fail', '--silent', '--show-error', '--retry', '3', '--retry-all-errors', '--max-time', '40', `${url}?sync=${sha}`], { maxBuffer: 4 * 1024 * 1024 });
  assert.equal(stdout, await readFile(new URL(`${path}index.html`, root), 'utf8'), `${path}: deployed HTML is not current`);
  const $ = load(stdout);
  assert.equal($('link[rel="canonical"]').attr('href'), url);
  assert.equal($('head link[hreflang]').length, 4);
  console.log(`Verified production ${url}`);
}
const { stdout: xml } = await exec('curl', ['--fail', '--silent', '--show-error', '--retry', '3', '--retry-all-errors', '--max-time', '40', `https://deepsurf.app/sitemap.xml?sync=${sha}`]);
assert.equal(xml, await readFile(new URL('sitemap.xml', root), 'utf8'));
