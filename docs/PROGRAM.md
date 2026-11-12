# No Internet Dragon: the 100x program

The owner's request (2026-11-05): "make it 100x better than current", the whole game, across looks, gameplay, content, polish and optimisation. This is the approved program. Status per part is tracked in [ROADMAP.md](ROADMAP.md); the appendix at the end keeps the gameplay designer's implementation notes per item (file:line references are from 2026-11-05 and drift as the code changes).

## Context

The owner asked to "make it 100x better than current". When asked, they chose **the whole game**, covering **looks, gameplay, content, polish and optimisation**.

Today the game is a procedural three.js runner (Vite, one self-contained HTML file published as the claude.ai artifact https://claude.ai/artifact/38LU4dJei24uvhwcSq25td, currently v11). It has:
- 3 levels (Desert, Night City, Volcano), each looping 2 stages plus a gunship boss.
- 3 monsters: the Kaiju with 7 skins, Golden Hydra, and Moth Queen, just shipped.
- A company leaderboard and achievement-style unlocks.

A read-only code review (three explorers, plus a gameplay/content designer) produced the findings and items below. Looks, polish and performance items come from the explorers' maps.

**Hard constraints** (every part respects them):
- Procedural and offline only: no assets, fetches or CDNs. It stays one HTML file.
- 60 fps on the Intel iGPU at 1280x720 on High, with Auto quality.
- Every monster keeps the Kaiju's hitbox heights.
- The autopilot clears all levels in 2D and 3D with 0 deaths.
- The 2D view stays Chrome-dino readable.
- Leaderboard rows (`best`, `l2`, `l3`, `progress`) and `dragon.*` local saves stay compatible. New fields are written with `update()` only.

## Starting point: what the review found

- **Bugs**
  - Night City loses its road, lamps and skyline from stage 2 on. `Game._enterStage` calls `city.setActive(!!st.city)`, and no stage sets `city`.
  - A failed read of the player's own row makes the next write a `set()` of partial data, which can wipe their other bests and progress (`Leaderboard.js` `submit`/`syncProgress` fallback).
  - Progress is only saved at death.
  - Space and Enter can't press focused buttons, because `Input.js` swallows them.
  - The in-run HUD and touch buttons show on the title and game-over screens.
  - Losing window focus doesn't pause.
- **Performance**
  - Background saguaros (48 radial segments x 108 instances) cost about 1.3M triangles in both the main and the shadow pass.
  - Every post pass writes MSAA HalfFloat buffers, because the composer's second target is an MSAA clone.
  - The sky IBL re-bakes up to about 2.5 times a second. Each bake allocates a target and re-validates every material.
  - Auto quality leaks the old composer, recompiles mid-run and never climbs back.
  - Cactus, rock, building and car meshes are rebuilt on every spawn.
  - Pterodactyls are 11 meshes each.
  - The main loop allocates every frame.
  - Paused and menu screens render at full rate.
  - `backdrop-filter` blurs run over the live canvas.
  - Loading is synchronous and untimed.
  - Picking a monster for the first time stalls for about 0.65 s.
- **Gameplay**
  - Obstacles are purely random, one at a time, with no patterns or set pieces.
  - Most of the 16 obstacle types are static reskins.
  - One gunship is reused everywhere, and its fights are long and pure dodging.
  - The breath is a no-skill screen clear, and Rage triggers by itself.
  - Smashing breaks the combo, and duck close calls happen automatically.
  - Monsters are mostly cosmetic, and loops only add speed.
  - Runs can't be reproduced, and the bot is a narrow fairness check.
- **Content and meta**
  - All 3 levels share one structure.
  - There are 2 unlock goals and no achievements, missions, daily challenge or modes.
- **Looks**
  - There is no ambient occlusion and almost no local light.
  - In 3D, shadows end about 45 units ahead.
  - Clouds are flat sprites, fog is one colour and particles are dots.
  - Destroyed objects vanish into cubes, and props are untextured.
  - The world repeats every 512 units, and the city sits on desert dunes.
  - Camera shake is white noise.
- **Polish**
  - There is no music at all, the mix is flat, there are no UI sounds and every monster sounds the same.
  - Screens hard-cut, the game-over screen is static and the unlock moment is weak.
  - There are no settings, and onboarding is toast-only.
  - Accessibility gaps: dialog semantics, focus handling, flashes, small text, and zoom is disabled.
  - On mobile there is no way back to the title from game over.

## Vision

Every run should play like a kaiju film sequence. Fire and neon light the world, buildings collapse, and an original score swells into boss fights. Each monster plays differently, and levels have rhythm and set pieces. There are reasons to come back every day: a daily challenge, achievements that unlock the whole film roster, missions and modes. All of it stays smooth at 60 fps and fair, and every claim is measured, not guessed.

## How the program runs

- There are 12 parts (A–L), done in order. Each ends with at least one publish (v12, v13, …). A large part may ship in two.
- **Cost policy** (the /usage report flagged my `Plan` fan-out at 42%):
  - Parts are built sequentially in the main session.
  - No multi-agent workflows unless you ask for one.
  - Any helper subagent gets a narrow brief and `model: 'sonnet'`.
  - The assistant keeps this policy in its project memory as well.
- Part A copies this program into the repo (the `docs/ROADMAP.md` status table and `docs/PROGRAM.md` with item details), so either laptop can resume.

## Definition of done (every part)

1. **Build**: `npm run build:single`, then `tools/make-artifact.mjs`, then `tools/scan-artifact.mjs`. The scan must show 0 external URLs and gzip of 400 KB or less (today 243 KB).
2. **Fairness**: `npm run test:matrix` (built in Part A) runs every level × 2D/3D × every monster, on fixed and random seeds, in fast fixed-step sim through loop 4.
   - It must show 0 deaths and 0 "saves": shields and re-forms count as failures.
   - Also one real-time run per level.
   - `npm run test:hitbox` must show every monster within ±0.05 of the Kaiju's envelope.
3. **Performance**: `npm run test:perf` reference scenes stay within budget, run solo (one Chrome at a time) and spot-checked in a real Chrome window on the iGPU.
   - Scenes: Desert noon 3D High, Night City siege 3D, Volcano gunship with Rage and breath, Desert night 2D, and a phone-size Medium scene at device pixel ratio 2.
   - Budget: p95 frame time of 16.7 ms or less at 1280x720 High, and no frame over 50 ms after loading.
   - Draw calls, triangles and load time are compared with the previous part.
4. **Data**: `npm run test:data` (mock store with failure injection, plus old saves) must show rows never losing fields and old `dragon.*` saves loading correctly.
5. **Review**: screenshots of every touched scene (2D and 3D, day and night, each biome), checked for 2D readability.
6. **Ship**:
   - Update README, ROADMAP and CLAUDE.md.
   - Commit.
   - Publish to the artifact URL without `capabilities`.
   - Record the version.
   - If the artifact service is unreachable (its connector failed to connect this session), commit and publish later.

## Parts

### A. Foundations: fixes, data safety and measurement
- **Fixes**
  - Use `city.setActive(this.level.biome === 'city')` in `Game._enterStage`.
  - Leaderboard writes never `set()` a partial row. On a failed read, re-read the row; only a successful read that shows no row allows `set()`; otherwise use `update()`.
  - Save progress on `pagehide`/`visibilitychange`, and persist tips (`dragon.tips`).
  - Pause on window blur.
  - Let Space and Enter press a focused control in `Input.js`.
  - Touch buttons use `setPointerCapture`.
  - Add a touch "back to title" on game over.
  - Show `#hud` only during runs.
  - In the dist build, the service worker precaches the hashed assets under a versioned cache name.
- **Seeded runs**
  - Add `?seed=` and per-spawn RNG streams (`mulberry32` from `src/gfx/noise.js`), and seed the boss volleys.
  - Add one RESPONSE table (jump, duck, under, smash) next to `SMASH/TALL/SILENT` in `Obstacles.js`. The spawner, tips and bot all read it.
  - Drive `Game._prewarm` from pool types instead of positional `temp[n]`.
- **Test harness**
  - A fixed-step sim, `?sim=N`, runs `_update(1/60)` N times per frame and never posts scores.
  - Bot v2 keeps a threat queue from RESPONSE and uses human-scale windows.
  - `tools/botmatrix.mjs` returns exit codes.
  - Thresholds in `tools/hitboxes.js` and `tools/scan-artifact.mjs`.
  - `tools/mock-claude.js` gets failure injection and write assertions.
  - Add `npm run test:*` scripts.
- **Instrumentation**
  - A `?perf` overlay shows draw calls and triangles (`renderer.info`), CPU phase times and GPU time (`EXT_disjoint_timer_query_webgl2`).
  - Load-step timings.
  - `tools/perf.mjs` reports p50/p95/p99 and long frames.
  - Record the baseline in ROADMAP.
- **Verify**: on the same seeds, the matrix gives the same results as today's bot. Data tests pass. The baseline is recorded.

### B. Sound and music (the biggest felt gap)
- `src/game/Music.js`: an **original** procedural score (no film themes) on a look-ahead Web Audio scheduler.
  - Desert, City and Volcano themes add layers by intensity: run, army stage, boss, Rage.
  - A title theme, game-over and new-best stingers, and an unlock fanfare.
- Mix:
  - Music, SFX, UI and ambience buses into a master limiter.
  - Stereo panning for flyers, a reverb per biome from a generated impulse, and ducking under roars and explosions.
  - A voice cap with node pooling, and a cached roar shaper curve.
- Soundscape:
  - City hum and lava rumble.
  - Pterodactyl screech, tank treads, meteor whistle, missile launch, glass break.
  - UI sounds.
  - A voice, breath sound and death cry per monster (Moth Queen's trill, Hydra's triple roar).
  - Audio follows game state: pause, hidden tab, game over.
- **Verify**: a listening checklist per scene, audio CPU time in the perf overlay, and the limiter never clips.

### C. Performance overhaul (headroom for everything after)
- **Geometry**
  - Saguaro LOD for scenery (16 radial segments or fewer), shadows only from the near layer, and per-tile frustum culling with real bounds.
  - Lower-detail far rocks.
  - Prebuilt child meshes in the cactus, rock, building and car pools.
  - The pterodactyl becomes one mesh with shader-animated wings.
- **Post**
  - The scene renders into its own MSAA target; Sanitize resolves it into non-MSAA HalfFloat ping-pong targets.
  - Tone mapping and the grade merge into one pass, with Sanitize still before bloom.
  - The 26 cloud sprites become one draw.
- **IBL**: a persistent cube target plus `pmrem.fromCubemap(cube, envTarget)` reuse (`fromScene` can't reuse targets in r170), with coarser sun steps. That means no allocations and no material re-validation.
- **Auto quality v2**
  - Dispose the old composer and bloom chain.
  - Keep the shadow type fixed per session.
  - Apply preset and terrain changes between runs only.
  - Detect the display refresh rate and 30 fps caps.
  - Climb back up when there's sustained headroom.
  - Use GPU time when available.
- **CPU**
  - Remove per-frame allocations: `Environment.update` and in `Game._update` the boss context, warnings, `_toScreen`, crystal options, plus the `Dragon.getHitboxes` closure.
  - Cache `matchMedia`, write the HUD only on change, and make the reflect check O(n).
- **Idle**: render once when paused, and throttle the title and game-over screens.
- **CSS**: no `backdrop-filter` on in-run elements.
- **Loading**
  - Time each step.
  - Move the slowest generators to GPU render-to-texture, or chunk them across frames with a moving bar.
  - Drop the woff font fallback.
  - Build monsters at idle with `compileAsync`, and show a "Summoning…" state if one is picked before it's ready.
- **Targets**: Desert 3D High triangles down 60% or more, GPU frame time down 35% or more, 0 frames over 50 ms after load, and load-to-title time down 30%.

### D. Game feel and a fair score economy
- **Controls**
  - A 0.12 s jump buffer.
  - Kaiju Rage on demand: R/G key plus a touch button, both appearing when Rage is ready. During Rage, touched shells and missiles bounce back. The bot triggers Rage in boss fights.
- **Combo economy**
  - Crystals over a smashed or burned obstacle home in to you.
  - Skipping an optional high trio doesn't break the chain.
  - Breath kills add to the chain (MULTI-BURN).
- **Smash mastery**
  - PERFECT last-instant smashes, DOUBLE/TRIPLE SMASH and SKY BITE, with bonuses capped at 2x base.
  - Close calls count only for late ducks.
- **Loops**: each loop adds threats. Sync `obstacles.cycle` with `stages.cycle` and add cycle-gated rows to the spawn tables.
- **3D side entrances**: vehicles and flyers approach from the sides for visual effect only, locked onto the track by x = 50.
- **Camera and juice**
  - Noise-based shake with roll, independent of frame rate.
  - Speed-based FOV, impact punch-in, a death cam and boss framing.
  - Haptics.
  - All of it honours a motion/flash setting that defaults to `prefers-reduced-motion`.
- **Verify**: the matrix passes, and points per minute per monster in bot crystal mode stay within +10% of Part C. Announce if higher.

### E. Looks I: light, atmosphere and effects
- **Grade**: compare AgX and Neutral tone mapping against ACES, and give each biome its own grade (lift/gamma/gain, split toning) inside the merged pass.
- **Atmosphere**
  - Height fog with sun in-scattering, keeping the CPU mirror in sync.
  - A lit procedural cloud layer in the sky shader.
  - Milky Way and shooting stars at night.
  - A lava-lit volcano plume and city light-pollution glow.
- **Light and shadow**
  - A local light pool fixed per preset (High 3, Medium 1, Low 0) for explosions, muzzle flashes, lava and street lamps.
  - The shadow box fits the 3D view, with texel snapping and a fade.
  - Soft contact shadows beyond the box.
  - A ground-proximity AO term in the shared materials.
- **VFX**
  - Particle shader with rotation, procedural fire and smoke, and a fade near the ground.
  - Explosions get a fireball, a smoke column and a shockwave ring.
  - Scorch and crater decals use the footprint pattern.
  - Destruction v2: shards in the obstacle's colours, and buildings collapse into dust.
  - The breath gets an impact splash and scorched ground; missiles get smoke ribbons.
  - Obstacles fade in at spawn in 3D.
  - FXAA on Low (it has no MSAA today), and alpha-to-coverage on bushes.
- **Verify**: the perf gate holds within Part C's savings; before/after screenshots for every biome × time of day × view; 2D obstacle readability.

### F. Menus, UX and onboarding
- **Screens and HUD**
  - Screens animate in and out, keeping `.hidden` semantics for state checks.
  - The HUD shows only during runs.
  - Toasts and banners go through a priority queue.
- **Pause and settings**
  - A pause menu: resume, restart, settings, quit to title.
  - Settings: music, SFX and UI volume; motion and flashes; quality; controls and help.
- **Game over v2**
  - A score count-up with a breakdown: distance, combo, smashes, gunships.
  - Progress toward the next unlock.
  - "N points to pass <colleague>".
  - A new-best celebration.
  - A short ready beat before a restart.
- **Unlocks and monsters**
  - Unlocking a monster gets a full-screen 3D reveal with a "Play now" button.
  - Monster cards show each model rendered once, or a silhouette while locked, plus a stats page.
- **Onboarding**: Kaiju Bootcamp, a guided first Desert run.
  - It uses a scripted spawn queue, slow-motion prompts and forgiven mistakes, and posts no score.
  - Tips stay learned across visits.
- **Accessibility and mobile**
  - Dialog roles with focus trap and restore; arrow keys move between cards.
  - Meters are exposed as progressbars, and game over and unlocks are announced.
  - Zoom is allowed: drop `user-scalable=no`; the canvas keeps `touch-action: none` and buttons get `touch-action: manipulation`.
  - The pixel font uses 8/16 px sizes, and contrast is fixed.
  - Fullscreen and quality are reachable on phones, with a rotate hint.
- **Verify**: keyboard-only and touch walkthroughs scripted in `tools/cdp.mjs` (new touch steps), and screenshots of every screen at desktop and phone sizes.

### G. Signature abilities, Storm Wing, and monster fidelity (roadmap part 3)
- `src/game/Traits.js` plus a `trait` field in `Monsters.js`. All abilities are optional and leave hitbox heights alone.
  - **Kaiju, NUCLEAR PULSE**: hold duck and press breath with the meter at 50% or more.
  - **Hydra, WING FLAP**: a mid-air flap, and his gravity beams deal 2 HP to bosses.
  - **Moth Queen, SCALE STORM**: her beam collects crystals, on top of the glide.
  - **Storm Wing, SONIC DIVE**: dive while airborne, with a shock on landing.
- **Storm Wing** (`src/entities/StormWing.js`): built from the Moth.js template with Hydra's `_wingGeometry` membrane. He unlocks with your first gunship and passes the hitbox parity check.
- **Fidelity**
  - Kaiju: wrap/rim skin shading, blinks and snarls, tail and plate secondary motion.
  - Hydra: spring-damped necks and lightning-style beams.
  - Moth Queen: backlit translucent wings, fur shells on Medium/High, iridescent scales, animated antennae.
- **Verify**: hitbox parity for all 4 monsters; the matrix passes; points per minute per monster.

### H. Living levels: patterns, threats, power-ups, world detail
- **Pacing**: a pacing director plus authored patterns in `src/game/Patterns.js` (warm, wave, breather, peak). Each stage gets set pieces:
  - Desert staircase.
  - Army checkpoint and convoy.
  - City traffic jam and block buster.
  - Ashlands meteor shower and lava hopscotch.
  - Gaps are never below today's `minGap`.
- **New obstacle behaviours**
  - Jeeps that drive at you, tumbleweeds, rolling boulders.
  - A city footbridge to duck under or smash.
  - Artillery barrages on marked spots, and gunner helicopters.
  - Supply-drop crates: atomic core, shield, magnet, combo lock, rage shard.
- **World detail**
  - Landmarks that break the 512-unit repeat.
  - City sidewalks, kerbs, parked cars, neon, rooftops, blinkers and a wet sheen.
  - Volcano lava rivers and falls with heat shimmer.
  - Terrain anti-tiling with slope/height blending and sand glints.
  - Procedural edge wear on props.
- **Verify**: the matrix passes with bot rules for every new type, plus 600 s runs; telegraphs of at least 0.9 s on the L/M/H heights; the perf gate holds.

### I. Bosses
- **Gunship 2.0**: dodging missiles charges the breath, and at half health a phase 2 adds a move per level: early mixed volleys, a chin-gun strafe, or mines.
- **`BossBase`**: a shared framework that the gunship moves onto.
- **MECHA-KAIJU**: a ground duel for Night City.
  - Finger missiles you can reflect.
  - A stomp shockwave to jump.
  - A head-height eye beam to duck.
  - A charge you parry with a smash.
- **Verify**: fight lengths measured; every attack telegraphed for at least 0.9 s, never overlapping; the matrix passes.

### J. Meta and modes
- **Achievements** (`src/game/Achievements.js`, about 30): stored as `a:<id>` in `progress.unlocked`, so older clients keep them. Every monster unlock becomes an achievement, and there's a trophies list.
- **Missions, Kaiju XP and mastery looks**: unlockable looks keep their monster's base `hitX` and score factor.
- **Modes**
  - Daily Challenge: a seeded level, a featured monster and a modifier. It's stored as `daily = dayId*1e6 + score`.
  - World Tour (`tour`) and Boss Rush (`rush`).
  - Writes use `update()` only, and boards subscribe lazily, only the one on screen.
- **Verify**: data tests with old saves; the next 7 dailies pass the matrix; rows keep `best/l2/l3/progress`.

### K. Roster parts 4–5 and balance
- **Hook Raptor**: BUZZSAW, smashes solids with a longer reach, score ×0.95.
- **Crab Demon**: RE-FORM, survives one hit per stage, score ×0.85.
- **Crystal Titan**: CRYSTAL FIELD, burns leave crystals and his magnet reach doubles.
- A Storm Wing boss at the Volcano Fortress, which also unlocks Storm Wing.
- Balance pass: score factors put every monster's median points per minute within ±5% of the Kaiju, measured in bot crystal mode.
- **Verify**: parity, the matrix, and a balance table in the README.

### L. New worlds and the film roster pipeline
- **Level 4, Monster Island** (`l4`): Anguirus rolls at you, Kumonga drops from above, Kamacuras swoops in, plus eggs, trees and tar pits.
- **Level 5, Tokyo Bay** (`l5`): containers, cranes, forklifts, wave crests, naval shells, and a SUPER-X boss with a shield window.
- Roster batches, each monster with one trait and one achievement: Anguirus, Battra, King Caesar, Jet Jaguar, then Baragon, Megalon, Hedorah, Biollante…
- The title screen fits 4–5 level cards.
- **Verify**: as above.

## Guardrails

- **Fairness**
  - Hitbox heights are fixed, and gaps never go below `minGap`.
  - Telegraphs last at least 0.9 s on the L/M/H heights and read in 2D.
  - Anything that prevents a death counts as a "save" in tests and gets a score factor below 1.
- **Data**
  - New fields are written with `update()` only.
  - `progress` keeps `{stats, unlocked}` with a max/union merge.
  - Never rename stats or `dragon.*` keys; keep `MAX_SCORE`.
  - If a part raises bot points per minute by more than 10%, decide with the owner whether to start a new season of boards.
- **Rendering**
  - The light set stays constant within a preset, and every new material goes through prewarm.
  - `onBeforeCompile` chunk names are pinned to three 0.170.0.
  - Keep the ANGLE workarounds: no `isnan`, guarded `pow`, no reserved words.
  - Terrain heights stay in sync between CPU and GPU, and the world scrolls past a fixed monster.
- **Artifact**
  - No fetches.
  - Workers from blob URLs are unverified inside the artifact sandbox, so speed up loading on the GPU or by chunking instead.

## Reuse

- `gfx/geometry.js` (`sweep`, `blob`, `mergeLoose`), `gfx/textures.js` (generators, `heightToNormal`), `gfx/noise.js` (`mulberry32`, `createTileableNoise`).
- The Footprints instanced-decal pattern (`world/Particles.js`) for scorch and crater decals.
- The `dragonLight` zero-intensity trick for a constant light set.
- `Moth.js` as the flyer template: fan wings, IK legs, anchors.
- Dragon variants (`_buildGhidorah`, `_wingGeometry`).
- Marked drops from `_spawnMeteor`/`_updateMeteor`.
- The `Progress` max/union merge.
- `tools/cdp.mjs`, `botrun.mjs` and `hitboxes.js` as the base of the new test harness.

## Files most touched

- `src/game/Game.js`: new systems go into new modules instead (`Music.js`, `Traits.js`, `Patterns.js`, `Achievements.js`, `Missions.js`, `Daily.js`, `BossBase`).
- `src/game/Renderer.js`, `src/world/Environment.js`, `src/world/Particles.js`.
- `src/entities/Obstacles.js`, `src/entities/Boss.js`.
- `src/game/HUD.js`, `index.html`, `src/style.css`.
- `src/game/Audio.js`, `src/game/Input.js`, `src/game/Leaderboard.js`, `src/game/Progress.js`.
- `tools/*`, `docs/ROADMAP.md`, `README.md`, `CLAUDE.md`.

## Appendix: gameplay and content design notes

From the gameplay/content designer (2026-11-05). Vision: 100x better play means every second asks a sharper question and every run tells a different story. Each monster gets a signature move on the same four buttons (Kaiju's Nuclear Pulse, Hydra's Wing Flap, Moth Queen's Scale Storm, Storm Wing's Sonic Dive, Hook Raptor's Buzzsaw, Crab Demon's Re-form, Crystal Titan's Crystal Field), so the roster becomes a set of play styles rather than repaints. Levels are paced by authored patterns and a director: waves, breathers, set pieces and crescendos, all built on today's Chrome gap guarantee. Loops add threats, not just speed. Three distinct bosses use every verb (dodge, duck, parry-smash, breath) instead of one gunship reused everywhere. The combo economy rewards smashing, burning and skilful timing (PERFECT smashes, late ducks) instead of punishing them, and a 120 ms early jump press is forgiven. Players get reasons to come back: a seeded Daily with a featured monster and modifier, World Tour, Boss Rush, Monster Island, Tokyo Bay, achievements that unlock every film monster, missions, XP and mastery looks. All of it stays on the existing fairness rails: the Kaiju's hitbox heights, gaps never tighter than today's minGap, and telegraphs of at least 0.9 s at L/M/H heights that read in 2D. Before each part is published, a seeded, fast-sim bot matrix must show 0 deaths and 0 saves for every level, view, monster and the next 7 dailies. Leaderboards only grow by new fields written with update(). Items are ranked by impact per effort, and no item ranks ahead of its prerequisites.

### CT-01 · Keep Night City's road, lamps and skyline for the whole run (bug)

Part A (done) · content · impact 4/5 · effort S

- **What:** In Night City the road, street lamps, light pools and lit skyline roll away when CITY SIEGE starts and never come back, not even after a gunship. For most of every run, buildings and cars stand on bare desert dunes under a city sky. After the fix the city stays built for the whole run: the siege, the city gunship and every later loop happen in the streets, and the lamps keep the road readable at night.
- **How:** src/game/Game.js:1060 (_enterStage) calls this.city.setActive(!!st.city), but no STAGE in src/game/Stages.js:4-14 has a city flag. So City.setActive(false) (src/world/City.js:240-245) runs at stage 2 and again after every gunship. Only _setupWorld's prefill (Game.js:198) ever turns the city on. Replace the call with this.city.setActive(this.level.biome === 'city'). Once MODE-02 lands, use (st.biome ?? this.level.biome) === 'city'. City.setActive(true) after a roll-away already restarts the road at the horizon (roadX0 = 125 when roadX1 < -40), so nothing pops. Add a regression probe to the bot report: at each stage change, record the stage key, city.active and city.road.visible (tools/botrun.mjs report eval, lines 25-28).
- **Risk:** Visual only: gameplay, hitboxes and the bot are unaffected. Players have only ever seen the siege without the city, so confirm the gunship at its home position (15.5, 4.6) still reads against the lit skyline at blue hour.
- **Verify:** Bot runs on L2 in 2D and 3D for 300 s each, which reach the siege, the gunship and loop 2, with 0 deaths. Screenshots at CITY SIEGE, during GUNSHIP OVER THE CITY and in loop 2 show the road, lamps and skyline. The new probe logs city.active = true at every stage change. Fps unchanged.

### GP-01 · Jump buffer: a jump pressed just before landing still happens

Part D · gameplay · impact 4/5 · effort S

- **What:** Pressing jump up to 0.12 s before touching down now jumps the instant the monster lands; today the press is silently dropped. Back-to-back cactus clusters and late-loop 3D speeds (40-58 units/s) stop producing 'I pressed it!' deaths. Releasing jump before landing still gives the short hop.
- **How:** Game._onJump (src/game/Game.js:527-544) only jumps when this.grounded. 1) Factor the take-off into _doJump(): vy = CFG.jumpV, grounded = false, cutPending = !input.jump, audio.jump(), _dustBurst. 2) In _onJump, while running or in the intro and airborne, set this.jumpBuf = CFG.jumpBuffer, a new CFG entry of 0.12 next to jumpCut (Game.js:33). 3) Decrement jumpBuf by realDt in _update. In the landing branch (Game.js:1299-1315), call _doJump() when jumpBuf > 0 and state === 'running'. 4) Reset jumpBuf in _resetRun (141-190). A glider's held key is not a new keydown, so Moth Queen's glide is unaffected. With GP-05, Hydra's flap fires only above y 0.6; a press closer to the ground goes into the buffer instead.
- **Risk:** Slightly more forgiving, and scores stay comparable because the jump arc, crystal arcs and gaps are unchanged. The bot only jumps when grounded (tools/bot.js:37), so it behaves the same.
- **Verify:** Scripted CDP step: press Space about 100 ms before landing (poll g.y and g.vy with eval) and assert g.vy > 0 within 2 frames of landing. Manual check at 2D and 3D top speed. Bot on 3 levels x 2 views with the Kaiju: 0 deaths.

