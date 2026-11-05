# Tools

Development helpers (not part of the game build).

| File | Use |
| --- | --- |
| `make-artifact.mjs` | `node tools/make-artifact.mjs dist-single/index.html <out.html>`: turns the single-file build into a claude.ai artifact page (title first, no html/head/body wrapper). Run `npm run build:single` first. |
| `scan-artifact.mjs` | `node tools/scan-artifact.mjs <out.html>`: checks the page for external URLs the artifact sandbox would block (all counts should be 0). |
| `cdp.mjs` | `node --experimental-websocket tools/cdp.mjs <url> <outdir> <steps.json> [w h]`: drives headless Chrome over CDP with a JSON list of steps (`waitState`, `wait`, `key`, `down`/`up`, `cdp`, `click`, `reload`, `eval`, `shot`) and saves screenshots. The Chrome path is hard-coded for this machine. |
| `bot.js` | Autopilot to `eval` into the page: jumps ground obstacles, ducks mid-height flyers, smashes what's too tall to jump, fires the breath at the gunship. Set `window.__smasher = true` first to also smash everything breakable. Reads deaths and logs from `window.__bot`. |
| `mock-claude.js` | A fake `window.claude` (`db` + `user`) with seeded colleagues, for testing the leaderboard and unlock sync locally. Inject with a `Page.addScriptToEvaluateOnNewDocument` step, then `reload`. |
