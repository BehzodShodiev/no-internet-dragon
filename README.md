# No Internet Dragon

A realistic take on Chrome's offline dino game. A Godzilla-style dragon runs, jumps, ducks and smashes its way through three levels (a desert army outpost, a city at night and a volcano fortress), each ending in a gunship fight. You can switch between the classic side-scrolling **2D** view and a third-person **3D** view at any moment, even mid-run.

Everything is generated in code: the creature, textures, terrain, sky and sound. The game downloads no assets and plays fully offline.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | Output |
| --- | --- |
| `npm run build` | `dist/`: static site with a service worker, so after one visit it also works with no connection |
| `npm run build:single` | `dist-single/index.html`: one self-contained file (about 200 KB gzipped) you can double-click with no server and no internet |
| `npm run preview` | serves `dist/` locally |

The game needs a browser with WebGL 2 (any current Chrome, Edge, Firefox or Safari).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Jump (hold for higher; as Mothra, keep holding to glide) | `Space` / `↑` / `W` | tap, or the ↑ button |
| Smash | `→` / `D` / `E` | claw button |
| Duck / fast-fall | `↓` / `S` | swipe down, or the ↓ button |
| Atomic breath (when the meter is full) | `F` / `X` / `Shift` | flame button |
| Switch 2D / 3D | `V` / `C` | 2D/3D toggle (top left) |
| Pause | `P` / `Esc` | pause button |
| Mute | `M` | speaker button |
| Graphics quality | `Q` | quality button |
| Company leaderboard | `L` | trophy button |
| Pick a level (title / game over) | `1` `2` `3`, or `←` `→` on the title | level cards / buttons |
| Pick a skin (title / game over) | `K` | colour swatches |
| Monsters panel (title / game over) | `B` | Monster button |

The rules follow Chrome's game. The speed ramps up over about two minutes. Pterodactyls appear after 250 points of distance at three heights: jump the low ones, duck the middle ones, run under the high ones. Every 100 points of distance beeps, and the high score is saved. Godzilla's breath is the core addition: every run starts with the meter mostly full, it fills as you run (70 points of distance for a full charge), and when it's full it clears everything in front of you for bonus points. Pressing it early shows how far along the charge is. (Distance points are the score before the combo multiplier described below.)

The two views play differently. In 2D you see about 20 units of track ahead, like Chrome. The 3D camera sees six times further, so 3D makes up for it: the world runs 20% faster and speeds up 1.5× quicker, obstacles come in tighter sequences, and pterodactyls arrive from 120 points and three times as often. The breath charges at the same rate in both views. Switching views mid-run eases between the two rule sets, and since points come from distance, 3D scores faster.

## Kaiju Rampage

On top of the Chrome rules, each run has goals, a power-up and set pieces:

- **Smash.** A jaws-first lunge that breaks most things just ahead of the snout: cacti, tanks, helicopters, cars, watchtowers, fuel tanks and buildings, each for points and combo, with a freeze-frame and flying debris. Boulders and steel anti-tank "hedgehogs" are too solid (they clang), so jump those. Watchtowers, fuel tanks and buildings are too tall to jump, so smash them or burn them with the breath. The jaws stay dangerous for 0.45 s and reach 3 units ahead, so the timing is forgiving, but a smash that hits nothing has a longer cooldown, so mashing the key is a gamble. Smash a shell or missile just before it hits and it flies back: a reflected shell destroys the tank that fired it, and a reflected missile damages the gunship.
- **Radiation crystals and combos.** Crystals are laid along the arc of a full jump over obstacles, in lines you collect just by running, and in high trios that are worth an extra jump if there's room. Every crystal, every obstacle cleared and every close call adds to a combo chain. The multiplier rises to ×2 at 10, ×3 at 30, ×4 at 60 and ×5 at 100, and applies to every point you earn. Let a crystal slip past and the chain resets.
- **Close calls.** Clearing an obstacle by less than about a third of a unit pops "CLOSE!" for bonus points and extra combo.
- **Kaiju Rage.** 40 crystals fill the rage meter, and it triggers automatically. For 7 seconds the dragon grows by a third, its plates burn red, the world speeds up 15%, nearby crystals fly to it, and anything it touches explodes for points.
## Levels

Pick one on the title screen (the world behind the menu changes to match) or straight from the game-over screen. Each level has three stages and loops through them, shorter and tighter every time round, with the speed cap rising 10% per loop (up to four times), so long runs never plateau. Each level has its own leaderboard.

