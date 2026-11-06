// Fully synthesized sound effects (WebAudio). Nothing to download.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('dragon.muted') === '1'; } catch { /* storage unavailable */ }
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startWind();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('dragon.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  _env(gainNode, t, a, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  _startWind() {
    const ctx = this.ctx;
    const src = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(bp.frequency);
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.windGain = g;
  }

  setWind(speedFactor) {
    if (!this.ctx) return;
    this.windGain.gain.setTargetAtTime(0.03 + speedFactor * 0.05, this.ctx.currentTime, 0.5);
  }

  footstep(intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.32 * intensity, 0.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    // sandy crunch
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = ctx.createGain();
    this._env(ng, t, 0.004, 0.08 * intensity, 0.12);
    n.connect(f).connect(ng).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  jump() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.22);
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.22, 0.25);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.35);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    const og = ctx.createGain();
    this._env(og, t, 0.01, 0.12, 0.14);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  land() {
    this.footstep(1.6);
  }

  /** A giant wing's downstroke: a soft, low push of air. intensity 0..1.3 */
  flutter(intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    const g = ctx.createGain();
    this._env(g, t, 0.05, 0.3 * intensity, 0.26);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.4);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    const og = ctx.createGain();
    this._env(og, t, 0.04, 0.12 * intensity, 0.18);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Chrome-style milestone beep
  milestone() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1046.5;
      const g = ctx.createGain();
      const s = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.06, s + 0.005);
      g.gain.setValueAtTime(0.06, s + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.1);
    }
  }

  roar(duration = 1.6, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    out.gain.setValueAtTime(0.5, t + duration * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.5); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2600, t + duration * 0.35);
    lp.frequency.exponentialRampToValueAtTime(500, t + duration);
    shaper.connect(lp).connect(out).connect(this.master);
    // growl: detuned saws with a slow pitch arc + amplitude flutter
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 23;
    const fg = ctx.createGain();
    fg.gain.value = 0.35;
    flutter.connect(fg);
    [1, 1.007, 0.5, 1.51].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 150 * pitch * m;
      o.frequency.setValueAtTime(f0 * 0.75, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.15, t + duration * 0.3);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + duration);
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.5 : 0.28;
      fg.connect(g.gain);
      o.connect(g).connect(shaper);
      o.start(t);
      o.stop(t + duration + 0.05);
    });
    flutter.start(t);
    flutter.stop(t + duration + 0.05);
    // breathy noise layer
    const n = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 0.4;
    n.connect(bp).connect(ng).connect(shaper);
    n.start(t, Math.random());
    n.stop(t + duration + 0.05);
  }

  breath(duration = 1.2) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(1200, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.08);
    g.gain.setValueAtTime(0.5, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + duration + 0.05);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(110, t + duration);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.15, t + 0.1);
    og.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    o.connect(lp).connect(og).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  explosion(size = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.6 * size);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.5 * size, 0.7 * size);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 1);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const og = ctx.createGain();
    this._env(og, t, 0.005, 0.5 * size, 0.45);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }

  hit() {
    if (!this.ctx) return;
    this.explosion(0.8);
    this.roar(0.9, 1.35);
  }

  denied() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.07, 0.12);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  charged() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      this._env(g, t + i * 0.06, 0.01, 0.09, 0.35);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.5);
    });
  }

  _tone(type, freq, t, a, peak, decay, dest = this.master) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    this._env(g, t, a, peak, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + decay + 0.05);
    return o;
  }

  /** Crystal pickup: a glassy chime that climbs a pentatonic scale with the combo chain. */
  crystal(step) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = [0, 2, 4, 7, 9];
    const semi = scale[step % 5] + 12 * Math.min(2, Math.floor(step / 5) % 3);
    const f = 880 * Math.pow(2, semi / 12);
    this._tone('sine', f, t, 0.003, 0.08, 0.28);
    this._tone('triangle', f * 2.01, t, 0.003, 0.03, 0.15);
  }

  multUp(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 523.25 * Math.pow(2, (level - 2) * 2 / 12);
    [1, 1.26, 1.5, 2].forEach((m, i) => this._tone('square', base * m, t + i * 0.045, 0.004, 0.045, 0.12));
  }

  chainBreak() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this._tone('sawtooth', 660, t, 0.004, 0.06, 0.32);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.3);
  }

  closeCall() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.3, 0.25);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.35);
    this._tone('sine', 1568, t + 0.05, 0.004, 0.05, 0.2);
  }

  /** Tank cannon: a hard crack over a deep thump. */
  cannon() {
    if (!this.ctx) return;
    this.explosion(0.55);
    const t = this.ctx.currentTime;
    const o = this._tone('square', 180, t, 0.002, 0.12, 0.08);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  }

  /** Incoming-fire beep pair. */
  warning() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone('square', 1320, t, 0.004, 0.04, 0.06);
    this._tone('square', 1320, t + 0.11, 0.004, 0.04, 0.06);
  }

  /** Boss alarm: a rising siren. */
  alarm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.55;
      const o = this._tone('sawtooth', 440, s, 0.02, 0.07, 0.48);
      o.frequency.setValueAtTime(440, s);
      o.frequency.linearRampToValueAtTime(880, s + 0.45);
    }
  }

  /** Heavy beating rotors (helicopters, the gunship). level 0..1, smoothed. */
  setRotor(level) {
    if (!this.ctx) return;
    if (!this.rotorGain) {
      const ctx = this.ctx;
      const src = this._noiseSrc();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 13;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(chop.gain);
      this.rotorGain = ctx.createGain();
      this.rotorGain.gain.value = 0;
      src.connect(lp).connect(chop).connect(this.rotorGain).connect(this.master);
      src.start();
      lfo.start();
    }
    this.rotorGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.25);
  }

  /** Taiko-style war drums for Kaiju Rage and the boss fight. 0 = off, 1 = normal, 2 = double time. */
  setDrums(mode) {
    if (!this.ctx || mode === this.drumMode) return;
    this.drumMode = mode;
    clearInterval(this._drumTimer);
    if (!mode) return;
    const beat = mode === 2 ? 0.15 : 0.21;
    const pattern = [1, 0, 0.5, 0, 0.8, 0.4, 0.6, 0];
    this._drumNext = this.ctx.currentTime + 0.05;
    this._drumStep = 0;
    const schedule = () => {
      // lookahead scheduler: queue every hit due in the next 0.25 s
      while (this._drumNext < this.ctx.currentTime + 0.25) {
        const v = pattern[this._drumStep++ % pattern.length];
        if (v) this._drum(this._drumNext, v);
        this._drumNext += beat;
      }
    };
    schedule();
    this._drumTimer = setInterval(schedule, 90);
  }

  _drum(t, v) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = this.ctx.createGain();
    this._env(g, t, 0.003, 0.42 * v, 0.24);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    const n = this._noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.002, 0.1 * v, 0.07);
    n.connect(f).connect(ng).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.12);
  }

  /** The smash lunge: a short heavy swish. */
  swing() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.16);
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.22, 0.16);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.25);
  }

  /** Something big gives way: crunch, thump and rubble. size 0.5..2 */
  crunch(size = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this._tone('square', 120, t, 0.002, 0.18 * size, 0.12);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.35 * size);
    const g = ctx.createGain();
    this._env(g, t, 0.003, 0.45 * Math.min(1.3, size), 0.35 * size);
    n.connect(f).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.8);
    // rubble patter
    for (let i = 0; i < 4; i++) {
      const s = t + 0.08 + Math.random() * 0.3;
      const k = this._noiseSrc();
      const kf = ctx.createBiquadFilter();
      kf.type = 'bandpass';
      kf.frequency.value = 600 + Math.random() * 900;
      const kg = ctx.createGain();
      this._env(kg, s, 0.002, 0.08, 0.05);
      k.connect(kf).connect(kg).connect(this.master);
      k.start(s, Math.random());
      k.stop(s + 0.08);
    }
  }

  /** Hitting something too solid to smash. */
  clang() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 1371, 2210].forEach((f, i) => this._tone('triangle', f, t, 0.002, 0.08 / (i + 1), 0.4));
  }

  /** A projectile batted back. */
  reflect() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._tone('square', 300, t, 0.003, 0.08, 0.2);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
    this._tone('sine', 2093, t + 0.04, 0.003, 0.06, 0.25);
  }

  /** Someone on the leaderboard just got passed. */
  passed() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [659.25, 987.77].forEach((f, i) => this._tone('triangle', f, t + i * 0.09, 0.005, 0.1, 0.3));
  }
}
