// Performance gate: plays reference scenes with the autopilot in real time (?perf) and reports the
// frame-time distribution, CPU/GPU time, draw calls, triangles and load time. Run it SOLO (one Chrome).
//   node tools/perf.mjs [--scenes a,b] [--secs 15] [--save base.json] [--baseline base.json] [--url URL]
// Budget (the 1280x720 scenes): p95 frame <= 16.7 ms and no frame over 50 ms after warm-up. Exit 1 if over.
// Headless Chrome runs uncapped (no vsync), so frame intervals measure the real cost of a frame.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, sleep } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const secs = Number(A.secs || 15);
const bot = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'bot.js'), 'utf8');
// level index, view, quality, monster, day time, extra setup after the start, recurring action, screen
const SCENES = {
  'desert-noon-3d': { level: 0, view: '3d', quality: 'high', day: 0.25 },
  'city-siege-3d': { level: 1, view: '3d', quality: 'high', after: 'g.dist = 361;' },
  'volcano-boss-3d': { level: 2, view: '3d', quality: 'high', after: 'g.nextBossScore = 0;', every: 'if (g.boss.state === "fight") { if (g.rageT <= 0 && g.rage < 1) g._startRage(); g.charge = 1; g._breath(); }' },
  'desert-night-2d': { level: 0, view: '2d', quality: 'high', day: 0.66 },
  'phone-medium': { level: 0, view: '3d', quality: 'medium', day: 0.25, screen: { w: 844, h: 390, dpr: 2, mobile: true }, budgetless: true },
};
const pick = A.scenes ? String(A.scenes).split(',') : Object.keys(SCENES);
const { url, close } = await serve(A.url);
const results = {};
let over = 0;

for (const name of pick) {
  const sc = SCENES[name];
  if (!sc) { console.log(`unknown scene ${name}`); continue; }
  const s = await Session.launch(sc.screen || { w: 1280, h: 720 });
  const u = new URL(url);
  u.searchParams.set('perf', '');
  u.searchParams.set('seed', '7');
  await s.navigate(u.toString());
  if (!(await s.waitState('title', 120000))) { console.log(`${name}: no title`); await s.close(); continue; }
  const load = await s.evaluate('JSON.stringify(window.__loadTimes)').then((j) => JSON.parse(j || '[]'));
  await s.evaluate(`(() => { const g = window.__game; g.selectLevel(${sc.level}, true);
    g.rig.setMode('${sc.view}'); g.rig.raw = g.rig.blend = ${sc.view === '3d' ? 1 : 0}; g.hud.setView('${sc.view}');
    g._setQuality('${sc.quality}', false); g.selectMonster('kaiju'); return true; })()`);
  await s.evaluate('window.__game._onJump()');
  await s.waitState('running', 30000);
  await s.evaluate(bot);
  await s.evaluate(`(() => { const g = window.__game; ${sc.day != null ? `g.dayT = ${sc.day};` : ''} ${sc.after || ''} return true; })()`);
  if (sc.every) await s.evaluate(`(() => { const g = window.__game; window.__perfTimer = setInterval(() => { ${sc.every} }, 1500); return true; })()`);
  await sleep(4000); // warm-up: first spawns, shader variants, the boss arriving
  await s.evaluate('window.__perf.reset()');
  await sleep(secs * 1000);
  const st = await s.evaluate('JSON.stringify(window.__perf.snapshot())').then((j) => JSON.parse(j));
  const deaths = await s.evaluate('window.__bot.deaths');
  await s.close();
  const loadTotal = load.length ? load[load.length - 1].t : null;
  const steps = load.map((x, i) => (i ? `${load[i - 1].text.replace(/…/g, '')} ${x.t - load[i - 1].t}` : null)).filter(Boolean).join(' · ');
  const ok = sc.budgetless || (st.p95 <= 16.7 && st.long50 === 0);
  if (!ok) over++;
  results[name] = { ...st, loadMs: loadTotal, loadSteps: steps, deaths };
  for (const f of st.longFrames || []) console.log(`      long frame ${f.ms} ms at ${f.at} ms: ${f.newPrograms} new programs, update ${f.update} ms, render ${f.render} ms`);
  console.log(`${ok ? 'pass' : 'OVER'}  ${name.padEnd(16)} p50 ${st.p50} p95 ${st.p95} p99 ${st.p99} ms · >33ms ${st.long33} >50ms ${st.long50} · cpu ${st.cpuUpdate}+${st.cpuRender} ms · gpu ${st.gpu ?? 'n/a'} ms · ${st.calls} draws · ${(st.triangles / 1e6).toFixed(2)}M tris · load ${loadTotal} ms`);
}
await close();
console.log('load steps (ms):', Object.values(results)[0]?.loadSteps || '');

if (A.baseline && fs.existsSync(A.baseline)) {
  const base = JSON.parse(fs.readFileSync(A.baseline, 'utf8'));
  console.log('\nvs baseline:');
  for (const [name, r] of Object.entries(results)) {
    const b = base[name];
    if (!b) continue;
    const d = (k, unit = '') => `${k} ${b[k]}→${r[k]}${unit}`;
    console.log(`  ${name.padEnd(16)} ${d('p95', 'ms')} · ${d('calls')} · tris ${(b.triangles / 1e6).toFixed(2)}→${(r.triangles / 1e6).toFixed(2)}M · ${d('gpu', 'ms')} · ${d('loadMs', 'ms')}`);
  }
}
if (A.save) fs.writeFileSync(A.save, JSON.stringify(results, null, 1));
process.exit(over ? 1 : 0);
