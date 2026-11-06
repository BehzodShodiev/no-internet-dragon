// Hitbox probe, to `eval` into a running game (debug mode, ?debug, so nothing ends the run). Samples the
// current monster's five boxes while running, ducking, in the air and smashing, and resolves
// window.__meas to a text report: per box, x range of the left / right edge and y range of the bottom /
// top edge, relative to the monster's feet. Run it for the Kaiju and for a new monster and compare: every
// monster must keep the Kaiju's heights (running top ~2.40, ducking top ~1.49, airborne bottom ~0.33).
window.__meas = (async () => {
  const g = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const f = (a) => a.map((v) => v.toFixed(2)).join('..');
  const res = {};
  const sample = async (label, ms) => {
    const end = performance.now() + ms;
    const R = [];
    while (performance.now() < end) {
      await new Promise((r) => requestAnimationFrame(r));
      const n = g.dragon.getHitboxes(g.boxes);
      for (let i = 0; i < n; i++) {
        const b = g.boxes[i];
        const q = (R[i] = R[i] || { x0: [9, -9], y0: [9, -9], x1: [9, -9], y1: [9, -9] });
        const upd = (k, v) => { q[k][0] = Math.min(q[k][0], v); q[k][1] = Math.max(q[k][1], v); };
        upd('x0', b[0]); upd('y0', b[1] - g.y); upd('x1', b[2]); upd('y1', b[3] - g.y);
      }
    }
    res[label] = R.map((q) => `x ${f(q.x0)} / ${f(q.x1)}   y ${f(q.y0)} / ${f(q.y1)}`);
  };
  await sample('run', 2500);
  g.input.duck = true; await sleep(300); await sample('duck', 1000); g.input.duck = false; await sleep(300);
  g.input.jump = true; g._onJump(); await sleep(120); await sample('air', 350); g.input.jump = false; await sleep(800);
  g.smashCool = 0; g._smash(); await sample('bite', 300);
  return `${g.monster.id}\n` + Object.entries(res).map(([k, v]) => `${k}\n  ${v.join('\n  ')}`).join('\n');
})();
'measuring (read window.__meas in ~5.5 s)';
