// Drives headless Chrome through a JSON list of steps and saves screenshots.
//   node --experimental-websocket tools/cdp.mjs <url> <outdir> <steps.json> [w h]
// Steps: waitState, wait, key (press; hold ms), down / up, cdp {cdp, params}, click [x, y], tap [x, y],
// reload, eval (expression or { evalFile }), shot (name). Unknown keys fail loudly.
import fs from 'node:fs';
import path from 'node:path';
import { Session, sleep } from './lib/cdp.mjs';

const [url, outdir, stepsFile, w = '1280', h = '720'] = process.argv.slice(2);
if (!stepsFile) { console.log('usage: node tools/cdp.mjs <url> <outdir> <steps.json> [w h]'); process.exit(1); }
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outdir, { recursive: true });
const s = await Session.launch({ w: +w, h: +h });
await s.navigate(url);
const t0 = Date.now();
let failed = false;
for (const st of steps) {
  if (st.waitState && !(await s.waitState(st.waitState))) { s.logs.push(`[timeout] waiting for state ${st.waitState}`); failed = true; }
  if (st.wait) await sleep(st.wait);
  if (st.key) await s.press(st.key, st.hold || 40);
  if (st.down) await s.key('keyDown', st.down);
  if (st.up) await s.key('keyUp', st.up);
  if (st.cdp) { const r = await s.send(st.cdp, st.params || {}); if (r.error) s.logs.push(`[cdp-error] ${st.cdp}: ${r.error.message}`); }
  if (st.click) await s.click(...st.click);
  if (st.tap) await s.tap(...st.tap);
  if (st.reload) { await s.send('Page.reload', { ignoreCache: false }); await sleep(500); }
  const expr = st.evalFile ? fs.readFileSync(st.evalFile, 'utf8') : st.eval;
  if (expr) {
    const r = await s.evaluate(expr);
    if (r !== undefined) s.logs.push(`[eval] ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  }
  if (st.shot) await s.screenshot(path.join(outdir, st.shot + '.png'));
}
s.logs.push(`elapsed ${(Date.now() - t0) / 1000}s`);
console.log(s.logs.filter((l) => !l.includes('[vite]')).join('\n'));
await s.close();
process.exit(failed ? 1 : 0);
