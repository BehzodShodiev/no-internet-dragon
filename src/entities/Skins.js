// Kaiju skins (and the Rex's looks, REX_SKINS, below). Skins with a price are sold for crystals in the
// shop (Progress.buy); the rest are free. Ids are stored in browsers ('dragon.skin'), so they
// never change even when a display name does. Each recolours the hide, back crystals, glow, eyes and
// prism beam, and has its own build: hitX scales the hitbox (and the body) along x only, never in
// height. A slimmer build is easier to thread between obstacles, so score scales with it too.
//   skin / plate: tint multipliers on the hide's and the crystals' base colours (above 1 brightens)
//   glow: crystal glow; beam: [inner, core] breath colours (HDR); spark: breath spark colour
//   crack: glow between the scales (0 = none); metal / rough: hide material
export const SKINS = [
  {
    id: 'classic', name: 'Classic', note: 'Charcoal hide, mint crystals, mint beam',
    skin: [1, 1, 1], plate: [1, 1, 1], glow: 0x2dffb0, eye: 0xff7a00, crack: 0x000000, metal: 0, rough: 1,
    beam: [[0.12, 1.55, 0.95], [1.5, 3.3, 2.6]], spark: [0.5, 3.0, 1.8], hitX: 1,
  },
  {
    id: 'showa', name: 'Retro', note: 'Grey-green, white crystals',
    skin: [1.3, 1.45, 1.25], plate: [1.15, 1.15, 1.1], glow: 0xcfeaff, eye: 0xffe08a, crack: 0x000000, metal: 0, rough: 1,
    beam: [[0.45, 0.75, 1.5], [2.4, 2.7, 3.2]], spark: [1.6, 1.9, 2.6], hitX: 0.95,
  },
  {
    id: 'millennium', name: 'Jungle', note: 'Green hide, magenta crystals, orange beam',
    skin: [0.85, 1.25, 0.9], plate: [1.25, 0.65, 1.3], glow: 0xff3ad6, eye: 0xffcc33, crack: 0x000000, metal: 0, rough: 1,
    beam: [[1.6, 0.35, 0.08], [3.2, 1.7, 0.6]], spark: [3.0, 1.1, 0.3], hitX: 1,
  },
  {
    id: 'evolved', name: 'Neon', note: 'Hot-pink crystals, pink beam',
    skin: [0.95, 0.85, 1.05], plate: [1.35, 0.7, 1.15], glow: 0xff2fa8, eye: 0xff6ad8, crack: 0x000000, metal: 0, rough: 1,
    beam: [[1.5, 0.15, 1.1], [3.3, 1.4, 2.8]], spark: [3.0, 0.6, 2.4], hitX: 1.08,
  },
  {
    id: 'burning', name: 'Magma', note: 'Molten cracks, red beam',
    skin: [0.6, 0.45, 0.42], plate: [1.25, 0.8, 0.6], glow: 0xff4a0e, eye: 0xffd040, crack: 0xff4a10, crackGain: 2.2, metal: 0, rough: 0.9,
    beam: [[1.8, 0.3, 0.04], [3.4, 1.8, 0.5]], spark: [3.2, 1.0, 0.2], hitX: 1.1,
  },
  {
    id: 'shin', name: 'Rust', note: 'Red-brown hide, purple beam',
    skin: [1.45, 0.72, 0.6], plate: [0.95, 0.6, 0.65], glow: 0x9a48ff, eye: 0xf2f0ff, crack: 0x5a18c0, metal: 0, rough: 0.95,
    beam: [[0.75, 0.15, 1.8], [2.4, 1.3, 3.4]], spark: [1.8, 0.8, 3.2], hitX: 0.88,
  },
  {
    id: 'mecha', name: 'Steel', note: 'Silver armour, cyan core',
    // flat: replaces the hide's painted colours with one metal colour (the scale texture stays as panelling)
    skin: [1, 1, 1], flat: 0xaab3bd, plate: [1.7, 1.8, 2.0], glow: 0x3ae6ff, eye: 0xff2020, crack: 0x000000, metal: 0.7, rough: 0.34,
    beam: [[0.1, 1.2, 1.8], [1.6, 3.0, 3.4]], spark: [0.6, 2.4, 3.2], hitX: 1.12,
  },
  // newer looks: spot (glowing scales), sheen (a coloured rim at grazing angles), irid (oil-slick rainbow)
  {
    id: 'frost', name: 'Frost', note: 'Ice-blue hide, frozen crystals, freezing beam',
    skin: [2.0, 2.35, 2.8], plate: [1.7, 2.0, 2.3], glow: 0xaef2ff, eye: 0x6fe9ff, crack: 0x2a8cff, crackGain: 0.45, metal: 0.1, rough: 0.55,
    sheen: 0x9fdcff, beam: [[0.55, 1.5, 2.2], [2.6, 3.2, 3.4]], spark: [1.8, 2.8, 3.4], hitX: 1,
  },
  {
    id: 'toxic', name: 'Toxic', note: 'Olive hide, acid blisters, acid-green beam',
    skin: [0.72, 1.0, 0.5], plate: [0.85, 1.6, 0.45], glow: 0x7dff2e, eye: 0xff3030, crack: 0x3cff10, crackGain: 0.1, metal: 0, rough: 0.9, spot: 0x58ff20,
    beam: [[0.45, 2.0, 0.12], [2.0, 3.4, 0.9]], spark: [1.2, 3.0, 0.4], hitX: 1.04,
  },
  {
    id: 'abyss', name: 'Abyss', note: 'Deep-sea hide with glowing spots, sea-blue beam',
    skin: [0.42, 0.8, 1.0], plate: [0.6, 1.25, 1.35], glow: 0x22b8ff, eye: 0xfff07a, crack: 0x000000, metal: 0.05, rough: 0.7,
    spot: 0x1affe0, beam: [[0.05, 0.8, 1.7], [1.2, 2.7, 3.4]], spark: [0.3, 1.8, 3.2], hitX: 0.94,
  },
  {
    id: 'golden', name: 'Golden', note: 'Gold armour, golden beam',
    skin: [1, 1, 1], flat: 0xc9973a, plate: [2.0, 1.6, 0.7], glow: 0xffcf4a, eye: 0xff2a2a, crack: 0x000000, metal: 0.85, rough: 0.28,
    beam: [[2.0, 1.25, 0.12], [3.4, 3.0, 1.5]], spark: [3.2, 2.4, 0.6], hitX: 1.1,
  },
  {
    id: 'obsidian', name: 'Obsidian', note: 'Glassy black with an oil-slick sheen, violet beam',
    skin: [1, 1, 1], flat: 0x17141c, plate: [1.8, 1.75, 1.95], glow: 0xd9c2ff, eye: 0xffffff, crack: 0x000000, metal: 0.3, rough: 0.2,
    irid: 0.6, beam: [[1.2, 0.35, 2.3], [3.2, 2.6, 3.4]], spark: [2.2, 1.0, 3.2], hitX: 0.98,
  },
  // Crystal shop (price: crystals). Cosmetic only: hitX 1, so they play and score exactly like Classic.
  {
    id: 'midnight', name: 'Midnight', note: 'Navy hide, white-hot crystals, ice-white beam', price: 300,
    skin: [0.55, 0.7, 1.35], plate: [1.6, 1.7, 1.9], glow: 0xe8f4ff, eye: 0x7fe3ff, crack: 0x000000, metal: 0.05, rough: 0.8,
    beam: [[0.9, 1.2, 1.9], [3.0, 3.2, 3.4]], spark: [2.4, 2.8, 3.4], hitX: 1,
  },
  {
    id: 'dune', name: 'Dune', note: 'Sand-camo hide, rust crystals, amber beam', price: 400,
    skin: [1.75, 1.45, 1.0], plate: [1.4, 0.95, 0.6], glow: 0xffb347, eye: 0xff5a1a, crack: 0x000000, metal: 0, rough: 0.95,
    beam: [[1.9, 0.9, 0.15], [3.4, 2.6, 1.0]], spark: [3.2, 1.9, 0.4], hitX: 1,
  },
  {
    id: 'sakura', name: 'Sakura', note: 'Blossom-pink hide, white crystals, pink beam', price: 600,
    skin: [2.1, 1.3, 1.55], plate: [1.8, 1.6, 1.7], glow: 0xffc4e6, eye: 0xff4f9a, crack: 0x000000, metal: 0, rough: 0.85,
    sheen: 0xffb0d8, beam: [[1.9, 0.6, 1.3], [3.4, 2.4, 3.0]], spark: [3.2, 1.6, 2.6], hitX: 1,
  },
  {
    id: 'venom', name: 'Venom', note: 'Black hide, glowing green veins', price: 800,
    skin: [0.45, 0.5, 0.45], plate: [0.9, 1.5, 0.8], glow: 0x5dff4a, eye: 0xd4ff3a, crack: 0x3dff2a, crackGain: 1.6, metal: 0, rough: 0.85,
    beam: [[0.5, 1.9, 0.25], [2.2, 3.4, 1.2]], spark: [1.4, 3.2, 0.6], hitX: 1,
  },
  {
    id: 'galaxy', name: 'Galaxy', note: 'Night-sky hide with glowing stars, violet breath', price: 1200,
    skin: [0.5, 0.45, 0.85], plate: [1.3, 1.1, 1.9], glow: 0xb48cff, eye: 0xffffff, crack: 0x000000, metal: 0.1, rough: 0.6,
    spot: 0xc8b0ff, irid: 0.35, beam: [[1.1, 0.5, 2.2], [3.0, 2.6, 3.4]], spark: [2.4, 1.6, 3.4], hitX: 1,
  },
  {
    id: 'ivory', name: 'Ivory', note: 'White armour, gold crystals, golden beam', price: 1600,
    skin: [1, 1, 1], flat: 0xe4ddcc, plate: [2.1, 1.7, 0.8], glow: 0xffd56a, eye: 0x3ad0ff, crack: 0x000000, metal: 0.35, rough: 0.35,
    beam: [[2.0, 1.4, 0.3], [3.4, 3.1, 1.8]], spark: [3.2, 2.6, 0.9], hitX: 1,
  },
];

