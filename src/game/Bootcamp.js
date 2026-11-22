// Kaiju Bootcamp: a player's very first run opens with a guided stretch on the Desert. A script of
// obstacles comes one at a time (Obstacles.script); as each prompted one gets close, time slows and a
// big prompt says what to press, until the player does it (or a few seconds pass). Mistakes don't end
// the run: whatever was hit breaks with an "Again!" and the step comes back. When the script is done the
// real level starts from zero: Bootcamp never posts a score and never counts toward unlocks.
import { PTERO_HEIGHTS } from '../entities/Obstacles.js';

// prompt: the action that clears it (the game watches for it), or 'under' (nothing to press)
export const SCRIPT = [
  { type: 'cactusS', n: 1, prompt: 'jump' },
  { type: 'cactusS', n: 2, prompt: 'jump' },
  { type: 'ptero', y: PTERO_HEIGHTS[1], prompt: 'duck' },
  { type: 'ptero', y: PTERO_HEIGHTS[2], prompt: 'under' },
  { type: 'tower', prompt: 'smash' },
  { type: 'cactusL', n: 1, prompt: 'crystals' },
  { type: 'cactusL', n: 3, prompt: 'breath', charge: true },
];

export const PROMPTS = {
  jump: { key: 'Press SPACE to JUMP', touch: 'TAP to JUMP', sub: 'Hold it for a higher jump' },
  duck: { key: 'Hold ↓ to DUCK', touch: 'Hold the ▼ button to DUCK', sub: 'Flyers at head height pass over you' },
  under: { key: 'High flyer: just run under it', touch: 'High flyer: just run under it', sub: 'No need to do anything' },
  smash: { key: 'Too tall to jump: press → to SMASH', touch: 'Too tall to jump: tap the claw to SMASH', sub: 'Smashing breaks most things for points' },
  crystals: { key: 'Jump through the crystals', touch: 'Jump through the crystals', sub: 'Crystals build your combo and buy skins' },
  breath: { key: 'Breath full: press F to BURN them', touch: 'Breath full: tap the flame to BURN them', sub: 'The meter fills as you run' },
};

export const COACH_SLOW = 0.3; // time scale while a prompt waits for its action
export const COACH_WAIT = 3; // real seconds a prompt waits before time runs on anyway
// Which presses answer each prompt ('under' and 'crystals' need none: they never slow time)
export const ANSWERS = { jump: ['jump'], crystals: [], duck: ['duck'], under: [], smash: ['smash'], breath: ['breath'] };

/**
 * Whether this run should open with Bootcamp: the first run in this browser (or 'again', from the settings
 * panel), on the Desert, and never a test run.
 */
export function wantsBootcamp(game, store) {
  if (game.sim || game.debug || game.seedFixed || game.daily || game.level.id !== 1) return false;
  const flag = store.get('dragon.tutorial', '');
  return flag === 'again' || (flag !== 'done' && (game.progress.stats.runs || 0) === 0);
}