### GP-02 · Fair combo economy: smashing never breaks your chain

Part D · gameplay · impact 4/5 · effort S

- **What:** Crystals hanging over an obstacle you smash, burn or rage through now fly to you; today they stay in the air and reset your chain. Skipping an optional high trio no longer breaks the chain either. Every obstacle the atomic breath burns adds +1 to the chain, with a MULTI-BURN pop-up for 3 or more, and each smash adds a little Kaiju Rage. Smashing, burning and jumping become equally good ways to hold a x5 combo.
- **How:** 1) Obstacles._acquire (src/entities/Obstacles.js:311-330) stamps o.uid = ++this.uidSeq. The arc branch of _layCrystals (721-723) passes owner = o.uid to Crystals.add(x, y, owner, optional) (src/entities/Crystals.js:27-29); the high-trio branch (728-732) passes optional = true. 2) New Crystals.release(uid) sets c.mag = 1 on that owner's crystals. Crystals.update (41-83) uses Math.max(magnet, c.mag) in the existing Rage-magnet block (49-53), so released crystals home in. Call release from Game._smashHit after o.dead (Game.js:786), from _explode (1050-1056) and from the Rage collision branch (1411-1413). 3) Crystals.update already passes the item to onMiss (Crystals.js:68). Game._missCrystal (896-903) returns early when c.optional. 4) In the breath kill loop (Game.js:1335-1340), count this.breathKills, call _setChain(this.chain + 1) per kill, and show _popup('MULTI-BURN xN') from 3 kills. 5) In _smashHit, after a break, call _addRage(0.5 / this.level.rageCrystals). Update the README section 'Radiation crystals and combos'.
- **Risk:** Smash-heavy and breath-heavy play scores a little more, so new bests come slightly easier on every board. The gain comes through the chain, not raw points; mention it in the release note. Rage arrives a bit sooner. The bot never chases crystals and is unaffected.
- **Verify:** Bot matrix: 0 deaths. Add a chainBreaks counter to the bot report through a hook in _missCrystal. With --smasher it must not count breaks caused by arcs over smashed obstacles. Manual: smash a cactus under an arc and watch the crystals fly in; burn 3 or more obstacles and see MULTI-BURN.

