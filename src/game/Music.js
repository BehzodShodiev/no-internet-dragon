// The game's score: an original, fully procedural soundtrack (no samples, no film themes). A 16th-note
// look-ahead sequencer plays a theme per biome (Desert, Night City, Volcano), plus the title and game-over
// moods. Six layers fade in with the run's intensity: pad, bass, percussion, arpeggio, brass and lead.
//   intensity 0 title/ambient · 1 running · 2 army or siege stage · 3 boss fight · 4 Kaiju Rage
// Stingers (game over, new best, unlock, stage clear) are one-shot phrases on top.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// scale: semitone offsets; prog: chord roots as scale degrees (one chord per bar); motif: [degree, steps]
// (degree null = rest), played by the lead from intensity 2. All melodies are original.
const THEMES = {
  title: { bpm: 70, root: 48, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], motif: [[4, 8], [3, 4], [2, 4], [0, 8], [null, 4], [1, 2], [2, 2], [4, 8], [5, 4], [4, 4], [null, 16]] },
  desert: { bpm: 94, root: 50, scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 1, 0, 6], motif: [[4, 4], [5, 2], [4, 2], [3, 4], [1, 4], [0, 8], [null, 8], [2, 2], [3, 2], [4, 4], [6, 4], [4, 4], [null, 16]] },
  city: { bpm: 108, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], motif: [[0, 2], [2, 2], [4, 4], [6, 2], [4, 2], [3, 4], [2, 4], [1, 4], [0, 8], [null, 16], [4, 2], [3, 2], [2, 4], [null, 8]] },
  volcano: { bpm: 122, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 4], motif: [[0, 4], [1, 4], [0, 2], [-1, 2], [0, 8], [null, 8], [3, 4], [1, 4], [0, 8], [null, 16]] },
  over: { bpm: 60, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], motif: [] },
};
const LAYERS = ['pad', 'bass', 'perc', 'arp', 'brass', 'lead'];
// intensity at which each layer is fully in (it fades in over the unit below)
const LAYER_AT = { pad: 0, bass: 1, perc: 1, arp: 2, brass: 3, lead: 2 };