| Level | Stages | Character |
| --- | --- | --- |
| **1 · Desert Outpost** ★ | Desert run → Army outpost → Gunship | Chrome's pace, with a day/night cycle. Cacti, pterodactyls, tanks, attack helicopters, watchtowers, fuel tanks, steel hedgehogs. |
| **2 · Night City** ★★ | City rampage → City siege → Gunship over the city | 12% faster, always at blue hour. A road with street lamps and pools of light, a lit skyline, cars with headlights, buildings to flatten, then the army in the streets. |
| **3 · Volcano Fortress** ★★★ | Ashlands → Inferno fortress → Inferno gunship | 25% faster, under an ember sky. Ash with glowing lava veins, lava pools to jump, meteors that mark their landing spot and leave a burning crater, basalt pillars to smash, then the army again. |

Some tanks fire a shell first; a tank only fires when the track between it and the dragon is clear, and the shell comes with an on-screen JUMP or DUCK marker. The **gunship** hovers ahead and fires missile volleys at jump or duck height, each flagged 0.9 s before launch. The beam tilts up to meet it, and a hit never stops it firing: it retaliates sooner instead. Breath hits and reflected missiles each take one hit point (4 on the first gunship, one more on the City and Volcano and for every gunship downed), and it's worth 500 × your multiplier. The first gunship ends the first loop; after that one returns every 7,000 points (a toast tells you the next score), wherever you are in the loop. Harder levels also tighten the gaps, arm more tanks, and make you earn your power: the breath charges at 85% speed in the City and 72% on the Volcano, and during gunship fights it charges slower still on every level (75%, 65% and 60%), and Kaiju Rage needs 55 and 70 crystals instead of 40.