### GP-03 · Loops that add threats, not just speed

Part D · gameplay · impact 3/5 · effort S

- **What:** Every new loop of a level announces itself ('LOOP 2 · THE ARMY STRIKES BACK') and brings new threats: helicopters and later tanks in the Desert run, siege tanks already in City Rampage, paired meteor strikes in the Ashlands, extra pillars in the Inferno. The README promises tighter gaps and more armed tanks every loop; today these only come after a gunship kill.
- **How:** 1) Sync the two cycle counters. Where a new stage begins in Game._update (src/game/Game.js:1263-1268), set this.obstacles.cycle = Math.max(this.obstacles.cycle, this.stages.cycle) before _enterStage; today only _afterBoss sets it (1157). 2) Let TABLES rows (src/entities/Obstacles.js:220-226) take a third value, minCycle, and have _pickType (618-638) skip rows whose minCycle is above this.cycle. The Desert keeps Chrome's logic (633-637) but checks a small cycle-gated extra list first (heli 8% from loop 1, tank 6% from loop 2). Add ['tank', 12, 1] to city and ['pillar', 6, 1] to inferno. In the Ashlands from loop 1, a meteor has a 50% chance of setting this.forceNext = 'meteor', so a second meteor follows at a normal gap. 3) Per-level loop titles in LEVELS (src/game/Stages.js:23-42), shown with hud.banner in _enterStage when stages.index === 0 and cycle > 0. 4) Reset lastType and repeat in Obstacles.reset (301-309).
- **Risk:** Players who loop without downing gunships face harder loops sooner, as the README promises. The gap formula is unchanged and tightening still caps at 20% (Obstacles.js:694). Late loops have never been bot-tested, so they need long runs.
- **Verify:** 600 s real-time botrun per level in 3D (three in parallel), reaching loop 3 or later, with 0 deaths. Log obstacles.cycle and stages.cycle at each stage change; they must match. Screenshots of the loop banners.

