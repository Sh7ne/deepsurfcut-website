// Optional design export, deliberately separate from the public-site build.
// Use the local Playwright dependency, or pass another installed project directory:
// node scripts/render-map-social.mjs --playwright-root /path/to/project
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--playwright-root')) {
  throw new Error('Usage: node scripts/render-map-social.mjs [--playwright-root /path/to/project]');
}
const require = createRequire(resolve(args[1] || root, 'package.json'));
const { chromium } = require('playwright');
const source = await readFile(resolve(root, 'design/rapid-surf-map-social.svg'), 'utf8');
const output = resolve(root, 'assets/rapid-surf-map-social-20261114.png');
let executablePath = process.env.BROWSER_PATH;
if (!executablePath && process.platform === 'darwin') {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await access(chrome); executablePath = chrome; } catch { /* Use Playwright's installed browser. */ }
}
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('**/*', (route) => route.abort());
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}svg{display:block}</style>${source}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: 'png' });
  console.log(output);
} finally {
  await browser.close();
}