export class Music {
  constructor(audio, bus) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.theme = THEMES.title;
    this.themeName = 'title';
    this.pending = null;
    this.target = 0;
    this.level = 0;
    this.step = 0;
    this.bar = 0;
    this.motifPos = 0;
    this.motifLeft = 0;
    this.nextT = 0;
    this.enabled = true;
    this.gains = {};
    for (const k of LAYERS) {
      const g = this.ctx.createGain();
      g.gain.value = k === 'pad' ? 1 : 0;
      g.connect(bus);
      this.gains[k] = g;
    }
    // shared vibrato for the lead
    this.vib = this.ctx.createOscillator();
    this.vib.frequency.value = 5.2;
    this.vibDepth = this.ctx.createGain();
    this.vibDepth.gain.value = 9; // cents
    this.vib.connect(this.vibDepth);
    this.vib.start();
    this.timer = null;
  }

  /** Starts the sequencer (after the audio context exists and is running). */
  start() {
    if (this.timer) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** theme: 'title' | 'desert' | 'city' | 'volcano' | 'over'; intensity 0..4. Theme changes land on a bar line. */
  set(themeName, intensity) {
    this.target = intensity;
    if (themeName !== this.themeName && themeName !== this.pending) this.pending = themeName;
  }

  /** Smooths the intensity and fades the layers (call every frame). */
  update(dt) {
    const k = 1 - Math.exp(-dt * (this.target > this.level ? 2.5 : 0.8));
    this.level += (this.target - this.level) * k;
    const t = this.ctx.currentTime;
    for (const name of LAYERS) {
      const on = name === 'pad' ? 1 : clamp01(this.level - LAYER_AT[name] + 1);
      this.gains[name].gain.setTargetAtTime(on, t, 0.3);
    }
  }

  _schedule() {
    const ctx = this.ctx;
    if (!this.enabled || ctx.state !== 'running') return;
    // after a long stall (tab in background), resync instead of flooding notes
    if (this.nextT < ctx.currentTime - 0.2) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + 0.15) {
      this._playStep(this.nextT);
      this.nextT += 60 / this.theme.bpm / 4;
    }
  }

  _degree(d, octave = 0) {
    const sc = this.theme.scale;
    const o = Math.floor(d / 7);
    const i = ((d % 7) + 7) % 7;
    return this.theme.root + sc[i] + 12 * (o + octave);
  }

  _chord(rootDeg, octave = 0) {
    return [rootDeg, rootDeg + 2, rootDeg + 4].map((d) => this._degree(d, octave));
  }

  _playStep(t) {
    const s = this.step;
    if (s === 0) {
      if (this.pending) {
        this.theme = THEMES[this.pending];
        this.themeName = this.pending;
        this.pending = null;
        this.bar = 0;
        this.motifPos = 0;
        this.motifLeft = 0;
      }
      this.chordDeg = this.theme.prog[this.bar % this.theme.prog.length];
    }
    const th = this.theme;
    const lv = this.level;
    const spb = 60 / th.bpm / 4; // seconds per step
    const chord = this._chord(this.chordDeg, 0);
    const live = (name) => name === 'pad' || lv > LAYER_AT[name] - 1 + 0.02;

    // pad: the chord, held for the bar
    const padV = this.themeName === 'over' ? 0.1 : this.themeName === 'title' ? 0.075 : 0.05;
    const calm = this.themeName === 'over' || this.themeName === 'title';
    if (s === 0) this._pad(t, chord.map((m) => m + 12), spb * 16, padV, calm ? 1300 : 500 + 900 * clamp01(lv / 3));
    if (this.themeName === 'over' || this.themeName === 'title') {
      if (this.themeName === 'title' && s % 4 === 0) this._pluck(t, this._degree(this.chordDeg + [0, 2, 4, 2][(s / 4) | 0], 2), 0.035);
    } else {
      // percussion
      if (live('perc')) {
        const kicks = lv > 2.5 ? [0, 3, 6, 8, 11, 14] : lv > 1.5 ? [0, 6, 8, 14] : [0, 8];
        if (kicks.includes(s)) this._kick(t, s % 8 === 0 ? 1 : 0.7);
        if (lv > 1.5 && (s === 4 || s === 12)) this._snare(t, 0.8);
        if (s % 2 === 0 || lv > 2.8) this._hat(t, s % 4 === 2 ? 0.5 : 0.3);
        if (lv > 2.5 && [0, 3, 10].includes(s)) this._taiko(t, s === 0 ? 1 : 0.7);
      }
      // bass: syncopated root and fifth
      if (live('bass')) {
        const pat = lv > 1.5 ? [0, 2, 3, 6, 8, 10, 11, 14] : [0, 3, 6, 8, 11, 14];
        if (pat.includes(s)) this._bass(t, this._degree(this.chordDeg + (s === 6 || s === 14 ? 4 : 0), -1), spb * 1.8, 0.16);
      }
      // arpeggio: chord tones in 16ths
      if (live('arp')) {
        const order = [0, 1, 2, 1, 0, 2, 1, 2];
        this._pluck(t, chord[order[s % 8]] + 24 + (s >= 8 && lv > 3.5 ? 12 : 0), 0.05);
      }
      // brass stabs
      if (live('brass') && (s === 0 || s === 10)) this._brass(t, chord.map((m) => m + 12), s === 0 ? 0.11 : 0.07);
      // lead motif
      if (live('lead') && th.motif.length) {
        if (this.motifLeft <= 0) {
          const [deg, len] = th.motif[this.motifPos % th.motif.length];
          this.motifPos++;
          this.motifLeft = len;
          if (deg != null) this._lead(t, this._degree(deg, lv > 3.5 ? 2 : 1), spb * len * 0.92, 0.06);
        }
        this.motifLeft--;
      }
    }
    this.step = (s + 1) % 16;
    if (this.step === 0) this.bar++;
  }

  // ------------------------------------------------------------------ instruments
  _env(g, t, a, peak, hold, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + release);
  }

  _osc(type, freq, t, end, dest, detune = 0) {
    const o = this.a._count(this.ctx.createOscillator());
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  _pad(t, notes, dur, v, cutoff) {
    if (this.a.busy()) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    this._env(g, t, Math.min(0.5, dur * 0.25), v, dur * 0.55, dur * 0.4);
    f.connect(g).connect(this.gains.pad);
    for (const m of notes) for (const d of [-7, 7]) this._osc('sawtooth', mtof(m), t, t + dur + 0.1, f, d);
  }

  _bass(t, m, dur, v) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.008, v, dur * 0.4, dur * 0.6);
    f.connect(g).connect(this.gains.bass);
    this._osc('sawtooth', mtof(m), t, t + dur + 0.05, f);
    this._osc('square', mtof(m - 12), t, t + dur + 0.05, f);
  }

  _pluck(t, m, v) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.004, v, 0.01, 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    f.connect(g).connect(this.themeName === 'title' ? this.gains.pad : this.gains.arp);
    this._osc('triangle', mtof(m), t, t + 0.3, f);
    this._osc('sine', mtof(m) * 2, t, t + 0.3, f);
  }

  _brass(t, notes, v) {
    if (this.a.busy()) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    const g = ctx.createGain();
    this._env(g, t, 0.03, v, 0.12, 0.5);
    f.connect(g).connect(this.gains.brass);
    for (const m of notes) for (const d of [-9, 0, 9]) this._osc('sawtooth', mtof(m), t, t + 0.75, f, d);
  }

  _lead(t, m, dur, v) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    this._env(g, t, 0.03, v, Math.max(0.02, dur - 0.18), 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.connect(g).connect(this.gains.lead);
    for (const [type, mul] of [['square', 1], ['triangle', 2]]) {
      const o = this._osc(type, mtof(m) * mul, t, t + dur + 0.2, f);
      this.vibDepth.connect(o.detune);
    }
  }

  _kick(t, v) {
    const ctx = this.ctx;
    const o = this.a._count(ctx.createOscillator());
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.42 * v, 0.02, 0.2);
    o.connect(g).connect(this.gains.perc);
    o.start(t);
    o.stop(t + 0.3);
  }

  _taiko(t, v) {
    const ctx = this.ctx;
    const o = this.a._count(ctx.createOscillator());
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.3);
    const g = ctx.createGain();
    this._env(g, t, 0.003, 0.4 * v, 0.03, 0.4);
    o.connect(g).connect(this.gains.perc);
    o.start(t);
    o.stop(t + 0.5);
    this._noise(t, 0.12 * v, 0.09, 'lowpass', 500);
  }

  _snare(t, v) {
    this._noise(t, 0.13 * v, 0.13, 'bandpass', 1900);
    const o = this.a._count(this.ctx.createOscillator());
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const g = this.ctx.createGain();
    this._env(g, t, 0.002, 0.06 * v, 0.01, 0.07);
    o.connect(g).connect(this.gains.perc);
    o.start(t);
    o.stop(t + 0.12);
  }

  _hat(t, v) {
    this._noise(t, 0.035 * v, 0.03, 'highpass', 7500);
  }

  _noise(t, v, dur, type, freq) {
    const ctx = this.ctx;
    const n = this.a._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    this._env(g, t, 0.002, v, 0.005, dur);
    n.connect(f).connect(g).connect(this.gains.perc);
    n.start(t, Math.random());
    n.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ stingers
  /** One-shot phrases: 'over' | 'best' | 'unlock' | 'clear'. */
  stinger(kind) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const root = this.theme.root + 12;
    const note = (m, at, len, v, type = 'triangle') => {
      const g = ctx.createGain();
      this._env(g, at, 0.02, v, len * 0.5, len * 0.6);
      g.connect(this.gains.pad);
      this._osc(type, mtof(m), at, at + len * 1.2, g);
      this._osc('sine', mtof(m + 12), at, at + len * 1.2, g);
    };
    if (kind === 'over') {
      [7, 5, 3, 0, -2].forEach((d, i) => note(root + d, t + i * 0.26, 0.5, 0.07));
    } else if (kind === 'best') {
      [0, 4, 7, 12, 16].forEach((d, i) => note(root + d, t + i * 0.09, 0.35, 0.06, 'square'));
      note(root + 24, t + 0.5, 0.9, 0.05);
    } else if (kind === 'unlock') {
      [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((ch, i) => this._brass(t + i * 0.22, ch.map((d) => root + d), 0.09));
      note(root + 24, t + 0.9, 1.2, 0.05);
    } else if (kind === 'clear') {
      this._brass(t, [0, 3, 7].map((d) => root + d), 0.1);
      this._brass(t + 0.3, [5, 8, 12].map((d) => root + d), 0.1);
    }
  }
}
