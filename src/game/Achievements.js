// Trophies: lifetime goals and one-run feats. Earned ones are kept in progress.unlocked as 'a:<id>'
// strings, which older versions of the game keep and write back (they keep any unknown string id), so
// nothing is lost between versions or devices. Every monster's unlock goal is a trophy too.
// kind 'life' tests lifetime stats (progress.stats); kind 'run' tests the record of the run that just ended.
// No trophy may depend on leaderboard rank: scores are reported by the player's own browser.
import { MONSTERS } from '../entities/Monsters.js';

const life = (id, name, desc, stat, need) => ({ id, name, desc, kind: 'life', stat, need, test: (s) => (s[stat] || 0) >= need });
const run = (id, name, desc, test) => ({ id, name, desc, kind: 'run', test: (s, r) => !!r && test(r) });

export const ACHIEVEMENTS = [
  // the monsters' unlock goals
  ...MONSTERS.filter((m) => m.goal).map((m) => ({ ...life(`m-${m.id}`, m.name, m.goal.text, m.goal.stat, m.goal.need), reward: m.id })),
  // lifetime
  life('smash200', 'Wrecking Crew', 'Smash 200 things in total', 'smashes', 200),
  life('smash1000', 'Demolition Expert', 'Smash 1,000 things in total', 'smashes', 1000),
  life('crystal2000', 'Crystal Hoard', 'Collect 2,000 crystals in total', 'crystals', 2000),
  life('close100', 'Nerves of Steel', 'Make 100 close calls in total', 'closeCalls', 100),
  life('rage10', 'Short Fuse', 'Unleash Kaiju Rage 10 times', 'rages', 10),
  life('boss20', 'Boss Hunter', 'Down 20 bosses in total', 'gunships', 20),
  life('runs25', 'Regular', 'Play 25 runs', 'runs', 25),
  life('runs100', 'Veteran', 'Play 100 runs', 'runs', 100),
  // one-run feats
  run('return', 'Return to Sender', 'Smash a tank shell back into its tank', (r) => r.returns > 0),
  run('reflectKill', 'Own Goal', 'Down a boss with one of its own missiles', (r) => r.reflectKill),
  run('parry', 'Immovable', 'Parry the Dreadnought’s ram', (r) => r.parries > 0),
  run('dreadnought', 'Scrap Metal', 'Down the Dreadnought', (r) => r.dreadnoughts > 0),
  run('x5', 'Combo Master', 'Reach a ×5 combo', (r) => r.bestMult >= 5),
  run('close10', 'Daredevil', 'Make 10 close calls in one run', (r) => r.closeCalls >= 10),
  run('perfect5', 'Precision', 'Land 5 PERFECT smashes in one run', (r) => r.perfects >= 5),
  run('nobreath', 'Bare Hands', 'Clear the first loop without using the breath', (r) => r.loopNoBreath),
  run('loop3', 'Marathon', 'Reach loop 3 on any level', (r) => r.loops >= 2),
  run('desert10k', 'Desert King', 'Score 10,000 in one Desert run', (r) => r.level === 1 && r.score >= 10000),
  run('city15k', 'City Smasher', 'Score 15,000 in one Night City run', (r) => r.level === 2 && r.score >= 15000),
  run('volcano15k', 'Fire Walker', 'Score 15,000 in one Volcano run', (r) => r.level === 3 && r.score >= 15000),
  // Bootcamp (granted when it is finished, not by a run record)
  { id: 'bootcamp', name: 'Graduate', desc: 'Finish Kaiju Bootcamp', kind: 'event', test: () => false },
];

const key = (a) => `a:${a.id}`;

export function hasTrophy(progress, id) {
  return progress.unlocked.has(`a:${id}`);
}

/** Grants a trophy by id (for events such as Bootcamp); returns it if it is new. */
export function grant(progress, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || progress.unlocked.has(key(a))) return null;
  progress.unlocked.add(key(a));
  return a;
}

/** Earns every trophy whose test now passes; returns the new ones. runRec: the run that just ended (or null). */
export function checkTrophies(progress, runRec = null) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (progress.unlocked.has(key(a))) continue;
    if (a.test(progress.stats, runRec)) {
      progress.unlocked.add(key(a));
      fresh.push(a);
    }
  }
  return fresh;
}

/** { value, need } toward a lifetime trophy (null for feats). */
export function trophyProgress(progress, a) {
  if (a.kind !== 'life') return null;
  return { value: Math.min(progress.stats[a.stat] || 0, a.need), need: a.need };
}

/** The unearned lifetime trophy closest to done (by fraction), for the game-over screen. */
export function closestTrophy(progress) {
  let best = null, bestK = -1;
  for (const a of ACHIEVEMENTS) {
    if (a.kind !== 'life' || a.reward || progress.unlocked.has(key(a))) continue;
    const k = (progress.stats[a.stat] || 0) / a.need;
    if (k > bestK) { bestK = k; best = a; }
  }
  return best;
}
