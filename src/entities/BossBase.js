// What every boss shares: the state machine (idle -> enter -> fight -> dying), hit points and the
// phase-2 switch at half health, the attack queue with its warnings, and the rule that only one attack
// runs at a time. A boss subclass builds its model and supplies:
//   _enter(k, time)       pose while it arrives (k: 0..1 of ENTER_TIME)
//   _fightPose(dt, time)  pose while it fights
//   _attack()             queues its next attack and sets this.cool (only called with the queue empty)
//   _fire(item, ctx)      a queued item's moment has come
//   _dying(dt, ctx)       returns true when the wreck is gone
//   box(out), title(levelName, n)
// Every attack is telegraphed: an item's warning shows from WARN_TIME before it fires.
export const WARN_TIME = 0.9; // seconds of warning before each attack
export const ENTER_TIME = 2.6;
export const MISSILE_LOW = 0.95; // jump these
export const MISSILE_MID = 1.95; // duck these

export class BossBase {
  constructor() {
    this.state = 'idle'; // idle | enter | fight | dying
    this.x = 40;
    this.y = 12;
    this.hp = this.maxHp = 0;
    this.queue = [];
    this.warnings = []; // [{x, y, t, kind}] for the HUD and the autopilot
    this.t = 0;
    this.flinch = 0;
    this.cool = 0;
    this.hold = 0;
    this.phaseUp = false;
    this.group = null; // set by the subclass
  }

  get active() {
    return this.state === 'enter' || this.state === 'fight';
  }

  /** 1 until it is down to half its hit points, then 2. */
  get phase() {
    return this.hp <= this.maxHp / 2 ? 2 : 1;
  }

  /** Where batted-back missiles hit it. */
  front() {
    return this.x - 2.5;
  }

  /** Common set-up; subclasses add theirs in _start. rand: this fight's seeded stream (a seed replays the fight). */
  start(cycle, home, rand = Math.random, opts = {}) {
    this.rand = rand;
    this.cycle = cycle;
    this.home = home;
    this.state = 'enter';
    this.t = 0;
    this.queue.length = 0;
    this.warnings.length = 0;
    this.flinch = 0;
    this.hold = 0; // the next attack waits at least this long (the last one's danger still to pass)
    this.phaseUp = false; // set once when phase 2 begins (the game announces it)
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this._start(cycle, home, opts);
  }

  _start() {}

  reset() {
    this.state = 'idle';
    this.queue.length = 0;
    this.warnings.length = 0;
    this.group.visible = false;
  }

  /** A hit taking n hit points. Returns true when it was the killing blow. */
  hit(n = 1) {
    if (this.state !== 'fight') return false;
    const was = this.phase;
    this.hp = Math.max(0, this.hp - n);
    this.flinch = 1;
    if (was === 1 && this.phase === 2 && this.hp > 0) this.phaseUp = true;
    // A hit never cancels the attack being aimed (otherwise fast breaths keep it from ever firing);
    // instead it retaliates sooner, though never while the last attack's danger is still coming.
    this.cool = Math.max(Math.min(this.cool, 0.6), this.hold);
    if (this.hp > 0) return false;
    this.state = 'dying';
    this.t = 0;
    this._die();
    return true;
  }

  _die() {}

  /** ctx: see Game._bossCtx (home, yaw, fire, shoot, drop, shock, beam, ram, smoke, blast, onGone). */
  update(dt, time, ctx) {
    if (this.state === 'idle') return;
    this.t += dt;
    this.home = ctx.home;
    this.flinch = Math.max(0, this.flinch - dt * 2.5);
    this.warnings.length = 0;
    if (this.state === 'enter') {
      this._enter(Math.min(1, this.t / ENTER_TIME), time, ctx);
      if (this.t >= ENTER_TIME) { this.state = 'fight'; this.t = 0; }
    } else if (this.state === 'fight') {
      this._fightPose(dt, time, ctx);
      this.cool -= dt;
      this.hold = Math.max(0, this.hold - dt);
      if (this.cool <= 0 && !this.queue.length && this._ready()) this._attack();
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const s = this.queue[i];
        s.t -= dt;
        if (s.t <= (s.warn ?? WARN_TIME) && !s.quiet) this.warnings.push({ x: s.wx ?? this.x - 2, y: s.y, t: s.t, kind: s.kind });
        if (s.t <= 0) {
          this.queue.splice(i, 1);
          this._fire(s, ctx);
        }
      }
    } else if (this.state === 'dying') {
      if (this._dying(dt, ctx)) {
        this.reset();
        ctx.onGone();
        return;
      }
    }
    this._afterUpdate(dt, time, ctx);
    this._place();
  }

  /** Puts the model where the boss is (a ground boss keeps its model on the ground). */
  _place() {
    this.group.position.set(this.x, this.y, 0);
  }

  /** Whether it may start its next attack (a subclass can hold off, e.g. while recovering from a parry). */
  _ready() {
    return true;
  }

  _afterUpdate() {}
}
