// The monster roster. Everyone starts with the Kaiju (the Godzilla-style dragon, with its colour skins);
// the others are locked until their goal is met (lifetime stats, see game/Progress.js).
// look: the same fields as a skin in Skins.js (colours, breath, build). hitX: hitbox width along x, which
// also scales score, as for skins. Planned additions and their goals are in docs/ROADMAP.md.
export const MONSTERS = [
  {
    id: 'kaiju', name: 'Kaiju', variant: 'kaiju', skins: true,
    note: 'The original atomic lizard, with seven film-era skins.',
  },
  {
    id: 'ghidorah', name: 'King Ghidorah', variant: 'ghidorah',
    note: 'Three heads, two tails, golden wings and gravity beams. Wide build: score ×1.15.',
    goal: { stat: 'gunships', need: 5, text: 'Down 5 gunships in total' },
    look: {
      id: 'ghidorah', name: 'King Ghidorah', note: 'Golden',
      skin: [1, 1, 1], flat: 0xd8a83c, plate: [1, 1, 1], glow: 0xffc640, eye: 0xff3a14, crack: 0x000000, metal: 0.55, rough: 0.4,
      beam: [[1.7, 1.15, 0.1], [3.4, 3.1, 1.3]], spark: [3.2, 2.6, 0.6], hitX: 1.15,
    },
  },
];
