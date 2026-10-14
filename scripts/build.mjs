import { cp, mkdir, rm } from 'node:fs/promises';
import { updatePages } from './render-updates.mjs';
import { buildIcons } from './build-icons.mjs';

await updatePages({ check: true });
await buildIcons({ check: true });

// Publish only website assets. Server code, tests, dependencies, and local
// credentials must never be copied into the public Pages output directory.
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const path of [
  'index.html', '404.html', 'home.css', 'home.js', 'legal.css', 'styles.css', 'script.js',
  'updates', 'updates.css', 'updates.js',
  'robots.txt', 'sitemap.xml', '_headers', '_routes.json',
  'assets', 'privacy', 'support', 'terms', 'zh', 'de', 'surf-video-editing', 'portrait-follow', 'portrait-follow.css', 'device-preview', 'deepfollow',
]) {
  await cp(new URL(path, root), new URL(path, output), {
    recursive: true,
    filter: (source) => !source.split('/').at(-1).startsWith('.'),
  });
}
console.log('Website assets prepared in dist/.');
