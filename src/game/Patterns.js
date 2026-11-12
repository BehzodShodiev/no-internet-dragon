// Pacing director and authored set pieces (program part H, GP-09).
//
// A run moves through tempo phases: a warm-up, waves, a short breather with a long crystal line and a
// peak, and the last seconds before every gunship are always a peak (the crescendo). Waves and peaks
// can open with a set piece, a short authored sequence for the current stage (a tank convoy, a traffic
// jam, a meteor shower...), announced with a banner as it spawns.
//
// Fairness: the director only chooses where gaps fall inside the spawner's own [minGap, maxGap] range,
// and set-piece gaps are minGap × gapK with gapK >= 1, so nothing here is tighter than a normal run can
// already be. Set pieces contain no flyers and no shooting tanks.
import { mulberry32, hash32 } from '../gfx/noise.js';

/** [phase, seconds]. After the last phase the tempo loops back to index 1 (the warm-up happens once). */
export const TEMPO = [['warm', 8], ['wave', 18], ['breather', 6], ['wave', 18], ['peak', 10]];
/** Where random gaps fall in each phase, as fractions of (maxGap − minGap) above minGap. */
// (waves sit a little roomier than a plain random gap, so peaks change the rhythm, not the average density)
export const GAP = { warm: [0.3, 1], wave: [0.15, 1], breather: [0.15, 1], peak: [0.1, 0.6] };
/** Odds that a phase opens with a set piece (tried at each spawn until one fits the speed). */
const PIECE_ODDS = { warm: 0, wave: 0.6, breather: 0, peak: 0.9 };
/** The breather's long gap, as a multiple of minGap; it carries a long crystal line. */
export const BREATHER_GAP = 2.2;
/** Seconds before a gunship stage that count as the crescendo. */
export const CRESCENDO = 10;

const convoy = { id: 'convoy', title: 'TANK CONVOY', gapK: 1.15, items: [{ type: 'tank' }, { type: 'tank' }, { type: 'tank' }] };
const jam = { id: 'jam', title: 'TRAFFIC JAM', gapK: 1.2, items: [{ type: 'car', jam: true }] };
const blockBuster = { id: 'block', title: 'BLOCK BUSTER', gapK: 1.2, items: [{ type: 'building' }, { type: 'building' }, { type: 'building' }] };
const meteorShower = { id: 'meteors', title: 'METEOR SHOWER', gapK: 1.05, items: [{ type: 'meteor' }, { type: 'meteor' }, { type: 'meteor' }, { type: 'meteor' }] };

/**
 * Set pieces per stage key. items: { type, n (cactus count, capped by speed), jam (a 2–3 car pile-up,
 * smashed in one bite) }. minSpeed / minCycle: the piece only appears from that speed / loop on.
 */
export const PIECES = {
  desert: [
    // (from speed 13: below it every cactus cluster is a single cactus)
    { id: 'staircase', title: 'CACTUS STAIRCASE', minSpeed: 13, gapK: 1.15, items: [{ type: 'cactusS', n: 1 }, { type: 'cactusL', n: 2 }, { type: 'cactusL', n: 3 }] },
  ],
  army: [
    { id: 'checkpoint', title: 'CHECKPOINT', gapK: 1.2, items: [{ type: 'hedgehog' }, { type: 'tower' }, { type: 'hedgehog' }] },
    convoy,
  ],
  city: [jam, { ...blockBuster, minCycle: 1 }], // three buildings pay a lot: in the Rampage only from loop 2
  siege: [blockBuster, jam, { ...convoy, minCycle: 1 }],
  ashlands: [
    meteorShower,
    { id: 'hopscotch', title: 'LAVA HOPSCOTCH', gapK: 1, items: [{ type: 'lava' }, { type: 'lava' }, { type: 'lava' }, { type: 'lava' }] },
  ],
  inferno: [
    { id: 'gate', title: 'FORTRESS GATE', gapK: 1.2, items: [{ type: 'pillar' }, { type: 'hedgehog' }, { type: 'pillar' }] },
    { ...meteorShower, minCycle: 1 },
  ],
};

export class Director {
  constructor() {
    this.reset(0);
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.i = 0;
    this.phaseT = 0;
    this.n = 0;
    this.queue = []; // set-piece items still to spawn
    this.gapK = 1;
    this.wantPiece = false;
    this.breathe = false;
    this.crescendo = false;
    this.toldCrescendo = false;
    this.last = null;
  }

  get phase() {
    return this.crescendo ? 'peak' : TEMPO[this.i][0];
  }

  update(dt) {
    // the run into a gunship always gets a set piece
    if (this.crescendo && !this.toldCrescendo) {
      this.toldCrescendo = true;
      this.wantPiece = true;
    }
    if (!this.crescendo) this.toldCrescendo = false;
    this.phaseT += dt;
    if (this.phaseT < TEMPO[this.i][1]) return;
    this.phaseT = 0;
    this.i = this.i + 1 < TEMPO.length ? this.i + 1 : 1;
    this.n++;
    const ph = TEMPO[this.i][0];
    // the phase roll has its own stream, so it never shifts the spawn streams
    const r = mulberry32(hash32(this.seed, 2000 + this.n))();
    // a breather stays clear: a piece still waiting for its speed is dropped (the crescendo re-arms one)
    // the first wave always opens with one, so every run shows a set piece within its first 30 seconds
    this.wantPiece = ph === 'breather' ? this.crescendo : this.wantPiece || this.n === 1 || r < PIECE_ODDS[ph];
    if (ph === 'breather') this.breathe = true;
  }

  /** At a spawn: if a set piece is wanted and one fits, queue its items and return it. */
  start(stage, speed, cycle, rand) {
    if (!this.wantPiece || this.queue.length) return null;
    let fit = (PIECES[stage] || []).filter((p) => speed >= (p.minSpeed || 0) && cycle >= (p.minCycle || 0));
    if (!fit.length) return null;
    if (fit.length > 1) fit = fit.filter((p) => p.id !== this.last); // vary them when the stage has more than one
    const p = fit[Math.floor(rand() * fit.length)];
    this.last = p.id;
    this.wantPiece = false;
    this.queue = p.items.slice();
    this.gapK = p.gapK;
    return p;
  }
}
