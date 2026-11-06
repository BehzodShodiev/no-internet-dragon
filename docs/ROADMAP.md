# Roadmap

Two tracks, worked in order: the **100x program** (the owner's request to make the whole game 100x better: looks, gameplay, content, polish, optimisation) and the **monster roster** it absorbed. The full program, with every item's design notes, is in [PROGRAM.md](PROGRAM.md). Work happens on the `game-100x` branch; each part ends built, tested (`npm test`, `npm run test:perf`), published to the shared artifact and committed.

## The 100x program

| Part | Content | Status |
| --- | --- | --- |
| A | Foundations: bug fixes, leaderboard data safety, seeded runs, fast-sim bot matrix, hitbox and data gates, perf instrumentation | **Done** 2026-11-06, artifact v12 |
| B | Sound and music: original adaptive score, mix buses and limiter, soundscape, per-monster voices | **Done** 2026-11-06, artifact v13 |
| C | Performance overhaul: scenery LOD, post chain, IBL reuse, Auto quality v2, pooling, idle rendering, faster loading | **Done** 2026-11-06, artifact v14 |
| D | Game feel and fair score economy: jump buffer, Rage on demand, combo fairness, smash mastery, loops add threats, camera and juice | **Done** 2026-11-06, artifact v15 |
| E | Looks I: grading, atmosphere, local lights, shadows, VFX and destruction | Not started |
| F | Menus, UX and onboarding: transitions, settings and pause menu, game over v2, unlock reveal, Bootcamp, accessibility | Not started |
| G | Signature abilities, Rodan (roster part 3), monster fidelity | Not started |
| H | Living levels: patterns and set pieces, new obstacle behaviours, power-ups, world detail | Not started |
| I | Bosses: Gunship 2.0, boss framework, Mecha-Kaiju | Not started |
| J | Meta and modes: achievements, missions, mastery looks, Daily, World Tour, Boss Rush | Not started |
| K | Roster parts 4–5 (Gigan, Destoroyah, SpaceGodzilla) and the balance pass | Not started |
| L | New worlds (Monster Island, Tokyo Bay) and the film-roster pipeline | Not started |

### Results of part A

- Fixes: Night City keeps its road, lamps and skyline for the whole level (it rolled away at stage 2); leaderboard writes never replace a row unless a successful read showed none, and progress is only written after the row was read (`Leaderboard._write`); progress saves on tab hide/close and merges with other tabs (`Progress.save`); goals met in a run that never ended unlock on the next load; tips are remembered; window blur pauses; Space/Enter press keyboard-focused buttons in menus; touch buttons capture the pointer; a Main menu button on game over; the in-run HUD hides on menus; the dist service worker precaches every hashed asset under a versioned cache.
- Seeded runs: `?seed=N` (run k uses N + k); every spawn draws from its own stream `hash32(seed, spawnIndex)`, boss volleys from `hash32(seed, 1000 + boss)`; `Obstacles.RESPONSE` / `respond(o)` say how each type is beaten (tips and bot use it); `_prewarm` is keyed by type and warns about any pool type without a sample.
- Gates (all pass): `npm run test:matrix` 36/36 (3 levels × 2D/3D × Kaiju, Ghidorah, Mothra × seeds 101 and 202, to loop 4, 0 deaths, about 6 min with 3 workers); `npm run test:hitbox` (Ghidorah within 0.001, Mothra within 0.034 of the Kaiju); `npm run test:data` (12 checks: blocked reads, retries, new rows, read-only viewers, old local saves).
- Perf baseline (`docs/perf/baseline-partA.json`, headless Chrome on this laptop's iGPU, `?perf`): GPU time per frame Desert noon 3D 6.06 ms (97 draws, **3.73M triangles**), City Siege 3D 4.4 ms (1.13M), Volcano gunship 3D 4.34 ms (1.12M), Desert night 2D 4.38 ms (1.75M), phone Medium 5.0 ms (2.76M). One frame over 50 ms in the Desert and City scenes. Load to title 4.0 s: shader compile 2.3 s, procedural textures about 0.9 s. Headless frames are paced at about 6.9 ms (144 Hz), so GPU time and long frames are the numbers to beat in part C.

### Results of part B

- `src/game/Music.js`: an original procedural score on a 16th-note look-ahead sequencer. Themes for the title, Desert (Phrygian dominant), Night City (minor synth), Volcano (heavy Phrygian) and game over; six layers (pad, bass, drums, arpeggio, brass, lead) follow intensity (title 0, running 1, army/siege/inferno 2, gunship 3, Rage 4, set in `Game._scoreMusic`); stingers for game over, new best, gunship down and unlocks. The old Rage/boss drum loop is gone (the score has its own drums).
- `src/game/Audio.js`: SFX, music, UI and ambience buses into a glue compressor, a limiter and a soft clipper; a reverb send with a generated impulse per biome; music ducks under roars and explosions; a live-voice count lets optional notes skip when the mix is crowded. Ambience per biome (desert wind, city hum and traffic, volcanic rumble and lava crackle). Per-monster sound (`Monsters.js` `sound`): Kaiju growl and atomic beam, Ghidorah triple roar and gravity beams, Mothra trill and scale storm; the death cry uses the monster's voice. New: pterodactyl screech, meteor whistle, missile launch (panned), glass for buildings, tank treads, UI hover/click/open/close. A paused game or hidden tab suspends the sound.
- Gates: `npm run test:audio` (new) renders the mix offline: every theme and intensity is audible (title −27 dB RMS, runs −24 to −20 dB, game over −24 dB) and the worst case (every big sound at once over Rage music) peaks at 0.87, no clipping. Quick matrix 18/18 at 0 deaths; the scheduler costs about 0.08 ms per 25 ms tick. Test servers no longer hot-reload (an edit mid-run had swapped monsters under the matrix), and the matrix now fails any run whose monster, level or seed changed underneath it.

### Results of part C

- Geometry: background saguaros and rocks use lighter meshes (`buildCactus` radial/rings, `buildRock` detail; obstacles keep full detail). Desert 3D went from 3.73M to 0.95M triangles a frame.
- Post: only the scene target is multisampled (`ScenePass` in `Renderer.js` resolves and sanitizes it into plain half-float targets); tone mapping and the grade are one pass; rebuilding the chain disposes the old one. IBL re-bakes render the sky into a persistent cube target and refill the same PMREM target (`Environment._bakeEnv`), so nothing is allocated and materials never re-validate.
- Auto quality v2 (`Renderer.adapt`): times the GPU (timer query) and only steps down when the GPU is the bottleneck; learns the display cadence (no drops on 30 fps caps or 50 Hz screens); preset changes go through `Game._autoPreset` at game over or the title, never mid-run; the shadow filter is fixed per session (no mid-run recompiles); climbs back up with headroom.
- CPU: obstacles keep and restyle their child meshes (cactus, rock, building, car); `Environment.update`, `skyColor`, `twilightSky` and `Game._update` allocate nothing per frame (scratch objects for the boss context, monster state, crystal options, warnings, projections, camera options); HUD meters and warnings only write on change; tips stop scanning once learned.
- Idle: paused draws once, title and game over redraw about 30 times a second; in-run buttons and the toast skip `backdrop-filter`.
- Loading: post-processing shaders compile with the scene during loading (the first frame now builds 5 programs, the shadow-depth variants three keeps internal, instead of all post shaders); the other monsters are built and compiled in the background on the title (picking Mothra went from about 0.68 s to under 10 ms); procedural textures are cached in IndexedDB (`TexCache`, keyed to the generator source); the font ships as woff2 only. Production load to title: 3.7 s on a first visit, 1.2–1.4 s on repeat visits (`npm run test:load`).
- Results (`docs/perf/partC.json` vs part A): GPU time per frame Desert 3D 6.06 → 2.81 ms, City Siege 4.4 → 2.83 ms, Volcano gunship with Rage and breath 4.34 → 3.85 ms, Desert night 2D 4.38 → 2.84 ms, phone Medium 5.0 → 2.6 ms; no frames over 50 ms in any scene. `npm test` passes (matrix 36/36).
- Deferred: merging the pterodactyl's 11 meshes moves to part E (its look is reworked there); the first visit's shader compile (about 1.8 s) remains the largest loading cost.
- Test fixes: the matrix now injects the bot before the run starts (a late injection on a busy machine let the fast simulation reach the first obstacle unattended), and `?perf` ignores frames in the 0.5 s after a reset (the DevTools call that resets can stall a frame).

### Results of part D

- Controls: 0.12 s jump buffer (`Game._onJump` / `_doJump`; a buffered press fires on landing). Kaiju Rage on demand: a full meter waits (`rageReady`), `R`/`G` or a touch button that appears when ready (`_triggerRage`); in Rage, touched shells and missiles are reflected; the bot saves Rage for gunship fights.
- Combo economy: crystals carry the uid of the obstacle they arc over (`Crystals.add(x, y, owner, optional)`), and `Crystals.release(uid)` homes them in when it is smashed, burned or raged through; high trios are optional (skipping them no longer breaks the chain); every obstacle the breath burns adds to the chain, with a MULTI-BURN pop-up at three.
- Smash mastery: PERFECT when the target was within 1.2 units of the jaws at the press (stamped as `o.smashLead` in `_smash`), DOUBLE/TRIPLE SMASH within 1.5 s, SKY BITE on flyers in mid-air, bonuses capped at 2×; each smash adds 0.6 crystals' worth of Rage. Duck close calls only count when the duck started within 0.25 s of the threat (`_markLateDucks`, `o.lateDuck`).
- Loops: `obstacles.cycle` now follows `stages.cycle` at every stage change (tightening and armed tanks no longer wait for a gunship kill); spawn-table rows take a "from loop" value (`TABLES` in `Obstacles.js`), and the Desert brings helicopters from loop 2 and tanks from loop 3; new loops are announced (LOOP n). In 3D, some cars, tanks and flyers swing in from the side (`o.z0`), locked onto the track by x = 50 (2D never sees it; collisions ignore z).
- Camera and juice (`CameraRig`): smooth-noise shake with roll, speed-based FOV, a zoom punch on smashes, a death cam, gunship framing; haptics on phones; everything honours `dragon.motion` (default: the system's reduced-motion setting), which also tones flashes down.
- Gates: matrix 36/36 at 0 deaths; data, audio and hitbox pass. Score impact on identical seeds (bot points per game second, part C → D): Kaiju 142.2 → 142.2, Ghidorah 163.0 → 165.9 (+2%), Mothra 86.9 → 72.7 (−16%, the bot no longer gets Rage automatically), all −3%. Within the +10% guard, so existing leaderboard scores stay comparable (human players who smash and burn more will score somewhat more).

## Monster roster

Started 2026-11-05: more playable monsters (Mothra, King Ghidorah, "and other ones"), all **locked** and earned through play.

- Every player starts with the **Kaiju** (the Godzilla-style dragon, with its seven colour skins). Other monsters are locked.
- Lifetime stats are kept per player (`src/game/Progress.js`, browser storage, mirrored into the player's leaderboard row as `progress` (stats and unlocks) when they can write to it).
- Unlocks are checked at the end of every run (and on load); a new one gets a banner on the game-over screen.
- The **Monsters** panel (title and game-over screens, key `B`) lists each monster with its unlock goal and progress bar. The artifact's owner can preview locked monsters there.
- Every monster keeps the Kaiju's hitbox heights (`npm run test:hitbox`); width (`hitX`) varies with its build, and score scales with it (or with `look.score`).

| Roster part | Content | Unlock goal | Status |
| --- | --- | --- | --- |
| 1 | Unlock system, lifetime stats, Monsters panel, **King Ghidorah** | Down 5 gunships in total | **Done** 2026-11-05, artifact v10 |
| 2 | **Mothra** (flying model, glide, wing-dust beam) | Collect 500 crystals in total | **Done** 2026-11-05, artifact v11 |
| 3 | **Rodan**: now program part G | Down your first gunship | Not started |
| 4 | **Gigan** and **Destoroyah**: now program part K | Gigan: smash 200 things. Destoroyah: score 15,000 in one Night City run | Not started |
| 5 | **SpaceGodzilla** and the balance pass: now program part K | Trigger Kaiju Rage 10 times | Not started |
| Later | Anguirus, Battra, King Caesar, Jet Jaguar, then Baragon, Megalon, Hedorah, Biollante…: program part L | One achievement each | Not started |

### Notes from roster part 1

- `Dragon` takes a variant (`'kaiju'` | `'ghidorah'`); the head builder is `makeHead()` inside `_buildMeshes`, reusable for extra heads. Rigid add-ons (side heads, wings) are plain meshes parented to bones; skinned add-ons (the extra tail) go through `spineSkin`.
- Monsters other than the Kaiju are built the first time they're selected (`Game.selectMonster`), so they don't slow loading.
- Stats counted: `runs, crystals, gunships, smashes, rages, closeCalls, bestScore` (`Progress.js`). Destoroyah's goal needs a per-level best; `bestScore` is any level, so add a stat for it then.
- Owner preview relies on the `user` capability's `isOwner()`.

### Notes from roster part 2

- Mothra is `src/entities/Moth.js`, a standalone model (no skinning) with the dragon's interface plus `flyer: true`, `onWingbeat(k)` and `wingDust(target)`. It is built in world units under a `root` that cancels `DRAGON_SCALE`. Wings are fan meshes (`wingPoint(def, u, v)`) with textures painted in the same (u, v) space; legs are instanced femur/tibia pairs placed by 2-bone IK.
- New monster fields (`Monsters.js`): `model` ('moth'), `glide`, `voice` (roar pitch), `look.score` (score factor when it differs from `hitX`).
- The bot scores less with Mothra because gliding leaves the crystal arcs; revisit her ×0.9 in the balance pass.
- For Rodan: Moth.js is the template; he needs membrane wings (Ghidorah's `_wingGeometry`), a beaked head and two bird legs.

## Resuming

1. Read this file, [PROGRAM.md](PROGRAM.md) and `CLAUDE.md`. Test tools are in `tools/` (see `tools/README.md`); they start their own dev server.
2. Build the next "Not started" part of the program, following its section in PROGRAM.md.
3. Before publishing: `npm test` (data, hitbox parity, bot matrix), `npm run test:perf -- --baseline docs/perf/baseline-partA.json`, screenshots of what changed, then `npm run artifact` and publish `dist-single/artifact.html` (see `CLAUDE.md`).
4. Update the status tables above (with the artifact version), README and this file's results, then commit.
