// Dragon skins, after the looks of different film eras. Each recolours the hide, plates, glow, eyes and
// atomic breath, and has its own build: hitX scales the hitbox (and the body) along x only, never in
// height. A slimmer build is easier to thread between obstacles, so score scales with it too.
//   skin / plate: tint multipliers on the base colours (above 1 brightens)
//   glow: plate glow; beam: [inner, core] breath colours (HDR); spark: breath spark colour
//   crack: glow between the scales (0 = none); metal / rough: hide material
export const SKINS = [
  {
    id: 'classic', name: 'Classic', note: 'Charcoal hide, atomic blue',
    skin: [1, 1, 1], plate: [1, 1, 1], glow: 0x3cc8ff, eye: 0xff7a00, crack: 0x000000, metal: 0, rough: 1,
    beam: [[0.1, 0.45, 1.6], [1.4, 2.2, 3.2]], spark: [0.5, 1.2, 3.0], hitX: 1,
  },
  {
    id: 'showa', name: 'Showa', note: 'Grey-green, white plates',
    skin: [1.3, 1.45, 1.25], plate: [1.15, 1.15, 1.1], glow: 0xcfeaff, eye: 0xffe08a, crack: 0x000000, metal: 0, rough: 1,
    beam: [[0.45, 0.75, 1.5], [2.4, 2.7, 3.2]], spark: [1.6, 1.9, 2.6], hitX: 0.95,
  },
  {
    id: 'millennium', name: 'Millennium', note: 'Green hide, magenta plates, orange breath',
    skin: [0.85, 1.25, 0.9], plate: [1.25, 0.65, 1.3], glow: 0xff3ad6, eye: 0xffcc33, crack: 0x000000, metal: 0, rough: 1,
    beam: [[1.6, 0.35, 0.08], [3.2, 1.7, 0.6]], spark: [3.0, 1.1, 0.3], hitX: 1,
  },
  {
    id: 'evolved', name: 'Evolved', note: 'Hot-pink plates, pink breath',
    skin: [0.95, 0.85, 1.05], plate: [1.35, 0.7, 1.15], glow: 0xff2fa8, eye: 0xff6ad8, crack: 0x000000, metal: 0, rough: 1,
    beam: [[1.5, 0.15, 1.1], [3.3, 1.4, 2.8]], spark: [3.0, 0.6, 2.4], hitX: 1.08,
  },
  {
    id: 'burning', name: 'Burning', note: 'Molten cracks, red breath',
    skin: [0.6, 0.45, 0.42], plate: [1.25, 0.8, 0.6], glow: 0xff4a0e, eye: 0xffd040, crack: 0xff4a10, crackGain: 2.2, metal: 0, rough: 0.9,
    beam: [[1.8, 0.3, 0.04], [3.4, 1.8, 0.5]], spark: [3.2, 1.0, 0.2], hitX: 1.1,
  },
  {
    id: 'shin', name: 'Shin', note: 'Red-brown hide, purple breath',
    skin: [1.45, 0.72, 0.6], plate: [0.95, 0.6, 0.65], glow: 0x9a48ff, eye: 0xf2f0ff, crack: 0x5a18c0, metal: 0, rough: 0.95,
    beam: [[0.75, 0.15, 1.8], [2.4, 1.3, 3.4]], spark: [1.8, 0.8, 3.2], hitX: 0.88,
  },
  {
    id: 'mecha', name: 'Mecha', note: 'Silver armour, cyan core',
    // flat: replaces the hide's painted colours with one metal colour (the scale texture stays as panelling)
    skin: [1, 1, 1], flat: 0xaab3bd, plate: [1.7, 1.8, 2.0], glow: 0x3ae6ff, eye: 0xff2020, crack: 0x000000, metal: 0.7, rough: 0.34,
    beam: [[0.1, 1.2, 1.8], [1.6, 3.0, 3.4]], spark: [0.6, 2.4, 3.2], hitX: 1.12,
  },
];
