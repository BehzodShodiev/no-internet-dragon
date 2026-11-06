// DOM overlay: score, meters, combo, boss bar, banners, pop-ups, warnings, menus, toasts and leaderboards.
const $ = (id) => document.getElementById(id);
const pad = (n) => String(Math.floor(n)).padStart(5, '0');
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export class HUD {
  constructor() {
    this.el = {
      score: $('score'), hi: $('hi'), charge: $('charge'), chargeFill: $('charge-fill'),
      title: $('title-screen'), over: $('gameover'), pause: $('pause'), loading: $('loading'),
      loadBar: $('load-bar'), loadText: $('load-text'), toast: $('toast'), hud: $('hud'),
      finalScore: $('final-score'), finalBest: $('final-best'), newBest: $('new-best'),
      view: $('btn-view'), sound: $('btn-sound'), quality: $('btn-quality'), pauseBtn: $('btn-pause'),
      online: $('online-status'),
      combo: $('combo'), chainFill: $('chain-fill'), mult: $('mult'),
      rage: $('rage'), rageFill: $('rage-fill'),
      bossBar: $('boss-bar'), bossName: $('boss-name'), bossHp: $('boss-hp'),
      banner: $('banner'), bannerSub: $('banner-sub'), bannerTitle: $('banner-title'),
      popups: $('popups'), warnings: $('warnings'),
      rival: $('rival'), boardBtn: $('btn-board'), board: $('board'),
      boardTitle: $('board-title'), overBoard: $('over-board'), overRank: $('over-rank'), overStats: $('over-stats'),
      monsters: $('monsters'),
    };
    this._lastScore = -1;
    this._blink = 0;
    this._toastTimer = 0;
    this._popups = Array.from({ length: 16 }, () => this.el.popups.appendChild(el('div', 'popup')));
    this._popIdx = 0;
    this._warns = Array.from({ length: 4 }, () => {
      const w = this.el.warnings.appendChild(el('div', 'warn'));
      w.hidden = true;
      return w;
    });
    this._rivalId = undefined;
    this._mult = 1;
    this._bossHp = -1;
    this.updateOnline();
    window.addEventListener('online', () => this.updateOnline());
    window.addEventListener('offline', () => this.updateOnline());
  }

  updateOnline() {
    if (!this.el.online) return;
    this.el.online.textContent = navigator.onLine
      ? 'Psst — you are actually online. The dragon does not care.'
      : 'You are offline. Perfect conditions for a dragon.';
  }

  loading(p, text) {
    this.el.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadText.textContent = text;
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  setHi(hi) {
    this.el.hi.textContent = `HI ${pad(hi)}`;
  }

  setScore(score, dt) {
    const s = Math.floor(score);
    if (this._blink > 0) {
      this._blink -= dt;
      const on = Math.floor(this._blink * 8) % 2 === 0;
      this.el.score.style.visibility = on ? 'visible' : 'hidden';
      if (this._blink <= 0) this.el.score.style.visibility = 'visible';
    }
    if (s === this._lastScore) return;
    this._lastScore = s;
    this.el.score.textContent = pad(s);
  }

  milestone() {
    this._blink = 0.9;
  }

  // per-frame setters only touch the DOM when the value changes (no style invalidation otherwise)
  setCharge(c, ready) {
    const k = c.toFixed(3);
    if (k !== this._chargeK) { this._chargeK = k; this.el.chargeFill.style.transform = `scaleX(${k})`; }
    if (ready !== this._chargeReady) { this._chargeReady = ready; this.el.charge.classList.toggle('ready', ready); }
  }

  chargeDenied() {
    this._restartAnim(this.el.charge, 'deny');
  }

  _restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // restart the animation
    node.classList.add(cls);
  }

  // ------------------------------------------------------------------ combo / rage / boss
  setCombo(mult, progress) {
    this.el.chainFill.style.transform = `scaleX(${progress.toFixed(3)})`;
    this.el.combo.classList.toggle('on', mult > 1 || progress > 0);
    if (mult !== this._mult) {
      this.el.mult.textContent = `×${mult}`;
      if (mult > this._mult) this._restartAnim(this.el.combo, 'up');
      this._mult = mult;
    }
  }

  comboBroken() {
    this.el.combo.classList.remove('up');
    this._restartAnim(this.el.combo, 'broken');
  }

  setRage(v, active, ending) {
    const k = v.toFixed(3);
    if (k !== this._rageK) { this._rageK = k; this.el.rageFill.style.transform = `scaleX(${k})`; }
    if (active !== this._rageA) { this._rageA = active; this.el.rage.classList.toggle('active', active); }
    if (ending !== this._rageE) { this._rageE = ending; this.el.rage.classList.toggle('ending', ending); }
  }

  setBoss(name, hp, max) {
    const bar = this.el.bossBar;
    if (hp < 0) {
      bar.classList.add('hidden');
      this._bossHp = -1;
      return;
    }
    bar.classList.remove('hidden');
    if (this.el.bossHp.children.length !== max) {
      this.el.bossHp.replaceChildren(...Array.from({ length: max }, () => el('i')));
      this.el.bossName.textContent = name;
    }
    if (hp !== this._bossHp) {
      [...this.el.bossHp.children].forEach((c, i) => c.classList.toggle('gone', i >= hp));
      this._bossHp = hp;
    }
  }

  banner(sub, title, kind = '') {
    const b = this.el.banner;
    this.el.bannerSub.textContent = sub;
    this.el.bannerTitle.textContent = title;
    b.className = `banner ${kind}`;
    void b.offsetWidth;
    b.classList.add('show');
  }

  /** Floating text at a screen position (px). */
  popup(text, x, y, kind = '') {
    const p = this._popups[this._popIdx++ % this._popups.length];
    p.textContent = text;
    p.className = `popup ${kind}`;
    p.getAnimations().forEach((a) => a.cancel());
    p.animate(
      [
        { opacity: 0, transform: `translate(${x}px, ${y}px) translate(-50%, 0) scale(0.7)` },
        { opacity: 1, transform: `translate(${x}px, ${y - 14}px) translate(-50%, 0) scale(1.1)`, offset: 0.15 },
        { opacity: 1, transform: `translate(${x}px, ${y - 40}px) translate(-50%, 0) scale(1)`, offset: 0.7 },
        { opacity: 0, transform: `translate(${x}px, ${y - 60}px) translate(-50%, 0) scale(1)` },
      ],
      { duration: 950, easing: 'ease-out', fill: 'forwards' },
    );
  }

  /** Incoming-fire markers: list of { x, y, kind: 'low' | 'mid' } in px. */
  setWarnings(list) {
    if (!list.length && !this._warnShown) return;
    this._warnShown = list.length;
    this._warns.forEach((w, i) => {
      const it = list[i];
      if (w.hidden !== !it) w.hidden = !it;
      if (!it) return;
      w.style.transform = `translate(${it.x | 0}px, ${it.y | 0}px)`;
      if (w.dataset.kind !== it.kind) {
        w.className = `warn ${it.kind}`;
        w.dataset.kind = it.kind;
      }
    });
  }

  // ------------------------------------------------------------------ menus
  /** Menus (title, game over): the in-run scoreboard, meters, touch buttons and pause button hide. */
  setMenu(on) {
    this.el.hud.classList.toggle('menu', on);
  }

  show(name, on) {
    const node = this.el[name];
    if (node) node.classList.toggle('hidden', !on);
  }

  gameOver(score, best, isBest, stats) {
    this.el.finalScore.textContent = pad(score);
    this.el.finalBest.textContent = pad(best);
    this.el.newBest.classList.toggle('hidden', !isBest);
    this.el.overStats.textContent = stats;
    this.show('over', true);
  }

  setView(mode) {
    this.el.view.dataset.mode = mode;
  }

  setMuted(m) {
    this.el.sound.classList.toggle('muted', m);
  }

  setQuality(label) {
    this.el.quality.textContent = label;
  }

  setPaused(p) {
    this.el.pauseBtn.classList.toggle('paused', p);
    this.show('pause', p);
  }

  toast(text, ms = 1600) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------------ leaderboard
  /** The colleague to beat next; null hides the chip. top = you're ahead of everyone. */
  setRival(board, row, top) {
    const r = this.el.rival;
    const id = top ? '#top' : row?.id ?? null;
    if (id === this._rivalId) return;
    this._rivalId = id;
    r.classList.toggle('hidden', !id);
    if (!id) return;
    r.classList.toggle('top', !!top);
    r.querySelector('.lbl').textContent = top ? 'YOU LEAD THE COMPANY' : 'NEXT TO BEAT';
    r.querySelector('.nm').textContent = top ? board.name(board.me) : board.name(row.id);
    r.querySelector('img').src = board.avatar(top ? board.me : row.id) || BLANK;
    r.querySelector('.pts').textContent = top ? '' : pad(row.best);
  }

  resetRival() {
    this._rivalId = undefined;
    this.el.rival.classList.add('hidden');
  }

  showBoard(on) {
    this.show('board', on);
  }

  isBoardOpen() {
    return !this.el.board.classList.contains('hidden');
  }

  // ------------------------------------------------------------------ levels
  /** Builds the level picker once; onPick(index) fires when one is chosen. */
  buildLevels(levels, onPick) {
    this.levelButtons = levels.map((lv, i) => {
      const b = el('button', 'lvl');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const st = el('span', 'st');
      st.append('★'.repeat(lv.stars), Object.assign(el('i'), { textContent: '★'.repeat(3 - lv.stars) }));
      b.append(el('span', 'n', `LEVEL ${lv.id}`), el('span', 'nm', lv.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())), st, el('span', 'best', ''));
      b.addEventListener('click', (e) => { e.stopPropagation(); onPick(i); b.blur(); });
      return b;
    });
    $('levels').replaceChildren(...this.levelButtons);
    // the same choice on the game-over screen: pick one and the next run starts there
    this.overLevelButtons = levels.map((lv, i) => {
      const b = el('button');
      b.type = 'button';
      b.title = `Run ${lv.name.toLowerCase()} (${lv.id})`;
      b.append(Object.assign(el('kbd'), { textContent: String(lv.id) }), lv.short, el('span', 'st', '★'.repeat(lv.stars)));
      b.addEventListener('click', (e) => { e.stopPropagation(); onPick(i); b.blur(); });
      return b;
    });
    $('over-levels').replaceChildren(...this.overLevelButtons);
    this.tabButtons = levels.map((lv) => {
      const b = el('button', '', lv.short);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', (e) => { e.stopPropagation(); this.boardField = lv.field; this.onBoardTab?.(); });
      return b;
    });
    $('board-tabs').replaceChildren(...this.tabButtons);
    this.levels = levels;
  }

  // ------------------------------------------------------------------ monsters
  /** Builds the Monsters panel cards; onPick(id) selects, onPreview(id) is the owner's locked preview. */
  buildMonsters(monsters, onPick, onPreview) {
    const art = {
      kaiju: 'linear-gradient(135deg, #2e3530, #3cc8ff)',
      ghidorah: 'linear-gradient(135deg, #8a5a14, #ffd166)',
      mothra: 'radial-gradient(circle at 80% 22%, #9fe8ff 0 5%, #ffd65c 6% 9%, #1a0e08 10% 13%, transparent 14%), linear-gradient(135deg, #5c3418, #e08a26 55%, #f6c44a)',
    };
    const lock = '<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>';
    this.monsterCards = monsters.map((m) => {
      const card = el('div', 'mon-card');
      const pic = el('div', 'mon-art');
      pic.style.background = art[m.id] || 'linear-gradient(135deg, #333, #777)';
      pic.innerHTML = lock; // shown only while locked (see renderMonsters)
      const body = el('div', 'mon-body');
      body.append(el('b', '', m.name), el('p', '', m.note));
      const goal = el('div', 'mon-goal');
      if (m.goal) {
        const bar = el('div', 'bar');
        bar.append(el('i'));
        goal.append(el('span', '', m.goal.text), el('span', 'cnt', ''), bar);
      }
      const actions = el('div', 'mon-actions');
      const pick = el('button', '', 'Select');
      pick.type = 'button';
      pick.addEventListener('click', (e) => { e.stopPropagation(); onPick(m.id); });
      const preview = el('button', 'ghost', 'Preview (owner)');
      preview.type = 'button';
      preview.title = 'As the owner you can try a locked monster. Colleagues have to earn it.';
      preview.addEventListener('click', (e) => { e.stopPropagation(); onPreview(m.id); });
      actions.append(pick, preview);
      body.append(goal, actions);
      card.append(pic, body);
      return { m, card, pic, goal, pick, preview };
    });
    $('mon-grid').replaceChildren(...this.monsterCards.map((c) => c.card));
  }

  /** Refreshes every card's lock state, goal progress and buttons. */
  renderMonsters(progress, currentId, isOwner) {
    for (const c of this.monsterCards) {
      const unlocked = progress.isUnlocked(c.m);
      c.card.classList.toggle('locked', !unlocked);
      c.card.classList.toggle('selected', c.m.id === currentId);
      c.pic.querySelector('svg').style.display = unlocked ? 'none' : '';
      if (c.m.goal) {
        const p = progress.progressOf(c.m);
        c.goal.querySelector('.cnt').textContent = unlocked ? 'UNLOCKED' : `${p.value} / ${p.need}`;
        c.goal.querySelector('.bar i').style.width = `${(unlocked ? 1 : p.value / p.need) * 100}%`;
      }
      c.pick.hidden = !unlocked;
      c.pick.disabled = c.m.id === currentId;
      c.pick.textContent = c.m.id === currentId ? 'Selected' : 'Select';
      c.preview.hidden = unlocked || !isOwner;
    }
  }

  showMonsters(on) {
    this.show('monsters', on);
  }

  isMonstersOpen() {
    return !$('monsters').classList.contains('hidden');
  }

  /** Shows the current monster's name; skins only apply to the Kaiju. */
  setMonster(m, preview) {
    for (const id of ['monster-name', 'monster-name-over']) $(id).textContent = m.name + (preview ? ' (preview)' : '');
    for (const id of ['skins', 'over-skins']) $(id).hidden = !m.skins;
    if (!m.skins) $('skin-info').textContent = m.note;
  }

  /** Builds the skin swatches (title card and game-over screen); onPick(index) fires on a click. */
  buildSkins(skins, onPick) {
    const hide = (k) => {
      const c = [0x38 / 255, 0x40 / 255, 0x38 / 255].map((v, i) => Math.min(255, Math.round(255 * v * k.skin[i] * 1.6)));
      return `rgb(${c.join(',')})`;
    };
    const glow = (k) => `#${k.glow.toString(16).padStart(6, '0')}`;
    const make = (k, i) => {
      const b = el('button', 'skin-sw');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.title = `${k.name}: ${k.note}`;
      b.setAttribute('aria-label', k.name);
      b.style.background = `linear-gradient(135deg, ${hide(k)} 0 52%, ${glow(k)} 52% 100%)`;
      b.addEventListener('click', (e) => { e.stopPropagation(); onPick(i); b.blur(); });
      return b;
    };
    this.skins = skins;
    this.skinButtons = [...skins.map(make), ...skins.map(make)];
    $('skins').replaceChildren(...this.skinButtons.slice(0, skins.length));
    $('over-skins').replaceChildren(...this.skinButtons.slice(skins.length));
  }

  setSkin(index) {
    const n = this.skins.length;
    this.skinButtons.forEach((b, i) => b.setAttribute('aria-checked', String(i % n === index)));
    const k = this.skins[index];
    const pct = Math.round(k.hitX * 100);
    $('skin-info').textContent = `${k.name} · ${k.note} · hitbox ${pct}% wide · score ×${k.hitX.toFixed(2)}`;
  }

  /** Marks the chosen level, shows its blurb and each level's personal best. */
  setLevel(index, bests) {
    this.levelButtons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === index));
      b.querySelector('.best').textContent = bests[i] ? `BEST ${pad(bests[i])}` : 'NOT PLAYED';
    });
    this.overLevelButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    $('lvl-blurb').textContent = this.levels[index].blurb;
    this.el.boardTitle.querySelector('.lvl-name').textContent = this.levels[index].short;
  }

  /** Redraws every leaderboard view. level: the level being played or picked; lastRun: the run just ended. */
  renderBoards(board, level, lastRun) {
    const on = board.enabled;
    this.el.boardBtn.classList.toggle('hidden', !on);
    this.el.boardTitle.classList.toggle('hidden', !on);
    if (!on) {
      this.el.overBoard.classList.add('hidden');
      this.showBoard(false);
      return;
    }
    const field = level.field;
    const tabField = this.boardField || field;
    this.tabButtons?.forEach((b, i) => b.setAttribute('aria-selected', String(this.levels[i].field === tabField)));
    let status = '';
    if (board.status === 'loading') status = 'Loading the leaderboard…';
    else if (board.status === 'slow') status = "Can't reach the leaderboard yet.";
    else if (board.status === 'error') status = 'The leaderboard is unavailable right now.';
    const blocked = board.readOnly && board.status === 'ready';
    if (blocked) status = "Your scores aren't saved: your access to this game is view-only. Ask its owner for Contributor access.";
    document.querySelectorAll('.board-status').forEach((s) => {
      const empty = board.status === 'ready' && !board.rows(s.closest('#board') ? tabField : field).length;
      s.textContent = status || (empty ? 'No scores on this level yet. Set the first one!' : '');
      s.classList.toggle('alert', blocked);
    });

    const ranked = (f) => board.rows(f).map((r, i) => ({ ...r, rank: i + 1 }));
    const rows = ranked(field);
    const meIdx = rows.findIndex((r) => r.id === board.me);
    // title card: top five, plus you if you're further down
    const top = rows.slice(0, 5);
    if (meIdx >= 5) top.push(null, rows[meIdx]);
    this._fillList(this.el.boardTitle.querySelector('.board-list'), top, board);
    this._fillList(this.el.board.querySelector('.board-list'), ranked(tabField), board);

    // game over: where this run landed, the top three, and the players either side of you
    const ob = this.el.overBoard;
    ob.classList.toggle('hidden', !lastRun || board.status !== 'ready');
    if (!lastRun) return;
    const rank = board.rankOf(field, lastRun.score);
    const label = board.truncated(field) && rank > rows.length ? `${rows.length}+` : `#${rank}`;
    const where = level.short.toUpperCase();
    this.el.overRank.textContent = lastRun.posted
      ? `NEW PERSONAL BEST · ${label} ON ${where}`
      : board.saveError === 'readonly'
        ? `NOT SAVED · VIEW-ONLY ACCESS · WOULD RANK ${label}`
        : board.saveError === 'network'
          ? `COULDN'T SAVE · WOULD RANK ${label}`
          : `THIS RUN: ${label} ON ${where} · YOUR BEST ${pad(board.myBest(field))}`;
    const pick = rows.slice(0, 3);
    if (meIdx >= 3) {
      if (meIdx > 4) pick.push(null);
      for (let i = Math.max(3, meIdx - 1); i <= Math.min(rows.length - 1, meIdx + 1); i++) pick.push(rows[i]);
    }
    this._fillList(ob.querySelector('.board-list'), pick, board);
  }

  _fillList(ol, items, board) {
    ol.replaceChildren(...items.map((r) => {
      if (!r) return el('li', 'gap', '• • •');
      const li = el('li', r.id === board.me ? 'me' : '');
      const img = el('img');
      img.alt = '';
      img.src = board.avatar(r.id) || BLANK;
      li.append(el('span', 'rk', String(r.rank)), img, el('span', 'nm', board.name(r.id)), el('span', 'pts', pad(r.best)));
      return li;
    }));
  }
}
