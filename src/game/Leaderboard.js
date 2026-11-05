// Company leaderboards on the artifact's shared store: one row per player, with their best run on each
// level ('best' is the Desert level and predates levels; 'l2' and 'l3' are the City and Volcano).
// Rows store only the player's opaque id; names and photos are resolved from claude.ai profiles each
// time the board renders. Outside claude.ai (dev server, offline build) the boards stay switched off.
const TOP = 50;
const MAX_SCORE = 999999;
export const BOARD_FIELDS = ['best', 'l2', 'l3'];

export class Leaderboard {
  constructor() {
    this.status = 'off'; // off | loading | slow | ready | error
    this.boards = Object.fromEntries(BOARD_FIELDS.map((f) => [f, []])); // field -> [{ id, best }], best first
    this.profiles = {};
    this.me = null;
    this.mine = Object.fromEntries(BOARD_FIELDS.map((f) => [f, 0])); // your bests, per field
    this.mineExists = false;
    this.readOnly = false;
    this.saveError = null; // why the last run couldn't be posted: 'readonly' | 'network' | null
    this.onChange = null;
    this._writing = Promise.resolve();
    this._mineLoaded = Promise.resolve();
  }

  get enabled() {
    return this.status !== 'off';
  }

  async connect() {
    const claude = window.claude;
    if (typeof claude?.use !== 'function') return;
    this.status = 'loading';
    this._emit();
    let db = null, user = null;
    try {
      [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    } catch { /* treated as unavailable below */ }
    if (!db) {
      this.status = 'off';
      this._emit();
      return;
    }
    this.db = db;
    this.user = user;
    this.me = user ? await user.id() : null;
    const can = user ? await user.can('data.write') : null;
    this.readOnly = !this.me || can === false;
    this.isOwner = user ? await user.isOwner() : false; // the owner may preview locked monsters

    const slow = setTimeout(() => {
      if (this.status === 'loading') { this.status = 'slow'; this._emit(); }
    }, 10000);
    let answered = 0;
    for (const field of BOARD_FIELDS) {
      db.collection('scores').orderBy(field, 'desc').limit(TOP).onSnapshot(
        (snap) => {
          if (!snap.metadata.fromCache && ++answered >= 1) clearTimeout(slow);
          const rows = [];
          for (const d of snap.docs) {
            const v = Number(d.data()?.[field]);
            if (v > 0) rows.push({ id: d.id, best: Math.min(MAX_SCORE, Math.floor(v)) });
          }
          this.boards[field] = rows;
          const mine = rows.find((r) => r.id === this.me);
          if (mine) this.mine[field] = Math.max(this.mine[field], mine.best);
          this.status = 'ready';
          this._resolveAndEmit();
        },
        () => {
          clearTimeout(slow);
          if (this.status !== 'ready') this.status = 'error';
          this._emit();
        },
      );
    }
    // your own row (it may sit below the top 50 on some boards)
    if (this.me) {
      this._mineLoaded = db.doc(`scores/${this.me}`).get().then((s) => {
        this.mineExists = s.exists;
        if (s.exists) {
          for (const f of BOARD_FIELDS) this.mine[f] = Math.max(this.mine[f], Number(s.data()[f]) || 0);
          this.remoteProgress = s.data().progress || null; // unlocks and lifetime stats from other devices
        }
        this._emit();
      }).catch(() => {});
    }
  }

  async _resolveAndEmit() {
    const ids = [...new Set(BOARD_FIELDS.flatMap((f) => this.boards[f].map((r) => r.id)))];
    if (this.user && ids.length) {
      try { this.profiles = await this.user.profiles(ids); } catch { /* names fall back */ }
    }
    this._emit();
  }

  _emit() {
    this.onChange?.(this);
  }

  rows(field) {
    return this.boards[field] || [];
  }

  myBest(field) {
    return this.mine[field] || 0;
  }

  name(id) {
    return id === this.me ? this.profiles[id]?.name || 'You' : this.profiles[id]?.name || 'Someone';
  }

  avatar(id) {
    return this.profiles[id]?.avatarUrl || '';
  }

  /** Rank (1-based) a score would hold among the other players on a board. */
  rankOf(field, score) {
    let r = 1;
    for (const row of this.rows(field)) if (row.id !== this.me && row.best > score) r++;
    return r;
  }

  /** Whether a board is a full page, so ranks past it are only "50+". */
  truncated(field) {
    return this.rows(field).length >= TOP;
  }

  /** The nearest player above a live score (not you), or null when you'd be on top. */
  rival(field, score) {
    const rows = this.rows(field);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].id !== this.me && rows[i].best > score) return rows[i];
    }
    return null;
  }

  /** Mirrors lifetime stats and unlocks into your row, so they follow you to other devices. Best effort. */
  syncProgress(progress) {
    if (!this.db || this.readOnly || !this.me) return;
    const write = async () => {
      await this._mineLoaded;
      const ref = this.db.doc(`scores/${this.me}`);
      try {
        if (this.mineExists) await ref.update({ progress });
        else {
          await ref.set({ ...this.mine, progress });
          this.mineExists = true;
        }
      } catch { /* the local copy still has it */ }
    };
    this._writing = this._writing.then(write).catch(() => {});
  }

  /** Posts a run on one level's board if it beats your best there. Resolves true when it was written. */
  async submit(field, score, meta) {
    score = Math.min(MAX_SCORE, Math.floor(score));
    this.saveError = null;
    if (!this.db || score <= this.myBest(field)) return false;
    if (this.readOnly || !this.me) {
      this.saveError = 'readonly';
      this._emit();
      return false;
    }
    this.mine[field] = score;
    this._emit();
    const write = async () => {
      await this._mineLoaded; // never overwrite the other levels' bests with stale zeros
      const ref = this.db.doc(`scores/${this.me}`);
      const fields = { [field]: this.mine[field], at: Date.now(), view: meta.view, stage: meta.stage };
      const put = async () => {
        if (this.mineExists) await ref.update(fields);
        else await ref.set({ ...this.mine, ...fields });
        this.mineExists = true;
      };
      try {
        await put();
        return true;
      } catch (e) {
        if (e?.code === 'unavailable') {
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));
          try { await put(); return true; } catch { /* give up */ }
        }
        // a write below the access rules rejects invalid_argument: this viewer has view-only access
        if (e?.code === 'invalid_argument' || e?.code === 'not_granted') this.readOnly = true;
        this.saveError = this.readOnly ? 'readonly' : 'network';
        this._emit();
        return false;
      }
    };
    // one write at a time to this player's row
    const p = this._writing.then(write);
    this._writing = p.catch(() => false);
    return p;
  }
}
