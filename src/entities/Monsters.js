// The monster roster. Everyone starts with the Kaiju (the crystal-backed lizard, with its colour skins); the others
// are locked until their goal is met (lifetime stats, see game/Progress.js). Ids are stored in players'
// progress and leaderboard rows, so they never change; names are what players see. skins: a list of looks
// to choose from (Skins.js); monsters without one use `look`. The Kaiju and the Rex are unlocked from the
// start; new players begin with the Rex (Game: 'dragon.monster' defaults to 'rex').
// attack: 'teeth' replaces the breath beam's look with teeth erupting from the ground (same hits).
// trait: the monster's signature ability (game/Traits.js), on the existing buttons.
// attackName: the breath's name on the charge meter and in tips. beam: 'prism' draws the breath as the
// Kaiju's faceted crystal beam (Particles.js), otherwise a flowing one.
// look: the same fields as a skin in Skins.js (colours, breath, build). hitX: hitbox width along x, which
// also scales score, as for skins; score (optional) overrides that factor for monsters with a gameplay
// edge. model: 'dragon' (default, Dragon.js with `variant`), 'moth' (Moth.js) or 'stormwing' (StormWing.js). glide: holding jump on
// the way down slows the fall. voice: pitch of the roar. sound: { roar: 'growl' | 'triple' | 'trill',
// breath: 'atomic' | 'gravity' | 'dust' } (Audio.js). Planned additions and their goals are in
// docs/ROADMAP.md.
import { SKINS, REX_SKINS } from './Skins.js';

export const MONSTERS = [
  {
    id: 'kaiju', name: 'Kaiju', variant: 'kaiju', skins: SKINS, sound: { roar: 'growl', breath: 'atomic' },
    attackName: 'PRISM BEAM', beam: 'prism', trait: 'burst',
    note: 'A giant lizard with crystals growing from its back. Its prism beam throws off crystal shards. CRYSTAL BURST: duck + breath at half a charge shatters everything close by. Twelve free skins, six more in the shop.',
  },
  {
    id: 'ghidorah', name: 'Jade Hydra', variant: 'ghidorah', sound: { roar: 'triple', breath: 'gravity' },
    attackName: 'TRIPLE FIRE', trait: 'flap',
    note: 'Three horned heads, jade wings, green fire from every mouth (it hits a gunship twice as hard). WING FLAP: jump again in mid-air.',
    goal: { stat: 'gunships', need: 5, text: 'Down 5 gunships in total' },
    look: {
      id: 'ghidorah', name: 'Jade Hydra', note: 'Jade',
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0x6dff8a, eye: 0xffc21a, crack: 0x000000, metal: 0.12, rough: 0.5,
      // wide (hitbox 115%), but the flap makes up for it: score ×1.0 since v33 (×1.15 before)
      sheen: 0x2f9c74, beam: [[0.3, 1.75, 0.35], [1.9, 3.4, 1.5]], spark: [1.0, 3.0, 0.6], hitX: 1.15, score: 1,
    },
  },
  {
    id: 'mothra', name: 'Moth Queen', model: 'moth', glide: true, voice: 2.3, sound: { roar: 'trill', breath: 'dust' },
    attackName: 'WING DUST', trait: 'scale',
    note: 'Giant moon moth with long-tailed jade wings: hold jump on the way down to glide, let go to drop. SCALE STORM: her silver dust beam lasts longer and sweeps up crystals. Gliding is an edge: score ×0.9.',
    goal: { stat: 'crystals', need: 500, text: 'Collect 500 crystals in total' },
    look: {
      id: 'mothra', name: 'Moth Queen', note: 'Moonlit wings',
      // skin: body fur tint; plate: wing tint; glow: tint of the wing patterns' glow (the patterns carry their own colours)
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0xece4ff, eye: 0xb07aff, crack: 0x000000, metal: 0, rough: 0.95,
      beam: [[1.05, 0.85, 1.75], [3.0, 2.9, 3.4]], spark: [2.5, 2.3, 3.2], hitX: 1, score: 0.9,
    },
  },
  {
    id: 'stormwing', name: 'Storm Wing', model: 'stormwing', voice: 1.5, sound: { roar: 'trill', breath: 'gravity' },
    attackName: 'THUNDER BEAM', trait: 'dive',
    note: 'A giant storm pterosaur whose wing veins glow like lightning. SONIC DIVE: hold duck in mid-air to plunge; the boom on landing shatters what is just ahead.',
    goal: { stat: 'gunships', need: 1, text: 'Down your first gunship' },
    look: {
      id: 'stormwing', name: 'Storm Wing', note: 'Storm blue',
      // skin: hide tint; plate: wing tint; glow: the wing veins
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0x7fe8ff, eye: 0xffd23a, crack: 0x000000, metal: 0, rough: 0.8,
      beam: [[0.35, 1.1, 2.2], [2.2, 3.0, 3.4]], spark: [1.6, 2.6, 3.4], hitX: 1,
    },
  },
  {
    id: 'rex', name: 'Rex', variant: 'rex', skins: REX_SKINS, voice: 1.2, sound: { roar: 'growl', breath: 'quake' },
    note: 'A tyrant lizard: huge head, tiny arms, no plates. Two looks: built from cubes, or sculpted. Its attack is a quake of giant teeth.',
    attack: 'teeth', attackName: 'TOOTH QUAKE',
  },
];
