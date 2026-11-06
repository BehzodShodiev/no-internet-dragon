// Audio gate: renders the real mix (AudioEngine + Music) offline and measures it, since nobody can listen
// in a headless test. 1) the score through every theme and intensity: each section must be audible and
// the mix must never clip; 2) a worst case, every big sound at once over the loudest music: still no clip.
//   node tools/audiocheck.mjs [--url URL]
import { Session } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const { url, close } = await serve(A.url);
const s = await Session.launch({ w: 640, h: 360 });
await s.navigate(url);
await s.waitState('title', 90000);

const res = await s.evaluate(`(async () => {
  const { AudioEngine } = await import('/src/game/Audio.js');
  const SR = 44100;
  const Real = window.AudioContext;
  const make = (secs) => {
    window.AudioContext = function () { return new OfflineAudioContext(2, Math.ceil(SR * secs), SR); };
    const a = new AudioEngine();
    a.muted = false;
    a.init();
    window.AudioContext = Real;
    a.music.stop(); // driven by hand below
    clearInterval(a._crackle);
    a.busy = () => false; // offline, every note is queued before rendering, so the live-voice guard would misfire
    return a;
  };
  const measure = (buf, from, to) => {
    let peak = 0, sum = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = Math.floor(from * SR); i < Math.min(d.length, Math.floor(to * SR)); i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; }
    }
    return { peak: +peak.toFixed(3), rmsDb: +(10 * Math.log10(sum / Math.max(1, n) + 1e-12)).toFixed(1) };
  };
  // 1) the score: [theme, intensity, seconds]
  const plan = [['title', 0, 6], ['desert', 1, 6], ['desert', 2, 5], ['city', 2, 5], ['city', 3, 5], ['volcano', 3, 5], ['volcano', 4, 6], ['over', 0, 5]];
  const total = plan.reduce((t, p) => t + p[2], 0);
  const a = make(total + 1);
  const m = a.music;
  const LAYERS = { pad: 0, bass: 1, perc: 1, arp: 2, brass: 3, lead: 2 };
  let t = 0.05;
  const sections = [];
  for (const [theme, level, secs] of plan) {
    m.pending = theme; m.step = 0; m.level = level;
    for (const [name, at] of Object.entries(LAYERS)) m.gains[name].gain.setValueAtTime(name === 'pad' ? 1 : Math.max(0, Math.min(1, level - at + 1)), t);
    const end = t + secs;
    while (t < end) { m._playStep(t); t += 60 / m.theme.bpm / 4; }
    sections.push([theme + ' ' + level, end - secs, end]);
  }
  const buf = await a.ctx.startRendering();
  const score = sections.map(([name, a0, a1]) => ({ name, ...measure(buf, a0 + 0.5, a1) }));
  // 2) worst case: every big sound at once over the loudest music
  const b = make(4);
  b.music.level = 4;
  for (const k in b.music.gains) b.music.gains[k].gain.value = 1;
  b.music.pending = 'volcano';
  let u = 0.01;
  while (u < 3.5) { b.music._playStep(u); u += 60 / 122 / 4; }
  b.roar(1.6, 1, 'triple'); b.breath(1.3, 'gravity'); b.breath(1.3, 'atomic'); b.explosion(1.6); b.explosion(1.2); b.crunch(1.6); b.glass();
  b.missileLaunch(10); b.screech(15); b.cannon(); b.hit(1, 'growl'); b.music.stinger('unlock');
  const wb = await b.ctx.startRendering();
  const worst = measure(wb, 0, 4);
  return JSON.stringify({ score, worst });
})()`);
await s.close();
await close();
if (!res || res.__error) { console.log('audio check failed to run:', res?.__error || res); process.exit(1); }
const { score, worst } = JSON.parse(res);
let fail = 0;
for (const r of score) {
  const ok = r.peak <= 1.0 && r.rmsDb > -50;
  if (!ok) fail++;
  console.log(`${ok ? 'pass' : 'FAIL'}  score ${r.name.padEnd(10)} peak ${r.peak} · rms ${r.rmsDb} dB`);
}
const okW = worst.peak <= 1.0;
if (!okW) fail++;
console.log(`${okW ? 'pass' : 'FAIL'}  worst case (everything at once) peak ${worst.peak} · rms ${worst.rmsDb} dB`);
process.exit(fail ? 1 : 0);
