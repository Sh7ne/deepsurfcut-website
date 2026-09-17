import { cp, mkdir, rm } from 'node:fs/promises';

// Publish only website assets. Server code, tests, dependencies, and local
// credentials must never be copied into the public Pages output directory.
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const path of [
  'index.html', '404.html', 'home.css', 'home.js', 'legal.css', 'styles.css', 'script.js',
  'robots.txt', 'sitemap.xml', '_headers', '_routes.json',
  'assets', 'privacy', 'support', 'terms', 'zh', 'device-preview',
]) {
  await cp(new URL(path, root), new URL(path, output), {
    recursive: true,
    filter: (source) => !source.split('/').at(-1).startsWith('.'),
  });
}
console.log('Website assets prepared in dist/.');