### GP-04 · 3D entrances: traffic and aircraft merge onto the track from the sides

Part D · gameplay · impact 3/5 · effort S

- **What:** In 3D, the 120 units of visible track finally show the world closing in: cars pull out of side streets, tanks roll down off the dunes, and helicopters and pterodactyls swoop in from the flanks. Each locks onto the track well before it matters. 2D looks exactly as it does today.
- **How:** Gameplay stays 1-D because collisions ignore z (Obstacles.collide, src/entities/Obstacles.js:784-799). In _spawnNext (683-688), give flavour types an entry offset o.z0: cars ±10, non-shooting tanks ±14, helis and pterodactyls ±18 with +3 height. Anything that will raise a warning marker (shooter tanks, later gunner helis) spawns on the track so its marker matches. In Obstacles.update (600), set group.position.z = o.z0 * smoothstep(50, 110, o.x) and yaw the group along its path (atan2 of dz/dx) so vehicles visibly turn onto the road. z is exactly 0 by x = 50, and the 2D frame only shows x below about 21 (src/game/CameraRig.js:49-59), so 2D never sees the offset. Scale z0 by hard (Game.js:1219) so a mid-run switch to 2D eases out.
- **Risk:** An obstacle away from the track must never look as if it might miss you, so it locks onto the track by x = 50, about 1 s at 3D speeds. Off-track shadows fall outside the 68-unit shadow box: acceptable. Hitboxes, timing and the bot are unchanged (the bot reads x only).
- **Verify:** 3D screenshots and a short capture at x 60-110 show the merge; 2D screenshots are pixel-identical in layout; bot matrix sanity run at 0 deaths.

### ENG-01 · Seeded runs and one obstacle 'response' table shared by spawner, tips and bot

Part A (done) · engineering · impact 3/5 · effort M

- **What:** Not visible directly, but most later items rely on it. Every run gets a seed: it appears on the game-over line and can be replayed with ?seed=. Gunship volleys become reproducible. Every obstacle type declares in one place how it must be answered (jump, duck, run under, smash, jump-or-smash), so no new hazard can be added without the bot and the tips knowing.
- **How:** 1) Seeds: Obstacles.reset (src/entities/Obstacles.js:301-309) reseeds this.rand with mulberry32(seed) (src/gfx/noise.js:3-11). Game._resetRun picks the seed: random, URL ?seed=, or the daily seed. Use per-spawn streams, mulberry32(hash(seed, spawnIndex)) inside _spawnNext, so an early branch doesn't shift every later spawn. Boss._volley (src/entities/Boss.js:200-206) takes a rand passed to start() instead of Math.random. Math.random stays for cosmetic effects only. Keep this.seed for the bot death log and the stats line. 2) RESPONSE table beside SMASH/TALL/SILENT (Obstacles.js:211-218), for example rock 'jump', tower 'smash', cactus 'jump|smash', ptero 'byHeight', missile 'byHeight|reflect'. byHeight maps PTERO_HEIGHTS (206) to jump, duck or under. _acquire sets o.resp and o.flyer from one FLYERS list. That list replaces isFlyer (208-209), the separate flyer test in _spawnNext (681) and the bot's FLY list (tools/bot.js:6). 3) _prewarm (src/game/Game.js:399-463) loops over Object.keys(obstacles.pools) through a spawnAny(type) dispatcher. Today it indexes temp[14], temp[5] and temp[4] by position (409, 420-423), so inserting a type breaks it and missing types compile mid-run.
- **Risk:** The bot must behave identically before and after: same seed, same outcome. The refactored dispatch must keep a stable RNG call order or the daily breaks.
- **Verify:** The same ?seed in two headless sessions gives the same first 60 spawn types (logged via eval). Bot matrix: 0 deaths before and after. A dev assertion that every pool type was spawned once during prewarm.

### ENG-02 · Bot v2 and a pass/fail test matrix that reaches late loops

Part A (done) · engineering · impact 4/5 · effort M · after ENG-01

- **What:** Indirect but essential: each gameplay part ships only after a smarter autopilot clears every level, view, monster and seed, plus upcoming dailies, with 0 deaths. That includes loop-4 top speeds, which today's 150 s runs never reach.
- **How:** 1) Fast fixed-step sim. Behind a debug-only ?sim=N, Game._loop (src/game/Game.js:1165-1172) runs _update(1/60) N times per frame and renders once. The bot registers g.stepHook = tick, called at the top of every _update, instead of its own requestAnimationFrame (tools/bot.js:8-9), so it still reacts every step. 2) Threat-queue bot that reads o.resp and o.flyer (ENG-01) instead of FLY and the heuristics at bot.js:24-38. For each threat it works out the action window: jump when t < 0.17 and grounded; duck from t < 0.45 until the threat's right edge passes the rear of g.boxes; smash for 'smash' or 'parry' at t < 0.12; run under 'H'. It also handles beam and overhead hazards from boss.warnings by kind and t, keeps the glide logic (43-52), and adds an optional --crystals mode that jumps for arcs when safe, to measure scoring per monster. 3) New tools/botmatrix.mjs runs botrun for levels x views x monsters x seeds, three in parallel, 600 game-seconds each at --sim 4. It exits 1 on any death or save and prints a table: deaths, saves, loops reached, gunship fight durations, smallest gap seen, and draw calls and triangles from renderer.info (autoReset off, reset once per frame so all composer passes are summed). 4) botrun.mjs gains seed, saves, bossTimes and a non-zero exit code (36-38), and package.json gains an npm script test:bot. 5) Fps from sim runs is meaningless, so keep one real-time perf run per level.
- **Risk:** A smarter bot can hide unfairness a human would feel. Keep its reaction windows human-scale (at least 0.12 s) and add an advisory 'human' profile with 80 ms extra latency. A fixed dt of 1/60 is within today's clamp (0.05), so the physics are unchanged.
- **Verify:** Bot v1 and v2 both reach 0 deaths on today's build, and botmatrix exits 0. Temporarily halving minGap makes it exit 1.

### GP-05 · Signature abilities: every monster plays differently

Part G · gameplay · impact 5/5 · effort M · after GP-02

- **What:** Each monster gets one signature move on top of jump, duck, smash and breath, on the existing buttons. Kaiju, NUCLEAR PULSE: hold duck and press breath while the meter is half full or more to blast everything within 6 units, rocks, hedgehogs and shells included, for half a charge. Golden Hydra, WING FLAP: a second jump in mid-air that can clear fuel tanks and basalt pillars; his three gravity beams take 2 hit points off a gunship. Moth Queen, glide plus SCALE STORM: a longer wing-dust beam that sweeps up every crystal it touches. The Monsters panel shows each trait, and a one-time tip teaches it.
- **How:** 1) Monsters.js (src/entities/Monsters.js:8-34) gains trait: { id, name, hint, ... }. Moth Queen's glide moves into it, with m.glide kept as an alias for the bot. 2) New src/game/Traits.js holds a hook table called from Game. In _breath (Game.js:740-757), pulse fires only when 0.5 <= charge < 1 and input.duck is held, so a full meter always fires the beam and the bot never pulses. In _onJump (527-544), a flap needs airborne, airJumpsLeft > 0 and y > 0.6, and sets vy = max(vy, 0.75 * CFG.jumpV); airJumpsLeft resets in the landing branch (1299-1315). In the breath tick (1321-1360), Moth Queen calls a new Crystals.collect(x0, x1, onPick) for crystals inside the beam and gets a per-trait breath duration of 1.6 s (replace the fixed CFG.breathTime reads with this.breathDur). Hydra's boss hit calls boss.hit(2); extend Boss.hit(n = 1) (src/entities/Boss.js:129-141). 3) Pulse: obstacles.inZone(m.x - 3, 0, m.x + 6, 4.5, ...) marks each obstacle dead, calls _explode(o, 15) and crystals.release(o.uid); inZone (src/entities/Obstacles.js:442-452) already includes solids and projectiles. Add an additive expanding RingGeometry tinted by skin.beam (made visible in _prewarm), sparks via _blast, and rig.shake(0.5). 4) _monsterTip (559-563) generalises to trait.hint, with keyboard and touch wording. 5) Score factors (look.score): Kaiju skins unchanged; Hydra 1.15 -> 1.0 because the flap offsets his wide build; Moth Queen stays 0.9 (re-measured in ROST-03). 6) Trait text on the cards in HUD.buildMonsters (src/game/HUD.js:285-319).
- **Risk:** Hitbox heights are untouched and every trait is optional, so the bot's rules hold: it never flaps (it only jumps when grounded) and never pulses (it breathes only at a full meter). Hydra's flap reaches about 5.2, high enough to hit high flyers (3.05-3.38); the tip warns about it. Changing Hydra's x1.15 makes old and new Hydra scores slightly incomparable: do it once, in this part, and note it in the release.
- **Verify:** hitboxes.js unchanged for all three. Bot matrix with kaiju, ghidorah and mothra on 3 levels x 2 views: 0 deaths. Scripted checks: duck+F at 60% charge destroys a rock 5 units ahead and leaves 10% charge; a Hydra flap at the apex reaches y > 4.5; Moth Queen's beam over a crystal line raises crystalsRun.

### GP-06 · Kaiju Rage on demand, and Rage bats missiles back

Part D · gameplay · impact 4/5 · effort M

