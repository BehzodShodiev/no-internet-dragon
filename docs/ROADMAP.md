# Monster roster roadmap

Started 2026-11-05. The owner asked for more playable monsters (Mothra, King Ghidorah, "and other ones"), all **locked** and earned through play, delivered in parts so the work can stop and resume between sessions. Each part ends built, tested with the autopilot bot, and published to the shared artifact.

## How unlocking works (all parts)

- Every player starts with the **Kaiju** (the Godzilla-style dragon, with its seven colour skins). Other monsters are locked.
- Lifetime stats are kept per player (`src/game/Progress.js`, browser storage, mirrored into the player's leaderboard row as `progress` (stats and unlocks) when they can write to it).
- Unlocks are checked at the end of every run; a new one gets a banner on the game-over screen.
- The **Monsters** panel (title and game-over screens, key `B`) lists each monster with its unlock goal and progress bar.
- The artifact's owner can preview locked monsters from that panel (labelled as a preview), so new monsters can be checked without grinding.
- Every monster keeps the same hitbox height; width along x (`hitX`) varies with its build, and score scales with it, as with skins.

## Parts

| Part | Content | Unlock goal | Status |
| --- | --- | --- | --- |
| 1 | Unlock system, lifetime stats, Monsters panel, **King Ghidorah** (three heads, two tails, wings, gold, gravity-beam breath) | Down 5 gunships in total | **Done** 2026-11-05, artifact v10 |
| 2 | **Mothra** (giant moth: new flying model, glides when jump is held, wing-dust beam) | Collect 500 crystals in total | **Done** 2026-11-05, artifact v11 |
| 3 | **Rodan** (fiery pteranodon kaiju, reuses the flyer model) | Down your first gunship | Not started |
| 4 | **Gigan** (cyborg: visor, hook arms, dorsal fin row) and **Destoroyah** (horned, winged demon), both variants of the dragon rig | Gigan: smash 200 things in total. Destoroyah: score 15,000 in one Night City run | Not started |
| 5 | **SpaceGodzilla** (crystal shoulders, crystal breath), balance pass across all monsters, README | Trigger Kaiju Rage 10 times | Not started |

## Notes from part 1

- `Dragon` takes a variant (`'kaiju'` | `'ghidorah'`); the head builder is `makeHead()` inside `_buildMeshes`, reusable for extra heads. Rigid add-ons (side heads, wings) are plain meshes parented to bones; skinned add-ons (the extra tail) go through `spineSkin`.
- Monsters other than the Kaiju are built the first time they're selected (`Game.selectMonster`), so they don't slow loading.
- Stats counted: `runs, crystals, gunships, smashes, rages, closeCalls, bestScore` (`Progress.js`). Part 4's Destoroyah goal needs a per-level best; `bestScore` is any level, so add a stat for it then.
- Owner preview relies on the `user` capability's `isOwner()`.

## Notes from part 2

- Mothra is `src/entities/Moth.js`, a standalone model (no skinning) with the dragon's interface plus `flyer: true`, `onWingbeat(k)` and `wingDust(target)`. It is built in world units under a `root` that cancels `DRAGON_SCALE`, so Game's group scaling (rage, build) works unchanged. The body is pitched nose-up; wings are fan meshes (`wingPoint(def, u, v)`) whose textures are painted in the same (u, v) space; wing flex and the glow wave are in the wing material's `onBeforeCompile`; legs are instanced femur/tibia pairs placed by 2-bone IK (middle and hind legs skim the ground, so the leg box reaches it like the Kaiju's).
- Hitbox parity was tuned with `tools/hitboxes.js` against the Kaiju: running head top 2.25–2.37 (Kaiju 2.16–2.40), ducking top 1.47 (1.49), airborne bottom 0.24–0.39 (0.32–0.35). Any new model should go through the same comparison.
- New monster fields (`Monsters.js`): `model` ('moth'), `glide`, `voice` (roar pitch), `look.score` (score factor when it differs from `hitX`). Game: `gliding` (`CFG.glideGravity`, `CFG.glideFall`), soft landing for flyers, `_wingbeat` dust and whoosh (`audio.flutter`), `_wingGlitter` during flight and the beam, `_roar` applies the voice, `scoreK` replaces `skin.hitX` for points.
- The bot glides as Mothra only while nothing is due before it lands (`glides`/`drops` in its report). Results, 150 s per combination: 0 deaths on all three levels in 2D and 3D (2–3 loops, 1–2 gunships each), and the Kaiju still at 0 deaths. The bot scores less with Mothra (Volcano 3D: 12.6k vs the Kaiju's 19.2k) because gliding leaves the crystal arcs; revisit her ×0.9 in the part 5 balance pass.
- First pick of Mothra costs about 0.35 s to build plus about 0.3 s of shader compile (title screen only).
- For Rodan (part 3): Moth.js is the template (pose constants, anchors tuned to the Kaiju's boxes, IK legs, wingbeat hooks); Rodan needs membrane wings (see Ghidorah's `_wingGeometry` in Dragon.js), a beaked head and two bird legs. Decide whether he glides too or gets his own trait (for example a fast dive on duck in the air).

## Later

The owner wants every monster from the films eventually (said 2026-11-05). After part 5, plan further parts from candidates such as Anguirus, Kumonga, Biollante, Hedorah, Battra, Megalon, Jet Jaguar, Titanosaurus, Baragon, King Caesar, Kamacuras and Ebirah, each with its own unlock goal; confirm the next batch with the owner.

## Resuming

1. Read this file and `CLAUDE.md`. Build and test helpers are in `tools/` (see `tools/README.md`).
2. Start the dev server (`node node_modules/vite/bin/vite.js --port 5187 --strictPort --host 127.0.0.1`).
3. Build the next "Not started" part. Monsters built on the dragon rig go through the variant options in `src/entities/Dragon.js`; flyers need their own model class with the same interface as `Dragon` (`group`, `update(dt, st)`, `getHitboxes`, `getMouthWorld`, `getSideMouths`, `setGlow`, `setRage`, `setSkin`, `glowColor`, `hitX`, `roar`, `onFootstep`), as `Moth.js` does.
4. Register it in `src/entities/Monsters.js` with its unlock goal, and give it card art in `HUD.buildMonsters`.
5. Test: hitbox parity with `tools/hitboxes.js`; `tools/botrun.mjs` on all three levels in 2D and 3D with the new monster (0 deaths), plus one Kaiju run if Game.js changed; screenshots; fps check.
6. Publish (see `CLAUDE.md`), then update the status column above.
