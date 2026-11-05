// Levels and their stage loops. Each level is its own world with its own leaderboard, and loops through
// its stages, faster every time round. Progress is measured in distance points (the score before combo
// multipliers), so stage pacing doesn't depend on how many combos the player farms.
const STAGE = {
  desert: { key: 'desert', title: 'DESERT RUN', length: [300, 240] }, // [first loop, later loops]
  army: { key: 'army', title: 'ARMY OUTPOST', length: [420, 360] },
  boss: { key: 'boss', title: 'GUNSHIP INCOMING', boss: true },
  city: { key: 'city', title: 'CITY RAMPAGE', length: [360, 300] },
  siege: { key: 'siege', title: 'CITY SIEGE', length: [420, 360] },
  cityBoss: { key: 'boss', title: 'GUNSHIP OVER THE CITY', boss: true },
  ashlands: { key: 'ashlands', title: 'ASHLANDS', length: [360, 300] },
  inferno: { key: 'inferno', title: 'INFERNO FORTRESS', length: [420, 360] },
  volcanoBoss: { key: 'boss', title: 'INFERNO GUNSHIP', boss: true },
};

/**
 * field: the leaderboard field holding each player's best on this level ('best' predates levels and
 * stays as the Desert board). pace: speed multiplier. tight: extra gap tightening and boss toughness.
 * time: a fixed time of day (cycle 0..1), or null for the normal day/night cycle.
 * breath: how fast the atomic breath charges; bossCharge: its extra boost during the gunship fight;
 * rageCrystals: crystals to fill Kaiju Rage. Harder levels make you earn both.
 */
export const LEVELS = [
  {
    id: 1, name: 'DESERT OUTPOST', short: 'Desert', stars: 1, field: 'best', biome: 'desert', pace: 1, tight: 0, time: null, startT: 0.035,
    breath: 1, bossCharge: 0.75, rageCrystals: 40,
    stages: [STAGE.desert, STAGE.army, STAGE.boss],
    blurb: 'Cacti, tanks, watchtowers and a gunship. The place to learn jump, duck and smash.',
  },
  {
    id: 2, name: 'NIGHT CITY', short: 'City', stars: 2, field: 'l2', biome: 'city', pace: 1.12, tight: 1, time: 0.575,
    breath: 0.85, bossCharge: 0.65, rageCrystals: 55,
    stages: [STAGE.city, STAGE.siege, STAGE.cityBoss],
    blurb: 'Traffic, buildings to flatten and the army in the streets, under the street lights.',
  },
  {
    id: 3, name: 'VOLCANO FORTRESS', short: 'Volcano', stars: 3, field: 'l3', biome: 'volcano', pace: 1.25, tight: 2, time: 0.53,
    breath: 0.72, bossCharge: 0.6, rageCrystals: 70,
    stages: [STAGE.ashlands, STAGE.inferno, STAGE.volcanoBoss],
    blurb: 'Lava pools, falling meteors, basalt pillars and the Inferno Gunship. Fast.',
  },
];

export class Stages {
  constructor() {
    this.level = LEVELS[0];
    this.reset();
  }

  setLevel(level) {
    this.level = level;
    this.reset();
  }

  reset() {
    this.cycle = 0; // completed loops
    this.index = 0;
    this.start = 0;
  }

  get list() {
    return this.level.stages;
  }

  get current() {
    return this.list[this.index];
  }

  get key() {
    return this.current.key;
  }

  /** 1-based stage number across loops, for the banner. */
  get number() {
    return this.cycle * this.list.length + this.index + 1;
  }

  /**
   * Advances by distance; returns the stage that just began, or null. Boss stages wait for afterBoss().
   * The first gunship comes at the end of the first loop; later ones come by score (bossDue), wherever
   * the loop is, and the loop's own boss stage is skipped (loopBoss false).
   */
  update(dist, { bossDue = false, loopBoss = true } = {}) {
    const st = this.current;
    if (st.boss) return null;
    if (bossDue) {
      this.index = this.list.findIndex((s) => s.boss);
      this.start = dist;
      return this.current;
    }
    if (dist - this.start < st.length[this.cycle ? 1 : 0]) return null;
    let next = this._advance(dist);
    if (next.boss && !loopBoss) next = this._advance(dist);
    return next;
  }

  /** The gunship fell: move on to the next stage. */
  afterBoss(dist) {
    return this._advance(dist);
  }

  _advance(dist) {
    this.index++;
    if (this.index >= this.list.length) {
      this.index = 0;
      this.cycle++;
    }
    this.start = dist;
    return this.current;
  }
}
