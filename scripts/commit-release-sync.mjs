import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const allowed = new Set(['content/releases.json', 'content/app-store-sync.json', 'sitemap.xml', 'updates/index.html', 'zh/updates/index.html', 'de/updates/index.html']);
assert.equal(process.env.GITHUB_REPOSITORY, 'Sh7ne/deepsurfcut-website', 'publication is restricted to the website repository');
assert.equal(git('branch', '--show-current'), 'main');
const changed = [...new Set([
  ...git('diff', '--name-only', '-z').split('\0'),
  ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
].filter(Boolean))];
assert.ok(changed.length > 0, 'nothing to publish');
assert.ok(changed.every((path) => allowed.has(path)), 'unrelated or private files must not be committed');
assert.equal(git('diff', '--cached', '--name-only'), '', 'unexpected staged changes');
git('diff', '--check');
git('add', '--', ...changed);
git('config', 'user.name', 'github-actions[bot]');
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
git('commit', '-m', 'Sync verified public App Store releases');
const sha = git('rev-parse', 'HEAD');
// A concurrent main change must fail the push, never be overwritten or silently rebased.
git('push', 'origin', 'HEAD:main');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
console.log(`Published website commit ${sha}`);
