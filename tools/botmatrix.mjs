// The fairness gate: runs the autopilot (tools/bot.js) on every level x view x monster x seed in fast
// fixed-step simulation (?sim=N) until each run reaches a loop count, and fails (exit 1) on any death.
//   node tools/botmatrix.mjs [--levels 1,2,3] [--views 2d,3d] [--monsters kaiju,ghidorah,mothra]
//        [--seeds 101,202] [--loops 4] [--sim 10] [--workers 3] [--max 1500] [--url URL] [--quick]
// --max: game seconds per run before giving up on reaching the loop count (counted as a pass, flagged).
// --quick: one seed, 2 loops. A JSON report is written to the OS temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, sleep } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const list = (v, d) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : d);
const quick = !!A.quick;
const levels = list(A.levels, ['1', '2', '3']).map(Number);
const views = list(A.views, ['2d', '3d']);
const monsters = list(A.monsters, ['kaiju', 'ghidorah', 'mothra']);
const seeds = list(A.seeds, quick ? ['101'] : ['101', '202']).map(Number);
const loops = Number(A.loops || (quick ? 2 : 4));
const sim = Number(A.sim || 10);
const workers = Number(A.workers || 3);
const maxGame = Number(A.max || 1500);
const bot = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'bot.js'), 'utf8');

const jobs = [];
for (const seed of seeds) for (const level of levels) for (const view of views) for (const monster of monsters) jobs.push({ level, view, monster, seed });

const { url, close } = await serve(A.url);
console.log(`matrix: ${jobs.length} runs (levels ${levels}, views ${views}, monsters ${monsters}, seeds ${seeds}), to loop ${loops}, sim x${sim}, ${workers} workers, ${url}`);
const results = [];
const t0 = Date.now();

async function runJob(s, j) {
  const u = new URL(url);
  u.searchParams.set('sim', String(sim));
  u.searchParams.set('seed', String(j.seed));
  await s.navigate(u.toString());
  if (!(await s.waitState('title', 90000))) return { ...j, error: 'no title' };
  const setup = await s.evaluate(`(() => { const g = window.__game; g.selectLevel(${j.level - 1}, true);
    if (g.rig.mode !== '${j.view}') { g.rig.setMode('${j.view}'); g.rig.raw = g.rig.blend = '${j.view}' === '3d' ? 1 : 0; g.hud.setView('${j.view}'); }
    g.selectMonster('${j.monster}', true); return g.monster.id + '/' + g.level.id + '/' + g.rig.mode; })()`);
  if (typeof setup !== 'string' || !setup.startsWith(j.monster)) return { ...j, error: 'setup ' + JSON.stringify(setup) };
  // the bot goes in before the run starts (it idles until then): injected after the start, a busy
  // machine could let the fast simulation reach the first obstacle with nobody at the controls
  await s.evaluate(bot);
  await s.evaluate('window.__game._onJump()');
  if (!(await s.waitState('running', 30000))) return { ...j, error: 'did not start' };
  const start = await s.evaluate('window.__game.time');
  for (;;) {
    await sleep(1500);
    const st = await s.evaluate(`(() => { const g = window.__game, B = window.__bot; return { t: g.time, loops: g.stages.cycle, deaths: B.deaths, score: g.score | 0, stage: g.stages.number, gunships: g.bossesDowned, state: g.state, monster: g.monster.id, level: g.level.id, seed: g.seedBase }; })()`);
    if (!st || st.__error) return { ...j, error: 'eval ' + JSON.stringify(st) };
    // the run must still be the one that was asked for (a page reload would silently swap it)
    if (st.monster !== j.monster || st.level !== j.level || st.seed !== j.seed) return { ...j, error: `wrong run: ${st.monster} L${st.level} seed ${st.seed}` };
    const gameT = st.t - start;
    if (st.deaths > 0 || st.loops >= loops || gameT > maxGame) {
      const B = await s.evaluate('JSON.stringify(window.__bot)');
      const b = JSON.parse(B);
      return { ...j, deaths: b.deaths, loops: st.loops, gameTime: Math.round(gameT), score: b.maxScore, stage: st.stage, gunships: st.gunships,
        jumps: b.jumps, ducks: b.ducks, smashes: b.smashes, glides: b.glides, drops: b.drops, timedOut: st.loops < loops && st.deaths === 0, log: b.log };
    }
  }
}

let next = 0;
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
  let s = await Session.launch({ w: 960, h: 540 });
  while (next < jobs.length) {
    const j = jobs[next++];
    let r;
    try { r = await runJob(s, j); } catch (e) { r = { ...j, error: String(e) }; }
    if (r.error) { // one retry with a fresh browser for infrastructure errors
      await s.close();
      s = await Session.launch({ w: 960, h: 540 });
      try { r = await runJob(s, j); } catch (e) { r = { ...j, error: String(e) }; }
    }
    results.push(r);
    const tag = `L${j.level} ${j.view} ${j.monster.padEnd(8)} seed ${j.seed}`;
    if (r.error) console.log(`ERROR ${tag}: ${r.error}`);
    else console.log(`${r.deaths ? 'FAIL ' : r.timedOut ? 'SLOW ' : 'pass '} ${tag}: ${r.deaths} deaths, loop ${r.loops}, ${r.gameTime}s game, score ${r.score}, ${r.gunships} gunships${r.glides ? `, ${r.glides} glides` : ''}`);
    if (r.deaths) for (const d of r.log) console.log('   death:', JSON.stringify(d));
  }
  await s.close();
}));
await close();

const failed = results.filter((r) => r.deaths || r.error);
const report = path.join(os.tmpdir(), `botmatrix-${Date.now()}.json`);
fs.writeFileSync(report, JSON.stringify({ levels, views, monsters, seeds, loops, sim, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)}s · report ${report}`);
process.exit(failed.length ? 1 : 0);
