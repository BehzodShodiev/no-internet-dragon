// Mothra: a procedural giant moth, the first flying monster. It has the same interface as Dragon (group,
// update, getHitboxes, getMouthWorld, getSideMouths, setGlow, setRage, setSkin, glowColor, hitX, roar,
// onFootstep), so Game drives both the same way.
//
// Everything is built in world units under `root`, which cancels the group's DRAGON_SCALE, so Game's
// scaling of the group (Kaiju Rage, the build's x-width) applies exactly as it does to the dragon.
// The body flies nose-up like a real moth: head high in front, abdomen trailing low behind, much like the
// dragon's head and tail. She skims the ground on her middle and hind legs while the wings beat, so her
// hitboxes keep the Kaiju's heights (running, ducking and airborne) and ground obstacles still need a jump.
// Wings, antennae and the front legs are decoration, like Ghidorah's wings.
import * as THREE from 'three';
import { sweep, mergeGeometries } from '../gfx/geometry.js';
import { heightToNormal } from '../gfx/textures.js';
import { createTileableNoise } from '../gfx/noise.js';
import { DRAGON_SCALE } from './Dragon.js';

const RAGE = new THREE.Color(0xff4a0c);
const TAU = Math.PI * 2;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const lerp = (a, b, t) => a + (b - a) * t;
/** Smooth interpolation through (keys, vals). */
function curve(keys, vals, t) {
  if (t <= keys[0]) return vals[0];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t <= keys[i + 1]) {
      const f = (t - keys[i]) / (keys[i + 1] - keys[i]);
      return lerp(vals[i], vals[i + 1], f * f * (3 - 2 * f));
    }
  }
  return vals[vals.length - 1];
}

// ---- pose (world units, relative to the group's origin on the ground) ----
const BODY_X = 1.15; // thorax centre
const FLY_Y = 1.56; // thorax height while skimming along
const FLY_PITCH = 0.28; // nose up
const DUCK_Y = 0.94;
const DUCK_PITCH = 0.05;
const L1 = 0.85, L2 = 1.05; // femur, tibia (with the claw)

// Leg roots on the thorax underside (body space, right side): front, middle, hind.
const LEG_ROOTS = [V(0.32, -0.25, 0.16), V(0.02, -0.33, 0.2), V(-0.3, -0.3, 0.2)];
// Middle and hind legs skim the ground: where their tips plant (group space) and their gait phase.
const GROUND_LEGS = [
  { pair: 1, side: 1, x: 1.0, z: 0.95, ph: 0 }, { pair: 1, side: -1, x: 1.0, z: 0.95, ph: 0.5 },
  { pair: 2, side: 1, x: 0.4, z: 1.0, ph: 0.5 }, { pair: 2, side: -1, x: 0.4, z: 1.0, ph: 0 },
];

// ---- wings: a fan from the root, (u, v) = (out along the span, from leading edge to inner margin) ----
// In the wing's own space: x forward, z outward, y up (the right wing; the left one is mirrored).
const FORE = {
  root: [0.25, -0.35], th: [0.2, -1.4], scallop: 0,
  rk: [0, 0.08, 0.3, 0.55, 0.75, 0.9, 1], rv: [2.75, 3.0, 2.6, 2.05, 1.6, 1.25, 1.0],
};
const HIND = {
  root: [0.1, -0.45], th: [-0.45, -1.62], scallop: 0.035,
  rk: [0, 0.25, 0.5, 0.75, 1], rv: [1.75, 2.1, 2.05, 1.8, 1.15],
};
function wingPoint(w, u, v, out) {
  const R = curve(w.rk, w.rv, v) * (1 - w.scallop * Math.abs(Math.sin(v * Math.PI * 5)));
  const th = lerp(w.th[0], w.th[1], v);
  out.x = lerp(w.root[0], w.root[1], v) + u * R * Math.sin(th);
  out.y = 0.1 * Math.sin(Math.PI * v) * u * (1 - 0.5 * u); // a slight camber
  out.z = 0.02 + u * R * Math.cos(th);
  return out;
}