// The Rex's looks. model: 'smooth' (the sculpted model) or 'pixel' (the same model built from cubes); both use
// the same skeleton, so they play identically. swatch: the hide colour on the skin button.
export const REX_SKINS = [
  // Pixel first: the default look
  {
    id: 'rex-pixel', name: 'Pixel', note: 'Built from cubes, cube teeth', model: 'pixel', swatch: 0x6f8f34,
    skin: [1.1, 1.18, 1.0], plate: [1, 1, 1], glow: 0x7dff5a, eye: 0xffe040, crack: 0x000000, metal: 0, rough: 0.8,
    beam: [[0.35, 1.6, 0.3], [1.6, 3.3, 1.3]], spark: [1.0, 3.0, 0.6], hitX: 1,
  },
  {
    id: 'rex', name: 'Classic', note: 'Olive hide, tiger stripes, sculpted fangs', model: 'smooth', swatch: 0x55652c,
    skin: [1, 1, 1], plate: [1, 1, 1], glow: 0xffa030, eye: 0xffc02a, crack: 0x000000, metal: 0, rough: 0.95,
    beam: [[1.7, 0.55, 0.08], [3.3, 2.1, 0.7]], spark: [3.0, 1.4, 0.3], hitX: 1,
  },
  // crystal shop
  {
    id: 'rex-lava', name: 'Pixel Lava', note: 'Cubes of molten rock', model: 'pixel', swatch: 0xb8401a, price: 300,
    skin: [2.2, 0.75, 0.4], plate: [1, 1, 1], glow: 0xff7a2a, eye: 0xffe040, crack: 0x000000, metal: 0, rough: 0.7,
    beam: [[1.9, 0.5, 0.08], [3.4, 2.0, 0.6]], spark: [3.2, 1.2, 0.3], hitX: 1,
  },
  {
    id: 'rex-ice', name: 'Pixel Ice', note: 'Cubes of glacier ice', model: 'pixel', swatch: 0x8ccfe8, price: 500,
    skin: [1.7, 2.4, 3.0], plate: [1, 1, 1], glow: 0xbff0ff, eye: 0x3a7dff, crack: 0x000000, metal: 0.05, rough: 0.35,
    beam: [[0.6, 1.5, 2.2], [2.6, 3.2, 3.4]], spark: [1.8, 2.8, 3.4], hitX: 1,
  },
  {
    id: 'rex-gold', name: 'Golden Rex', note: 'Sculpted, cast in gold', model: 'smooth', swatch: 0xc9973a, price: 1500,
    skin: [1, 1, 1], flat: 0xc9973a, plate: [1, 1, 1], glow: 0xffcf4a, eye: 0xff2a2a, crack: 0x000000, metal: 0.85, rough: 0.28,
    beam: [[2.0, 1.25, 0.12], [3.4, 3.0, 1.5]], spark: [3.2, 2.4, 0.6], hitX: 1,
  },
];
