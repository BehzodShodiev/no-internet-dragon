// The monster roster. Everyone starts with the Kaiju (the Godzilla-style dragon, with its colour skins);
// the others are locked until their goal is met (lifetime stats, see game/Progress.js).
// look: the same fields as a skin in Skins.js (colours, breath, build). hitX: hitbox width along x, which
// also scales score, as for skins; score (optional) overrides that factor for monsters with a gameplay
// edge. model: 'dragon' (default, Dragon.js with `variant`) or 'moth' (Moth.js). glide: holding jump on
// the way down slows the fall. voice: pitch of the roar. Planned additions and their goals are in
// docs/ROADMAP.md.
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
  {
    id: 'mothra', name: 'Mothra', model: 'moth', glide: true, voice: 2.3,
    note: 'Giant moth: hold jump on the way down to glide, let go to drop. Wing-dust beam. Gliding is an edge: score ×0.9.',
    goal: { stat: 'crystals', need: 500, text: 'Collect 500 crystals in total' },
    look: {
      id: 'mothra', name: 'Mothra', note: 'Glowing wings',
      // skin: body fur tint; plate: wing tint; glow: tint of the wing patterns' glow (the patterns carry their own colours)
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0xfff2d8, eye: 0x3ab8ff, crack: 0x000000, metal: 0, rough: 0.95,
      beam: [[1.5, 0.95, 0.35], [3.0, 3.1, 2.6]], spark: [2.6, 2.2, 1.0], hitX: 1, score: 0.9,
    },
  },
];
