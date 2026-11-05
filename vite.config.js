import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';

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

// `npm run build`        -> dist/ (hashed assets + service worker for offline play)
// `npm run build:single` -> dist-single/index.html, one self-contained file you can double-click
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [singleFileHead(), viteSingleFile({ removeViteModuleLoader: true })] : [],
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
