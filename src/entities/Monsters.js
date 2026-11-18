// The monster roster. Everyone starts with the Kaiju (the crystal-backed lizard, with its colour skins); the others
// are locked until their goal is met (lifetime stats, see game/Progress.js). Ids are stored in players'
// progress and leaderboard rows, so they never change; names are what players see. skins: a list of looks
// to choose from (Skins.js); monsters without one use `look`. The Kaiju and the Rex are unlocked from the
// start; new players begin with the Rex (Game: 'dragon.monster' defaults to 'rex').
// attack: 'teeth' replaces the breath beam's look with teeth erupting from the ground (same hits).
// attackName: the breath's name on the charge meter and in tips. beam: 'prism' draws the breath as the
// Kaiju's faceted crystal beam (Particles.js), otherwise a flowing one.
// look: the same fields as a skin in Skins.js (colours, breath, build). hitX: hitbox width along x, which
// also scales score, as for skins; score (optional) overrides that factor for monsters with a gameplay
// edge. model: 'dragon' (default, Dragon.js with `variant`) or 'moth' (Moth.js). glide: holding jump on
// the way down slows the fall. voice: pitch of the roar. sound: { roar: 'growl' | 'triple' | 'trill',
// breath: 'atomic' | 'gravity' | 'dust' } (Audio.js). Planned additions and their goals are in
// docs/ROADMAP.md.
import { SKINS, REX_SKINS } from './Skins.js';

export const MONSTERS = [
  {
    id: 'kaiju', name: 'Kaiju', variant: 'kaiju', skins: SKINS, sound: { roar: 'growl', breath: 'atomic' },
    attackName: 'PRISM BEAM', beam: 'prism',
    note: 'A giant lizard with crystals growing from its back. Its prism beam throws off crystal shards. Twelve free skins, six more in the shop.',
  },
  {
    id: 'ghidorah', name: 'Jade Hydra', variant: 'ghidorah', sound: { roar: 'triple', breath: 'gravity' },
    attackName: 'TRIPLE FIRE',
    note: 'Three horned heads, jade wings, green fire from every mouth. Wide build: score ×1.15.',
    goal: { stat: 'gunships', need: 5, text: 'Down 5 gunships in total' },
    look: {
      id: 'ghidorah', name: 'Jade Hydra', note: 'Jade',
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0x6dff8a, eye: 0xffc21a, crack: 0x000000, metal: 0.12, rough: 0.5,
      sheen: 0x2f9c74, beam: [[0.3, 1.75, 0.35], [1.9, 3.4, 1.5]], spark: [1.0, 3.0, 0.6], hitX: 1.15,
    },
  },
  {
    id: 'mothra', name: 'Moth Queen', model: 'moth', glide: true, voice: 2.3, sound: { roar: 'trill', breath: 'dust' },
    attackName: 'WING DUST',
    note: 'Giant moth: hold jump on the way down to glide, let go to drop. Wing-dust beam. Gliding is an edge: score ×0.9.',
    goal: { stat: 'crystals', need: 500, text: 'Collect 500 crystals in total' },
    look: {
      id: 'mothra', name: 'Moth Queen', note: 'Glowing wings',
      // skin: body fur tint; plate: wing tint; glow: tint of the wing patterns' glow (the patterns carry their own colours)
      skin: [1, 1, 1], plate: [1, 1, 1], glow: 0xfff2d8, eye: 0x3ab8ff, crack: 0x000000, metal: 0, rough: 0.95,
      beam: [[1.5, 0.95, 0.35], [3.0, 3.1, 2.6]], spark: [2.6, 2.2, 1.0], hitX: 1, score: 0.9,
    },
  },
  {
    id: 'rex', name: 'Rex', variant: 'rex', skins: REX_SKINS, voice: 1.2, sound: { roar: 'growl', breath: 'quake' },
    note: 'A tyrant lizard: huge head, tiny arms, no plates. Two looks: built from cubes, or sculpted. Its attack is a quake of giant teeth.',
    attack: 'teeth', attackName: 'TOOTH QUAKE',
  },
];
