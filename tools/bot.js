// Autopilot, to `eval` into the page. It answers each threat the way the game's RESPONSE table says
// (Obstacles.respond): jump low things, duck mid flyers, run under high ones, smash what's too tall.
// Fixed, human-scale reflexes: jump 0.17 s before contact, duck from 0.45 s, smash at 0.12 s; full jumps,
// no fast-fall. With a gliding monster (the Moth Queen) it holds the glide only while nothing is due before it
// would land. It fires the breath at the gunship. Set window.__smasher = true first to also smash
// everything breakable. In fast simulation (?sim=N) it runs on every step through game.stepHook;
// otherwise once per frame. Results in window.__bot (deaths, log with the seed of each death).
(() => {
  const g = window.__game;
  const SMASHER = !!window.__smasher;
  window.__bot = { jumps: 0, ducks: 0, deaths: 0, maxScore: 0, breaths: 0, smashes: 0, glides: 0, glideTime: 0, drops: 0, runs: 1, log: [] };
  const B = window.__bot;
  let holding = false, ducking = false;

  function step(dt) {
    if (window.__botStop) return;
    if (g.state === 'over') {
      B.deaths++;
      B.runs++;
      B.maxScore = Math.max(B.maxScore, g.score | 0);
      const near = g.obstacles.active.filter((o) => o.x > -6 && o.x < 9).map((o) => o.type + '/' + (o.ty ?? o.y).toFixed(2) + '@' + o.x.toFixed(1) + (o.dead ? 'D' : '') + (o.reflected ? 'R' : ''));
      B.log.push({ seed: g.seed, score: g.score | 0, stage: g.stages.key, loop: g.stages.cycle, speed: +g.speed.toFixed(1), y: +g.y.toFixed(2), duck: g.ducking, smashT: +g.smashT.toFixed(2), cool: +g.smashCool.toFixed(2), near });
      g.overT = 1;
      g._onJump();
      holding = false;
      return;
    }
    if (g.state !== 'running') return;
    B.maxScore = Math.max(B.maxScore, g.score | 0);
    if (g.boss.state === 'fight' && g.charge >= 1 && g.breathT <= 0) { g._breath(); B.breaths++; }
    // Kaiju Rage (on demand): the bot saves it for the gunship
    if (g.rageReady && g.boss.state === 'fight') { g._triggerRage(); B.rages = (B.rages || 0) + 1; }
    const v = g.speed;
    const obs = g.obstacles;
    // threats still to deal with, nearest first (flyers stay until they're well past, so a duck is held)
    const ahead = obs.active.filter((o) => !o.dead && !o.reflected && o.x + o.width / 2 > (obs.flies(o) ? -3.5 : -0.5)).sort((a, b) => a.x - b.x);
    const o = ahead[0];
    let wantDuck = false;
    if (o) {
      const front = o.x - o.width / 2 - 2.6; // distance from the snout to the obstacle
      const t = front / (v + o.vx);
      const r = obs.respond(o);
      const y = o.ty ?? o.y;
      const smashIt = r === 'smash' || (SMASHER && typeof o.smash === 'number' && o.smash > 0 && (!obs.flies(o) || y < 2.5));
      if (smashIt) {
        if (t < 0.12 && g.smashT <= 0 && g.smashCool <= 0) { g._smash(); B.smashes++; }
      } else if (r === 'under') { /* run under */ }
      else if (r === 'duck') { if (t < 0.45) wantDuck = true; }
      else if (t < 0.17 && g.grounded && front > -1.5) { g.input.jump = true; g._onJump(); B.jumps++; holding = true; }
    }
    if (holding && g.grounded && g.vy === 0) holding = false;
    // Gliders: past the top of a jump, keep holding (gliding) only while nothing is due before landing,
    // plus a moment to jump again; otherwise let go and drop on the normal arc. A glide is always at or
    // above the normal arc, so whatever is under her already is cleared either way.
    if (holding && g.monster.glide && !g.grounded && g.vy <= 0) {
      const tLand = g.y / 6.5 + 0.2;
      const due = obs.active.some((q) => {
        if (q.dead || q.reflected) return false;
        const front = q.x - q.width / 2 - 2.6;
        return front > 0 && front < (v + q.vx) * (tLand + 0.35);
      });
      if (due) { holding = false; B.drops++; }
      else { if (!g.gliding) B.glides++; B.glideTime += dt; }
    }
    if (!holding) g.input.jump = false;
    g.input.duck = wantDuck;
    if (wantDuck && !ducking) B.ducks++;
    ducking = wantDuck;
  }

  g.stepHook = step;
  return 'bot on' + (g.sim ? ` (sim x${g.sim})` : '') + ` seed ${g.seed}`;
})()
