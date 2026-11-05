// Lifetime stats and monster unlocks for this player. Kept in browser storage, and mirrored into the
// player's leaderboard row (when they can write to it) so it follows them to other devices.
const KEY = 'dragon.progress';
export const STATS = ['runs', 'crystals', 'gunships', 'smashes', 'rages', 'closeCalls', 'bestScore'];

export class Progress {
  constructor() {
    this.stats = Object.fromEntries(STATS.map((s) => [s, 0]));
    this.unlocked = new Set(['kaiju']);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) this.merge(saved);
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  /** Takes the larger of each stat and the union of unlocks (from storage or the leaderboard row). */
  merge(data) {
    for (const s of STATS) this.stats[s] = Math.max(this.stats[s], Number(data?.stats?.[s]) || 0);
    for (const id of data?.unlocked || []) if (typeof id === 'string') this.unlocked.add(id);
  }

  add(stat, n = 1) {
    this.stats[stat] += n;
  }

  max(stat, v) {
    this.stats[stat] = Math.max(this.stats[stat], v);
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.toJSON())); } catch { /* storage unavailable */ }
  }

  toJSON() {
    return { stats: { ...this.stats }, unlocked: [...this.unlocked] };
  }

  isUnlocked(m) {
    return !m.goal || this.unlocked.has(m.id);
  }

  /** { value, need, done } towards a monster's goal. */
  progressOf(m) {
    if (!m.goal) return { value: 1, need: 1, done: true };
    const value = Math.min(this.stats[m.goal.stat] || 0, m.goal.need);
    return { value, need: m.goal.need, done: this.unlocked.has(m.id) || value >= m.goal.need };
  }

  /** Unlocks every monster whose goal is now met; returns the newly unlocked ones. */
  check(monsters) {
    const fresh = [];
    for (const m of monsters) {
      if (!m.goal || this.unlocked.has(m.id)) continue;
      if ((this.stats[m.goal.stat] || 0) >= m.goal.need) {
        this.unlocked.add(m.id);
        fresh.push(m);
      }
    }
    return fresh;
  }
}
