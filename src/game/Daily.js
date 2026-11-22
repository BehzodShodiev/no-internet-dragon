// The Daily Challenge: one seeded run a day for the whole company. The day number (UTC) picks the level,
// a featured monster (often a locked one, playable for that day only) and a modifier; everyone gets the
// same seed, with unlimited attempts, and the best counts on the Daily board (field 'daily', stored as
// day * 1e6 + score so today's scores sort first; see Leaderboard.js). Modifiers only adjust the level's
// existing knobs (pace, breath, Rage, time of day, tightness), so the autopilot can check each day.
import { LEVELS } from './Stages.js';
import { MONSTERS } from '../entities/Monsters.js';

export const dayId = (t = Date.now()) => Math.floor(t / 864e5);

export const MODS = [
  { id: 'turbo', name: 'Turbo', desc: 'Everything runs 15% faster', apply: (lv) => ({ pace: lv.pace * 1.15 }) },
  { id: 'glass', name: 'Glass Cannon', desc: 'The breath charges twice as fast, but there is no Kaiju Rage', apply: (lv) => ({ breath: lv.breath * 2, rageCrystals: 1e9 }) },
  { id: 'night', name: 'Night Run', desc: 'The whole run after dark', apply: () => ({ time: 0.7 }) },
  { id: 'tight', name: 'Tight Squeeze', desc: 'Tighter gaps and tougher bosses', apply: (lv) => ({ tight: lv.tight + 1 }) },
  { id: 'fever', name: 'Crystal Fever', desc: 'Kaiju Rage fills twice as fast', apply: (lv) => ({ rageCrystals: Math.round(lv.rageCrystals / 2) }) },
];

/** The challenge for a day: { day, base, level, monster, mod, seed }. level is a copy of the base level with the modifier applied. */
export function dailyFor(day) {
  const base = LEVELS[day % LEVELS.length];
  const monster = MONSTERS[(day + 2) % MONSTERS.length]; // every monster in turn (the level turns every 3 days, the modifier every 5)
  const mod = MODS[(day * 3 + 2) % MODS.length];
  const level = { ...base, ...mod.apply(base), field: 'daily', short: 'Daily', daily: true };
  return { day, base, level, monster, mod, seed: Math.imul(day, 2654435761) >>> 0 };
}
