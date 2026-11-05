# No Internet Dragon

Browser runner game (Vite + three.js, everything procedural). See `README.md` for the game and code layout.

- **Work in progress:** `docs/ROADMAP.md` tracks the multi-part monster roster. Check its status column first and continue with the next part.
- **Shared build:** the game is published as a claude.ai artifact, https://claude.ai/artifact/38LU4dJei24uvhwcSq25td, shared with the owner's organization. Always republish to that URL. Build with `npm run build:single`, convert with `node tools/make-artifact.mjs dist-single/index.html <scratch>/no-internet-dragon.html`, check with `tools/scan-artifact.mjs`, and publish without passing `capabilities` (the stored `db` + `user` declaration carries forward).
- **Leaderboard data:** `scores/<player id>` rows; fields `best` (Desert), `l2` (Night City), `l3` (Volcano). Never overwrite other fields when posting one level.
- **Testing:** the autopilot bot must clear every level in 2D and 3D with 0 deaths after gameplay changes.
- The owner prefers changes made and verified without clarifying questions.
