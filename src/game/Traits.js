// Signature abilities (program part G, GP-05): one move per monster, on the buttons players already use.
// Every trait is optional and leaves the hitbox heights alone. The autopilot never uses the active ones
// (it jumps only when grounded and breathes only at a full meter), so the bot matrix stays a fair check.
// Game reads these by Monsters.js `trait` id; the tips are shown once each.
export const TRAITS = {
  // the Kaiju: duck + breath with the meter at least half full (but not full) shatters everything close by
  burst: {
    name: 'CRYSTAL BURST',
    key: 'Hold ↓ and press F with the meter half full: everything close by shatters, rocks and shells too. Costs half a charge.',
    touch: 'Hold the duck button and tap the flame with the meter half full: everything close by shatters. Costs half a charge.',
  },
  // the Hydra: a second jump in mid-air; his triple fire takes 2 hit points off a gunship
  flap: {
    name: 'WING FLAP',
    key: 'Press jump again in mid-air for a wing flap: high enough for fuel tanks and pillars. Mind the high flyers.',
    touch: 'Tap again in mid-air for a wing flap: high enough for fuel tanks and pillars. Mind the high flyers.',
  },
  // the Moth Queen: her wing-dust beam lasts longer and sweeps up every crystal it touches
  scale: {
    name: 'SCALE STORM',
    key: 'Her wing-dust beam sweeps up every crystal it touches, and lasts longer.',
    touch: 'Her wing-dust beam sweeps up every crystal it touches, and lasts longer.',
  },
  // Storm Wing: hold duck in mid-air to dive; the sonic boom on landing shatters what is just ahead
  dive: {
    name: 'SONIC DIVE',
    key: 'In mid-air, hold ↓ to dive: the sonic boom on landing shatters what is just ahead.',
    touch: 'In mid-air, hold the duck button to dive: the sonic boom on landing shatters what is just ahead.',
  },
};

/** Breath duration in seconds for a trait (others use the default). */
export const BREATH_TIME = { scale: 1.6 };
/** Gravity multiplier while diving (Storm Wing), instead of the fast fall's. */
export const DIVE_FALL = 4.2;
/** A landing this soon after diving makes the sonic boom. */
export const DIVE_WINDOW = 0.4;
