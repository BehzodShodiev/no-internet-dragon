// Storm Wing: a giant storm pterosaur, the second flyer (unlocked by downing a gunship). An original design:
// slate-blue hide, a long beak and a swept-back crest with a glowing edge, a tail vane, one pair of
// membrane wings whose veins glow electric cyan, and two bird legs with talons. His breath is a crackling
// THUNDER BEAM and his trait the SONIC DIVE (game/Traits.js).
//
// He reuses the Moth Queen's flying body: the same pose, wingbeat, skimming leg IK and hitbox anchors
// (Moth.js), so his hitboxes are hers, which keep the Kaiju's heights. Only the parts are his own.
import * as THREE from 'three';
import { sweep, mergeGeometries } from '../gfx/geometry.js';
import { Moth, wingPoint, wingGeometry, dataTexture, makeFur, clean, paint, curve } from './Moth.js';

const TAU = Math.PI * 2;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const L1 = 0.85, L2 = 1.05; // the Moth Queen's leg lengths (the IK uses them)

// A pterosaur wing in the fan's (u, v) space: very long at the leading edge (the wing finger), short where
// the membrane meets the body and legs.
const WING = { root: [0.3, -0.55], th: [0.22, -1.72], scallop: 0.02, rk: [0, 0.1, 0.3, 0.55, 0.8, 1], rv: [3.9, 3.6, 2.7, 1.8, 1.15, 0.85] };

/** The membrane: slate, paler where it is thin, a dark bony leading edge, veins that glow like lightning. */
function makeStormWing(W, H) {
  const col = new Uint8Array(W * H * 4), glow = new Uint8Array(W * H * 4);
  const P = V(0, 0, 0);
  const span = Math.abs(WING.th[1] - WING.th[0]);
  const c = [0, 0, 0], g = [0, 0, 0];
  const mix = (arr, rgb, k) => { for (let i = 0; i < 3; i++) arr[i] += (rgb[i] - arr[i]) * k; };
  const base = [44, 58, 76], thin = [96, 118, 142], edge = [24, 30, 40], vein = [120, 232, 255];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, v = (j + 0.5) / H;
      wingPoint(WING, u, v, P);
      const R = curve(WING.rk, WING.rv, v), across = span * u * R;
      c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
      mix(c, thin, smooth(0.25, 0.75, u) * smooth(0.05, 0.4, v) * 0.7);
      g[0] = 2; g[1] = 6; g[2] = 10;
      // veins: forked lines from the root, kinked like lightning
      let vd = Infinity;
      for (let k = 1; k < 7; k++) {
        const f = u * 7 + k * 0.37;
        const zig = 0.02 * (1 - 4 * Math.abs(f - Math.floor(f) - 0.5)) * smooth(0.15, 0.4, u); // a continuous zigzag
        vd = Math.min(vd, Math.abs(v - (k / 7 + zig)) * across);
      }
      const lit = smooth(0.03, 0.008, vd) * smooth(0.12, 0.3, u) * smooth(0.98, 0.85, u);
      mix(c, vein, lit * 0.8);
      mix(g, [90, 220, 255], lit);
      // the bony leading edge and a darker trailing margin
      mix(c, edge, smooth(0.12, 0.05, v * across) * smooth(0.02, 0.1, u));
      mix(c, edge, smooth(0.9, 0.99, u) * 0.6);
      mix(c, [52, 64, 80], smooth(0.14, 0.03, u)); // the root, against the body
      const o = (j * W + i) * 4;
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; col[o + 3] = 255;
      glow[o] = g[0]; glow[o + 1] = g[1]; glow[o + 2] = g[2]; glow[o + 3] = 255;
    }
  }
  const map = dataTexture(col, W, H, true), glowMap = dataTexture(glow, W, H, true);
  map.wrapS = map.wrapT = glowMap.wrapS = glowMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, glowMap };
}

export class StormWing extends Moth {
  constructor(detail = 'std') {
    super(detail);
    this.variant = 'stormwing';
    this.group.name = 'stormwing';
  }

  dispose() {
    super.dispose();
    this.glowMat.dispose();
  }