function dataTexture(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Fine fur running along the body (u): streaky height noise, as colour variation and a normal map. */
function makeFur(size = 256) {
  const tn = createTileableNoise(77);
  const hgt = new Float32Array(size * size);
  const col = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const h = 0.6 * tn.noise(u * 6, v * 48, 6, 48) + 0.4 * tn.noise(u * 12, v * 96, 12, 96);
      const i = y * size + x;
      hgt[i] = h;
      const t = clamp01(0.78 + 0.3 * h + 0.08 * tn.noise(u * 4, v * 4, 4, 4));
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = t * 255;
      col[i * 4 + 3] = 255;
    }
  }
  return { map: dataTexture(col, size, size, true), normalMap: dataTexture(heightToNormal(hgt, size, size, 2.2), size, size, false) };
}

/**
 * Paints a wing in its (u, v) space: amber to gold, dark veins radiating from the root, a zig-zag band,
 * a big eyespot, and a dark border with pale spots. Also a colour glow map (the eyespots and spots glow).
 */
function makeWingTextures(w, hind, W = 256, H = 256) {
  const col = new Uint8Array(W * H * 4);
  const glow = new Uint8Array(W * H * 4);
  const P = V(0, 0, 0);
  const E = wingPoint(w, hind ? 0.55 : 0.6, hind ? 0.5 : 0.42, V(0, 0, 0));
  const eR = hind ? 0.4 : 0.44;
  const E2 = wingPoint(w, 0.8, 0.1, V(0, 0, 0)); // small apex spot (forewing)
  const veins = hind ? 6 : 8;
  const span = Math.abs(w.th[1] - w.th[0]);
  const c = [0, 0, 0], g = [0, 0, 0];
  const mix = (arr, rgb, k) => { for (let i = 0; i < 3; i++) arr[i] += (rgb[i] - arr[i]) * k; };
  const root = [92, 52, 24], dark = [34, 19, 11], cream = [255, 236, 172];
  const baseA = hind ? [196, 74, 22] : [214, 118, 30], baseB = hind ? [236, 142, 44] : [246, 196, 74];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = (j + 0.5) / H;
      wingPoint(w, u, v, P);
      const R = curve(w.rk, w.rv, v);
      const across = span * u * R; // physical length of one unit of v at this u
      c[0] = baseA[0]; c[1] = baseA[1]; c[2] = baseA[2];
      mix(c, baseB, smooth(0.4, 0.85, u) * 0.75);
      g[0] = 26; g[1] = 12; g[2] = 3; // a faint warm glow everywhere
      // zig-zag band across the middle, its edges glowing
      const bandU = 0.34 + 0.035 * Math.sin(v * TAU * 4);
      const bd = Math.abs(u - bandU) * R;
      if (bd < 0.075) { mix(c, dark, smooth(0.075, 0.045, bd)); mix(g, [110, 50, 12], smooth(0.075, 0.05, bd) * smooth(0.02, 0.05, bd)); }
      // veins: radial, plus the arc closing the discal cell
      let vd = Infinity;
      for (let k = 1; k < veins; k++) vd = Math.min(vd, Math.abs(v - (k / veins + 0.012 * Math.sin(u * 9 + k))) * across);
      vd = Math.min(vd, Math.abs(u - 0.47) * R + (v > 0.15 && v < 0.75 ? 0 : 1));
      const vein = smooth(0.034, 0.012, vd) * smooth(0.06, 0.2, u);
      mix(c, [60, 30, 14], vein * 0.85);
      // dark leading edge
      mix(c, dark, smooth(0.09, 0.03, v * across) * smooth(0.05, 0.15, u));
      // the eyespot: blue-white core, yellow ring, black ring, red halo
      const er = Math.hypot(P.x - E.x, P.z - E.z) / eR;
      if (er < 1) {
        if (er < 0.3) { mix(c, [150, 225, 255], smooth(0.3, 0.22, er)); mix(g, [110, 215, 255], smooth(0.3, 0.2, er)); }
        else if (er < 0.52) { mix(c, [255, 216, 92], 1); mix(g, [255, 186, 60], 0.75); }
        else if (er < 0.75) mix(c, [22, 12, 8], 1);
        else mix(c, [190, 56, 18], smooth(1, 0.82, er));
        if (er < 0.33) mix(c, [255, 255, 255], smooth(0.12, 0.0, Math.hypot(P.x - E.x - 0.06, P.z - E.z - 0.05) / eR) * 0.8); // highlight
      }
      if (!hind) {
        const e2 = Math.hypot(P.x - E2.x, P.z - E2.z) / 0.15;
        if (e2 < 1) { mix(c, [255, 246, 214], smooth(1, 0.7, e2)); mix(g, [255, 236, 190], smooth(1, 0.6, e2)); }
      }
      // dark border with a row of pale spots between the veins
      const edge = 0.86 - 0.025 * Math.cos(v * TAU * (veins - 1));
      if (u > edge - 0.02) {
        mix(c, dark, smooth(edge - 0.02, edge + 0.01, u));
        const sv = (Math.floor(v * veins) + 0.5) / veins;
        const sd = Math.hypot((u - 0.93) * R, (v - sv) * across) / 0.075;
        if (sd < 1) { mix(c, cream, smooth(1, 0.55, sd)); mix(g, [255, 214, 140], smooth(1, 0.5, sd)); }
      }
      // furry root
      mix(c, root, smooth(0.16, 0.04, u));
      mix(g, [0, 0, 0], smooth(0.2, 0.08, u));
      const o = (j * W + i) * 4;
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; col[o + 3] = 255;
      glow[o] = g[0]; glow[o + 1] = g[1]; glow[o + 2] = g[2]; glow[o + 3] = 255;
    }
  }
  const map = dataTexture(col, W, H, true), glowMap = dataTexture(glow, W, H, true);
  map.wrapS = map.wrapT = glowMap.wrapS = glowMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, glowMap };
}

