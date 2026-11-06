# Tools

Development helpers (not part of the game build). The test tools start their own Vite dev server (or take `--url`) and drive headless Chrome (found in the usual install locations, or set `CHROME`). Node 22+.

| Command | What it checks |
| --- | --- |
| `npm test` | Everything below except perf: data safety, audio levels, hitbox parity, bot matrix. |
| `npm run test:matrix` (`tools/botmatrix.mjs`) | The fairness gate: the autopilot plays every level × 2D/3D × monster × seed (101, 202) in fast fixed-step simulation (`?sim=10`) until loop 4; exit 1 on any death. Options: `--levels 1,2 --views 3d --monsters mothra --seeds 7 --loops 2 --workers 3 --quick`. Prints the seed of every death, so `?seed=` replays it. About 6 minutes with 3 workers. |
| `npm run test:hitbox` (`tools/hitcheck.mjs`) | Every monster keeps the Kaiju's hitbox heights: running top, ducking top and airborne bottom within `--tol 0.05`. |
| `npm run test:audio` (`tools/audiocheck.mjs`) | Renders the real mix offline (the score through every theme and intensity, then every big sound at once over the loudest music) and checks each section is audible and nothing clips. |
| `npm run test:data` (`tools/datatest.mjs`) | Leaderboard and save safety against `mock-claude.js` with injected failures: a row is never replaced or blindly overwritten, view-only viewers are told, old local saves still load. |
| `npm run test:perf` (`tools/perf.mjs`) | Reference scenes played in real time with `?perf`: frame-time percentiles, frames over 33/50 ms, CPU and GPU time, draw calls, triangles, load steps. `--save file.json`, `--baseline file.json` (see `docs/perf/`), `--scenes a,b`. Run it alone. |
| `npm run artifact` | Single-file build, then `make-artifact.mjs` (page body for the claude.ai artifact: title first, no html/head/body wrapper) and `scan-artifact.mjs` (no external URLs or network APIs, gzip within `--gzip-kb 400`) into `dist-single/artifact.html`. |

| File | Use |
| --- | --- |
| `bot.js` | Autopilot to `eval` into the page. Answers each threat as `Obstacles.respond(o)` says (jump, duck, run under, smash), with fixed human-scale reflexes; glides as Mothra only while nothing is due before landing; fires the breath at the gunship. Runs on every simulation step via `game.stepHook`. `window.__smasher = true` first also smashes everything breakable. Results and the seed of every death in `window.__bot`. |
| `botrun.mjs` | One real-time bot run: `node tools/botrun.mjs <level 1-3> <2d\|3d> <monster> <seconds> [--smasher]` against the dev server on port 5187. |
| `hitboxes.js` | Hitbox probe to `eval` into a `?debug` run: per-box ranges while running, ducking, airborne and smashing (`window.__meas`), envelope numbers in `window.__measJSON`. |
| `cdp.mjs` | `node tools/cdp.mjs <url> <outdir> <steps.json> [w h]`: plays a JSON list of steps (`waitState`, `wait`, `key`, `down`/`up`, `cdp`, `click`, `tap`, `reload`, `eval`/`evalFile`, `shot`) and saves screenshots. |
| `lib/cdp.mjs`, `lib/server.mjs` | The shared Chrome DevTools driver (`Session`) and dev-server starter used by all of the above. |
| `mock-claude.js` | A fake `window.claude` (`db` + `user`) with seeded colleagues. URL options: `?mockfail=get` or `get1` (reads of your own row fail), `?mockmine=1` (your row exists), `?mockro=1` (view-only). `window.__mockWrites`, `window.__mockDocs`. |
| `make-artifact.mjs`, `scan-artifact.mjs` | See `npm run artifact`. |

Game URL switches for testing: `?seed=N` (replayable runs), `?sim=N` (fast fixed-step simulation, never posts or saves), `?perf` (performance overlay and `window.__perf`), `?debug` (no collisions).
