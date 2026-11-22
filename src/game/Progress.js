// Lifetime stats, monster unlocks and crystal-shop purchases for this player. Kept in browser storage, and mirrored into the
// player's leaderboard row (when they can write to it) so it follows them to other devices.
const KEY = 'dragon.progress';
export const STATS = ['runs', 'crystals', 'gunships', 'smashes', 'rages', 'closeCalls', 'bestScore', 'dailies', 'lastDaily'];

export class Progress {
  constructor() {
    this.stats = Object.fromEntries(STATS.map((s) => [s, 0]));
    this.unlocked = new Set(['kaiju']);
    // the shop: crystals spent so far and what they bought. Spendable crystals = lifetime crystals - spent.
    this.spent = 0;
    this.owned = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) this.merge(saved);
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  /** Takes the larger of each stat and of the crystals spent, and the union of unlocks and purchases. */
  merge(data) {
    for (const s of STATS) this.stats[s] = Math.max(this.stats[s], Number(data?.stats?.[s]) || 0);
    // stats this version doesn't know (from a newer one) are kept too, so they survive a round trip
    for (const [s, v] of Object.entries(data?.stats || {})) if (!STATS.includes(s) && Number.isFinite(Number(v))) this.stats[s] = Math.max(this.stats[s] || 0, Number(v));
    for (const id of data?.unlocked || []) if (typeof id === 'string') this.unlocked.add(id);
    this.spent = Math.max(this.spent, Number(data?.spent) || 0);
    for (const id of data?.owned || []) if (typeof id === 'string') this.owned.add(id);
  }

  /** Crystals available to spend in the shop. */
  get balance() {
    return Math.max(0, this.stats.crystals - this.spent);
  }

  /** Free items (no price) are everyone's; priced ones once bought. */
  owns(item) {
    return !item.price || this.owned.has(item.id);
  }

  /** Buys a priced item for its price in crystals; false if it can't be afforded or is already owned. */
  buy(item) {
    if (this.owns(item) || this.balance < item.price) return false;
    this.spent += item.price;
    this.owned.add(item.id);
    return true;
  }

  add(stat, n = 1) {
    this.stats[stat] += n;
  }

  max(stat, v) {
    this.stats[stat] = Math.max(this.stats[stat], v);
  }

  /** Saves, first merging what is already stored (another tab may have counted more since). */
  save() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) this.merge(saved);
      localStorage.setItem(KEY, JSON.stringify(this.toJSON()));
    } catch { /* storage unavailable or corrupt */ }
  }

  toJSON() {
    return { stats: { ...this.stats }, unlocked: [...this.unlocked], spent: this.spent, owned: [...this.owned] };
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
