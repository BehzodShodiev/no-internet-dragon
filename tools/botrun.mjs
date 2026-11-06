// Runs the autopilot on one level and view with one monster, and prints a report.
//   node tools/botrun.mjs <level 1-3> <2d|3d> <monster id> <seconds> [--smasher] [--url http://127.0.0.1:5187/]
// Needs the dev server (or any URL serving the game). Locked monsters are picked as the owner's preview.
// Report: deaths (must be 0), score, stage reached, loops, gunships downed, the bot's actions (glides/drops
// for gliding monsters), average fps and frames over 33 ms. A screenshot of the end lands in the temp dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const [lv, view, monster, secs] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--url'));
if (!secs) { console.log('usage: node tools/botrun.mjs <level 1-3> <2d|3d> <monster> <seconds> [--smasher] [--url URL]'); process.exit(1); }
const tools = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'botrun-'));
const tag = `bot-L${lv}-${view}-${monster}${flag('--smasher') ? '-smash' : ''}`;
const setup = `(() => { const g = window.__game; g.selectLevel(${Number(lv) - 1}, true); if (g.rig.mode !== '${view}') g.toggleView();
  g.selectMonster('${monster}', true); ${flag('--smasher') ? 'window.__smasher = true;' : ''}
  window.__fps = { n: 0, t0: performance.now(), slow: 0, last: performance.now() };
  const f = () => { const t = performance.now(); if (t - window.__fps.last > 33) window.__fps.slow++; window.__fps.last = t; window.__fps.n++; requestAnimationFrame(f); }; f();
  return g.monster.id + ' L' + g.level.id + ' ' + g.rig.mode; })()`;
const report = `(() => { const g = window.__game, B = window.__bot, F = window.__fps; const s = (performance.now() - F.t0) / 1000;
  return JSON.stringify({ deaths: B.deaths, maxScore: B.maxScore, score: g.score | 0, stage: g.stages.number, loops: g.stages.cycle, gunships: g.bossesDowned,
    jumps: B.jumps, ducks: B.ducks, smashes: B.smashes, breaths: B.breaths, glides: B.glides, glideTime: +B.glideTime.toFixed(1), drops: B.drops,
    fps: +(F.n / s).toFixed(1), slowFrames: F.slow, log: B.log }); })()`;
const steps = [
  { waitState: 'title' }, { wait: 600 }, { eval: setup }, { wait: 1500 }, { key: 'Space' }, { waitState: 'running' },
  { eval: fs.readFileSync(path.join(tools, 'bot.js'), 'utf8') },
  { wait: Number(secs) * 1000 }, { shot: tag }, { eval: report },
];
const file = path.join(out, tag + '.json');
fs.writeFileSync(file, JSON.stringify(steps));
const res = execFileSync(process.execPath, ['--experimental-websocket', path.join(tools, 'cdp.mjs'), opt('--url', 'http://127.0.0.1:5187/'), out, file],
  { encoding: 'utf8', timeout: (Number(secs) + 120) * 1000 });
console.log(`${tag} (screenshot in ${out})\n` + res.split('\n').filter((l) => !l.includes('[vite]') && !l.includes('bot on')).join('\n'));
