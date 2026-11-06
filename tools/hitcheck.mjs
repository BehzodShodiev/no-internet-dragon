// Hitbox parity gate: every monster must keep the Kaiju's hitbox HEIGHTS (only the width may differ).
//   node tools/hitcheck.mjs [--monsters ghidorah,mothra] [--tol 0.05] [--url URL]
// Compares, against the Kaiju: running top (max), ducking top (max) and airborne bottom (median), each
// within --tol. Exit 1 on any failure. Uses tools/hitboxes.js in a ?debug run (collisions off).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, sleep } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';
import { MONSTERS } from '../src/entities/Monsters.js';

const A = args();
const tol = Number(A.tol || 0.05);
const monsters = A.monsters ? String(A.monsters).split(',') : MONSTERS.map((m) => m.id).filter((id) => id !== 'kaiju');
const probe = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'hitboxes.js'), 'utf8');
const { url, close } = await serve(A.url);
const s = await Session.launch({ w: 960, h: 540 });

async function measure(id) {
  const u = new URL(url);
  u.searchParams.set('debug', '');
  u.searchParams.set('seed', '1');
  await s.navigate(u.toString());
  if (!(await s.waitState('title', 90000))) throw new Error('no title');
  await s.evaluate(`window.__game.selectMonster('${id}', true)`);
  await sleep(300);
  await s.evaluate('window.__game._onJump()');
  if (!(await s.waitState('running', 30000))) throw new Error('did not start');
  await sleep(1500);
  await s.evaluate(probe);
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const j = await s.evaluate('window.__measJSON');
    if (j) return j.env;
  }
  throw new Error('probe timed out');
}

const ref = await measure('kaiju');
console.log('kaiju     run top', ref.run.topMax, '· duck top', ref.duck.topMax, '· air bottom', ref.air.bottomMed);
let fail = 0;
for (const id of monsters) {
  const e = await measure(id);
  const checks = [['run top', e.run.topMax, ref.run.topMax], ['duck top', e.duck.topMax, ref.duck.topMax], ['air bottom', e.air.bottomMed, ref.air.bottomMed]];
  const bad = checks.filter(([, v, r]) => Math.abs(v - r) > tol);
  fail += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'pass'} ${id.padEnd(9)} ` + checks.map(([n, v, r]) => `${n} ${v} (${v >= r ? '+' : ''}${(v - r).toFixed(3)})`).join(' · '));
}
await s.close();
await close();
process.exit(fail ? 1 : 0);
