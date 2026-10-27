import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('.github/workflows/sync-app-store.yml', root), 'utf8');
const workflow = parse(source);

test('cloud sync has independent hosted scheduling and authenticated event/manual triggers', () => {
  assert.equal(workflow.on.schedule[0].cron, '23 * * * *');
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.deepEqual(workflow.on.repository_dispatch.types, ['app-store-release-check']);
  assert.equal(workflow.jobs.sync['runs-on'], 'ubuntu-latest');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.match(workflow.jobs.sync.if, /Sh7ne\/deepsurfcut-website/);
  assert.equal(workflow.on.pull_request_target, undefined);
});

test('cloud publication uses narrow permissions, pinned actions and no local credentials', () => {
  assert.deepEqual(workflow.permissions, { contents: 'write', checks: 'read' });
  for (const step of workflow.jobs.sync.steps.filter(step => step.uses)) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.doesNotMatch(source, /OPENAI_API_KEY|\.ssh\/|(?:^|\/)\.env(?:\.|['"\s]|$)|release-drafts|APP_STORE_CONNECT/m);
  assert.equal(workflow.jobs.sync.steps.find(step => step.uses?.startsWith('actions/checkout')).with.ref, 'main');
});

test('tests, browser validation and production verification bracket the bot commit', () => {
  const steps = workflow.jobs.sync.steps;
  const publish = steps.findIndex(step => step.id === 'publish');
  const before = steps.slice(0, publish).map(step => step.run || '').join('\n');
  const after = steps.slice(publish + 1).map(step => step.run || '').join('\n');
  for (const command of ['npm test', 'npm run build', 'npm run test:runtime', 'check-updates-browser.mjs']) assert.ok(before.includes(command));
  assert.ok(after.includes('verify-release-deployment.mjs'));
  assert.ok(after.includes('check-updates-browser.mjs'));
  assert.equal(steps[publish].if, "steps.sync.outputs.changed == 'true'");
});

test('bot publication and static output are explicitly restricted', async () => {
  const commit = await readFile(new URL('scripts/commit-release-sync.mjs', root), 'utf8');
  assert.match(commit, /content\/app-store-sync\.json/);
  assert.match(commit, /changed\.every\(\(path\) => allowed\.has\(path\)\)/);
  assert.doesNotMatch(commit, /--force|git\('add', '-A'|release-drafts/);
  const build = await readFile(new URL('scripts/build.mjs', root), 'utf8');
  assert.doesNotMatch(build, /^\s*['"](?:content|scripts|\.github)['"]/m);
});
