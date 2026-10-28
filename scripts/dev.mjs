import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const venueRoutes = new Set(['/RapidSurfingMap']);
const localBaiduOrigins = ['http://api.map.baidu.com', 'http://*.bdimg.com'];

export function localPreviewHeaders(source) {
  let route, changed = 0;
  const result = source.split('\n').map((line) => {
    if (line.trim() && !line.trim().startsWith('#') && !/^\s/.test(line)) route = line.trim();
    if (!venueRoutes.has(route) || !/^\s+Content-Security-Policy:/i.test(line)) return line;
    let directives = 0;
    const patched = line.replace(/\b(script-src|connect-src)\s+([^;]+)/g, (match, name, values) => {
      const origins = values.trim().split(/\s+/);
      if (!localBaiduOrigins.every((origin) => origins.includes(origin.replace('http:', 'https:')))) {
        throw new Error('Expected HTTPS Baidu origins are missing from the venue policy.');
      }
      directives++;
      for (const origin of localBaiduOrigins) if (!origins.includes(origin)) origins.push(origin);
      return `${name} ${origins.join(' ')}`;
    });
    if (directives !== 2) throw new Error('Expected venue script and connection policies are missing.');
    changed++;
    return patched;
  }).join('\n');
  if (changed !== venueRoutes.size) throw new Error('Expected the standalone map policy for the local preview.');
  return result;
}

export async function preparePreviewAssets(root = new URL('../', import.meta.url)) {
  const source = new URL('dist/', root);
  const output = new URL('.wrangler/preview-assets/', root);
  // Compute and validate first. Production headers and build assets are read-only.
  const headers = localPreviewHeaders(await readFile(new URL('_headers', source), 'utf8'));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
  await writeFile(new URL('_headers', output), headers);
  return output;
}

async function main() {
  const root = new URL('../', import.meta.url);
  const assets = await preparePreviewAssets(root);
  const logs = new URL('.wrangler/logs/', root);
  await mkdir(logs, { recursive: true });
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', root)),
    'pages', 'dev', fileURLToPath(assets), ...process.argv.slice(2), '--ip', '127.0.0.1',
  ], {
    cwd: fileURLToPath(root), stdio: 'inherit',
    env: { ...process.env, WRANGLER_LOG_PATH: fileURLToPath(new URL('dev.log', logs)), WRANGLER_SEND_METRICS: 'false' },
  });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = signals.map((signal) => {
    const handler = () => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
    process.on(signal, handler);
    return handler;
  });
  try {
    await new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Could not start the local Cloudflare preview.')));
      child.once('close', (code, signal) => {
        process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
        resolve();
      });
    });
  } finally {
    signals.forEach((signal, index) => process.removeListener(signal, handlers[index]));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
