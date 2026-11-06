// Fully synthesized sound (WebAudio): effects, ambience and the procedural score (Music.js). Nothing to
// download. Mix: SFX, music, UI and ambience buses -> glue compressor -> limiter -> speakers, with a
// reverb send whose impulse is generated per biome. Every SFX method plays into this.master (the SFX bus).
import { Music } from './Music.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.biome = 'desert';
    this.live = 0; // sources currently playing (busy() lets optional sounds skip when the mix is crowded)
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
    // final mix: buses -> glue compressor -> brick-wall limiter -> speakers (mute and volume on this.out)
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.9;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    const limiter = (this.limiter = ctx.createDynamicsCompressor());
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    // the compressor isn't a true brick wall: a soft clipper catches the transients it lets through
    // (linear to 0.85, then a smooth knee that can never pass 0.97)
    const clip = ctx.createWaveShaper();
    const cc = new Float32Array(2049);
    for (let i = 0; i < cc.length; i++) {
      const x = (i / (cc.length - 1)) * 2 - 1, ax = Math.abs(x);
      cc[i] = Math.sign(x) * (ax <= 0.85 ? ax : 0.85 + 0.12 * Math.tanh((ax - 0.85) / 0.12));
    }
    clip.curve = cc;
    this.out.connect(glue).connect(limiter).connect(clip).connect(ctx.destination);
    const bus = (v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(this.out); return g; };
    this.master = bus(0.8); // sound effects
    this.musicLevel = 0.42;
    this.musicBus = bus(this.musicLevel);
    this.uiBus = bus(0.5);
    this.amb = bus(0.9);
    // reverb send (impulse per biome, see setBiome)
    this.reverb = ctx.createConvolver();
    const rev = ctx.createGain();
    rev.gain.value = 0.9;
    this.reverb.connect(rev).connect(this.out);
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.1;
    this.master.connect(this.sfxSend).connect(this.reverb);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.22;
    this.musicBus.connect(this.musicSend).connect(this.reverb);
    // shared noise buffer and the roar's distortion curve
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.shaperCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; this.shaperCurve[i] = Math.tanh(x * 3.5); }
    this._startWind();
    this._startAmbience();
    this.setBiome(this.biome);
    this.music = new Music(this, this.musicBus);
    this.music.start();
  }

  /** Too many sounds at once: optional ones (music pads, ticks) skip. */
  busy() {
    return this.live > 220;
  }

  _count(src) {
    this.live++;
    src.onended = () => { this.live--; };
    return src;
  }

  /** Dips the music under a big sound (roar, explosion) and brings it back. */
  duck(amount = 0.5, hold = 0.4) {
    if (!this.ctx) return;
    const g = this.musicBus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.musicLevel * (1 - amount), t, 0.03);
    g.setTargetAtTime(this.musicLevel, t + hold, 0.35);
  }

  /** Reverb size and ambience per biome: open desert, a city canyon, a dark volcanic hall. */
  setBiome(biome) {
    this.biome = biome;
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const spec = { desert: [1.2, 0.5, 0.06], city: [2.4, 0.35, 0.16], volcano: [2.8, 0.9, 0.13] }[biome] || [1.5, 0.5, 0.1];
    const [secs, dark, send] = spec;
    const n = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (1 - dark * 0.9); // darker biomes lose the highs
        d[i] = lp * Math.pow(1 - i / n, 2.6);
      }
    }
    this.reverb.buffer = buf;
    this.sfxSend.gain.setTargetAtTime(send, t, 0.3);
    this.musicSend.gain.setTargetAtTime(send * 1.6, t, 0.3);
    const want = { wind: biome === 'desert' ? 1 : biome === 'volcano' ? 0.35 : 0.2, city: biome === 'city' ? 1 : 0, lava: biome === 'volcano' ? 1 : 0 };
    for (const k in this.ambGains) this.ambGains[k].gain.setTargetAtTime(want[k] * (k === 'wind' ? 1 : 0.5), t, 1.2);
  }

  /** Looping beds for the city (hum and distant traffic) and the volcano (rumble and crackle). */
  _startAmbience() {
    const ctx = this.ctx;
    const chain = (type, freq, q, gain) => {
      const src = this._noiseSrc(true);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g);
      src.start();
      return { f, g };
    };
    const city = ctx.createGain();
    city.gain.value = 0;
    city.connect(this.amb);
    chain('lowpass', 160, 0.7, 0.18).g.connect(city);
    const traffic = chain('bandpass', 650, 0.5, 0.05);
    traffic.g.connect(city);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(traffic.f.frequency);
    lfo.start();
    const lava = ctx.createGain();
    lava.gain.value = 0;
    lava.connect(this.amb);
    const rumble = chain('lowpass', 70, 1, 0.35);
    rumble.g.connect(lava);
    const rl = ctx.createOscillator();
    rl.frequency.value = 0.21;
    const rg = ctx.createGain();
    rg.gain.value = 25;
    rl.connect(rg).connect(rumble.f.frequency);
    rl.start();
    this.ambGains = { wind: this.windBed, city, lava };
    // lava crackle: short bright ticks, only while the volcano bed is up
    this._crackle = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.biome !== 'volcano' || this.busy()) return;
      if (Math.random() < 0.55) {
        const t2 = this.ctx.currentTime + Math.random() * 0.1;
        const n = this._noiseSrc();
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800 + Math.random() * 2500;
        f.Q.value = 4;
        const g = this.ctx.createGain();
        this._env(g, t2, 0.002, 0.03 + Math.random() * 0.04, 0.04);
        n.connect(f).connect(g).connect(lava);
        n.start(t2, Math.random());
        n.stop(t2 + 0.08);
      }
    }, 140);
  }

  /** Paused or hidden: the whole sound world stops (the score resumes where it was). */
  setPaused(p) {
    if (!this.ctx) return;
    if (p && this.ctx.state === 'running') this.ctx.suspend();
    else if (!p && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** A stereo position for a sound at world x (the monster is at 0, threats come from the right). */
  _pan(x) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp((x - 3) / 26, -0.8, 0.8);
    p.connect(this.master);
    return p;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('dragon.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  _noiseSrc(persistent = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return persistent ? s : this._count(s);
  }

  _env(gainNode, t, a, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  _startWind() {
    const ctx = this.ctx;
    const src = this._noiseSrc(true);
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
    this.windBed = ctx.createGain();
    this.windBed.connect(this.amb);
    src.connect(bp).connect(g).connect(this.windBed);
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

  /** kind: 'growl' (the Kaiju), 'triple' (three heads, a beat apart), 'trill' (Mothra's high, fluttering cry). */
  roar(duration = 1.6, pitch = 1, kind = 'growl') {
    if (!this.ctx) return;
    this.duck(0.55, duration * 0.6);
    if (kind === 'triple') {
      [[1, 0, 0.62], [1.14, 0.08, 0.5], [0.86, 0.17, 0.5]].forEach(([p, d, v]) => this._roar(duration * 0.95, pitch * p, d, v, 23));
      return;
    }
    if (kind === 'trill') return this._roar(duration, pitch, 0, 0.75, 41);
    this._roar(duration, pitch, 0, 1, 23);
  }

  _roar(duration, pitch, delay, level, flutterHz) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.12);
    out.gain.setValueAtTime(0.5 * level, t + duration * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.shaperCurve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2600, t + duration * 0.35);
    lp.frequency.exponentialRampToValueAtTime(500, t + duration);
    shaper.connect(lp).connect(out).connect(this.master);
    // growl: detuned saws with a slow pitch arc + amplitude flutter
    const flutter = ctx.createOscillator();
    flutter.frequency.value = flutterHz;
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

  /** kind: 'atomic' (the Kaiju's roaring beam), 'gravity' (Ghidorah's crackling, pulsing beams), 'dust' (Mothra's shimmering scale storm). */
  breath(duration = 1.2, kind = 'atomic') {
    if (!this.ctx) return;
    this.duck(0.45, duration);
    if (kind === 'gravity') return this._gravityBeam(duration);
    if (kind === 'dust') return this._dustBeam(duration);
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
    if (size >= 0.8) this.duck(0.3 * Math.min(1, size), 0.25);
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

  hit(pitch = 1, kind = 'growl') {
    if (!this.ctx) return;
    this.explosion(0.8);
    this.roar(0.9, 1.35 * pitch, kind);
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
    const o = this._count(this.ctx.createOscillator());
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
      const src = this._noiseSrc(true);
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

  /** Tank treads: a low engine growl chopped into clanks, louder as a tank rolls close. level 0..1. */
  setTreads(level) {
    if (!this.ctx) return;
    if (!this.treadGain) {
      const ctx = this.ctx;
      const src = this._noiseSrc(true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const chop = ctx.createGain();
      chop.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 9;
      const lg = ctx.createGain();
      lg.gain.value = 0.4;
      lfo.connect(lg).connect(chop.gain);
      const engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 46;
      const eg = ctx.createGain();
      eg.gain.value = 0.05;
      this.treadGain = ctx.createGain();
      this.treadGain.gain.value = 0;
      src.connect(lp).connect(chop).connect(this.treadGain);
      engine.connect(eg).connect(this.treadGain);
      this.treadGain.connect(this.master);
      src.start();
      lfo.start();
      engine.start();
    }
    this.treadGain.gain.setTargetAtTime(level * 0.35, this.ctx.currentTime, 0.3);
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

  /** Ghidorah's gravity beams: twin buzzing saws chopped by a fast tremolo, with crackles. */
  _gravityBeam(duration) {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.06);
    out.gain.setValueAtTime(0.3, t + duration * 0.75);
    out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    const lfo = this._count(ctx.createOscillator());
    lfo.type = 'square';
    lfo.frequency.value = 27;
    const lg = ctx.createGain();
    lg.gain.value = 0.45;
    lfo.connect(lg).connect(trem.gain);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + duration * 0.5);
    bp.frequency.exponentialRampToValueAtTime(900, t + duration);
    trem.connect(bp).connect(out).connect(this.master);
    for (const f of [96, 143.5]) {
      const o = this._count(ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.35, t + duration);
      o.connect(trem);
      o.start(t);
      o.stop(t + duration + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + duration + 0.05);
    for (let i = 0; i < 7; i++) {
      const s2 = t + 0.08 + Math.random() * (duration - 0.2);
      const n = this._noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = ctx.createGain();
      this._env(g, s2, 0.002, 0.12, 0.05);
      n.connect(f).connect(g).connect(this.master);
      n.start(s2, Math.random());
      n.stop(s2 + 0.08);
    }
  }

  /** Mothra's scale storm: a bright hiss swelling under a cascade of glassy chimes. */
  _dustBeam(duration) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2500, t);
    hp.frequency.exponentialRampToValueAtTime(6000, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + duration + 0.05);
    const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    for (let i = 0; i * 0.055 < duration - 0.1; i++) {
      const f = 1046.5 * Math.pow(2, scale[(i * 3) % scale.length] / 12);
      this._tone('sine', f, t + i * 0.055, 0.004, 0.035, 0.25);
    }
    const o = this._tone('triangle', 330, t, 0.1, 0.06, duration);
    o.frequency.linearRampToValueAtTime(660, t + duration);
  }

  /** A pterodactyl's cry as it comes in (x: where it is, for stereo). */
  screech(x = 20) {
    if (!this.ctx || this.busy()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this._count(ctx.createOscillator());
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.4);
    const vib = this._count(ctx.createOscillator());
    vib.frequency.value = 31;
    const vg = ctx.createGain();
    vg.gain.value = 70;
    vib.connect(vg).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 2;
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.07, 0.4);
    o.connect(bp).connect(g).connect(this._pan(x));
    o.start(t);
    o.stop(t + 0.5);
    vib.start(t);
    vib.stop(t + 0.5);
  }

  /** A missile leaving the gunship: a rising rush and a pop. */
  missileLaunch(x = 15) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.2, 0.4);
    const pan = this._pan(x);
    n.connect(f).connect(g).connect(pan);
    n.start(t, Math.random());
    n.stop(t + 0.5);
    const o = this._tone('square', 140, t, 0.002, 0.07, 0.06, pan);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
  }

  /** A falling meteor: a descending whistle that lasts as long as its fall. */
  meteorWhistle(x = 20, dur = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this._count(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this._pan(x));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Windows giving way: bright tinkles after the crunch. */
  glass() {
    if (!this.ctx || this.busy()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const s2 = t + 0.04 + Math.random() * 0.35;
      this._tone('sine', 2600 + Math.random() * 3400, s2, 0.001, 0.025 + Math.random() * 0.02, 0.12 + Math.random() * 0.15);
    }
  }

  /** Interface sounds: 'hover' | 'select' | 'open' | 'close'. */
  ui(kind = 'select') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const b = this.uiBus;
    if (kind === 'hover') this._tone('sine', 1760, t, 0.002, 0.025, 0.04, b);
    else if (kind === 'select') { this._tone('triangle', 880, t, 0.002, 0.07, 0.07, b); this._tone('sine', 1320, t + 0.035, 0.002, 0.05, 0.08, b); }
    else if (kind === 'open') { const o = this._tone('triangle', 520, t, 0.004, 0.06, 0.14, b); o.frequency.exponentialRampToValueAtTime(980, t + 0.12); }
    else if (kind === 'close') { const o = this._tone('triangle', 980, t, 0.004, 0.05, 0.12, b); o.frequency.exponentialRampToValueAtTime(520, t + 0.1); }
  }
}
