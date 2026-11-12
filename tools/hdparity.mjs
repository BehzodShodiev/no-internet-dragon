// Hitbox parity between the standard and detailed (Very High) Kaiju: both models are driven through the
// same run, duck, jump and death poses and every hitbox must match exactly (they share one skeleton).
//   node tools/hdparity.mjs [--url URL]
import { Session } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const { url, close } = await serve(A.url);
const s = await Session.launch({ w: 640, h: 360 });
await s.navigate(url);
if (!(await s.waitState('title', 120000))) { console.log('no title'); process.exit(1); }
const r = await s.evaluate(`(async () => {
  const g = window.__game, D = g.dragon.constructor;
  const a = new D(g.tex.scales, 'kaiju', 'std'), b = new D(g.tex.scales, 'kaiju', 'hd');
  const boxes = () => Array.from({ length: 8 }, () => new Float32Array(4));
  const ba = boxes(), bb = boxes();
  const phases = [
    ['run', { speed: 14, grounded: true, vy: 0, running: true }],
    ['duck', { speed: 14, grounded: true, vy: 0, running: true, ducking: true }],
    ['jump', { speed: 14, grounded: false, vy: 8, running: true }],
    ['fall', { speed: 14, grounded: false, vy: -9, running: true }],
    ['breath', { speed: 14, grounded: true, vy: 0, running: true, breath: 1 }],
    ['dead', { speed: 0, grounded: true, vy: 0, dead: true }],
  ];
  let worst = 0, frames = 0;
  for (const [name, st] of phases) {
    for (let i = 0; i < 90; i++) {
      for (const d of [a, b]) { d.update(1 / 60, st); d.group.updateMatrixWorld(true); }
      const n = a.getHitboxes(ba), m = b.getHitboxes(bb);
      if (n !== m) return 'count differs in ' + name;
      for (let k = 0; k < n; k++) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(ba[k][c] - bb[k][c]));
      frames++;
    }
  }
  const tris = (d) => d.group.children.reduce((n, m) => n + (m.geometry ? (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 : 0), 0);
  const out = 'frames ' + frames + ', worst difference ' + worst + ', triangles std ' + tris(a) + ' hd ' + tris(b);
  a.dispose(); b.dispose();
  return out;
})()`);
console.log(r);
await s.close();
await close();
process.exit(/worst difference 0,/.test(r) ? 0 : 1);
