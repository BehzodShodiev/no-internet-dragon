(() => {
  const g = window.__game;
  const SMASHER = !!window.__smasher; // smash everything breakable, not just what must be smashed
  window.__bot = { jumps: 0, ducks: 0, deaths: 0, maxScore: 0, breaths: 0, smashes: 0, glides: 0, glideTime: 0, drops: 0, log: [] };
  const B = window.__bot;
  const FLY = ['ptero', 'heli', 'shell', 'missile'];
  let holding = false, ducking = false, last = performance.now();
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), frame = (now - last) / 1000;
    last = now;
    if (window.__botStop) return;
    if (g.state === 'over') {
      B.deaths++; B.maxScore = Math.max(B.maxScore, g.score | 0);
      const near = g.obstacles.active.filter(o => o.x > -6 && o.x < 9).map(o => o.type + '/' + (o.ty ?? o.y).toFixed(2) + '@' + o.x.toFixed(1) + (o.dead ? 'D' : '') + (o.reflected ? 'R' : ''));
      B.log.push({ score: g.score | 0, stage: g.stages.key, speed: +g.speed.toFixed(1), y: +g.y.toFixed(2), duck: g.ducking, smashT: +g.smashT.toFixed(2), cool: +g.smashCool.toFixed(2), near });
      g.overT = 1; g._onJump();
      return;
    }
    if (g.state !== 'running') return;
    B.maxScore = Math.max(B.maxScore, g.score | 0);
    if (g.boss.state === 'fight' && g.charge >= 1 && g.breathT <= 0) { g._breath(); B.breaths++; }
    const v = g.speed;
    const ahead = g.obstacles.active.filter(o => !o.dead && !o.reflected && o.x + o.width / 2 > (FLY.includes(o.type) ? -3.5 : -0.5)).sort((a, b) => a.x - b.x);
    const o = ahead[0];
    let wantDuck = false;
    if (o) {
      const front = o.x - o.width / 2 - 2.6; // distance from snout to obstacle
      const t = front / (v + o.vx);
      const y = o.ty ?? o.y;
      const fly = FLY.includes(o.type);
      const smashIt = o.tall || (SMASHER && typeof o.smash === 'number' && o.smash > 0 && (!fly || y < 2.5));
      if (smashIt) {
        if (t < 0.12 && g.smashT <= 0 && g.smashCool <= 0) { g._smash(); B.smashes++; }
      } else if (fly && y > 2.5) { /* run under */ }
      else if (fly && y > 1.5) { if (t < 0.45) wantDuck = true; }
      else if (t < 0.17 && g.grounded && front > -1.5) { g.input.jump = true; g._onJump(); B.jumps++; holding = true; }
    }
    if (holding && g.grounded && g.vy === 0) holding = false;
    // Gliders (Mothra): past the top of a jump, keep holding (gliding) only while nothing is due before
    // she would land, plus a moment to jump again; otherwise let go and drop on the normal arc. A glide is
    // always at or above the normal arc, so whatever is under her already is cleared either way.
    if (holding && g.monster.glide && !g.grounded && g.vy <= 0) {
      const tLand = g.y / 6.5 + 0.2;
      const due = g.obstacles.active.some((q) => {
        if (q.dead || q.reflected) return false;
        const front = q.x - q.width / 2 - 2.6;
        return front > 0 && front < (v + q.vx) * (tLand + 0.35);
      });
      if (due) { holding = false; B.drops++; }
      else { if (!g.gliding) B.glides++; B.glideTime += frame; }
    }
    if (!holding) g.input.jump = false;
    g.input.duck = wantDuck;
    if (wantDuck && !ducking) B.ducks++;
    ducking = wantDuck;
  }
  tick();
  return 'bot on';
})()