**Seeing at night.** After dark (and in the volcano's dusk) the dragon's glowing plates throw a soft forward light that picks out what's coming. Pterodactyls are painted in warm rust and cream with a glowing rim around their silhouettes (helicopters get a subtler one), cars carry head and tail lights, steel hedgehogs have a hazard-yellow beam and a blinking red beacon, the city's street lights and warm ambient keep the road readable, and the volcano's lava veins stay well clear of the paler ash path the dragon runs on.

The autopilot used for testing (full jumps, fixed reflexes, no fast-fall, smashing only what can't be jumped) survives every level in both views, so every pattern can be cleared. It does so with every monster; as Mothra it also glides whenever nothing is due before it would land.

## Skins

Seven looks after different film eras, picked with the swatches on the title or game-over screen. Each recolours the hide, plates, plate glow, eyes and the atomic breath, and has its own build: the hitbox (and the body) is narrower or wider along x only, never taller or shorter. A slimmer build is easier to thread between obstacles, so score scales with the build.

| Skin | Look | Hitbox width / score |
| --- | --- | --- |
| Classic | charcoal hide, pale plates, atomic blue | 100% |
| Showa | grey-green hide, white plates, white-blue breath | 95% |
| Millennium | green hide, magenta plates, orange-red breath | 100% |
| Evolved | dark hide, hot-pink plates, pink breath | 108% |
| Burning | molten cracks glowing across the hide, red breath | 110% |
| Shin | red-brown hide, violet glow between the scales, purple breath | 88% |
| Mecha | silver armour, cyan core, red eyes | 112% |

## Monsters

Everyone starts with the **Kaiju** (the dragon above, with its skins). Other monsters are locked and earned by playing. Goals count across all your runs, on any level, and the **Monsters** panel shows each goal with a progress bar. Lifetime stats and unlocks are kept in the browser and mirrored into your leaderboard row, so they follow you to other devices. The artifact's owner can preview a locked monster from the panel.

| Monster | How to unlock | Notes |
| --- | --- | --- |
| Kaiju | from the start | seven skins |
| **King Ghidorah** | down 5 gunships in total | three heads (staggered so all three read in 2D), two tails, golden wings, gravity beams from every mouth; wide build: hitbox 115%, score ×1.15 |
| **Mothra** | collect 500 crystals in total | a giant moth that skims the ground on her legs while her wings beat. Keep holding jump after the top of a jump to glide (a slower fall), let go to drop. Glowing wing patterns, a wing-dust beam with glittering scales, a high cry. Hitbox 100%; gliding is an edge, so score ×0.9 |

Every monster has the Kaiju's hitbox heights (running, ducking and in the air), so size never makes anything easier or harder to clear; only the width varies. More are planned (Rodan, Gigan, Destoroyah, SpaceGodzilla); see `docs/ROADMAP.md`.

## Company leaderboard

When the game is opened as a shared claude.ai artifact, it shows a live leaderboard of everyone in the organization: top five on the title screen, your rank and nearby players on the game-over screen, the full top 50 behind the trophy button, and a "next to beat" chip during a run that cheers when you overtake a colleague.

- Players are identified by their claude.ai account. Each row stores only the player's opaque id and their best score on each level (`best` for the Desert, which predates levels, then `l2` and `l3`); names and photos are looked up when the board is drawn, so nobody types a name and nobody can post as someone else.
- Each player can write only their own row. The artifact's owner can remove any row.
- Posting needs **Contributor** access to the artifact (set in its Share menu). The platform never lets view-only users write, so viewers see the board but their runs aren't posted; the game says so on the title screen, on the game-over screen and in a toast.
- Scores are reported by the player's own browser, so a determined player could fake one; the owner can delete it.
- Opened anywhere else (the dev server, `dist/`, the single-file build), the board stays hidden and the high score is kept locally as before.

## What's in it

- **Dragon.** A procedural skinned mesh with 18 bones. The body, tail and neck are swept along a spine curve. Legs use analytic 2-bone inverse kinematics, so the feet plant on the sand at any speed. The scale texture is Voronoi-based (normal, roughness and AO maps). Three rows of dorsal plates glow with a Godzilla-style pulse that travels down the spine.
- **World.** Dunes come from a periodic heightfield displaced on the GPU and snapped to its grid, so they never shimmer while scrolling. Cacti are ribbed saguaros. There are eroded boulders, striped mesas, dry brush and footprints in the sand. All scenery is instanced and tiles endlessly with no per-frame updates.
- **Lighting.** A physically based (Preetham) sky drives image-based lighting, and fog is computed from the same scattering model so the horizon blends cleanly. A day/night cycle follows your score: golden hour, dusk, then a moonlit night with stars. Shadows are soft.
- **Post-processing.** MSAA, bloom, filmic tone mapping, colour grading, vignette, film grain, subtle chromatic aberration, and heat haze along the horizon. A guard pass stops any stray NaN/Inf pixel from blacking out the frame.
- **Military.** Tanks, attack helicopters and the tandem-rotor gunship are modelled in code from rounded boxes and swept hulls, with spinning rotors, recoiling barrels, muzzle flashes, searchlights at night, and shell and missile trails.
- **Audio.** Everything is synthesized with WebAudio: footsteps, roars, the breath, explosions, desert wind, Chrome-style milestone beeps, crystal chimes that climb with the combo, cannon fire, rotor thump, warning beeps, a boss siren and war drums during Rage and the boss fight.

## Performance

- Quality presets are Low, Medium and High. **Auto** (the default) starts at High on desktop and Medium on touch devices, then adjusts render resolution, dropping a preset only if that isn't enough.
- All shaders compile during the loading screen, against the same HDR render target the game draws into, so no shader compiles in the middle of a run.
- Obstacles are pooled, scenery is instanced, particles reuse fixed buffers and the main loop avoids allocations.
- Measured on an Intel Arc 140T integrated GPU at 1280×720: 60 fps on High through the army stage, Kaiju Rage and the boss fight at top speed. Game logic stays under 1 ms a frame; a few isolated frames per minute take 33–50 ms.

## Project layout

```
src/
  main.js                 entry: font, WebGL check, service worker
  game/Game.js            state machine, physics, scoring, combos, rage, boss flow, main loop
  game/Stages.js          the three levels and their stage loops
  game/Leaderboard.js     company leaderboard on the artifact's shared store
  game/CameraRig.js       2D ⇄ 3D camera blend, title orbit, shake
  game/Renderer.js        renderer, post-processing chain, quality, dynamic resolution
  game/Input.js           keyboard / pointer / touch buttons
  game/Audio.js           synthesized sound
  game/HUD.js             DOM overlay: meters, combo, banners, pop-ups, warnings, boards
  entities/Dragon.js      the skinned dragon + IK + hitboxes from bone positions
  entities/Obstacles.js   cacti, boulders, flyers, tanks, projectiles, spawner, crystal patterns
  entities/Military.js    tank, helicopter, watchtower, fuel tank, hedgehog, shell and missile models
  entities/Boss.js        the gunship boss
  entities/Skins.js       the seven dragon skins and their builds
  entities/Monsters.js    the monster roster and unlock goals
  entities/Moth.js        Mothra: painted fan-shaped wings, IK legs, same interface as the dragon
  game/Progress.js        lifetime stats and unlocks
  entities/Crystals.js    instanced radiation crystals
  world/City.js           city biome: skyline, road, buildings and cars, procedural lit windows
  world/Volcano.js        volcano biome: smoking volcanoes, lava, meteors, basalt pillars
  world/Debris.js         instanced debris chunks from smashed obstacles
  world/Terrain.js        GPU-displaced scrolling desert
  world/Environment.js    sky, sun/moon, stars, clouds, fog, IBL, day/night
  world/Scenery.js        instanced, endlessly tiling decor
  world/Particles.js      dust/spark particles, breath beam, footprints
  gfx/                    noise, procedural textures, sweep/blob geometry helpers
public/                   service worker, manifest, icon
```

Add `?debug` to the URL to turn off collisions (useful for sightseeing).
