// Load-time check on the production single file: serves dist-single/index.html over HTTP and loads it
// several times in one browser (first visit, then repeat visits that use the texture cache).
//   npm run build:single && node tools/loadtime.mjs [--runs 3]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from './lib/cdp.mjs';
import { args } from './lib/server.mjs';

const A = args();
const runs = Number(A.runs || 3);
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-single/index.html');
if (!fs.existsSync(file)) { console.log('build first: npm run build:single'); process.exit(1); }
const html = fs.readFileSync(file);
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const s = await Session.launch({ w: 1280, h: 720 });
for (let i = 0; i < runs; i++) {
  await s.navigate(url + '?perf&n=' + i);
  await s.waitState('title', 90000);
  const lt = JSON.parse(await s.evaluate('JSON.stringify(window.__loadTimes)'));
  const steps = lt.map((x, k) => (k ? `${lt[k - 1].text.replace(/…/g, '').replace(/ \(.*\)/, '')} ${x.t - lt[k - 1].t}` : null)).filter(Boolean).join(' · ');
  console.log(`${i ? 'repeat' : 'first '} visit: title after ${lt[lt.length - 1].t} ms\n   ${steps}`);
}
await s.close();
server.close();
