// Starts the Vite dev server for a test run (or reuses --url), so tests need no server running beforehand.
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Returns { url, close }. If `url` is given, nothing is started. */
export async function serve(url) {
  if (url) return { url, close: async () => {} };
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.js'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5190 + Math.floor(Math.random() * 400), strictPort: false },
  });
  await server.listen();
  const local = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${server.config.server.port}/`;
  return { url: local, close: () => server.close() };
}

/** Tiny argv parser: --key value, --flag, and positionals. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