- **What:** A full rage meter now waits for you: 'RAGE READY · R' pulses on the meter, and a rage button appears on touch screens. Unleash it in a dense stretch to score, or save it for the gunship. During Rage, shells and missiles that touch you are batted back like a perfect smash, so a well-timed Rage can strip several hit points off the gunship. Crystals collected while Rage is ready still score and chain.
- **How:** 1) Game._addRage (src/game/Game.js:865-869): when the meter fills, set this.rageReady = true, play audio.charged() and give HUD.setRage (src/game/HUD.js:116-120) a 'ready' class like the breath meter's. Rage no longer starts on its own. 2) New input action 'rage': KeyR and KeyG in the key map (src/game/Input.js:24-30), plus a fifth touch button with data-act="rage" in index.html #touch-controls .right, shown by a CSS class only while ready. It is bound automatically by Game.js:523. _bindUI: inp.on('rage', () => this._triggerRage()), which calls the existing _startRage (871-879) when rageReady and running. 3) Collision branch (Game.js:1409-1415): during rageT > 0, if hit.smash === 'reflect', call obstacles.reflect(hit, this.speed) (src/entities/Obstacles.js:433-439), _setChain(+2) and audio.reflect() instead of _explode. _updateReflected (1132-1151) then turns it into a gunship hit or a RETURN TO SENDER. 4) One-time tip, and a reminder toast if Rage sits ready for 8 s. 5) tools/bot.js: if (g.rageReady && g.rageT <= 0) g._triggerRage(), the same timing as today's automatic Rage. 6) Update the README section on Kaiju Rage and the title key legend.
- **Risk:** Saving Rage for a boss shortens fights: up to about 3-4 HP over 7 s from reflected missiles. Measure fight times in the matrix and, if they drop too far, cap Rage reflections at 1 HP per volley. The fifth touch button stays hidden until ready so it can't be mis-tapped. Players who never press it lose Rage's benefits, hence the ready pulse and the reminder toast.
- **Verify:** Bot matrix 0 deaths, with the bot triggering Rage as soon as it is ready. Scripted: save Rage, start it during a gunship volley, and confirm boss.hp drops as reflected missiles land. With touch emulation (CDP Emulation.setTouchEmulationEnabled), the rage button appears and works.

### GP-07 · Smash mastery: PERFECT timing, smash chains, sky bites and honest close calls

Part D · gameplay · impact 4/5 · effort M · after GP-02

- **What:** The smash gets a skill ceiling. Snapping the jaws in the last instant before contact scores PERFECT: double points, +2 chain, a heavier freeze-frame and crunch. Breaking several things within 1.5 s pops DOUBLE or TRIPLE SMASH. Biting a pterodactyl or helicopter out of the air is a SKY BITE bonus. Ducking under a flyer counts as CLOSE! only if you ducked late, within about 0.25 s; today every duck pays out automatically, because duck clearance is 0.31-0.34 against a 0.35 threshold.
- **How:** 1) On each press, _smash (src/game/Game.js:759-764) makes one pass over obstacles.active and stamps each obstacle ahead with o.smashLead, its front distance from getMouthWorld. _smashHit (767-806) scores PERFECT when smashLead < 1.2: points x2, _setChain(+2), hitStopT 0.09, audio.crunch(1.4). Smash is checked before collision in the same frame (1401-1409), so a late press is safe. The bot smashes at t < 0.12, about 2.9 units at 24 units/s, so it rarely scores PERFECT. 2) A 1.5 s smashChainT window with a counter shows DOUBLE or TRIPLE SMASH popups, at x1.5 and x2 on that smash. 3) SKY BITE: +50% when !grounded and the target is a flyer. 4) Late ducks: track this.duckT, the time since the duck began, next to the ducking line (1317). Obstacles.collide (src/entities/Obstacles.js:784-799) takes duckT and stores o.duckT0 on the first overlap. _passObstacle (905-917) grants duck close calls only when o.duckT0 < 0.25; jump clearances are unchanged. 5) New stats perfects and smashChains in Progress STATS (src/game/Progress.js:4) for achievements.
- **Risk:** PERFECT adds points: cap it at 2x the base and leave distance score alone so boards don't inflate. Fewer duck close calls means slightly less rage from close calls (Game.js:911), offset by smash rage from GP-02. Collisions are unchanged, so the bot is unaffected.
- **Verify:** Bot matrix 0 deaths. Scripted: a smash pressed with a cactus 0.8 units ahead logs PERFECT, at 3 units it doesn't. Over a run the bot, which ducks early, records 0 duck close calls, while a scripted late duck earns one.

### GP-08 · Gunship 2.0: dodge to charge, a second phase and per-level tactics

Part I · gameplay · impact 4/5 · effort M · after ENG-02

- **What:** Gunship fights stop being 25-50 s of waiting. Every missile you dodge adds 8% breath, so good dodging brings the next beam sooner. At half health the gunship switches to PHASE 2 with a move of its own on each level: the Desert gunship fires its longer mixed volleys early, the City gunship strafes with its chin gun (one burst you duck through), and the Inferno gunship drops mines onto the track (jump them). The war drums speed up.
- **How:** 1) Game._passObstacle (src/game/Game.js:905-917): when o.type is 'missile' and boss.active, charge = min(1, charge + 0.08). The existing full-charge cue (1256-1259) still fires. 2) Boss (src/entities/Boss.js): phase = hp <= maxHp / 2 ? 2 : 1. In phase 2, _volley (200-206) also draws from a per-level move set passed to start(cycle, home, moves), with moves listed per level in LEVELS (bossMoves, src/game/Stages.js:23-42). The Desert uses the full VOLLEYS pool even at cycle 0. 'strafe' queues 4 mid-height bullets 0.14 s apart through a new reflectable 'bullet' pool type (the shell model) with a single warning. 'mines' calls a new ctx.drop(x), which goes to Obstacles.spawnMine: a ground obstacle, box [-0.45, 0, 0.45, 0.5], response 'jump', which falls from the gunship using the meteor flow (_updateMeteor, src/entities/Obstacles.js:411-430) and lands at least 14 units ahead. One attack queue at a time, as the cool timer already enforces (Boss.js:205). 3) Warnings gain kind ('missile' | 'strafe' | 'mine') for the HUD markers and the bot. 4) Faster drums in phase 2 (Audio.setDrums, src/game/Audio.js:433-452: beat 0.21 -> 0.17).
- **Risk:** A strafe is one duck of at most about 0.8 s at mid height, never mixed with a low shot in the same volley. Mines land on screen in 2D, like meteors (Obstacles.js:416). The bot already handles these: bullets are mid flyers it ducks while each is nearest, and mines are ground jumps. Fight lengths must be measured (ENG-02). Gunship cadence by score is unchanged.
- **Verify:** Bot matrix 0 deaths with bossTimes: median fight length drops (targets about 18 s Desert, about 30 s Volcano). 2D screenshots of the strafe and mine telegraphs.

### CT-02 · Supply drops and power-ups

Part H · content · impact 4/5 · effort M · after ENG-02

- **What:** Now and then a parachuted army supply crate lands on the track ahead; its landing spot glows first, like a meteor's. Smash it, burn it or rage through it for its power-up: ATOMIC CORE (breath full), KAIJU SHIELD (survive one hit, shown as a shimmering aura), CRYSTAL MAGNET (8 s), COMBO LOCK (the chain can't break for 10 s) or RAGE SHARD (+50% rage). Jump it to leave it. Each crate shows its icon, so it's a choice, not a lottery.
- **How:** 1) New pool type 'crate' (pools at src/entities/Obstacles.js:233-236; SMASH 15; response 'jump|smash') with a low weight in every stage table. The drop reuses _spawnMeteor and _updateMeteor (387-430): a marker ring tinted by content, a parachuted crate falling for 1 s from 18 + speed units ahead, then a 1.0-high box [-0.6, 0, 0.6, 1.0]. Model: Military rounded boxes with the existing camo material, canopy in the paint material, so no new shader programs. 2) o.content is picked at spawn from a weighted table. Game._smashHit and _explode (src/game/Game.js:767-806, 1050-1056) call this._powerUp(o.content) when a crate dies. 3) Effects: core sets charge = 1. Shield sets this.shield = 1; the collision branch (1409-1415) then treats a hit like Rage does (hit.dead, _explode, graceT 0.8, shield = 0, flash, 'SHIELD!' popup, saves++). Magnet sets magnetT, and Crystals.update uses magnet = max(rageK, magnetT > 0 ? 1 : 0). Combo lock: _missCrystal returns while lockT > 0. Rage shard: _addRage(0.5). 4) New HUD.setPowerups: an icon strip with timers under the meters. 5) New audio powerup() jingle built from _tone (src/game/Audio.js:323-333). 6) No new bot rule (crates are jumpable ground obstacles). botrun reports saves, and botmatrix fails on any.
- **Risk:** Shields soften deaths, so the bot gate must count saves as failures. Power-ups raise scores slightly: keep shields rare (at most about one a minute) and leave them out of the daily unless the modifier calls for them. Drops must follow the meteor rule of landing on screen in 2D (about 18 units ahead, Obstacles.js:416).
- **Verify:** Bot matrix: 0 deaths and 0 saves. Scripted: spawn one crate of each kind via eval and smash it; the shield absorbs exactly one hit. Screenshots of a falling crate and the icon strip in 2D and 3D.

### META-01 · Achievements and feats that unlock the film roster

Part J · content · impact 4/5 · effort M

- **What:** A Trophies list in the Monsters panel holds about 30 achievements. Some are lifetime goals (5 gunships, 500 crystals, 200 smashes); others are one-run feats: return a shell to its tank, clear loop 1 without the breath, reach x5, 10 close calls in one run, down a gunship using only reflected missiles, score 15,000 in one Night City run. Every monster's unlock becomes an achievement, as the owner wants, so collecting the roster becomes a trophy hunt. The game-over screen shows the trophy you are closest to.
- **How:** 1) New src/game/Achievements.js: ACHIEVEMENTS = [{ id, name, desc, kind: 'life' | 'run', test(stats, run), reward: { monster } }]. 2) Game._die (src/game/Game.js:603-640) builds a run record from the existing counters (score, level.id, smashes, crystalsRun, bestMult, bossesDowned, stages.number) plus new per-run counters (reflects, closeCallsRun, breathsUsed, perfects), incremented where progress.add already runs. It then calls achievements.check(progress, run). 3) Old-client-safe storage: earned achievements go into progress.unlocked as 'a:<id>' strings. Older clients keep unknown string ids (src/game/Progress.js:19) and write them back, so nothing is lost. New lifetime stats (reflects, perfects, distance, dailies, missions, x5Runs, bestL1-bestL3) are appended to STATS (Progress.js:4). Make merge and toJSON keep unknown stat keys from now on, so future stats survive. 4) Monster goals in Monsters.js become { ach: 'gunshipAce' }, and Progress.progressOf and check (43-60) read the achievement. Existing unlocks stay because their ids are already stored. Crab Demon's 'one Night City run' goal reads bestL2. 5) Save progress on pagehide and visibilitychange too, not only at death (Game.js:620-625). 6) Feedback: banner, toast and charged() at game over (626-631), through the UI's queued notifier. A trophies tab follows the renderMonsters pattern (src/game/HUD.js:322-338).
- **Risk:** Keep the shape of the progress blob ({stats, unlocked}). Never rename stats; merge by max and union only. Achievements must never depend on leaderboard rank, because scores are client-reported. Already-earned unlocks must stay earned: test with a seeded old dragon.progress.
- **Verify:** Load an old-format dragon.progress plus a mock-claude row with progress (tools/mock-claude.js): unlocks survive, and new 'a:' ids round-trip through syncProgress (check window.__mockWrites). Scripted runs trigger three feats. Bot matrix unaffected.