/** A fan-shaped wing mesh (uv = (u, v) of the fan, so the painted pattern lines up). */
function wingGeometry(w, nu = 12, nv = 30) {
  const pos = [], uv = [], idx = [];
  const P = V(0, 0, 0);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      wingPoint(w, u, v, P);
      pos.push(P.x, P.y, P.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function clean(g) {
  const keep = ['position', 'normal', 'uv', 'color'];
  const q = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
  if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
  if (!q.attributes.color) q.setAttribute('color', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 3).fill(1), 3));
  return q;
}
function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export class Moth {
  constructor() {
    this.variant = 'mothra';
    this.flyer = true;
    this.group = new THREE.Group();
    this.group.name = 'mothra';
    this.group.scale.setScalar(DRAGON_SCALE);
    this.root = new THREE.Group();
    this.root.scale.setScalar(1 / DRAGON_SCALE);
    this.group.add(this.root);
    this.time = 0;
    this.run = 0;
    this.air = 0;
    this.duck = 0;
    this.dead = 0;
    this.roar = 0;
    this.breath = 0;
    this.bite = 0;
    this.glide = 0;
    this.rise = 0;
    this.beat = 0; // wingbeat phase (0..1)
    this.gait = 0; // leg phase
    this.stroke = 0;
    this.glowColor = new THREE.Color(0xfff2d8);
    this.eyeColor = new THREE.Color(0x3ab8ff);
    this.wingTint = new THREE.Color(1, 1, 1);
    this.hitX = 1;
    this.onFootstep = null; // she has no footfalls
    this.onWingbeat = null; // (strength 0..1) at the start of every downstroke
    this._buildMaterials();
    this._buildMeshes();
    this._tmp = V(0, 0, 0);
    this._inv = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._a = V(0, 0, 0);
    this._b = V(0, 0, 0);
    this._k = V(0, 0, 0);
    this._h = V(0, 0, 0);
    this._one = V(1, 1, 1);
    this._Y = V(0, 1, 0);
    this.update(0, { speed: 0, grounded: true, vy: 0 });
  }

  _buildMaterials() {
    const fur = makeFur();
    this.furMat = new THREE.MeshStandardMaterial({
      map: fur.map, normalMap: fur.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
      vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.8,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x10263f, emissive: 0x3ab8ff, emissiveIntensity: 1.5, roughness: 0.12, metalness: 0.2,
    });
    // the wings glow like the Kaiju's plates: a base level plus a wave running out along the span
    this.wingUniforms = { uGlow: { value: 0.35 }, uWaveAmp: { value: 0 }, uWavePos: { value: -1 }, uFlex: { value: 0 } };
    const wingMat = (tex) => {
      const m = new THREE.MeshStandardMaterial({
        map: tex.map, emissiveMap: tex.glowMap, emissive: 0xfff2d8, emissiveIntensity: 1,
        side: THREE.DoubleSide, roughness: 0.72, metalness: 0.04,
      });
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, this.wingUniforms);
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uFlex;\nvarying float vSpan;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpan = uv.x;\ntransformed.y += uFlex * uv.x * uv.x;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uWaveAmp;\nuniform float uWavePos;\nvarying float vSpan;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance *= uGlow + uWaveAmp * exp(-pow((vSpan - uWavePos) * 5.0, 2.0));`);
      };
      m.customProgramCacheKey = () => 'mothwing';
      return m;
    };
    this.foreMat = wingMat(makeWingTextures(FORE, false, 512, 256));
    this.hindMat = wingMat(makeWingTextures(HIND, true, 256, 256));
    this.wingMats = [this.foreMat, this.hindMat];
  }

  _buildMeshes() {
    const brown = new THREE.Color(0x4a2c18), brownLo = new THREE.Color(0x6e4524), ochre = new THREE.Color(0xb57b30);
    const dark = new THREE.Color(0x2c1a10), cream = new THREE.Color(0xeee2c4);
    const add = (parent, geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    };
    const body = (this.body = new THREE.Group());
    this.root.add(body);

    // ---- thorax with a fluffy collar ----
    const thorax = sweep({
      points: [V(-0.55, -0.03), V(-0.2, 0.01), V(0.2, 0.03), V(0.55, 0.05)],
      segments: 30, radial: 28, uvScale: [1.5, 2],
      section: (t, a, out) => {
        const r = curve([0, 0.2, 0.6, 1], [0.24, 0.47, 0.5, 0.3], t) * (1 + 0.04 * Math.sin(a * 7 + t * 13));
        out.x = Math.sin(a) * r * 1.02;
        out.y = Math.cos(a) * r * 0.95;
      },
      color: (t, a, out) => out.copy(brown).lerp(brownLo, smooth(0.3, -0.8, Math.cos(a))),
      capStart: true, capEnd: true,
    });
    const collar = sweep({
      points: [V(0.28, 0.02), V(0.45, 0.04), V(0.66, 0.06)],
      segments: 16, radial: 36, uvScale: [0.8, 3],
      section: (t, a, out) => {
        const tuft = 1 + 0.12 * Math.max(0, Math.sin(a * 9)) * Math.sin(Math.PI * t);
        const r = (0.2 + 0.3 * Math.pow(Math.sin(Math.PI * t), 0.7)) * tuft;
        out.x = Math.sin(a) * r;
        out.y = Math.cos(a) * r * 0.92;
      },
      color: (t, a, out) => out.copy(cream).lerp(brownLo, smooth(0.2, -0.9, Math.cos(a)) * 0.5),
    });
    add(body, mergeGeometries([thorax, collar].map(clean), false), this.furMat);

    // ---- abdomen: banded segments, on its own pivot so it can pump and curl ----
    this.abdomen = new THREE.Group();
    this.abdomen.position.set(-0.42, -0.02, 0);
    body.add(this.abdomen);
    const abd = sweep({
      points: [V(0.15, 0.02), V(-0.4, -0.04), V(-0.95, -0.12), V(-1.4, -0.22), V(-1.62, -0.28)],
      segments: 70, radial: 26, uvScale: [3, 2],
      section: (t, a, out) => {
        const s = (t * 7) % 1;
        const r = curve([0, 0.2, 0.5, 0.82, 1], [0.3, 0.38, 0.35, 0.2, 0.05], t) * (0.93 + 0.09 * Math.sin(Math.PI * s));
        out.x = Math.sin(a) * r;
        out.y = Math.cos(a) * r * 0.96;
      },
      color: (t, a, out) => {
        const s = (t * 7) % 1;
        out.copy(dark).lerp(ochre, smooth(0.45, 0.8, s) * 0.85).lerp(brownLo, smooth(0.2, -0.8, Math.cos(a)) * 0.4);
      },
      capEnd: true,
    });
    add(this.abdomen, clean(abd), this.furMat);

    // ---- head: big blue compound eyes, palps, feathery antennae ----
    this.head = new THREE.Group();
    this.head.position.set(0.55, 0.06, 0);
    body.add(this.head);
    const skull = sweep({
      points: [V(0.0, 0.0), V(0.25, 0.04), V(0.55, 0.05), V(0.8, 0.0), V(0.9, -0.05)],
      segments: 30, radial: 28, uvScale: [1, 1.5],
      section: (t, a, out) => {
        const r = curve([0, 0.25, 0.55, 0.85, 1], [0.2, 0.33, 0.35, 0.25, 0.06], t);
        out.x = Math.sin(a) * r * 1.04;
        out.y = Math.cos(a) * r * 0.94;
      },
      color: (t, a, out) => out.copy(dark).lerp(brownLo, smooth(0.6, 1, t) * 0.6),
      capEnd: true,
    });
    const parts = [skull];
    for (const s of [1, -1]) {
      const palp = new THREE.ConeGeometry(0.05, 0.26, 8).rotateZ(Math.PI / 2 + 0.5).translate(0.88, -0.16, 0.08 * s);
      parts.push(paint(palp, 0x6e4524));
      // antenna: a curved shaft with a comb of filaments on both sides
      const pts = [V(0.6, 0.24, 0.1 * s), V(0.72, 0.75, 0.32 * s), V(0.55, 1.25, 0.58 * s), V(0.25, 1.55, 0.74 * s)];
      parts.push(sweep({
        points: pts, segments: 24, radial: 6, curveType: 'catmullrom',
        section: (t, a, out) => { const r = 0.035 * (1 - 0.55 * t); out.x = Math.sin(a) * r; out.y = Math.cos(a) * r; },
        color: (t, a, out) => out.set(0x5a321a),
        capEnd: true,
      }));
      const shaft = new THREE.CatmullRomCurve3(pts, false, 'catmullrom');
      const P = V(0, 0, 0), T = V(0, 0, 0), N = V(0, 0, 0);
      for (let k = 0; k < 20; k++) {
        const t = 0.1 + (0.86 * k) / 19;
        shaft.getPointAt(t, P);
        shaft.getTangentAt(t, T);
        N.crossVectors(T, V(0, 0, 1)).normalize();
        for (const d of [1, -1]) {
          const len = 0.22 * (1 - 0.6 * t) * smooth(0.05, 0.25, t);
          const dir = N.clone().multiplyScalar(d).addScaledVector(T, 0.55).normalize();
          const f = new THREE.CylinderGeometry(0.006, 0.011, len, 4).translate(0, len / 2, 0);
          f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
          f.translate(P.x, P.y, P.z);
          parts.push(paint(f, 0x7a4524));
        }
      }
    }
    add(this.head, mergeGeometries(parts.map(clean), false), this.furMat);
    const eyes = [1, -1].map((s) => new THREE.SphereGeometry(0.21, 22, 16).scale(1.15, 1, 0.9).translate(0.5, 0.07, 0.25 * s));
    add(this.head, mergeGeometries(eyes.map(clean), false), this.eyeMat, false);

    // ---- wings: rooted on top of the thorax, the left ones mirrored ----
    const foreGeo = wingGeometry(FORE), hindGeo = wingGeometry(HIND, 10, 24);
    this.wings = [];
    for (const side of [1, -1]) {
      for (const [geo, mat, root, hind] of [[foreGeo, this.foreMat, V(0.12, 0.3, 0.2), false], [hindGeo, this.hindMat, V(-0.22, 0.22, 0.2), true]]) {
        const pivot = new THREE.Group();
        pivot.position.set(root.x, root.y, root.z * side);
        pivot.scale.z = side;
        const mesh = add(pivot, geo, mat);
        mesh.receiveShadow = false;
        body.add(pivot);
        this.wings.push({ pivot, mesh, side, hind });
      }
    }

    // ---- legs: femur and tibia per leg, instanced, placed by 2-bone IK every frame ----
    const femur = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.095, L1, 10).translate(0, L1 / 2, 0),
      new THREE.SphereGeometry(0.085, 10, 8).translate(0, L1, 0),
    ].map((g) => paint(clean(g), 0x3a2414)), false);
    const tibia = mergeGeometries([
      new THREE.CylinderGeometry(0.035, 0.07, L2 - 0.1, 10).translate(0, (L2 - 0.1) / 2, 0),
      new THREE.ConeGeometry(0.04, 0.16, 6).rotateZ(-0.35).translate(0.02, L2 - 0.05, 0),
    ].map((g) => paint(clean(g), 0x4a2c18)), false);
    this.femurs = new THREE.InstancedMesh(femur, this.furMat, 6);
    this.tibias = new THREE.InstancedMesh(tibia, this.furMat, 6);
    for (const m of [this.femurs, this.tibias]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      body.add(m);
    }
    this.legs = [];
    for (let pair = 0; pair < 3; pair++) {
      for (const side of [1, -1]) {
        const r = LEG_ROOTS[pair];
        const gl = GROUND_LEGS.find((l) => l.pair === pair && l.side === side);
        const tip = new THREE.Object3D();
        body.add(tip);
        this.legs.push({ pair, side, hip: V(r.x, r.y, r.z * side), ground: gl || null, tip, target: V(0, 0, 0) });
      }
    }

    // ---- anchors: hitbox centres (placed to match the Kaiju's boxes), mouth ----
    const mk = (parent, x, y) => { const o = new THREE.Object3D(); o.position.set(x, y, 0); parent.add(o); return o; };
    this.anchor = {
      head: mk(this.head, 0.567, 0.188),
      // the beam leaves just below the face, between the palps
      snout: mk(this.head, 0.664, -0.18),
      neck: mk(body, 0.273, 0.12),
      chest: mk(body, -0.208, 0.071),
      hips: mk(body, -1.102, 0.287),
    };
  }

  setGlow(base, waveAmp, wavePos) {
    const u = this.wingUniforms;
    u.uGlow.value = base;
    u.uWaveAmp.value = waveAmp;
    u.uWavePos.value = wavePos;
  }

  /** 0 = her own glow, 1 = Kaiju Rage's burning red-orange. */
  setRage(k) {
    for (const m of this.wingMats) {
      m.emissive.copy(this.glowColor).lerp(RAGE, k);
      m.color.copy(this.wingTint).multiplyScalar(1 - 0.35 * k);
    }
    this.eyeMat.emissive.copy(this.eyeColor).lerp(RAGE, k);
  }

  /** Applies her look (Monsters.js): body and wing tints, glow, eyes, build. */
  setSkin(look) {
    this.skin = look;
    this.furMat.color.setRGB(...look.skin);
    this.wingTint.setRGB(...look.plate);
    this.glowColor.set(look.glow);
    this.eyeColor.set(look.eye);
    this.hitX = look.hitX;
    this.setRage(0);
  }

  /**
   * st: { speed, grounded, vy, ducking, running, dead, roar (0..1), breath (0..1), bite (0..1), glide (bool) }
   */
  update(dt, st) {
    this.time += dt;
    const time = this.time;
    this.run = damp(this.run, st.running ? 1 : 0, 6, dt);
    this.air = damp(this.air, st.grounded ? 0 : 1, 14, dt);
    this.duck = damp(this.duck, st.ducking ? 1 : 0, 18, dt);
    this.dead = damp(this.dead, st.dead ? 1 : 0, 8, dt);
    this.roar = damp(this.roar, st.roar || 0, 8, dt);
    this.breath = damp(this.breath, st.breath || 0, 12, dt);
    this.bite = damp(this.bite, st.bite || 0, 30, dt);
    this.glide = damp(this.glide, st.glide ? 1 : 0, 10, dt);
    this.rise = damp(this.rise, !st.grounded && (st.vy || 0) > 0 ? 1 : 0, 12, dt);
    const speed = Math.max(0, st.speed || 0);
    const { run, duck, dead, roar, breath, bite, glide, rise } = this;
    const air = this.air;

    // ---- wingbeat: blend the stroke (mean angle, amplitude, rate, sweep, twist) between states ----
    let p0 = 0.35, amp = 0.5, hz = 1.1, sweepB = 0, twist = 0;
    const to = (k, P0, A, F, S = 0, T = 0) => {
      p0 = lerp(p0, P0, k); amp = lerp(amp, A, k); hz = lerp(hz, F, k); sweepB = lerp(sweepB, S, k); twist = lerp(twist, T, k);
    };
    to(run, 0.3, 0.72, 1.7 + 0.03 * speed);
    to(rise, 0.3, 0.85, 2.8 + 0.03 * speed);
    to(glide, 0.1, 0.07, 3.2, -0.12, 0.06);
    to(duck, -0.02, 0.05, 4.5, -1.05, 0.12);
    to(breath, 0.3, 0.13, 6);
    to(roar, 0.95, 0.16, 3.4, 0.1);
    to(bite, -0.3, 0.1, 3, 0.15, -0.1);
    to(dead, -0.35, 0, 0, -0.5, 0);
    const prev = this.beat;
    this.beat = (this.beat + dt * hz) % 1;
    // the downstroke starts at the top of the stroke (phase 0.25)
    if (dt > 0 && prev < 0.25 && this.beat >= 0.25 && amp > 0.3 && this.onWingbeat) this.onWingbeat(Math.min(1, amp / 0.72) * (1 - dead));
    const stroke = p0 + amp * Math.sin(this.beat * TAU);
    const dStroke = dt > 0 ? (stroke - this.stroke) / dt : 0;
    this.stroke = stroke;
    this.wingUniforms.uFlex.value = THREE.MathUtils.clamp(-0.035 * dStroke, -0.35, 0.35);
    for (const { pivot, side, hind } of this.wings) {
      const s = stroke - (hind ? 0.12 : 0); // the hind wings trail a little
      pivot.rotation.set(-side * s, side * (sweepB + (hind ? 0.08 : 0)), twist - 0.12 * Math.cos(this.beat * TAU) * amp);
    }

    // ---- body: skims along nose-up, rising on each downstroke; crouches level to duck ----
    const lift = -0.07 * Math.cos(this.beat * TAU) * (amp / 0.72) * (1 - duck) * (1 - dead) * (1 - glide);
    const vyTilt = THREE.MathUtils.clamp((st.vy || 0) * 0.012, -0.2, 0.2) * air;
    let by = lerp(FLY_Y, DUCK_Y, duck) + lift + 0.1 * roar - 0.12 * bite;
    let pitch = lerp(FLY_PITCH, DUCK_PITCH, duck) + 0.03 * Math.sin(this.beat * TAU + 1) * (1 - duck) + vyTilt
      + 0.15 * roar - 0.22 * bite - 0.04 * breath;
    by = lerp(by, 0.5, dead);
    pitch = lerp(pitch, -0.06, dead);
    this.body.position.set(BODY_X + 0.25 * bite, by, 0);
    this.body.rotation.set(0.35 * dead, 0, pitch);
    this.head.rotation.z = -0.1 * duck + 0.15 * roar - 0.12 * bite + 0.03 * Math.sin(time * 2.1) - 0.1 * dead;
    this.abdomen.rotation.z = -0.06 * Math.sin(this.beat * TAU - 1) * amp + 0.06 * duck - 0.15 * dead - 0.08 * vyTilt;

    // ---- legs ----
    this.body.updateMatrix();
    this._inv.copy(this.body.matrix).invert();
    const stanceF = 0.55;
    const legHz = 2.4 + 0.18 * speed;
    if (!st.dead) this.gait = (this.gait + dt * legHz * run) % 1;
    const stride = THREE.MathUtils.clamp((speed * stanceF) / legHz / 2, 0, 0.3) * run;
    for (const leg of this.legs) {
      const T = leg.target;
      const s = leg.side;
      if (leg.ground) {
        const gl = leg.ground;
        // on the ground (group space): a light skitter while running, planted when idle, wider when ducking
        const p = (this.gait + gl.ph) % 1;
        let gx, gy = 0;
        if (p < stanceF) gx = gl.x + stride - 2 * stride * (p / stanceF);
        else {
          const u = (p - stanceF) / (1 - stanceF);
          gx = gl.x - stride + 2 * stride * u * u * (3 - 2 * u);
          gy = 0.16 * Math.sin(Math.PI * u) * run;
        }
        T.set(gx + 0.05 * duck, gy, (gl.z + 0.12 * duck) * s).applyMatrix4(this._inv);
        // in the air the legs trail back under the abdomen
        this._a.set(gl.pair === 1 ? -0.95 : -1.15, gl.pair === 1 ? -1.04 : -0.92, (gl.pair === 1 ? 0.42 : 0.45) * s);
        T.lerp(this._a, air);
      } else {
        // front legs held folded under the head, striking forward on a smash
        T.set(0.85 + 0.05 * Math.sin(time * 2.6 + s), -0.55, 0.26 * s);
        this._a.set(1.55, -0.6, 0.2 * s);
        T.lerp(this._a, bite);
      }
      this._a.set(0.1 + 0.25 * leg.pair * -1, -0.55, 0.32 * s);
      T.lerp(this._a, dead); // curled up
      leg.tip.position.copy(T);
    }
    this._placeLegs();
    this.group.updateMatrixWorld(true);
  }

  /** 2-bone IK for every leg in body space; knees bend up and out like an insect's. */
  _placeLegs() {
    const max = L1 + L2 - 0.002;
    this.legs.forEach((leg, i) => {
      const H = leg.hip, T = leg.tip.position;
      const d = this._a.subVectors(T, H);
      let len = d.length();
      if (len > max) { d.multiplyScalar(max / len); len = max; T.copy(H).add(d); }
      len = Math.max(len, 0.3);
      d.normalize();
      const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const hint = this._h.set(leg.pair === 0 ? 0.3 : 0, 0.5, 1.0 * leg.side);
      hint.addScaledVector(d, -hint.dot(d)).normalize();
      const K = this._k.copy(H).addScaledVector(d, a).addScaledVector(hint, h);
      this._b.subVectors(K, H).normalize();
      this._q.setFromUnitVectors(this._Y, this._b);
      this.femurs.setMatrixAt(i, this._m.compose(H, this._q, this._one));
      this._b.subVectors(T, K).normalize();
      this._q.setFromUnitVectors(this._Y, this._b);
      this.tibias.setMatrixAt(i, this._m.compose(K, this._q, this._one));
    });
    this.femurs.instanceMatrix.needsUpdate = true;
    this.tibias.instanceMatrix.needsUpdate = true;
  }

  /** World-space AABBs [minX, minY, maxX, maxY], the same five boxes (and heights) as the Kaiju's. */
  getHitboxes(out) {
    const w = this._tmp;
    const a = this.anchor;
    let n = 0;
    const box = (o, hx, hy) => {
      o.getWorldPosition(w);
      const b = out[n++];
      b[0] = w.x - hx; b[1] = w.y - hy; b[2] = w.x + hx; b[3] = w.y + hy;
      return w;
    };
    const k = this.hitX;
    box(a.head, 0.36 * k, 0.2);
    box(a.neck, 0.2 * k, 0.2);
    box(a.chest, 0.34 * k, 0.32);
    box(a.hips, 0.38 * k, 0.3);
    const hx = w.x, hy = w.y;
    // legs: from the lowest of the four skimming tips up to the abdomen
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (const leg of this.legs) {
      if (!leg.ground) continue;
      leg.tip.getWorldPosition(w);
      minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x); minY = Math.min(minY, w.y);
    }
    const b = out[n++];
    b[0] = Math.max(hx - 0.45 * k, minX);
    b[1] = minY + 0.05;
    b[2] = Math.max(b[0] + 0.1, Math.min(hx + 0.55 * k, maxX + 0.05));
    b[3] = hy - 0.35;
    return n;
  }

  getMouthWorld(target) {
    return this.anchor.snout.getWorldPosition(target);
  }

  getSideMouths() {
    return 0;
  }

  /** A random point on one of the wings (world space), where glittering scale dust comes off. */
  wingDust(target) {
    const wg = this.wings[(Math.random() * 4) | 0];
    wingPoint(wg.hind ? HIND : FORE, 0.25 + 0.75 * Math.random(), Math.random(), target);
    return wg.mesh.localToWorld(target);
  }
}
