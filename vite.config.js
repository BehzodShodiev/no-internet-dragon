import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// In the single-file build there is no public/ folder next to the page, so inline the icon
// and drop the PWA manifest (it cannot be fetched from file:// anyway).
const singleFileHead = () => ({
  name: 'single-file-head',
  transformIndexHtml(html) {
    const icon = fs.readFileSync(new URL('./public/icon.svg', import.meta.url));
    return html
      .replace('href="./icon.svg"', `href="data:image/svg+xml;base64,${icon.toString('base64')}"`)
      .replace(/\s*<link rel="manifest"[^>]*>/, '');
  },
});

// Offline build: stamp the service worker with a content version and the list of hashed assets, so the
// first visit precaches everything and a new build cleanly replaces the old cache.
const swManifest = () => ({
  name: 'sw-manifest',
  apply: 'build',
  closeBundle() {
    const out = path.resolve('dist');
    const sw = path.join(out, 'sw.js');
    if (!fs.existsSync(sw)) return;
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.startsWith(path.join(out, 'assets'))) files.push('./' + path.relative(out, p).split(path.sep).join('/'));
      }
    };
    walk(out);
    files.sort();
    const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 12);
    const src = fs.readFileSync(sw, 'utf8')
      .replace("'no-internet-dragon-dev'", `'no-internet-dragon-${version}'`)
      .replace('/*ASSETS*/', files.map((f) => `'${f}'`).join(', '));
    fs.writeFileSync(sw, src);
  },
});

// `npm run build`        -> dist/ (hashed assets + service worker for offline play)
// `npm run build:single` -> dist-single/index.html, one self-contained file you can double-click
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [singleFileHead(), viteSingleFile({ removeViteModuleLoader: true })] : [swManifest()],
    publicDir: single ? false : 'public',
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: single ? 100_000_000 : 4096,
    },
    server: { host: true },
  };
});
