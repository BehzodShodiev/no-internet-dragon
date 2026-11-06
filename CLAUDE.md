# No Internet Dragon

Browser runner game (Vite + three.js, everything procedural). See `README.md` for the game and code layout.

- **Work in progress:** `docs/ROADMAP.md` tracks the 100x program (parts A–L; details per part in `docs/PROGRAM.md`) and the monster roster it absorbed. Check its status tables first and continue with the next "Not started" part. Work on the `game-100x` branch.
- **Shared build:** the game is published as a claude.ai artifact, https://claude.ai/artifact/38LU4dJei24uvhwcSq25td, shared with the owner's organization. Always republish to that URL. `npm run artifact` builds `dist-single/artifact.html` and scans it (no external URLs or network APIs, gzip within budget); publish that file without passing `capabilities` (the stored `db` + `user` declaration carries forward).
- **Leaderboard data:** `scores/<player id>` rows; fields `best` (Desert), `l2` (Night City), `l3` (Volcano) and `progress` (lifetime stats and unlocks). Never overwrite other fields when posting one level: new fields are written with `update()`, and a row is only created with `set()` after a successful read showed there is none (`Leaderboard._write`).
- **Testing:** after gameplay changes `npm test` must pass: data safety, hitbox parity (every monster keeps the Kaiju's hitbox heights) and the bot matrix (every level in 2D and 3D, every monster, 0 deaths). Rendering or loading changes also run `npm run test:perf` against the latest baseline in `docs/perf/`.
- **Cost:** no multi-agent workflows unless the owner asks; helper subagents run on Sonnet with a narrow brief.
- The owner prefers changes made and verified without clarifying questions.
