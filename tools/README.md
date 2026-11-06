# Tools

Development helpers (not part of the game build).

| File | Use |
| --- | --- |
| `make-artifact.mjs` | `node tools/make-artifact.mjs dist-single/index.html <out.html>`: turns the single-file build into a claude.ai artifact page (title first, no html/head/body wrapper). Run `npm run build:single` first. |
| `scan-artifact.mjs` | `node tools/scan-artifact.mjs <out.html>`: checks the page for external URLs the artifact sandbox would block (all counts should be 0). |
| `cdp.mjs` | `node --experimental-websocket tools/cdp.mjs <url> <outdir> <steps.json> [w h]`: drives headless Chrome over CDP with a JSON list of steps (`waitState`, `wait`, `key`, `down`/`up`, `cdp`, `click`, `reload`, `eval`, `shot`) and saves screenshots. Finds Chrome in the usual install locations, or set `CHROME` to its path. |
| `bot.js` | Autopilot to `eval` into the page: jumps ground obstacles, ducks mid-height flyers, smashes what's too tall to jump, fires the breath at the gunship. With a gliding monster (Mothra) it keeps holding jump past the top only while nothing is due before landing (`glides`, `glideTime`, `drops` count this). Set `window.__smasher = true` first to also smash everything breakable. Reads deaths and logs from `window.__bot`. |
| `botrun.mjs` | `node tools/botrun.mjs <level 1-3> <2d\|3d> <monster> <seconds> [--smasher]`: runs `bot.js` on the dev server (port 5187) with one level, view and monster (locked ones as the owner's preview) and prints deaths, stage, loops, gunships, glides, fps. A new monster needs all six level/view combinations at 0 deaths (about 150 s each; up to three can run at once). |
| `hitboxes.js` | Hitbox probe to `eval` into a run opened with `?debug`: samples the monster's boxes while running, ducking, airborne and smashing; read the report from `window.__meas` about 5.5 s later. Compare a new monster against the Kaiju: the heights must match. |
| `mock-claude.js` | A fake `window.claude` (`db` + `user`) with seeded colleagues, for testing the leaderboard and unlock sync locally. Inject with a `Page.addScriptToEvaluateOnNewDocument` step, then `reload`. |