### ONB-01 · Kaiju Bootcamp: a guided first run, and tips that stay learned

Part F · polish · impact 4/5 · effort M · after ENG-01

- **What:** A player's very first run, on the Desert, opens with a 45-second guided stretch: one cactus with 'SPACE / TAP to jump' as time slows near it, then a pair, a mid-height pterodactyl to duck, a high one to run under, a watchtower to SMASH, a crystal arc, and a cluster to burn with the breath. Mistakes in Bootcamp don't end the run: the obstacle breaks with an 'Again!' and comes back. Then the real level begins. Tips are remembered across visits, so returning players aren't nagged.
- **How:** 1) Persist this.tips (src/game/Game.js:136) in localStorage 'dragon.tips' through the store helper (78-81); _tip (821-825) saves on each new tip. 2) Spawn queue: Obstacles gains this.queue = [], which _spawnNext (src/entities/Obstacles.js:640-700) drains before calling _pickType; GP-09 reuses the same queue. Script entries look like { type, y, gapK, prompt: 'jump' | 'duck' | 'under' | 'smash' | 'breath', crystals: 'arc' }. 3) Stages accepts a one-run list override: a 'bootcamp' STAGE (length 380) placed before the Desert stages when progress.stats.runs === 0 and 'dragon.tutorial' isn't set. The first run is forced onto the Desert. 4) Prompts: when a prompted obstacle's front is 6 + 0.35 * speed units ahead, a tutorial time scale (0.3, alongside the slowT path at Game.js:1207-1210) holds until the matching action fires (_onJump, input.duck, _smash, _breath) or 3 s pass. A large prompt sits above the track, with keyboard or touch wording. 5) In Bootcamp a collision explodes the obstacle, as Rage does (1411-1414), and re-queues a copy with 'Again!'. Charge is set to 1 before the breath step. 6) Score and stats reset when the real stage 1 starts, so Bootcamp never posts. 7) botrun setup marks the tutorial done so the matrix skips it.
- **Risk:** Bootcamp must never post a score or count toward unlocks. Prompts must not cover the obstacle in 2D. A fresh browser profile (as the bot uses) must not get stuck in Bootcamp, so the skip flag goes into botrun.
- **Verify:** Fresh-profile CDP run with scripted presses at each prompt completes Bootcamp; a run that ignores every prompt doesn't die; a second visit repeats no tips; bot matrix (Bootcamp skipped) at 0 deaths.

### MODE-01 · Daily Challenge: one seeded run a day for the whole company

Part J · content · impact 4/5 · effort M · after ENG-01, ENG-02

- **What:** A DAILY card on the title shows today's level, a featured monster (often a locked one, so everyone can try Moth Queen or Storm Wing for a day) and a modifier: Meteor Storm, Night Run, Turbo Start, Hedgehog Alley, or Glass Cannon (breath charges twice as fast, no Rage). Everyone gets the same obstacle sequence, with unlimited attempts; the best counts on a Daily board that resets at 00:00 UTC. Playing 7 days earns an achievement.
- **How:** 1) dayId = Math.floor(Date.now() / 864e5) (UTC). The daily's level, monster and modifier rotate by dayId; seed = hash(dayId), using ENG-01's per-spawn streams. 2) Modifiers are data over existing knobs (CFG overrides, LEVELS fields such as pace, breath, rageCrystals and time, and TABLES weights), applied in _resetRun. Meteor Storm adds ['meteor', 14] to every table; Night Run sets time 0.75; Glass Cannon sets breath 2 and rageCrystals to Infinity. 3) Leaderboard: new field 'daily' storing dayId * 1e6 + score. Score is capped at 999,999 (MAX_SCORE, src/game/Leaderboard.js:6), so values stay near 2.1e10, exact in doubles. orderBy('daily', 'desc').limit(50) puts today first with no where() needed. Add a per-field decode (today's day ? v % 1e6 : 0) to the rows loop (Leaderboard.js:58-61, which today clamps to MAX_SCORE and would destroy the encoding) and to myBest. Writing the daily score sends only { daily } via update(). Subscribe to 'daily' only while the Daily card or tab is open. 4) A locked featured monster is selected the way the owner preview works (selectMonster(id, true), src/game/Game.js:240-260), for daily runs only. 5) New stat 'dailies', counted once per dayId. 6) botrun gains --daily <dayId>; the publish checklist runs the next 7 dailies through botmatrix.
- **Risk:** Data safety: the submit fallback to set() (Leaderboard.js:172, also 146) can wipe best/l2/l3/progress if the own-row read failed. Make it re-read the row before any set() and use update() for 'daily'. Fairness: every modifier must pass the bot for the next 7 days before publishing. The flyer odds depend on the view, so 2D and 3D players get the same seed but not identical sequences; say 'same seed' in the UI. A run started before midnight UTC posts to the day it started.
- **Verify:** Mock leaderboard with rows from yesterday and today: today sorts correctly, yesterday's rows are hidden, and __mockWrites never touches other fields. The same dayId gives the same first 60 spawns in two browsers. botmatrix --daily for the next 7 days: 0 deaths.

### GP-09 · Authored patterns, set pieces and a pacing director

Part H · gameplay · impact 5/5 · effort L · after ENG-01, ENG-02

- **What:** Runs gain rhythm and memorable moments instead of one random obstacle at a time. Waves build to a peak, then ease into a short breather with a long crystal line. Each stage has signature set pieces: Desert 'staircase' clusters; Army 'checkpoint' (hedgehog, tower, hedgehog) and a tank 'convoy'; a City 'traffic jam' smashed in one bite and 'block buster' rows of buildings; Ashlands 'meteor shower' and 'lava hopscotch'; the Inferno 'fortress gate'. There is a crescendo before every gunship, and a 6-second CRYSTAL RUSH (crystal rivers and crates, no hazards) after each one falls.
- **How:** 1) New src/game/Patterns.js. PATTERNS[stageKey] = [{ id, weight, minCycle, minDist, items: [{ type, n, y: 'L' | 'M' | 'H', gapK, crystals, shooter }] }]. TEMPO = [['warm', 8], ['wave', 18], ['breather', 6], ['wave', 18], ['peak', 10]] in seconds, with gapK and pattern odds per phase. 2) _spawnNext (src/entities/Obstacles.js:640-700) drains the queue (from ONB-01, or added here) first. It passes the forced height index to _spawnPtero/_spawnHeli (507-531) and sets nextGap = minGap * gapK inside patterns. Every gapK is at least 1, which keeps the existing minGap guarantee (694-698); the flyer push-back (687) and the shooter clear-track rule (650-662) still apply. Breathers lay ground crystal lines (the 724-727 branch) on gaps 2.2x the minimum. 3) 'carJam' is one obstacle record holding 2-3 cars and their boxes, the way cactus clusters work (_spawnCactus, 462-490). Its response is 'smash', because at City speeds a jump clears only about 0.586 * speed - 3.8 units of a 1.15-high obstacle. One smash covers it: the zone spans 3 + 1.4 + 0.45 * speed units. Popup 'TRAFFIC JAM xN'. 4) Crescendo: Stages.update (src/game/Stages.js:83-95) exposes the distance to the next boss stage, and the director runs 'peak' for the last 10 s. 5) A 'bonus' STAGE (length 120) inserted by _afterBoss (src/game/Game.js:1153-1162) uses crates and long crystal lines. 6) New tools/patterns-check.mjs (node, no browser) asserts for every pattern, speeds 11-58, hard 0 and 1 and every tight value, that each gap is at least minGap and no 'H' flyer overlaps a jump arc. 7) The bot treats resp 'smash' like tall obstacles (extend smashIt, tools/bot.js:32-34).
- **Risk:** Patterns never go below minGap, but 'smash' groups are new mandatory smashes: the bot rule and a 'SMASH through it' tip must ship with them. Crystal arcs still assume the spawn-time speed (Obstacles.js:707-710). The bonus stage gives everyone the same extra points.
- **Verify:** patterns-check passes; botmatrix (levels x views x monsters x 5 seeds x 600 s fast sim) at 0 deaths; 2D screenshots of each set piece; a log of tempo phases per run.

### ROST-01 · Storm Wing, the fire pteranodon, with SONIC DIVE (roadmap part 3)

Part G · content · impact 5/5 · effort L · after GP-05

- **What:** Storm Wing unlocks when you down your first gunship. He skims along on bird legs and beats huge membrane wings. His signature is the SONIC DIVE: press duck in mid-air to plunge, and the sonic boom on landing shatters smashable things just ahead. His breath is a red-orange heat beam and his cry a high screech.
- **How:** Follow docs/ROADMAP.md:38 with Moth.js as the template. New src/entities/StormWing.js implements the Dragon interface (group, update, getHitboxes, getMouthWorld, getSideMouths, setGlow, setRage, setSkin, glowColor, hitX, roar, onFootstep, flyer, onWingbeat). It uses membrane wings from Hydra's _wingGeometry in Dragon.js, a beaked head and 2-bone IK bird legs. Anchors are tuned with tools/hitboxes.js against the Kaiju: run top about 2.40, duck top about 1.49, air bottom about 0.33. Monsters.js entry: model 'stormwing', voice 1.6, look with beam colours and hitX 1.0, trait { id: 'dive' } in Traits.js (GP-05). While airborne with duck held, gravity is x4.2 instead of fastFall's x2.8 (src/game/Game.js:1290). A landing within 0.4 s of a dive runs obstacles.inZone(m.x - 1, 0, m.x + 4.5, 2.5) and breaks non-tall smashables through _smashHit, with shake and a dust ring. Game.selectMonster's ternary (245) becomes a factory map { dragon, moth, stormwing }. Card art goes in HUD.buildMonsters (src/game/HUD.js:286-290); goal: 1 gunship (achievement 'firstBlood').
- **Risk:** Hitbox parity must hold to within a few hundredths. The dive is optional and only breaks non-tall smashables, so gap fairness is unchanged. The bot fast-falls only when it ducks a mid flyer while airborne, which a dive makes safer. Score factor 1.0.
- **Verify:** hitboxes.js comparison against the Kaiju; botmatrix with stormwing (3 levels x 2 views x seeds) at 0 deaths; scripted dive over a cactus pair breaks the second; screenshots in 2D and 3D, day and night.

