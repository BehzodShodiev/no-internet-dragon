# Monster roster roadmap

Started 2026-11-05. The owner asked for more playable monsters (Mothra, King Ghidorah, "and other ones"), all **locked** and earned through play, delivered in parts so the work can stop and resume between sessions. Each part ends built, tested with the autopilot bot, and published to the shared artifact.

## How unlocking works (all parts)

- Every player starts with the **Kaiju** (the Godzilla-style dragon, with its seven colour skins). Other monsters are locked.
- Lifetime stats are kept per player (`src/game/Progress.js`, browser storage, mirrored into the player's leaderboard row as `unlocks`/`stats` when they can write to it).
- Unlocks are checked at the end of every run; a new one gets a banner on the game-over screen.
- The **Monsters** panel (title and game-over screens, key `M`) lists each monster with its unlock goal and progress bar.
- The artifact's owner can preview locked monsters from that panel (labelled as a preview), so new monsters can be checked without grinding.
- Every monster keeps the same hitbox height; width along x (`hitX`) varies with its build, and score scales with it, as with skins.

## Parts

| Part | Content | Unlock goal | Status |
| --- | --- | --- | --- |
| 1 | Unlock system, lifetime stats, Monsters panel, **King Ghidorah** (three heads, two tails, wings, gold, gravity-beam breath) | Down 5 gunships in total | **Done** 2026-11-05, artifact v10 |
| 2 | **Mothra** (giant moth: new flying model, glides when jump is held, wing-dust beam) | Collect 500 crystals in total | Not started |
| 3 | **Rodan** (fiery pteranodon kaiju, reuses the flyer model) | Down your first gunship | Not started |
| 4 | **Gigan** (cyborg: visor, hook arms, dorsal fin row) and **Destoroyah** (horned, winged demon), both variants of the dragon rig | Gigan: smash 200 things in total. Destoroyah: score 15,000 in one Night City run | Not started |
| 5 | **SpaceGodzilla** (crystal shoulders, crystal breath), balance pass across all monsters, README | Trigger Kaiju Rage 10 times | Not started |

## Notes from part 1

- `Dragon` takes a variant (`'kaiju'` | `'ghidorah'`); the head builder is `makeHead()` inside `_buildMeshes`, reusable for extra heads. Rigid add-ons (side heads, wings) are plain meshes parented to bones; skinned add-ons (the extra tail) go through `spineSkin`.
- Monsters other than the Kaiju are built the first time they're selected (`Game.selectMonster`), so they don't slow loading.
- Stats counted: `runs, crystals, gunships, smashes, rages, closeCalls, bestScore` (`Progress.js`). Part 4's Destoroyah goal needs a per-level best; `bestScore` is any level, so add a stat for it then.
- Owner preview relies on the `user` capability's `isOwner()`.

## Resuming

1. Read this file and `CLAUDE.md`. Build and test helpers are in `tools/` (see `tools/README.md`).
2. Start the dev server (`node node_modules/vite/bin/vite.js --port 5187 --strictPort --host 127.0.0.1`).
3. Build the next "Not started" part. Monsters built on the dragon rig go through the variant options in `src/entities/Dragon.js`; flyers (parts 2–3) need their own model class with the same interface as `Dragon` (`group`, `update(dt, st)`, `getHitboxes`, `getMouthWorld`, `setGlow`, `setRage`, `setSkin`, `glowColor`, `hitX`, `roar`, `onFootstep`).
4. Register it in `src/entities/Monsters.js` with its unlock goal.
5. Test: bot run in 2D and 3D with the new monster (0 deaths), screenshots, 60 fps check.
6. Publish (see `CLAUDE.md`), then update the status column above.