  _buildMaterials() {
    const hd = this.detail === 'hd';
    this.legSpread = 0.42; // feet planted under the body
    this.hiddenPairs = [0, 1]; // two bird legs (the hind pair); the others still count for the hitbox
    const fur = makeFur(hd ? 512 : 256);
    // leathery hide: the fur texture, flattened
    this.furMat = new THREE.MeshStandardMaterial({
      map: fur.map, normalMap: fur.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
      vertexColors: true, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.9,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a1c04, emissive: 0xffd23a, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.1 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x0a1a24, emissive: 0x7fe8ff, emissiveIntensity: 2.2, roughness: 0.3 });
    this.wingUniforms = { uGlow: { value: 0.35 }, uWaveAmp: { value: 0 }, uWavePos: { value: -1 }, uFlex: { value: 0 } };
    const tex = makeStormWing(hd ? 1024 : 512, hd ? 512 : 256);
    const m = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.glowMap, emissive: 0x7fe8ff, emissiveIntensity: 1,
      side: THREE.DoubleSide, roughness: 0.62, metalness: 0.05,
    });
    // the same shader tweak as the Moth Queen's wings: flex along the span, glow with a wave out along it
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
    this.foreMat = this.hindMat = m;
    this.wingMats = [m];
  }

  _buildBody() {
    const hd = this.detail === 'hd';
    const body = this.body;
    const back = new THREE.Color(0x2b394b), belly = new THREE.Color(0x9cadc2), bone = new THREE.Color(0x8c929c);
    const hide = (a, out) => out.copy(back).lerp(belly, smooth(0.2, -0.8, Math.cos(a)));

    // ---- torso ----
    const torso = sweep({
      points: [V(-0.55, -0.02), V(-0.2, 0.0), V(0.2, 0.04), V(0.55, 0.08)],
      segments: hd ? 48 : 28, radial: hd ? 40 : 24, uvScale: [1.5, 2],
      section: (t, a, out) => {
        const r = curve([0, 0.25, 0.65, 1], [0.22, 0.4, 0.42, 0.27], t);
        out.x = Math.sin(a) * r * 0.95;
        out.y = Math.cos(a) * r;
      },
      color: (t, a, out) => hide(a, out),
      capStart: true, capEnd: true,
    });
    this._add(body, clean(torso), this.furMat);

    // ---- tail with a diamond vane, on the abdomen pivot so it sways like hers ----
    this.abdomen = new THREE.Group();
    this.abdomen.position.set(-0.42, -0.02, 0);
    body.add(this.abdomen);
    const tail = sweep({
      points: [V(0.12, 0.02), V(-0.4, -0.02), V(-0.95, -0.1), V(-1.45, -0.2)],
      segments: hd ? 40 : 20, radial: hd ? 16 : 10, uvScale: [2, 1],
      section: (t, a, out) => { const r = 0.24 * (1 - 0.85 * t); out.x = Math.sin(a) * r; out.y = Math.cos(a) * r; },
      color: (t, a, out) => hide(a, out),
      capEnd: true,
    });
    const vane = paint(new THREE.OctahedronGeometry(0.28, 0).scale(1.3, 0.9, 0.12).translate(-1.6, -0.2, 0), 0x22303f);
    this._add(this.abdomen, mergeGeometries([tail, vane].map(clean), false), this.furMat);

    // ---- head: a long beak and a crest swept back; amber eyes ----
    this.head = new THREE.Group();
    this.head.position.set(0.55, 0.06, 0);
    body.add(this.head);
    const skull = sweep({
      points: [V(0.0, 0.0), V(0.25, 0.05), V(0.5, 0.04), V(0.62, 0.0)],
      segments: hd ? 36 : 20, radial: hd ? 36 : 22, uvScale: [1, 1],
      section: (t, a, out) => { const r = curve([0, 0.35, 0.75, 1], [0.24, 0.3, 0.25, 0.17], t); out.x = Math.sin(a) * r * 0.9; out.y = Math.cos(a) * r; },
      color: (t, a, out) => hide(a, out),
      capStart: true,
    });
    const beak = sweep({
      points: [V(0.55, 0.0), V(1.0, -0.06), V(1.45, -0.15), V(1.82, -0.27)],
      segments: hd ? 40 : 20, radial: hd ? 24 : 14, uvScale: [1, 0.5],
      section: (t, a, out) => { const r = 0.17 * (1 - 0.94 * t); out.x = Math.sin(a) * r * 0.75; out.y = Math.cos(a) * r; },
      color: (t, a, out) => out.copy(bone).multiplyScalar(1 - 0.45 * smooth(0.6, 1, t)),
      capEnd: true,
    });
    // the crest: a thin blade from the top of the skull, sweeping back and up
    const crestPts = [V(0.3, 0.22), V(0.0, 0.42), V(-0.45, 0.66), V(-0.95, 0.84)];
    const crest = sweep({
      points: crestPts, segments: hd ? 30 : 16, radial: 12, uvScale: [1, 0.5], curveType: 'catmullrom',
      section: (t, a, out) => { out.x = Math.sin(a) * 0.03 * (1 - 0.6 * t); out.y = Math.cos(a) * (0.2 * (1 - 0.85 * t) + 0.02); },
      color: (t, a, out) => out.copy(back).multiplyScalar(0.9),
      capEnd: true,
    });
    this._add(this.head, mergeGeometries([skull, beak, crest].map(clean), false), this.furMat);
    // the crest's glowing edge and the eyes
    const edge = sweep({
      points: crestPts.map((p, i) => p.clone().add(V(0, 0.2 * (1 - 0.85 * (i / 3)) + 0.015))), segments: hd ? 30 : 16, radial: 6, curveType: 'catmullrom',
      section: (t, a, out) => { const r = 0.02 * (1 - 0.6 * t); out.x = Math.sin(a) * r; out.y = Math.cos(a) * r; },
      capEnd: true,
    });
    this._add(this.head, clean(edge), this.glowMat, false);
    const eyes = [1, -1].map((s) => new THREE.SphereGeometry(0.065, 14, 10).translate(0.44, 0.1, 0.2 * s));
    this._add(this.head, mergeGeometries(eyes.map(clean), false), this.eyeMat, false);

    // ---- one pair of wings, rooted on the shoulders (the left one mirrored) ----
    const geo = wingGeometry(WING, hd ? 28 : 14, hd ? 72 : 36);
    this.wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.1, 0.26, 0.22 * side);
      pivot.scale.z = side;
      const mesh = this._add(pivot, geo, this.foreMat);
      mesh.receiveShadow = false;
      body.add(pivot);
      this.wings.push({ pivot, mesh, side, hind: false });
    }
  }

  /** Bird legs: a thick thigh, a thin shank and three talons (spread round the foot, so any turn reads). */
  _legGeometry() {
    const hd = this.detail === 'hd';
    const femur = [
      new THREE.CylinderGeometry(0.075, 0.11, L1, hd ? 16 : 10).translate(0, L1 / 2, 0),
      new THREE.SphereGeometry(0.085, hd ? 14 : 10, hd ? 10 : 8).translate(0, L1, 0),
    ];
    const tibia = [new THREE.CylinderGeometry(0.035, 0.06, L2 - 0.08, hd ? 14 : 8).translate(0, (L2 - 0.08) / 2, 0)];
    for (let k = 0; k < 3; k++) {
      tibia.push(new THREE.ConeGeometry(0.03, 0.22, 6).translate(0, 0.11, 0).rotateZ(1.9).rotateY((k * TAU) / 3).translate(0, L2 - 0.04, 0));
    }
    return {
      femur: mergeGeometries(femur.map((g) => paint(clean(g), 0x2b394b)), false),
      tibia: mergeGeometries(tibia.map((g) => paint(clean(g), 0x3a4656)), false),
    };
  }

  _buildAnchors() {
    super._buildAnchors([1.55, -0.18]); // the beam leaves from the beak
  }

  /** A random point on a wing (world space), where sparks come off. */
  wingDust(target) {
    const wg = this.wings[(Math.random() * 2) | 0];
    wingPoint(WING, 0.3 + 0.7 * Math.random(), Math.random(), target);
    return wg.mesh.localToWorld(target);
  }
}