### CT-03 · New obstacle families with new mechanics

Part H · content · impact 4/5 · effort L · after ENG-01, ENG-02, GP-03

- **What:** Each level gets hazards that behave differently, not just new skins: jeeps that drive at you (Army, Siege), tumbleweeds bouncing across the Desert, rolling boulders in the Ashlands (too solid to smash: jump them), a city footbridge at head height (duck under or smash through), artillery barrages at the Army outpost (marked spots, falling shells, scorched craters), and gunner helicopters that hover high and fire one telegraphed shot. Each arrives with a one-time tip.
- **How:** Each type follows the extension path in src/entities/Obstacles.js: pool (233-236); SMASH/TALL/SILENT and RESPONSE (211-218); a spawn method built like _spawnStructure/_spawnPillar (341-409) with _model (454-460); dispatch in _spawnNext (666-680); per-frame behaviour in update (601-604); TABLES weights gated by minCycle (GP-03). In src/game/Game.js: DEB colours (810-814), _checkTips (828-837), and the pool-driven prewarm (ENG-01). Movers: jeep (vx 4-6, box [-1.1, 0, 1.1, 1.1], smash 20); tumbleweed (vx 2-4, y = 0.35 * abs(sin 5t), box height 0.9, smash 5); boulder (vx 3-5, rolls, solid). The flyer push-back (687) extends to any o.vx > 0, so a mover never eats into the gap ahead of it. Footbridge: box [-2.0, 1.80, 2.0, 2.7], with its one pylon at z = -6 behind the track so 2D reads it as hanging rather than a wall; response 'duck|smash', smash 50. Artillery: 'shellDrop' reuses the meteor flow (387-430) with an amber marker, a falling shell, _blast and a 0.35-high scorch crater. Gunner heli: always at 'H' height; fires one shell via spawnShell (550-563) after a 0.75 s warning, gated by the shooter clear-track rule (650-662). Models in Military.js and Volcano.js use the existing camo, paint and basalt materials. Bot: movers already work through t = front / (v + vx) (tools/bot.js:29); overhead hazards use response 'duck' (duck until the right edge passes the rear box, ENG-02); drops behave like meteors.
- **Risk:** Overhead hazards keep their bottom (1.80) above the duck top (about 1.49), like mid flyers. Movers raise closing speed: cap vx so speed + vx never exceeds today's 3D Rage maximum for the same loop. Drops land on screen in 2D. Every type needs a bot rule and 600 s matrix coverage.
- **Verify:** patterns-check covers movers. botmatrix at 0 deaths with each type forced to 3x weight via a debug flag. 2D screenshots of every type, day and night.

### MODE-02 · World Tour: Desert to City to Volcano in one run

Part J · content · impact 4/5 · effort L · after CT-01

- **What:** A WORLD TOUR card: one endless run through all three worlds. The Desert outpost gives way to a highway rolling into Night City, the siege ends with the city gunship, then the road turns to ash and lava for the Volcano Fortress. Then it loops, faster each time, on its own board.
- **How:** 1) New LEVELS entry { id: 'tour', field: 'tour', stages: [desert, army, boss, city, siege, cityBoss, ashlands, inferno, volcanoBoss] }, where each STAGE carries a biome, a time and rule overrides (pace, tight, breath, bossCharge, rageCrystals). Game resolves this.rules = { ...level, ...stage.rules } in _enterStage, and every read of this.level.pace, tight, breath, bossCharge, rageCrystals, biome and time moves to this.rules (src/game/Game.js:207, 571, 885, 911, 1086, 1094, 1183, 1221, 1254, 1467, 1475; Obstacles.levelTight at 203). 2) Biome transition in _enterStage. env.setBiome(b, false) eases the sky (src/world/Environment.js:305-312). city.setActive(b === 'city') rolls the city in. volcano.setActive places the mountains at x + 600 so they scroll in instead of appearing. The terrain's uAsh target follows the current biome (Game.js:1467). scenery.setBiome is applied behind a dust-storm burst at the stage banner so the instant decor swap doesn't show. 3) Boss livery and name come from the stage, not level.id (207, 1102). 4) Local best key 'dragon.hi.tour' (derived automatically, Game.js:103). Add 'tour' to BOARD_FIELDS with a lazy subscription. The title gets a mode row: HUD.buildLevels (src/game/HUD.js:250-281) assumes at most 3 stars, so modes show an icon instead.
- **Risk:** New field 'tour', written with update() only. Moving level knobs into this.rules touches many reads, so L1-L3 must give identical bot results before and after. Scenery pops are possible: hide them behind the dust burst or the boss slow-motion.
- **Verify:** botmatrix on 'tour' in 2D and 3D through 3 full rotations (fast sim): 0 deaths. Screenshots at each transition. Mock leaderboard: a write changes only {tour, at, view, stage}.

### META-02 · Missions, Kaiju XP and monster mastery looks

Part J · content · impact 4/5 · effort L · after META-01

- **What:** Three active missions at a time, such as 'Smash 3 tanks in one run', 'Reflect 2 missiles', 'Reach x4 on Night City' or 'Burn 5 things with one breath'. Finishing one pays XP toward your Kaiju Level and rolls a new mission. Playing a monster builds its mastery and unlocks looks for it: Hydra's silver 'Grand King' and crimson 'Keizer', Moth Queen's 'Rainbow' and 'Armor', Storm Wing's 'Fire', and new Kaiju skins at Kaiju Levels 10 and 20. Looks never change the build or the hitbox.
- **How:** 1) New src/game/Missions.js: about 40 templates { id, text, event, need, tier, scope: 'run' | 'life' }. The three slots live in localStorage 'dragon.missions' (this device only). Completions count in a 'missions' stat and XP in an 'xp' stat, both in Progress STATS and max-merged, so they only grow. A single this._event(name, n) helper at the existing hook sites (src/game/Game.js:621-622, 789, 872, 883, 915, 1117) feeds progress, missions and achievements. 2) Mastery: 'm_<id>' stats (XP earned with that monster). Monsters.js gains looks: [{ id, name, need, look }]; each look keeps its base look's hitX and score (assert this in code). _applyLook (231-237) applies the chosen look, saved in 'dragon.look.<monster>'. Existing Kaiju skins stay free; new Kaiju skins are mastery rewards. 3) UI: a mission strip on the title and game-over cards, a 'mission complete' toast during runs, and an XP bar at game over.
- **Risk:** Mission slots are device-local by design, so merging is safe. XP and mastery are max-merged, so playing on two devices at the same time undercounts; document it. No mission may reward unfair play or dying.
- **Verify:** A node test feeds a scripted event list and checks mission progress. mock-claude progress round-trip. Screenshots. Bot matrix unaffected (no gameplay change).

### BOSS-01 · Boss framework and MECHA-KAIJU, a ground boss for Night City

Part I · content · impact 5/5 · effort XL · after ENG-02, GP-08

- **What:** Night City's finale becomes a duel. A silver Mecha-Kaiju-style machine hover-skates backwards ahead of you on thrusters. It fires finger missiles (jump or duck; reflectable), stomps out ground shockwaves (jump), and sweeps an eye beam at head height (duck through it). Telegraphed by red eyes and a SMASH! marker, it charges at you: smash it as it arrives to parry for a hit point and knock it back. Breath, reflected missiles and parries all hurt it. It alternates with the City gunship from loop 2.
- **How:** 1) Framework: Boss.js becomes Gunship extends BossBase, which holds the state machine, hp, hit(n), box(out), warnings [{x, y, t, kind}], the attack queue, setLivery and title(level, n). Game keeps this.bosses = { gunship, mecha } and sets this.boss = this.bosses[id] in _enterStage (src/game/Game.js:1059-1073), where id is the stage's bossIds alternating with bossesSeen (cityBoss at src/game/Stages.js:10 gets bossIds ['mecha', 'gunship']). The _updateBoss context (1090-1101) gains spawnShock(x, closing) and spawnBeam(y, x0, x1, life) beside fire(). _prewarm shows every boss (426-427). 2) Model: a second Dragon (src/entities/Dragon.js, variant 'kaiju') in the Mecha skin (src/entities/Skins.js:39-43), plus boss-only rigid add-ons (shoulder pods, back thrusters with additive flames). It is turned to face -x and animated with Dragon.update in its air pose, so no foot planting. 3) Every attack goes through obstacles.active, so collisions, close calls and the bot work unchanged. Missiles use spawnMissile (src/entities/Obstacles.js:566-581). Shock: a ground projectile 'shock', box [-0.6, 0, 0.6, 0.6], closing at 22 units/s, response 'jump'. Beam: type 'beam', box at y 1.80-2.10 spanning x 2-14, vx = -speed so it holds still relative to you, life 0.7 s, response 'duck', after a 0.9 s 'beam' warning. Charge: the boss body becomes an obstacle 'mechaCharge' (tall, smash 'parry') that dashes from x 14 to 4.5 in 0.45 s after a 1.0 s 'charge' warning. _smashHit handles 'parry': boss.hit(1), knockback, 'PARRY!' popup, hitStop 0.09. HP 6 + gunships downed. Only one attack runs at a time, as Boss._volley already ensures (src/entities/Boss.js:200-206). 4) Bot: smash when kind is 'parry' and t < 0.12; duck while a beam exists or a 'beam' warning has t < 0.35; shocks are ground jumps. 5) A new HUD warning marker style, 'smash'.
- **Risk:** Every attack is telegraphed for at least 0.9 s, uses only L or M heights, and never overlaps another. The beam fills the head region, so the duck must already be held: the warning and charge-up sound are essential. The parry is mandatory unless the breath is ready, so its window must be generous (any press in the last 0.5 s before contact). Boss points stay 500 x multiplier. Ship only with the bot rules in place.
- **Verify:** botmatrix on L2 in 2D and 3D with every monster and several seeds: 0 deaths, fight time 25-45 s. Scripted parry test. 2D screenshots of each telegraph. Fps of at least 60 during the fight on High on the Arc 140T.

### MODE-03 · Boss Rush

Part J · content · impact 3/5 · effort M · after BOSS-01, MODE-02, GP-09

- **What:** A BOSS RUSH card: every boss back to back (Gunship, Mecha-Kaiju, Inferno Gunship, Storm Wing, and later bosses as they arrive), each tougher than the last, with a 6-second Crystal Rush between them to refill. Fast kills earn a time bonus. It has its own board.
- **How:** New LEVELS entry { id: 'rush', field: 'rush', stages: [bonus, bossA, bonus, bossB, ...] }, using the bossIds from BOSS-01 and the per-stage biome and rules from MODE-02 (this.rules). The breath starts full; between bosses it refills during the bonus stage (GP-09). Time bonus in _bossHit (src/game/Game.js:1107-1129): max(0, 60 - fightTime) * 20 * mult. Board field 'rush', written with update() only; local best 'dragon.hi.rush'.
- **Risk:** New field 'rush'. Each boss must be bot-cleared at the higher cycles the rush reaches.
- **Verify:** botmatrix on 'rush' in 2D and 3D through 2 full rotations (fast sim): 0 deaths.

### BOSS-02 · STORM WING boss for the Volcano Fortress

Part K · content · impact 4/5 · effort L · after BOSS-01, ROST-01

- **What:** The Inferno stage ends with Storm Wing bursting out of the volcano. He circles, then dive-bombs across the track at jump or duck height (smash him as he passes to parry), sends sonic booms along the ground (jump), and spits fireball volleys. Defeating him 3 times also unlocks him, for players who haven't downed a gunship yet.
- **How:** StormWingBoss extends BossBase and uses ROST-01's Storm Wing model at 1.4x scale with a hotter tint. A dive is a flyer obstacle 'stormDive' whose height ty (L or M) is locked at least 1.0 s before arrival; the bot already reads o.ty (tools/bot.js:30). Dives take smash 'parry'. Booms are 'shock' obstacles; fireballs are spawnMissile with a hot material. The volcanoBoss stage gets bossIds ['stormwing', 'gunship']. Add an achievement for the alternative unlock. Bot: the BOSS-01 rules plus duck or jump by ty.
- **Risk:** A dive must lock its height early, never changing late, so it reads in 2D. The alternative unlock only adds a route; the existing goal stays.
- **Verify:** botmatrix on L3 with every view, monster and several seeds: 0 deaths. 2D screenshots of the dive telegraphs.

### ROST-02 · Hook Raptor (BUZZSAW) and Crab Demon (RE-FORM), roadmap part 4

Part K · content · impact 5/5 · effort XL · after GP-05, META-01

- **What:** Hook Raptor, the cyborg with hook arms and a visor, has a BUZZSAW smash that cuts through boulders and steel hedgehogs and reaches farther. Crab Demon, the horned and winged demon, can RE-FORM: the first hit in each stage bursts him into a swarm that re-forms a second later instead of ending the run. That safety net scores x0.85.
- **How:** Both are Dragon rig variants, built the way _buildGhidorah is (src/entities/Dragon.js:473-549). 'hookraptor': visor, hook arms parented to the arm bones, a dorsal fin row, a buzzsaw on the chest. 'crabdemon': horn, membrane wings via _wingGeometry, a tail pincer. Traits.js: buzzsaw lets _smashHit (src/game/Game.js:778-785) break solids (rock and hedgehog, 15 points each) when trait.breaksSolid is set, scales the reach x1.35 in the smash zone (1405-1406), and cuts the whiff cooldown to 0.25 s. Re-form: the collision branch (1409-1415) uses up this.reformsLeft (reset per stage in _enterStage), explodes the obstacle, gives 1.2 s of graceT with a flicker and swarm particles, and counts a save. Goals: Hook Raptor 200 smashes; Crab Demon 15,000 in one Night City run (bestL2, META-01). Bot: no new rule; botmatrix counts Crab Demon's saves as failures.
- **Risk:** Both need hitbox parity. Hook Raptor's longer reach scores more, so his factor is 0.95. Re-form must not apply in Bootcamp, or in the daily unless he is the featured monster.
- **Verify:** hitboxes.js for both; botmatrix (3 levels x 2 views x seeds) with 0 deaths and 0 saves; scripted: Hook Raptor's smash breaks a rock; Crab Demon survives one hit, then dies on the next in the same stage.

### ROST-03 · Crystal Titan (CRYSTAL FIELD) and the roster balance pass, roadmap part 5

Part K · content · impact 4/5 · effort L · after ROST-02, ENG-02

- **What:** Crystal Titan, with crystal spires on his shoulders and a crystal breath, turns destruction into combo: everything his beam burns leaves crystals on the ground, and his Rage magnet reaches twice as far. Then every monster's score factor is balanced so the choice changes your style, not your rank.
- **How:** Dragon variant 'crystaltitan', with crystal spires as rigid meshes in the Crystals material (src/entities/Crystals.js:11-13). Trait crystalField: the breath kill loop (src/game/Game.js:1335-1340) calls crystals.add(o.x + k, 1.0) for k = -0.6 and +0.6, within the 96-crystal cap. Its magnet range is 18 instead of 9 (Crystals.js:49). Goal: 10 Rages. Balance: botmatrix --crystals (ENG-02) measures points per minute for each monster on each level; set look.score so every monster's median is within ±5% of the Kaiju Classic, and record the factors in the README's Monsters table.
- **Risk:** Crystal breath inflates scores, so his factor (about 0.9) comes from measurement. Rebalancing makes old and new scores less comparable, once; announce it.
- **Verify:** hitboxes.js; botmatrix 0 deaths; the crystals-mode score table before and after balancing.

### LVL-01 · Level 4: Monster Island

Part L · content · impact 5/5 · effort XL · after BOSS-01, CT-03, GP-09, ROST-02

- **What:** A fourth level where the obstacles are kaiju. Anguirus curls into a spiked ball and rolls at you (jump; too solid to smash). Kumonga drops on a silk thread to head height (duck) or all the way down (jump, or smash the web). Kamacuras mantises swoop in and lock to jump or duck height. Giant Moth Queen eggs can be smashed for a burst of crystals, jungle trees must be smashed, and tar pits jumped. Stages: Jungle Run, then Spider Nest, then a rival-kaiju duel. It has its own board.
- **How:** New LEVELS entry { id: 4, name: 'MONSTER ISLAND', field: 'l4', biome: 'island', pace 1.18, tight 1, breath 0.8, bossCharge 0.65, rageCrystals 60, stages: [jungle, nest, islandBoss] }. New types: 'anguirus' (mover, response 'jump', clangs); 'kumonga' (meteor-style drop with a thread marker, final height L or M locked 1.0 s before arrival, response 'byHeight', smash 30); 'kamacuras' (flyer with an early-locked ty); 'egg' (smash 20 plus a crystal burst via crystals.add); 'tree' (tall, smash 40); 'tar' (silent, low, jump). Models from geometry.js blob, sweep and mergeLoose (src/gfx/geometry.js:17-185) with vertex colours and existing materials. Biome: an 'island' branch in Environment.setBiome, a moss and black-sand terrain uniform, and palm and fern Scenery layers via _layer (src/world/Scenery.js:133-167). Boss: the BOSS-01 framework with a rival kaiju on Hook Raptor's rig from ROST-02. Also: 'l4' in BOARD_FIELDS (lazy subscription), local key 'dragon.hi.4', Digit4 in the key map (Game.js:484 binds levelN for every entry), the star display generalised (src/game/HUD.js:256), and boss name and livery taken from the stage.
- **Risk:** New field 'l4', written with update() only, and the title must fit 4 level cards. Every new type needs bot rules and 600 s matrix coverage, and heights stay on the L/M/H grid. Kaiju that appear here as obstacles become playable later (ROST-04), which serves the owner's 'every film monster' goal.
- **Verify:** botmatrix on L4 with every view, monster and several seeds: 0 deaths. 2D readability screenshots at day and dusk. Fps of at least 60 on High on the Arc 140T. Mock leaderboard writes touch only l4.

### ROST-04 · The film roster pipeline: Anguirus, Battra, King Caesar, Jet Jaguar and beyond

Part L · content · impact 4/5 · effort XL · after ROST-03, META-01

- **What:** After part 5, new monsters arrive in batches, each with its own trait and achievement. Anguirus: SPIKED ROLL (hold duck while running to roll through low smashables). Battra: PRISM BEAM (the breath bats every projectile it touches back at the boss). King Caesar: MIRROR EYES (reflects the first shell or missile that would hit you, every 15 s). Jet Jaguar: SIZE UP (Rage lasts 10 s). After those: Baragon, Kumonga, Megalon, Titanosaurus, Biollante, Hedorah, Ebirah and Kamacuras.
- **How:** Each monster is a kit: a model (a Dragon variant, or a flyer class following Moth.js), a trait from the Traits.js library (new hooks only when needed), an achievement goal on the new stats (for example Battra: 25 reflects; King Caesar: 150 close calls; Jet Jaguar: 25 missions; Anguirus: 7 dailies), card art, hitbox parity, and a score factor measured with the crystals-mode matrix. Each batch is one roadmap part with the usual build, bot and publish loop.
- **Risk:** Trait creep: one optional trait per monster, never changing hitbox heights. Traits that prevent deaths (reflects, the roll) get a score factor below 1 and count as saves in the matrix.
- **Verify:** Per monster: hitboxes.js, botmatrix with 0 deaths and 0 saves, screenshots.

### LVL-02 · Level 5: Tokyo Bay

Part L · content · impact 4/5 · effort XL · after BOSS-01, CT-03, MODE-02

- **What:** the atomic lizard's home turf: a sunrise run along the harbour piers. Shipping containers (single: jump; stacked: smash), harbour cranes (smash), forklifts that drive at you, tsunami crests rolling across the quay (jump them), and destroyers offshore whose shells land on marked spots, visible on the water in 3D. The boss is the SUPER-X flying fortress: it fires cadmium missiles you can reflect, and raises a mirror shield that bounces your breath unless you fire while the shield recharges.
- **How:** Same path as LVL-01: LEVELS { id: 5, field: 'l5', biome: 'harbour' }. New types: container, containerStack, crane, forklift (mover), wave crest (a ground 'shock' projectile) and naval shell (the meteor flow). A cheap planar water shader for the bay (no reflections on Low), Scenery layers for bollards and lamp posts, and a SuperX boss on BossBase with a shield-window state machine that exposes boss.vulnerable to the bot and the breath aim.
- **Risk:** The breath-bouncing shield must read clearly. The bot's breath-at-boss rule must wait for boss.vulnerable, or fights stall. New field 'l5', written with update() only.
- **Verify:** As for LVL-01: botmatrix on L5 at 0 deaths, 2D readability screenshots, fps on the Arc 140T, and mock leaderboard writes.
