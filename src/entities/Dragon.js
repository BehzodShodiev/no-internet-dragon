// Procedural, skinned atomic lizard. Built in "design units" and scaled into world units.
// Legs are driven by analytic 2-bone IK so feet plant on the ground while running.
import * as THREE from 'three';
import { sweep, mergeGeometries } from '../gfx/geometry.js';
import { noise3, curvedSpike, spikeColors, plateGeometry, plateColors } from './DragonHD.js';
import { mulberry32 } from '../gfx/noise.js';
import { voxelize } from './Voxel.js';

export const DRAGON_SCALE = 0.62;
const PLATE_BLUE = new THREE.Color(0x3cc8ff);
const PLATE_RAGE = new THREE.Color(0xff4a0c);
const EYE_AMBER = new THREE.Color(0xff7a00);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const cr1 = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function profile(keys, vals, t) {
  const n = keys.length;
  if (t <= keys[0]) return vals[0];
  if (t >= keys[n - 1]) return vals[n - 1];
  let k = 0;
  while (k < n - 2 && t > keys[k + 1]) k++;
  const f = (t - keys[k]) / (keys[k + 1] - keys[k]);
  return cr1(vals[Math.max(0, k - 1)], vals[k], vals[k + 1], vals[Math.min(n - 1, k + 2)], f);
}

// Spine control points (tail tip -> head joint), design units, x forward / y up.
const SPINE = [
  [-5.0, 1.2], [-4.0, 1.52], [-3.0, 1.88], [-2.0, 2.22], [-1.0, 2.5],
  [0.0, 2.62], [0.9, 2.7], [1.6, 2.78], [2.1, 3.08], [2.42, 3.44], [2.66, 3.68],
];
const RY = [0.06, 0.24, 0.4, 0.56, 0.8, 1.0, 1.06, 0.92, 0.64, 0.5, 0.46];
const RZ = [0.05, 0.2, 0.33, 0.46, 0.64, 0.8, 0.84, 0.74, 0.54, 0.45, 0.42];

const B = {
  hips: 0, t1: 1, t2: 2, t3: 3, t4: 4, chest: 5, neck1: 6, neck2: 7, head: 8, jaw: 9,
  thighR: 10, shinR: 11, metaR: 12, toeR: 13, thighL: 14, shinL: 15, metaL: 16, toeL: 17,
};
const PARENT = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 8, 0, 10, 11, 12, 0, 14, 15, 16];

const L1 = 1.15, L2 = 1.1, L3 = 0.72; // thigh, shin, metatarsus
const HIP_OFF = new THREE.Vector2(0.15, -0.37); // hip joint relative to hips bone
const HIP_Z = 0.62;
const HEAD_TILT = -0.12;

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

export class Dragon {
  /**
   * variant: 'kaiju' (the atomic lizard), 'ghidorah' (the Golden Hydra: three heads, two tails, wings) or 'rex'
   * (big head, tiny arms, no plates; with a second, voxel look that its Pixel skin shows).
   * detail: 'std', or 'hd' for the Very High model (Kaiju only): same skeleton, animation and hitboxes,
   * with real anatomy, a carved head and bony plates.
   */
  constructor(tex, variant = 'kaiju', detail = 'std') {
    this.variant = variant;
    this.detail = variant === 'kaiju' ? detail : 'std';
    this.group = new THREE.Group();
    this.group.name = 'dragon';
    this.group.scale.setScalar(DRAGON_SCALE);
    this.time = 0;
    this.phase = 0;
    this.run = 0;
    this.air = 0;
    this.duck = 0;
    this.dead = 0;
    this.roar = 0;
    this.breath = 0;
    this.bite = 0;
    this.glow = 0.35;
    this.glowColor = PLATE_BLUE.clone();
    this.eyeColor = EYE_AMBER.clone();
    this.plateTint = new THREE.Color(1, 1, 1);
    this.hitX = 1; // the skin's build: hitbox (and body) width along x
    this.lastStance = [true, true];
    this.onFootstep = null;
    this._buildSkeleton();
    this._buildMaterials(tex);
    if (this.detail === 'hd') this._buildMeshesHD(); else this._buildMeshes();
    this._anchors();
  }

  /** Frees the GPU resources of this model (when Very High swaps models). */
  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of [this.skinMat, this.plateMat, this.eyeMat, this.ivoryMat, this.darkMat, this.wingMat, this.voxelMat]) m?.dispose();
    this.plateMat.emissiveMap?.dispose();
  }

  _buildSkeleton() {
    const hR = V(HIP_OFF.x, SPINE[5][1] + HIP_OFF.y, HIP_Z);
    const hL = V(HIP_OFF.x, SPINE[5][1] + HIP_OFF.y, -HIP_Z);
    const leg = (h) => [h, h.clone().add(V(0, -L1)), h.clone().add(V(0, -L1 - L2)), h.clone().add(V(0, -L1 - L2 - L3))];
    const head = V(SPINE[10][0], SPINE[10][1]);
    const jawPivot = head.clone().add(V(0.06, -0.2).applyAxisAngle(V(0, 0, 1), HEAD_TILT));
    this.rest = [
      V(...SPINE[5]), V(...SPINE[4]), V(...SPINE[3]), V(...SPINE[2]), V(...SPINE[1]),
      V(...SPINE[7]), V(...SPINE[8]), V(...SPINE[9]), head, jawPivot,
      ...leg(hR), ...leg(hL),
    ];
    this.bones = this.rest.map((p, i) => {
      const b = new THREE.Bone();
      const par = PARENT[i];
      b.position.copy(par < 0 ? p : p.clone().sub(this.rest[par]));
      return b;
    });
    this.bones.forEach((b, i) => { if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b); });

    // spine curve + parameter of each control point
    this.curve = new THREE.CatmullRomCurve3(SPINE.map(([x, y]) => V(x, y)), false, 'centripetal');
    const samples = 2000;
    const pts = [];
    for (let i = 0; i <= samples; i++) pts.push(this.curve.getPointAt(i / samples));
    this.tk = SPINE.map(([x, y]) => {
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best / samples;
    });
    const tk = this.tk;
    this.skinCenters = [
      [B.t4, (tk[0] + tk[1]) / 2], [B.t3, (tk[1] + tk[2]) / 2], [B.t2, (tk[2] + tk[3]) / 2],
      [B.t1, (tk[3] + tk[4]) / 2], [B.hips, (tk[5] + tk[6]) / 2], [B.chest, (tk[7] + tk[8]) / 2],
      [B.neck1, (tk[8] + tk[9]) / 2], [B.neck2, (tk[9] + tk[10]) / 2], [B.head, tk[10]],
    ];
  }

  spineSkin(t) {
    const c = this.skinCenters;
    if (t <= c[0][1]) return [c[0][0], 0, 1, 0];
    for (let i = 0; i < c.length - 1; i++) {
      if (t < c[i + 1][1]) {
        const f = smooth(c[i][1], c[i + 1][1], t);
        return [c[i][0], c[i + 1][0], 1 - f, f];
      }
    }
    return [c[c.length - 1][0], 0, 1, 0];
  }

  _buildMaterials(tex) {
    this.skinMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: tex.ormMap,
      aoMap: tex.ormMap,
      aoMapIntensity: 0.9,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.9,
    });
    // skins like Burning glow between the scales: the darkest grooves of the scale texture light up,
    // in broad patches rather than everywhere
    // spots: some scales glow (bioluminescence); sheen: a coloured rim at grazing angles; irid: an oil-slick
    // rainbow at grazing angles. All zero for skins that don't use them.
    this.skinUniforms = {
      uCrack: { value: new THREE.Color(0, 0, 0) }, uSpot: { value: new THREE.Color(0, 0, 0) },
      uSheen: { value: new THREE.Color(0, 0, 0) }, uIrid: { value: 0 },
    };
    // Very High: a second, finer layer of the scale normals breaks up the tiling, and a soft cool rim keeps
    // the silhouette readable on dark backgrounds (only compiled in, via the HD define, for that model)
    if (this.detail === 'hd') {
      this.skinMat.defines = { HD: '' };
      this.skinMat.normalScale.set(1.0, 1.0);
      this.skinMat.aoMapIntensity = 0.75;
    }
    this.skinMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.skinUniforms);
      s.fragmentShader = s.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          #ifdef HD
          vec3 mapN2 = texture2D(normalMap, vNormalMapUv * 3.7 + 0.37).xyz * 2.0 - 1.0;
          normal = normalize(normal + tbn * vec3(mapN2.xy * 0.45, 0.0));
          #endif`)
        .replace('#include <common>', '#include <common>\nuniform vec3 uCrack;\nuniform vec3 uSpot;\nuniform vec3 uSheen;\nuniform float uIrid;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float groove = smoothstep(0.22, 0.06, dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
          float crackPatch = smoothstep(0.35, 0.7, texture2D(map, vMapUv * 0.13 + 0.31).g); // ('patch' is reserved in GLSL)
          totalEmissiveRadiance += uCrack * groove * (0.35 + 0.65 * crackPatch) * 3.0;
          float lumS = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float spotPick = smoothstep(0.7, 0.78, texture2D(map, vMapUv * 0.37 + 0.71).g);
          totalEmissiveRadiance += uSpot * smoothstep(0.16, 0.34, lumS) * spotPick * 2.6;
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
          totalEmissiveRadiance += uSheen * fres * 0.9;
          vec3 irid = 0.5 + 0.5 * cos(6.2832 * (fres * 1.4 + vec3(0.0, 0.33, 0.67)));
          totalEmissiveRadiance += irid * fres * uIrid * 0.8;
          #ifdef HD
          float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += vec3(0.5, 0.58, 0.68) * rim * 0.16;
          #endif`);
    };
    const g = new Uint8Array(64 * 4);
    for (let i = 0; i < 64; i++) {
      const v = Math.pow(i / 63, 1.4);
      g[i * 4] = g[i * 4 + 1] = g[i * 4 + 2] = Math.min(255, 40 + v * 215);
      g[i * 4 + 3] = 255;
    }
    const grad = new THREE.DataTexture(g, 1, 64, THREE.RGBAFormat);
    grad.magFilter = grad.minFilter = THREE.LinearFilter;
    grad.wrapS = grad.wrapT = THREE.ClampToEdgeWrapping;
    grad.needsUpdate = true;

    this.plateUniforms = { uWavePos: { value: -1 }, uWaveAmp: { value: 0 }, uGlow: { value: 0.35 } };
    this.plateMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.05,
      emissive: new THREE.Color(0x3cc8ff),
      emissiveMap: grad,
      emissiveIntensity: 1,
    });
    this.plateMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.plateUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPlateT;\nvarying float vPlateT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlateT = aPlateT;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vPlateT;\nuniform float uWavePos;\nuniform float uWaveAmp;\nuniform float uGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float wave = exp(-pow((vPlateT - uWavePos) * 7.0, 2.0));
          totalEmissiveRadiance *= uGlow + uWaveAmp * wave;`
        );
    };
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffb347, emissive: 0xff7a00, emissiveIntensity: 1.6, roughness: 0.22, metalness: 0,
    });
    this.ivoryMat = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 0.45, metalness: 0 });
    // the Rex's Pixel look: plain painted cubes
    if (this.variant === 'rex') this.voxelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    if (this.detail === 'hd') {
      // teeth and claws carry their own colours (ivory teeth, dark horn claws); pupils and nostrils are glossy black
      this.ivoryMat.color.set(0xffffff);
      this.ivoryMat.vertexColors = true;
      this.ivoryMat.roughness = 0.38;
      this.darkMat = new THREE.MeshStandardMaterial({ color: 0x070504, roughness: 0.18, metalness: 0 });
    }
  }

  _buildMeshes() {
    const tk = this.tk;
    const rex = this.variant === 'rex';
    // the Rex: olive hide with dark tiger stripes over the back and a warm tan belly
    const backCol = new THREE.Color(rex ? 0x3a4622 : 0x384038);
    const midCol = new THREE.Color(rex ? 0x5c6b2e : 0x4a524a);
    const bellyCol = new THREE.Color(rex ? 0xc4925a : 0xa39883);
    const stripe = (t, c) => (rex ? 1 - 0.55 * smooth(-0.2, 0.5, c) * smooth(0.25, 0.75, Math.sin(t * 92)) * smooth(0.04, 0.2, t) : 1);
    const mouthCol = new THREE.Color(0x4a1414);
    const gumCol = new THREE.Color(0x7a2a2a);

    // ---------------- body / tail / neck ----------------
    const body = sweep({
      points: this.curve.points,
      segments: 120,
      radial: 32,
      uvScale: [5.5, 2.5],
      section: (t, a, out) => {
        const ry = profile(tk, RY, t), rz = profile(tk, RZ, t);
        const c = Math.cos(a), s = Math.sin(a);
        // the Golden Hydra's tail splits in two: this one bends to +z, the extra tail to -z
        const split = this.variant === 'ghidorah' ? smooth(tk[4], tk[1], t) : 0;
        const thin = 1 - 0.3 * split;
        out.x = s * rz * thin * (1 - 0.12 * Math.max(0, c)) + split * 0.55;
        out.y = c * ry * thin * (c < 0 ? 1.04 : 1);
      },
      color: (t, a, out) => {
        const c = Math.cos(a);
        out.copy(backCol).lerp(midCol, smooth(0.95, 0.1, c) * 0.7).lerp(bellyCol, smooth(0.0, -0.75, c) * smooth(0.02, 0.25, t));
        out.multiplyScalar(stripe(t, c));
      },
      skin: (t) => this.spineSkin(t),
      capStart: true,
    });

    // ---------------- legs ----------------
    const legLen = 0.4 + L1 + L2 + L3;
    const legKeys = [0, 0.4, 0.95, 1.55, 2.05, 2.65, 3.0, legLen];
    const legR = [0.52, 0.62, 0.5, 0.27, 0.21, 0.13, 0.1, 0.11];
    const legGeo = (thigh, z) => {
      const top = V(HIP_OFF.x, SPINE[5][1] + HIP_OFF.y + 0.4, z);
      const pts = [0, 0.33, 0.66, 1].map((f) => top.clone().add(V(0, -legLen * f)));
      return sweep({
        points: pts,
        segments: 40,
        radial: 20,
        uvScale: [1.6, 1.1],
        curveType: 'catmullrom',
        section: (t, a, out) => {
          const d = t * legLen;
          const r = profile(legKeys, legR, d);
          const thighness = smooth(1.6, 0.8, d);
          out.x = Math.sin(a) * r * (0.95 - 0.1 * thighness);
          // calf bulge at the back of the shin
          const calf = Math.exp(-((d - 1.95) ** 2) / 0.08) * 0.06 * Math.max(0, -Math.cos(a));
          out.y = Math.cos(a) * r * (1.0 + 0.18 * thighness) - calf;
        },
        color: (t, a, out) => {
          out.copy(midCol).lerp(backCol, smooth(0.5, 0.9, t) * 0.5).lerp(bellyCol, smooth(0.2, -0.9, Math.sin(a) * Math.sign(z)) * 0.35);
        },
        skin: (t) => {
          const d = t * legLen;
          if (d < 0.45) { const f = smooth(0.05, 0.45, d); return [B.hips, thigh, 1 - f, f]; }
          if (d < 1.42) return [thigh, 0, 1, 0];
          if (d < 1.68) { const f = smooth(1.42, 1.68, d); return [thigh, thigh + 1, 1 - f, f]; }
          if (d < 2.55) return [thigh + 1, 0, 1, 0];
          if (d < 2.75) { const f = smooth(2.55, 2.75, d); return [thigh + 1, thigh + 2, 1 - f, f]; }
          return [thigh + 2, 0, 1, 0];
        },
      });
    };

    const toeGeos = [];
    const clawGeos = [];
    const addFoot = (toeBone, z) => {
      const F = this.rest[toeBone];
      [[-0.42, 0.42], [0, 0.56], [0.42, 0.42]].forEach(([ang, len]) => {
        const dir = V(Math.cos(ang), 0, Math.sin(ang) * Math.sign(z || 1));
        const start = F.clone().add(V(-0.18, 0.1, 0));
        const end = F.clone().add(dir.clone().multiplyScalar(len)).add(V(0, 0.07, 0));
        const mid = start.clone().lerp(end, 0.5).add(V(0, 0.04, 0));
        toeGeos.push(sweep({
          points: [start, mid, end],
          segments: 10, radial: 10, uvScale: [0.4, 0.4],
          sideHint: V(-dir.z, 0, dir.x),
          section: (t, a, out) => { const r = 0.1 * (1 - 0.45 * t); out.x = Math.sin(a) * r * 1.15; out.y = Math.cos(a) * r * 0.85; },
          color: (t, a, out) => out.copy(backCol),
          skin: () => [toeBone, 0, 1, 0],
          capEnd: true,
        }));
        const claw = new THREE.ConeGeometry(0.055, 0.2, 8);
        claw.rotateZ(-Math.PI / 2 - 0.5);
        claw.translate(0.07, -0.03, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir);
        claw.applyQuaternion(q);
        claw.translate(end.x, end.y, end.z);
        skinRigid(claw, toeBone);
        clawGeos.push(claw);
      });
    };
    addFoot(B.toeR, HIP_Z);
    addFoot(B.toeL, -HIP_Z);

    // ---------------- arms (rigid to chest) ----------------
    const armGeos = [];
    for (const side of [1, -1]) {
      const sh = rex ? V(1.86, 2.4, 0.52 * side) : V(1.78, 2.35, 0.5 * side);
      const el = rex ? V(1.98, 2.16, 0.6 * side) : V(2.02, 1.98, 0.6 * side);
      const hand = rex ? V(2.14, 2.1, 0.56 * side) : V(2.32, 1.9, 0.55 * side);
      armGeos.push(sweep({
        points: [sh, el, hand],
        segments: 14, radial: 10, uvScale: [0.6, 0.5],
        sideHint: V(0, 0, 1),
        section: (t, a, out) => { const r = (rex ? 0.1 : 0.15) * (1 - 0.45 * t); out.x = Math.sin(a) * r; out.y = Math.cos(a) * r; },
        color: (t, a, out) => out.copy(midCol),
        skin: () => [B.chest, 0, 1, 0],
        capEnd: true,
      }));
      for (const dz of [-0.05, 0.05]) {
        const c = new THREE.ConeGeometry(0.035, 0.14, 6);
        c.rotateZ(-Math.PI / 2 - 0.9);
        c.translate(hand.x + 0.06, hand.y - 0.05, hand.z + dz);
        skinRigid(c, B.chest);
        clawGeos.push(c);
      }
    }

    // ---------------- head ----------------
    // Skull and jaw are both swept along the mouth line, so they share one edge and close cleanly.
    // The back of the head is as deep and wide as the end of the neck, so it grows out of it instead
    // of sitting on it. Coordinates are head-local (x forward from the head joint, y up), then tilted.
    const hp = this.rest[B.head];
    const tilt = new THREE.Matrix4().makeRotationZ(HEAD_TILT);
    const mouthY = (x) => -0.1 - 0.06 * x;
    // the Rex's head is bigger and deeper (scaled about the head joint, so it still grows out of the neck)
    const mainToWorld = rex ? (g) => g.scale(1.24, 1.2, 1.12).applyMatrix4(tilt).translate(hp.x, hp.y, hp.z)
      : (g) => g.applyMatrix4(tilt).translate(hp.x, hp.y, hp.z);
    const browK = rex ? 2.2 : 1;
    const line = (x0, x1, n) => Array.from({ length: n }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / (n - 1);
      return V(x, mouthY(x));
    });
    const sgnPow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
    const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
    const rig = (g, bone) => { if (bone >= 0) skinRigid(g, bone); return g; };

    // Builds a whole head (skull, jaw, teeth, eyes, optional crown of horns) through toWorld.
    // Bones < 0 give a rigid head (the Golden Hydra's side heads ride on their own necks).
    const makeHead = (toWorld, headBone, jawBone, horns = false) => {
    // skull: rounded cranium sinking into the neck, the brow as its crest, a short blunt muzzle
    const SX0 = -0.44, SX1 = 1.4;
    // the last stretch rounds the nose off, so the sweep's end cap is tiny
    const sH = [[-0.44, -0.05, 0.3, 0.7, 1.05, 1.3, 1.4], [0.44, 0.56, 0.6, 0.46, 0.36, 0.27, 0.1]];
    const sW = [[-0.44, -0.05, 0.3, 0.7, 1.05, 1.3, 1.4], [0.4, 0.45, 0.38, 0.31, 0.27, 0.22, 0.1]];
    const skullX = (t) => SX0 + (SX1 - SX0) * t;
    const lipC = backCol.clone().lerp(midCol, 0.25);
    const skull = sweep({
      points: line(SX0, SX1, 6),
      segments: 56, radial: 40, uvScale: [2.0, 1.6], curveType: 'catmullrom',
      section: (t, a, out) => {
        const x = skullX(t);
        const c = Math.cos(a), s = Math.sin(a);
        const h = profile(sH[0], sH[1], x), w = profile(sW[0], sW[1], x);
        // brow ridges over the eyes and the jaw muscles behind them
        const brow = bump(x, 0.3, 0.12) * bump(Math.abs(a), 0.78, 0.3);
        const cheek = bump(x, -0.05, 0.22) * Math.max(0, 1 - c * 1.6);
        const nostril = bump(x, 1.18, 0.06) * bump(Math.abs(a), 0.45, 0.15);
        const squared = smooth(-0.2, 0.9, x); // round at the back, a little squarer at the muzzle
        out.x = sgnPow(s, 1 - 0.2 * squared) * (w + 0.05 * browK * brow + 0.07 * cheek);
        out.y = c >= 0 ? sgnPow(c, 1 - 0.25 * squared) * (h + 0.08 * browK * brow + 0.025 * nostril) : c * 0.06; // flat underside = upper lip
      },
      color: (t, a, out) => {
        const c = Math.cos(a);
        if (c < -0.55) out.copy(mouthCol); // palate, only seen with the jaws open
        else out.copy(backCol).lerp(midCol, smooth(0.85, 0.2, c) * 0.6).lerp(lipC, smooth(0.1, -0.4, c));
      },
      capEnd: true,
    });
    rig(toWorld(skull), headBone);

    // lower jaw: deep chin and throat, gums on top
    const JX0 = -0.3, JX1 = 1.33;
    const jD = [[-0.3, 0.1, 0.6, 1.0, 1.24, 1.33], [0.44, 0.38, 0.31, 0.25, 0.19, 0.07]];
    const jW = [[-0.3, 0.1, 0.6, 1.0, 1.24, 1.33], [0.4, 0.37, 0.3, 0.25, 0.19, 0.08]];
    const jawX = (t) => JX0 + (JX1 - JX0) * t;
    const throatC = midCol.clone().lerp(bellyCol, 0.55);
    const jaw = sweep({
      points: line(JX0, JX1, 6),
      segments: 48, radial: 36, uvScale: [1.8, 1.4], curveType: 'catmullrom',
      section: (t, a, out) => {
        const x = jawX(t);
        const c = Math.cos(a), s = Math.sin(a);
        const d = profile(jD[0], jD[1], x), w = profile(jW[0], jW[1], x);
        out.x = sgnPow(s, 0.8) * w * (c > 0 ? 0.93 : 1);
        out.y = c >= 0 ? c * 0.025 - 0.012 : -sgnPow(-c, 0.85) * d;
      },
      color: (t, a, out) => {
        const c = Math.cos(a);
        if (c > 0.35 && t < 0.95) out.copy(gumCol); // gums, but not on the chin (the end cap takes this colour)
        else out.copy(midCol).lerp(throatC, smooth(-0.2, -0.85, c));
      },
      capEnd: true,
    });
    rig(toWorld(jaw), jawBone);

    // teeth along both lips: big canines near the front, smaller ones behind
    const teeth = [];
    for (let i = 0; i < 9; i++) {
      const x = 0.12 + i * 0.135;
      const canine = bump(x, 1.0, 0.1);
      const zU = profile(sW[0], sW[1], x) * 0.9;
      for (const s of [1, -1]) {
        const up = new THREE.ConeGeometry(0.028 + 0.016 * canine, 0.1 + 0.09 * canine, 6);
        up.rotateX(Math.PI);
        up.translate(x, mouthY(x) - 0.06 - 0.04 * canine, zU * s);
        teeth.push(rig(toWorld(up), headBone));
        if (i % 2 === 1 && x < 1.16) {
          const lo = new THREE.ConeGeometry(0.026 + 0.01 * canine, 0.09 + 0.05 * canine, 6);
          lo.translate(x - 0.05, mouthY(x - 0.05) + 0.045 + 0.025 * canine, profile(jW[0], jW[1], x - 0.05) * 0.84 * s);
          teeth.push(rig(toWorld(lo), jawBone));
        }
      }
    }

    // eyes, tucked under the brow ridge
    const eyes = [];
    for (const s of [1, -1]) {
      const ex = 0.38;
      const e = new THREE.SphereGeometry(0.054, 16, 12).scale(1.2, 0.8, 1);
      e.translate(ex, mouthY(ex) + profile(sH[0], sH[1], ex) * 0.6, (profile(sW[0], sW[1], ex) * 0.88) * s);
      eyes.push(rig(toWorld(e), headBone));
    }

    // a crown of horns sweeping back from the top of the skull
    if (horns) {
      for (const [x, z, len] of [[-0.32, 0, 0.6], [-0.2, 0.24, 0.5], [-0.2, -0.24, 0.5], [0.0, 0.16, 0.36], [0.0, -0.16, 0.36]]) {
        const hn = new THREE.ConeGeometry(0.06, len, 8).translate(0, len / 2, 0).rotateZ(1.05).rotateX(-z * 1.4);
        hn.translate(x, mouthY(x) + profile(sH[0], sH[1], x) * 0.92, z);
        teeth.push(rig(toWorld(hn), headBone));
      }
    }
    return { skull, jaw, teeth, eyes };
    };
    const { skull, jaw, teeth, eyes } = makeHead(mainToWorld, B.head, B.jaw, this.variant === 'ghidorah');

    // ---------------- the Golden Hydra: side necks and heads, second tail, wings ----------------
    if (this.variant === 'ghidorah') this._buildGhidorah({ makeHead, tilt, sweepColor: midCol });

    // ---------------- dorsal plates (not on the Hydra) ----------------
    const plates = this.variant === 'ghidorah' || rex ? null : this._buildPlates();

    const legs = [legGeo(B.thighR, HIP_Z), legGeo(B.thighL, -HIP_Z)];
    // the Pixel skin: the same model rebuilt from cubes (before the parts are merged)
    const pixel = rex ? this._voxelModel([body, ...legs, ...armGeos, skull, jaw], [...toeGeos], teeth, clawGeos, eyes) : null;
    const skinGeo = mergeGeometries([body, ...legs, ...toeGeos, ...armGeos, skull, jaw,
      ...(this.extraTail ? [this.extraTail] : [])].map(clean), false);
    const keratinGeo = mergeGeometries([...teeth, ...clawGeos].map(clean), false);
    const eyeGeo = mergeGeometries(eyes.map(clean), false);

    // Skinned meshes share one skeleton; the root bone is parented to the first mesh.
    const skinMesh = new THREE.SkinnedMesh(skinGeo, this.skinMat);
    skinMesh.add(this.bones[0]);
    skinMesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    skinMesh.bind(this.skeleton);
    const mk = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, skinMesh.bindMatrix);
      return m;
    };
    const eyeMesh = mk(eyeGeo, this.eyeMat);
    this.meshes = [skinMesh, mk(keratinGeo, this.ivoryMat), eyeMesh];
    if (plates) this.meshes.push(mk(plates, this.plateMat));
    const glowing = [eyeMesh];
    if (pixel) {
      // both looks share the skeleton; setSkin shows one of them
      const cubes = [mk(pixel.skin, this.voxelMat)];
      if (pixel.eye) { cubes.push(mk(pixel.eye, this.eyeMat)); glowing.push(cubes[1]); }
      this.styles = { smooth: [...this.meshes], pixel: cubes };
      this.meshes.push(...cubes);
    }
    for (const m of this.meshes) {
      m.castShadow = !glowing.includes(m);
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  /**
   * The Rex's Pixel look: the smooth model's parts voxelised (`Voxel.js`) on the same skeleton. Solids are
   * the closed sweeps; toes, teeth, claws and eyes are too thin to fill, so they mark the cells they touch.
   */
  _voxelModel(solids, toes, teeth, claws, eyes) {
    const N = 240;
    const samples = Array.from({ length: N + 1 }, (_, i) => { const t = i / N; const p = this.curve.getPointAt(t); return [t, p.x, p.y]; });
    const res = voxelize(solids, [
      ...toes.map((geo) => ({ geo })),
      ...teeth.map((geo) => ({ geo, color: [0.5, 0.46, 0.36] })), // linear: bright enough to read as ivory, not to bloom
      ...claws.map((geo) => ({ geo, color: [0.16, 0.14, 0.12] })),
      ...eyes.map((geo) => ({ geo, eye: true })),
    ], {
      size: 0.12,
      isSpine: (b) => b <= B.neck2,
      cornerSkin: (x, y) => {
        let best = 0, bd = Infinity;
        for (const [t, px, py] of samples) { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = t; } }
        return this.spineSkin(best);
      },
    });
    return res;
  }

  /**
   * The Very High Kaiju. Same spine, bones and proportions as _buildMeshes (so the same animation and
   * hitboxes), with anatomy and surface: haunch and shoulder masses, a dorsal keel, banded belly plates
   * and throat folds; muscled legs with heavy clawed toes; real arms and four-fingered hands; a carved
   * head with brows, sockets, lidded slit-pupil eyes, nostrils, curved teeth and a tongue; mottled
   * colouring; thick, ridged bone plates.
   */
  _buildMeshesHD() {
    const tk = this.tk;
    const L = this.curve.getLength();
    const backCol = new THREE.Color(0x2c332d);
    const midCol = new THREE.Color(0x47504a);
    const bellyCol = new THREE.Color(0x9a8e78);
    const mouthCol = new THREE.Color(0x4a1414);
    const gumCol = new THREE.Color(0x7a2a2a);
    const tongueCol = new THREE.Color(0x8c3a3c);
    const ivory = new THREE.Color(0xeee3c8), ivoryRoot = new THREE.Color(0xb3a079);
    const hornRoot = new THREE.Color(0x2a2622), hornTip = new THREE.Color(0x9a8f7c);
    const rnd = mulberry32(31);
    const skinGeos = [], keratin = [], dark = [], eyes = [];
    const rigged = (g, bone) => { skinRigid(g, bone); return g; };
    const paint = (g, col) => {
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    // large blotches plus fine speckle, so no two stretches of hide match
    const mottle = (out, x, y, z, k = 1) => out.multiplyScalar(1 + k * (0.3 * noise3(x * 1.3, y * 1.3, z * 1.3) + 0.1 * noise3(x * 5, y * 5, z * 5)));

    // ---------------- body / tail / neck ----------------
    const belly = (t, c) => smooth(-0.3, -0.8, c) * smooth(tk[4], tk[5] - 0.02, t) * smooth(tk[9], tk[8], t);
    const band = (t) => 0.5 + 0.5 * Math.cos((2 * Math.PI * t * L) / 0.21);
    const throat = (t, c) => smooth(tk[7], tk[8], t) * smooth(-0.15, -0.7, c);
    skinGeos.push(sweep({
      points: this.curve.points,
      segments: 240,
      radial: 64,
      uvScale: [12, 5.2],
      section: (t, a, out) => {
        const ry = profile(tk, RY, t), rz = profile(tk, RZ, t);
        const c = Math.cos(a), s = Math.sin(a);
        const flank = Math.max(0, 1 - Math.abs(c) * 1.25);
        const haunch = bump(t, (tk[5] + tk[6]) / 2, 0.045) * flank * 0.075;
        const shoulder = bump(t, tk[7], 0.035) * Math.max(0, 1 - Math.abs(c - 0.25) * 1.4) * 0.07;
        const groove = belly(t, c) * 0.016 * (1 - band(t)) ** 3;
        const fold = throat(t, c) * 0.02 * Math.max(0, Math.sin((2 * Math.PI * t * L) / 0.13));
        const keel = Math.max(0, c) ** 30 * 0.045 * (0.5 + 0.5 * smooth(tk[6], tk[2], t));
        const k = 1 + haunch + shoulder + fold;
        out.x = s * rz * (1 - 0.12 * Math.max(0, c)) * k;
        out.y = c * ry * (c < 0 ? 1.04 : 1) * (k - groove) + keel * ry;
      },
      color: (t, a, out) => {
        const c = Math.cos(a), s = Math.sin(a);
        const bel = belly(t, c);
        out.copy(backCol).lerp(midCol, smooth(0.95, 0.15, c) * 0.75).lerp(bellyCol, smooth(0.0, -0.75, c) * smooth(0.02, 0.25, t));
        out.multiplyScalar(1 - 0.45 * Math.max(0, c) ** 4); // dark stripe down the spine
        out.multiplyScalar(1 - bel * 0.45 * (1 - band(t)) ** 4); // grooves between the belly plates
        mottle(out, t * L, c * 1.3, s * 1.3, 1 - 0.6 * bel);
      },
      skin: (t) => this.spineSkin(t),
      capStart: true,
    }));

    // ---------------- legs ----------------
    const legLen = 0.4 + L1 + L2 + L3;
    const legKeys = [0, 0.4, 0.95, 1.55, 2.05, 2.65, 3.0, legLen];
    const legR = [0.54, 0.64, 0.52, 0.28, 0.22, 0.135, 0.105, 0.115];
    for (const [thigh, z] of [[B.thighR, HIP_Z], [B.thighL, -HIP_Z]]) {
      const top = V(HIP_OFF.x, SPINE[5][1] + HIP_OFF.y + 0.4, z);
      skinGeos.push(sweep({
        points: [0, 0.33, 0.66, 1].map((f) => top.clone().add(V(0, -legLen * f))),
        segments: 72,
        radial: 32,
        uvScale: [3.4, 2.4],
        curveType: 'catmullrom',
        section: (t, a, out) => {
          const d = t * legLen;
          const r = profile(legKeys, legR, d);
          const c = Math.cos(a), s = Math.sin(a);
          const thighness = smooth(1.6, 0.8, d);
          const calf = bump(d, 1.95, 0.28) * 0.07 * Math.max(0, -c);
          const quad = bump(d, 0.85, 0.35) * 0.06 * Math.max(0, c); // the front of the thigh
          const knee = bump(d, 1.52, 0.12) * 0.05 * Math.max(0, c);
          const ankle = bump(d, 2.62, 0.1) * 0.025;
          out.x = s * (r + ankle) * (0.95 - 0.1 * thighness);
          out.y = c * (r * (1.0 + 0.18 * thighness) + ankle) - calf + quad + knee;
        },
        color: (t, a, out) => {
          const c = Math.cos(a), s = Math.sin(a);
          out.copy(midCol).lerp(backCol, smooth(0.45, 0.9, t) * 0.55).lerp(bellyCol, smooth(0.2, -0.9, s * Math.sign(z)) * 0.3);
          mottle(out, t * legLen, c, s + z);
        },
        skin: (t) => {
          const d = t * legLen;
          if (d < 0.45) { const f = smooth(0.05, 0.45, d); return [B.hips, thigh, 1 - f, f]; }
          if (d < 1.42) return [thigh, 0, 1, 0];
          if (d < 1.68) { const f = smooth(1.42, 1.68, d); return [thigh, thigh + 1, 1 - f, f]; }
          if (d < 2.55) return [thigh + 1, 0, 1, 0];
          if (d < 2.75) { const f = smooth(2.55, 2.75, d); return [thigh + 1, thigh + 2, 1 - f, f]; }
          return [thigh + 2, 0, 1, 0];
        },
      }));
    }

    // a claw: along +x, curving down (spike along +y bending +x, turned so +y -> +x and +x -> -y)
    const claw = (len, r, bend, dir, at) => {
      const g = spikeColors(curvedSpike(len, r, bend, 10, 7), len, hornRoot, hornTip);
      g.rotateZ(-Math.PI / 2);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize()));
      return g.translate(at.x, at.y, at.z);
    };

    // ---------------- feet: three heavy toes and a dewclaw ----------------
    for (const [toeBone, z] of [[B.toeR, HIP_Z], [B.toeL, -HIP_Z]]) {
      const F = this.rest[toeBone];
      [[-0.44, 0.48], [0, 0.62], [0.44, 0.48]].forEach(([ang, len]) => {
        const dir = V(Math.cos(ang), 0, Math.sin(ang) * Math.sign(z));
        const start = F.clone().add(V(-0.2, 0.12, 0));
        const end = F.clone().add(dir.clone().multiplyScalar(len)).add(V(0, 0.08, 0));
        const mid = start.clone().lerp(end, 0.5).add(V(0, 0.06, 0));
        skinGeos.push(rigged(sweep({
          points: [start, mid, end],
          segments: 16, radial: 14, uvScale: [0.9, 0.8],
          sideHint: V(-dir.z, 0, dir.x),
          section: (t, a, out) => {
            const r = 0.125 * (1 - 0.4 * t) * (1 + 0.14 * bump(t, 0.5, 0.15));
            out.x = Math.sin(a) * r * 1.15; out.y = Math.cos(a) * r * 0.85;
          },
          color: (t, a, out) => mottle(out.copy(backCol).multiplyScalar(0.9), t * 3, Math.cos(a), ang),
          capEnd: true,
        }), toeBone));
        keratin.push(rigged(claw(0.27, 0.065, 0.55, dir.clone().add(V(0, -0.25, 0)), end.clone().add(V(0, -0.02, 0))), toeBone));
      });
      const dew = spikeColors(curvedSpike(0.14, 0.04, -0.5, 8, 5), 0.14, hornRoot, hornTip).rotateZ(Math.PI / 2);
      keratin.push(rigged(dew.translate(F.x - 0.3, F.y + 0.14, F.z), toeBone));
    }

    // ---------------- arms and hands (rigid to the chest) ----------------
    for (const side of [1, -1]) {
      const sh = V(1.74, 2.42, 0.5 * side), el = V(2.02, 2.0, 0.66 * side), wr = V(2.34, 1.86, 0.6 * side);
      skinGeos.push(rigged(sweep({
        points: [sh, sh.clone().lerp(el, 0.5).add(V(-0.02, 0, 0.04 * side)), el, el.clone().lerp(wr, 0.5), wr],
        segments: 32, radial: 18, uvScale: [1.6, 1.2],
        sideHint: V(0, 0, 1),
        curveType: 'catmullrom',
        section: (t, a, out) => {
          const c = Math.cos(a), s = Math.sin(a);
          const r = profile([0, 0.3, 0.5, 0.75, 1], [0.2, 0.16, 0.12, 0.11, 0.085], t)
            * (1 + 0.15 * bump(t, 0.28, 0.12) * Math.max(0, c) + 0.1 * bump(t, 0.7, 0.12) * Math.max(0, -c));
          out.x = s * r; out.y = c * r;
        },
        color: (t, a, out) => mottle(out.copy(midCol).lerp(backCol, 0.35 * t), t * 2, Math.cos(a), side),
        capEnd: true,
      }), B.chest));
      [-0.5, -0.17, 0.17, 0.5].forEach((sp, i) => {
        const len = i === 0 ? 0.12 : 0.17;
        const dir = V(0.55, -0.75, sp * 0.5 * side).normalize();
        const start = wr.clone().addScaledVector(dir, 0.03).add(V(0, 0, sp * 0.08 * side));
        const tip = start.clone().addScaledVector(dir, len).add(V(0.01, -0.03, 0));
        skinGeos.push(rigged(sweep({
          points: [start, start.clone().lerp(tip, 0.5).add(V(0.015, 0, 0)), tip],
          segments: 8, radial: 8, uvScale: [0.4, 0.3],
          section: (t, a, out) => { const r = 0.038 * (1 - 0.35 * t); out.x = Math.sin(a) * r; out.y = Math.cos(a) * r; },
          color: (t, a, out) => out.copy(midCol).multiplyScalar(0.85),
          capEnd: true,
        }), B.chest));
        keratin.push(rigged(claw(0.1, 0.024, 0.5, dir, tip), B.chest));
      });
    }

    // ---------------- head ----------------
    const hp = this.rest[B.head];
    const tilt = new THREE.Matrix4().makeRotationZ(HEAD_TILT);
    const mouthY = (x) => -0.1 - 0.06 * x;
    const toWorld = (g) => g.applyMatrix4(tilt).translate(hp.x, hp.y, hp.z);
    const line = (x0, x1, n) => Array.from({ length: n }, (_, i) => { const x = x0 + ((x1 - x0) * i) / (n - 1); return V(x, mouthY(x)); });
    const sH = [[-0.44, -0.05, 0.3, 0.7, 1.05, 1.3, 1.4], [0.44, 0.56, 0.6, 0.46, 0.36, 0.27, 0.1]];
    const sW = [[-0.44, -0.05, 0.3, 0.7, 1.05, 1.3, 1.4], [0.4, 0.45, 0.38, 0.31, 0.27, 0.22, 0.1]];
    const EYE_X = 0.4, EYE_A = 1.02, NOSE_X = 1.21, NOSE_A = 0.44;
    const fold = (a) => (a > Math.PI ? 2 * Math.PI - a : a); // angle from the top, the same on both sides
    // the skull's cross-section at x: brows over sunken sockets, cheeks, nostrils, scutes on the snout, lips
    const skullSec = (x, a, out) => {
      const c = Math.cos(a), s = Math.sin(a), af = fold(a);
      const h = profile(sH[0], sH[1], x), w = profile(sW[0], sW[1], x);
      const brow = bump(x, 0.34, 0.16) * bump(af, 0.68, 0.28);
      const socket = bump(x, EYE_X, 0.075) * bump(af, EYE_A, 0.16);
      const cheek = bump(x, -0.05, 0.22) * Math.max(0, 1 - c * 1.6);
      const nostril = bump(x, NOSE_X, 0.055) * bump(af, NOSE_A, 0.13);
      const scutes = Math.max(0, c) ** 6 * smooth(0.5, 0.9, x) * 0.012 * Math.max(0, Math.sin(x * 34));
      const lip = bump(c, 0.06, 0.1) * 0.018 * smooth(-0.1, 0.3, x);
      const squared = smooth(-0.2, 0.9, x);
      out.x = sgnPow(s, 1 - 0.2 * squared) * (w + 0.1 * brow + 0.08 * cheek - 0.07 * socket + lip);
      out.y = c >= 0 ? sgnPow(c, 1 - 0.25 * squared) * (h + 0.24 * brow + 0.03 * nostril - 0.05 * socket) + scutes : c * 0.06;
    };
    const SX0 = -0.44, SX1 = 1.4;
    const lipC = backCol.clone().lerp(midCol, 0.3);
    skinGeos.push(rigged(toWorld(sweep({
      points: line(SX0, SX1, 8),
      segments: 96, radial: 64, uvScale: [4.2, 3.4], curveType: 'catmullrom',
      section: (t, a, out) => skullSec(SX0 + (SX1 - SX0) * t, a, out),
      color: (t, a, out) => {
        const x = SX0 + (SX1 - SX0) * t, c = Math.cos(a), af = fold(a);
        if (c < -0.55) { out.copy(mouthCol); return; } // palate
        out.copy(backCol).lerp(midCol, smooth(0.85, 0.2, c) * 0.6).lerp(lipC, smooth(0.1, -0.4, c));
        out.multiplyScalar(1 - 0.45 * bump(x, EYE_X, 0.1) * bump(af, EYE_A, 0.22)); // shadowed sockets
        out.multiplyScalar(1 - 0.5 * bump(x, NOSE_X, 0.04) * bump(af, NOSE_A, 0.08)); // nostril pits
        mottle(out, x * 2, c, Math.sin(a));
      },
      capEnd: true,
    })), B.head));

    // eyes: an amber eyeball under a heavy lid, with a black slit pupil; nostrils
    for (const side of [1, -1]) {
      const sec = { x: 0, y: 0 };
      skullSec(EYE_X, side > 0 ? EYE_A : 2 * Math.PI - EYE_A, sec);
      const nrm = V(0, Math.cos(EYE_A), Math.sin(EYE_A) * side);
      const look = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), nrm);
      const ctr = V(EYE_X, mouthY(EYE_X) + sec.y, sec.x).addScaledVector(nrm, -0.012);
      eyes.push(rigged(toWorld(new THREE.SphereGeometry(0.062, 20, 14).scale(1.15, 0.9, 1).translate(ctr.x, ctr.y, ctr.z)), B.head));
      const pc = ctr.clone().addScaledVector(nrm, 0.058);
      const pupil = new THREE.SphereGeometry(0.015, 10, 8).scale(0.75, 2.6, 0.45).applyQuaternion(look);
      dark.push(rigged(toWorld(pupil.translate(pc.x + 0.008, pc.y, pc.z)), B.head));
      const lc = ctr.clone().addScaledVector(nrm, 0.018);
      const lid = new THREE.TorusGeometry(0.07, 0.024, 10, 28).scale(1.15, 0.85, 1).applyQuaternion(look);
      skinGeos.push(rigged(toWorld(paint(lid.translate(lc.x, lc.y + 0.006, lc.z), backCol.clone().multiplyScalar(0.85))), B.head));
      const ns = { x: 0, y: 0 };
      skullSec(NOSE_X, side > 0 ? NOSE_A : 2 * Math.PI - NOSE_A, ns);
      const nostril = new THREE.SphereGeometry(0.02, 10, 8).scale(1.3, 0.55, 0.8);
      dark.push(rigged(toWorld(nostril.translate(NOSE_X, mouthY(NOSE_X) + ns.y - 0.005, ns.x * 0.92)), B.head));
    }

    // lower jaw: deep chin and throat, gums on top
    const JX0 = -0.3, JX1 = 1.33;
    const jD = [[-0.3, 0.1, 0.6, 1.0, 1.24, 1.33], [0.46, 0.4, 0.32, 0.26, 0.2, 0.07]];
    const jW = [[-0.3, 0.1, 0.6, 1.0, 1.24, 1.33], [0.4, 0.37, 0.3, 0.25, 0.19, 0.08]];
    const throatC = midCol.clone().lerp(bellyCol, 0.55);
    skinGeos.push(rigged(toWorld(sweep({
      points: line(JX0, JX1, 8),
      segments: 80, radial: 56, uvScale: [3.8, 3.0], curveType: 'catmullrom',
      section: (t, a, out) => {
        const x = JX0 + (JX1 - JX0) * t, c = Math.cos(a), s = Math.sin(a);
        const d = profile(jD[0], jD[1], x), w = profile(jW[0], jW[1], x);
        const chin = bump(x, 1.12, 0.12) * 0.02 * Math.max(0, -c);
        out.x = sgnPow(s, 0.8) * w * (c > 0 ? 0.93 : 1) * (1 + 0.04 * bump(x, -0.1, 0.2));
        out.y = c >= 0 ? c * 0.025 - 0.012 : -sgnPow(-c, 0.85) * (d + chin);
      },
      color: (t, a, out) => {
        const c = Math.cos(a);
        if (c > 0.35 && t < 0.95) { out.copy(gumCol); return; }
        out.copy(midCol).lerp(throatC, smooth(-0.2, -0.85, c));
        mottle(out, t * 3, c, Math.sin(a), 0.8);
      },
      capEnd: true,
    })), B.jaw));
    // a tongue lying in the jaw
    skinGeos.push(rigged(toWorld(sweep({
      points: line(-0.15, 0.95, 5).map((p) => p.add(V(0, -0.045))),
      segments: 20, radial: 16, uvScale: [0.6, 0.4],
      section: (t, a, out) => { const w = 0.13 * (1 - 0.6 * t * t); out.x = Math.sin(a) * w; out.y = Math.cos(a) * 0.035 * (1 - 0.5 * t); },
      color: (t, a, out) => out.copy(tongueCol),
      capStart: true, capEnd: true,
    })), B.jaw));

    // teeth: curved and uneven, big canines near the front, a second large pair mid-jaw
    for (let i = 0; i < 12; i++) {
      const x = 0.1 + i * 0.1;
      const big = Math.max(bump(x, 1.0, 0.07), 0.6 * bump(x, 0.5, 0.05));
      const zU = profile(sW[0], sW[1], x) * 0.88;
      for (const s of [1, -1]) {
        const len = (0.08 + 0.11 * big) * (0.85 + 0.3 * rnd());
        const tooth = spikeColors(curvedSpike(len, 0.024 + 0.014 * big, 0.35, 8, 6), len, ivoryRoot, ivory).rotateZ(Math.PI);
        keratin.push(rigged(toWorld(tooth.translate(x, mouthY(x) + 0.01, zU * s)), B.head));
        if (i % 2 === 0 && x > 0.15 && x < 1.2) {
          const lx = x + 0.05;
          const ll = (0.07 + 0.06 * bump(lx, 0.95, 0.1)) * (0.85 + 0.3 * rnd());
          const lo = spikeColors(curvedSpike(ll, 0.022, -0.3, 8, 6), ll, ivoryRoot, ivory);
          keratin.push(rigged(toWorld(lo.translate(lx, mouthY(lx) - 0.01, profile(jW[0], jW[1], lx) * 0.82 * s)), B.jaw));
        }
      }
    }

    // ---------------- dorsal plates ----------------
    const plates = this._buildPlatesHD();

    const skinGeo = mergeGeometries(skinGeos.map(clean), false);
    const skinMesh = new THREE.SkinnedMesh(skinGeo, this.skinMat);
    skinMesh.add(this.bones[0]);
    skinMesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    skinMesh.bind(this.skeleton);
    const mk = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton, skinMesh.bindMatrix);
      return m;
    };
    const eyeMesh = mk(mergeGeometries(eyes.map(clean), false), this.eyeMat);
    const darkMesh = mk(mergeGeometries(dark.map(clean), false), this.darkMat);
    this.meshes = [skinMesh, mk(mergeGeometries(keratin.map(clean), false), this.ivoryMat), eyeMesh, darkMesh, mk(plates, this.plateMat)];
    for (const m of this.meshes) {
      m.castShadow = m !== eyeMesh && m !== darkMesh;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  /** Very High plates: every plate its own shape, thick and ridged, bone-coloured; more of them, down to the tail tip. */
  _buildPlatesHD() {
    const tk = this.tk;
    const geos = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
    const Z = V(0, 0, 1);
    let seed = 1000;
    const place = (t, size, lateral, tiltOut, rows = 30) => {
      const ry = profile(tk, RY, t), rz = profile(tk, RZ, t);
      this.curve.getPointAt(t, P);
      this.curve.getTangentAt(t, T);
      N.crossVectors(Z, T).normalize();
      const g = plateGeometry(++seed, rows);
      g.scale(size * 0.95, size, 0.8 + size * 0.5);
      plateColors(g, size, seed);
      const p = g.attributes.position;
      g.setAttribute('aPlateT', new THREE.BufferAttribute(new Float32Array(p.count).fill(t), 1));
      g.rotateX(tiltOut);
      g.rotateZ(Math.atan2(T.y, T.x));
      const a = lateral * 0.62;
      const off = N.clone().multiplyScalar(Math.cos(a) * ry * 0.8).add(Z.clone().multiplyScalar(Math.sin(a) * rz * 0.85));
      g.translate(P.x + off.x, P.y + off.y, P.z + off.z);
      const sk = this.spineSkin(t);
      const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) { si[i * 4] = sk[0]; si[i * 4 + 1] = sk[1]; sw[i * 4] = sk[2]; sw[i * 4 + 1] = sk[3]; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geos.push(g);
    };
    // small scutes down to the tail tip
    for (let i = 0; i < 5; i++) place(tk[0] + 0.015 + (tk[1] - 0.03 - tk[0] - 0.015) * (i / 4), 0.14 + 0.03 * i, 0, 0, 14);
    // central row
    const t0 = tk[1] - 0.02, t1 = (tk[8] + tk[9]) / 2;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const t = t0 + (t1 - t0) * (i / (n - 1));
      const k = i / (n - 1);
      const size = 0.32 + 0.95 * Math.sin(Math.pow(k, 0.85) * Math.PI) ** 1.2 * (k < 0.75 ? 1 : 1 - (k - 0.75) * 1.4);
      place(t, Math.max(0.25, size * (i % 2 ? 0.94 : 1)), 0, 0);
    }
    // two side rows, staggered against the centre
    const s0 = tk[3], s1 = tk[8];
    for (let i = 0; i < 11; i++) {
      const k = i / 10;
      const t = s0 + (s1 - s0) * k;
      const size = 0.22 + 0.36 * Math.sin(k * Math.PI);
      place(t + 0.012, size, 1, 0.5, 20);
      place(t + 0.012, size, -1, -0.5, 20);
    }
    return mergeGeometries(geos.map((g) => {
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aPlateT', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      return g.index ? g.toNonIndexed() : g;
    }), false);
  }

  /**
   * the Golden Hydra's extras: two side necks and heads that sway on their own, a split tail and a pair of
   * wings. The side heads and wings are rigid meshes riding on the chest bone; the extra tail is skinned
   * to the tail bones like the body. All of it is decoration: the hitbox is the same body as everyone's.
   */
  _buildGhidorah({ makeHead, tilt }) {
    const tk = this.tk;
    const chest = this.bones[B.chest];
    const chestRest = this.rest[B.chest];
    const gold = new THREE.Color(0xc8a040);
    this.wingMat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.25, emissive: 0x2a1200,
    });
    this.sideHeads = [];
    this.wings = [];
    const wing = this._wingGeometry();
    // The side heads are staggered so all three read from the side (2D): one low and forward,
    // the other raised high and back on a longer neck.
    const necks = {
      1: [V(1.72, 2.9, 0.42), V(2.0, 3.1, 0.75), V(2.3, 3.25, 0.95), V(2.62, 3.3, 1.0)],
      [-1]: [V(1.66, 3.02, -0.42), V(1.86, 3.55, -0.7), V(2.06, 3.98, -0.86), V(2.28, 4.2, -0.92)],
    };
    for (const side of [1, -1]) {
      // neck and head, built in rest space, then re-based onto a pivot at the shoulder
      const pts = necks[side];
      const S = pts[0];
      const H = pts[3];
      const neck = sweep({
        points: pts,
        segments: 30, radial: 24, uvScale: [1.6, 1.2], curveType: 'catmullrom',
        section: (t, a, out) => { const r = 0.38 - 0.1 * t; out.x = Math.sin(a) * r * 0.92; out.y = Math.cos(a) * r; },
        color: (t, a, out) => out.copy(gold),
      });
      const yaw = -0.2 * side; // turned a little outward
      const toWorld = (g) => g.scale(0.86, 0.86, 0.86).applyMatrix4(tilt).rotateY(yaw).translate(H.x, H.y, H.z);
      const head = makeHead(toWorld, -1, -1, true);
      const toPivot = (g) => g.translate(-S.x, -S.y, -S.z);
      const pivot = new THREE.Group();
      pivot.position.copy(S).sub(chestRest);
      const parts = [
        new THREE.Mesh(mergeGeometries([neck, head.skull, head.jaw].map(clean).map(toPivot), false), this.skinMat),
        new THREE.Mesh(mergeGeometries(head.teeth.map(clean).map(toPivot), false), this.ivoryMat),
        new THREE.Mesh(mergeGeometries(head.eyes.map(clean).map(toPivot), false), this.eyeMat),
      ];
      parts.forEach((m, i) => { m.castShadow = i < 2; m.frustumCulled = false; pivot.add(m); });
      // where this head's breath comes from
      const mouth = new THREE.Object3D();
      mouth.position.copy(V(1.1, -0.55, 0).multiplyScalar(0.86).applyMatrix4(tilt).applyAxisAngle(V(0, 1, 0), yaw).add(H).sub(S));
      pivot.add(mouth);
      chest.add(pivot);
      this.sideHeads.push({ pivot, mouth, side });

      // wing: rooted high on the shoulder, swept back; the left one is a mirror image
      const w = new THREE.Group();
      w.position.copy(V(1.45, 3.15, 0.5 * side)).sub(chestRest);
      w.scale.z = side;
      const membrane = new THREE.Mesh(wing.membrane, this.wingMat);
      const bones = new THREE.Mesh(wing.bones, this.skinMat);
      membrane.castShadow = bones.castShadow = true;
      membrane.frustumCulled = bones.frustumCulled = false;
      w.add(membrane, bones);
      chest.add(w);
      this.wings.push({ group: w, side });
    }

    // the tail splits in two: the body's tail bends to one side (see the body sweep), this one to the other
    const split = (t) => smooth(tk[4], tk[1], t);
    this.extraTail = sweep({
      points: SPINE.slice(0, 6).map(([x, y]) => V(x, y)),
      segments: 60, radial: 24, uvScale: [3, 2.5],
      section: (tl, a, out) => {
        const t = tl * tk[5];
        const ry = profile(tk, RY, t), rz = profile(tk, RZ, t);
        const thin = 1 - 0.3 * split(t);
        out.x = Math.sin(a) * rz * thin - split(t) * 0.55;
        out.y = Math.cos(a) * ry * thin;
      },
      color: (t, a, out) => out.copy(gold),
      skin: (tl) => this.spineSkin(tl * tk[5]),
      capStart: true,
    });
  }

  /** A bat wing: a scalloped membrane between finger bones, reaching up, out (+z) and back. */
  _wingGeometry() {
    const R = V(0, 0, 0), W = V(0.4, 1.0, 0.9), tip = V(-0.1, 2.3, 2.1);
    const F = [V(-1.1, 1.8, 2.4), V(-1.9, 1.0, 2.0), V(-1.7, 0.25, 1.2), V(-0.9, -0.2, 0.45)];
    const scallop = (a, b, toward) => a.clone().lerp(b, 0.5).lerp(toward, 0.22);
    const M01 = scallop(F[0], F[1], W), M12 = scallop(F[1], F[2], W), M23 = scallop(F[2], F[3], R);
    const tris = [
      [W, tip, F[0]], [W, F[0], M01], [W, M01, F[1]], [W, F[1], M12], [W, M12, F[2]],
      [R, W, F[2]], [R, F[2], M23], [R, M23, F[3]],
    ];
    const pos = [], col = [];
    const inner = new THREE.Color(0xd9a338), outer = new THREE.Color(0xa8381a), c = new THREE.Color();
    for (const t of tris) {
      for (const p of t) {
        pos.push(p.x, p.y, p.z);
        c.copy(inner).lerp(outer, Math.min(1, p.distanceTo(W) / 2.2));
        col.push(c.r, c.g, c.b);
      }
    }
    const membrane = new THREE.BufferGeometry();
    membrane.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    membrane.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    membrane.computeVertexNormals();
    const bone = (a, b, r) => sweep({
      points: [a, a.clone().lerp(b, 0.5).add(V(0, 0.06, 0)), b], segments: 10, radial: 8, curveType: 'catmullrom',
      section: (t, ang, out) => { const rr = r * (1 - 0.6 * t); out.x = Math.sin(ang) * rr; out.y = Math.cos(ang) * rr; },
      color: (t, ang, out) => out.set(0xc8a040),
      capEnd: true,
    });
    const bones = mergeGeometries([bone(R, W, 0.09), bone(W, tip, 0.06), ...F.slice(0, 3).map((f) => bone(W, f, 0.045))].map(clean), false);
    return { membrane, bones };
  }

  _buildPlates() {
    const tk = this.tk;
    const outline = [
      [-0.5, 0], [-0.4, 0.22], [-0.64, 0.3], [-0.36, 0.43], [-0.52, 0.58], [-0.24, 0.64],
      [-0.32, 0.8], [-0.1, 0.84], [0, 1], [0.1, 0.83], [0.28, 0.78], [0.15, 0.63],
      [0.4, 0.56], [0.24, 0.43], [0.46, 0.3], [0.34, 0.2], [0.5, 0],
    ];
    const shape = new THREE.Shape();
    outline.forEach(([x, y], i) => {
      const sx = x - 0.28 * y; // sweep tips backward
      if (i === 0) shape.moveTo(sx, y - 0.25); else shape.lineTo(sx, y - (i === outline.length - 1 ? 0.25 : 0));
    });
    const base = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, steps: 1,
    });
    base.translate(0, 0, -0.03);
    base.computeVertexNormals();

    const rootCol = new THREE.Color(0x2c302d);
    const tipCol = new THREE.Color(0xa9a596);
    const geos = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
    const Z = V(0, 0, 1);
    const place = (t, size, lateral, tiltOut) => {
      const ry = profile(tk, RY, t), rz = profile(tk, RZ, t);
      this.curve.getPointAt(t, P);
      this.curve.getTangentAt(t, T);
      N.crossVectors(Z, T).normalize();
      const g = base.clone();
      g.scale(size * 0.95, size, 1 + size * 0.3);
      // vertex colors: dark root -> pale tip
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      const pt = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const f = smooth(-0.15 * size, 0.85 * size, p.getY(i));
        const c = rootCol.clone().lerp(tipCol, f);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        pt[i] = t;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aPlateT', new THREE.BufferAttribute(pt, 1));
      g.rotateX(tiltOut);
      g.rotateZ(Math.atan2(T.y, T.x));
      const a = lateral * 0.62;
      const off = N.clone().multiplyScalar(Math.cos(a) * ry * 0.8).add(Z.clone().multiplyScalar(Math.sin(a) * rz * 0.85));
      g.translate(P.x + off.x, P.y + off.y, P.z + off.z);
      const sk = this.spineSkin(t);
      const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) { si[i * 4] = sk[0]; si[i * 4 + 1] = sk[1]; sw[i * 4] = sk[2]; sw[i * 4 + 1] = sk[3]; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geos.push(g);
    };
    // central row
    const t0 = tk[1] - 0.02, t1 = (tk[8] + tk[9]) / 2;
    const n = 19;
    for (let i = 0; i < n; i++) {
      const t = t0 + (t1 - t0) * (i / (n - 1));
      const k = i / (n - 1);
      const size = 0.32 + 0.95 * Math.sin(Math.pow(k, 0.85) * Math.PI) ** 1.2 * (k < 0.75 ? 1 : 1 - (k - 0.75) * 1.4);
      place(t, Math.max(0.25, size), 0, 0);
    }
    // two side rows
    const s0 = tk[3], s1 = tk[8];
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      const t = s0 + (s1 - s0) * k;
      const size = 0.28 + 0.42 * Math.sin(k * Math.PI);
      place(t + 0.012, size, 1, 0.42);
      place(t + 0.012, size, -1, -0.42);
    }
    const out = mergeGeometries(geos.map((g) => {
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aPlateT', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      return g.index ? g.toNonIndexed() : g;
    }), false);
    return out;
  }

  _anchors() {
    const mk = (bone, x, y) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, 0);
      this.bones[bone].add(o);
      return o;
    };
    this.anchor = {
      head: mk(B.head, 0.78, -0.06),
      // the middle of the open mouth (between the upper lip and the dropped jaw): the breath comes out here
      snout: mk(B.head, 1.1, -0.6),
      neck: mk(B.neck1, 0.1, 0.0),
      chest: mk(B.chest, -0.1, -0.05),
      hips: mk(B.hips, 0, 0),
      tail: mk(B.t1, -0.3, 0),
      toeR: mk(B.toeR, 0.2, 0),
      toeL: mk(B.toeL, 0.2, 0),
    };
    this._tmp = new THREE.Vector3();
  }

  setGlow(base, waveAmp, wavePos) {
    this.plateUniforms.uGlow.value = base;
    this.plateUniforms.uWaveAmp.value = waveAmp;
    this.plateUniforms.uWavePos.value = wavePos;
  }

  /** 0 = the skin's own glow, 1 = Kaiju Rage's burning red-orange. */
  setRage(k) {
    this.plateMat.emissive.copy(this.glowColor).lerp(PLATE_RAGE, k);
    // darken the pale bone base so the fire reads as red instead of washing out to pink
    this.plateMat.color.copy(this.plateTint).multiplyScalar(1 - 0.75 * k);
    this.eyeMat.emissive.copy(this.eyeColor).lerp(PLATE_RAGE, k);
  }

  /** Applies a skin from Skins.js: colours, hide material, and its build (hitbox width along x). */
  setSkin(skin) {
    this.skin = skin;
    // a 'flat' skin (Mecha) drops the hide's painted colours for one metal colour
    const vertexColors = skin.flat == null;
    if (this.skinMat.vertexColors !== vertexColors) {
      this.skinMat.vertexColors = vertexColors;
      this.skinMat.needsUpdate = true;
    }
    if (vertexColors) this.skinMat.color.setRGB(...skin.skin);
    else this.skinMat.color.set(skin.flat);
    this.skinMat.metalness = skin.metal;
    this.skinMat.roughness = skin.rough;
    this.skinMat.envMapIntensity = 0.9 + skin.metal * 1.2;
    this.skinUniforms.uCrack.value.set(skin.crack).multiplyScalar(skin.crackGain ?? 1);
    this.skinUniforms.uSpot.value.set(skin.spot ?? 0);
    this.skinUniforms.uSheen.value.set(skin.sheen ?? 0);
    this.skinUniforms.uIrid.value = skin.irid ?? 0;
    this.plateTint.setRGB(...skin.plate);
    this.glowColor.set(skin.glow);
    this.eyeColor.set(skin.eye);
    this.hitX = skin.hitX;
    if (this.styles) {
      // the Rex: a skin picks the smooth model or the cubes
      const pix = skin.model === 'pixel';
      for (const m of this.styles.smooth) m.visible = !pix;
      for (const m of this.styles.pixel) m.visible = pix;
      this.voxelMat.color.setRGB(...skin.skin);
      this.voxelMat.roughness = skin.rough;
    }
    this.setRage(0);
  }

  /**
   * st: { speed, grounded, vy, ducking, running, dead, roar (0..1), breath (0..1), bite (0..1) }
   */
  update(dt, st) {
    this.time += dt;
    const time = this.time;
    this.run = damp(this.run, st.running ? 1 : 0, 6, dt);
    this.air = damp(this.air, st.grounded ? 0 : 1, 14, dt);
    this.duck = damp(this.duck, st.ducking ? 1 : 0, 18, dt);
    this.dead = damp(this.dead, st.dead ? 1 : 0, 10, dt);
    this.roar = damp(this.roar, st.roar || 0, 8, dt);
    this.breath = damp(this.breath, st.breath || 0, 12, dt);
    this.bite = damp(this.bite, st.bite || 0, 30, dt); // smash: a fast lunge, jaws first

    const speed = Math.max(0, st.speed);
    const freq = 2.1 + speed * 0.1;
    if (!st.dead) this.phase = (this.phase + dt * freq * this.run) % 1;
    const ph = this.phase;
    const TAU = Math.PI * 2;
    const run = this.run * (1 - this.air);
    const duck = this.duck;
    const breathe = Math.sin(time * 1.6);

    const bn = this.bones;
    // ---- spine ----
    const bob = run * (0.07 * Math.cos(TAU * 2 * ph)) - 0.02 * breathe * (1 - this.run);
    const hipsY = SPINE[5][1] - 0.78 * duck + bob - 0.12 * this.run * (1 - duck);
    const vyTilt = THREE.MathUtils.clamp((st.vy || 0) * 0.012, -0.22, 0.25) * this.air;
    const hipsPitch = -0.05 * this.run - 0.13 * duck + vyTilt + 0.03 * Math.sin(TAU * 2 * ph + 0.6) * run
      + 0.22 * this.dead + 0.1 * this.roar - 0.06 * this.breath - 0.14 * this.bite;
    bn[B.hips].position.set(0.22 * this.bite, hipsY, 0);
    bn[B.hips].rotation.set(0, 0.02 * Math.sin(TAU * ph) * run, hipsPitch);

    for (let k = 1; k <= 4; k++) {
      const b = bn[B.t1 + k - 1];
      const lag = k * 0.75;
      b.rotation.y = (0.075 * Math.sin(TAU * ph - lag) * this.run + 0.03 * Math.sin(time * 0.9 - lag) * (1 - this.run)) * (1 - this.dead * 0.7);
      b.rotation.z = 0.035 * Math.sin(TAU * 2 * ph - lag) * run + 0.04 * duck + 0.06 * this.air * Math.sign(-(st.vy || 0) + 0.01) * 0.6
        + 0.015 * breathe * (1 - this.run) - 0.05 * this.dead + 0.04 * this.roar;
    }
    const chestPitch = 0.02 * breathe - 0.02 * Math.sin(TAU * 2 * ph) * run - 0.02 * duck;
    bn[B.chest].rotation.set(0, -0.015 * Math.sin(TAU * ph) * run, chestPitch);
    const breatheS = 1 + 0.015 * breathe;
    bn[B.chest].scale.set(1, breatheS, breatheS);

    // neck/head: stabilise the head, lower it for ducking, lift it for roaring
    const n1 = -0.62 * duck + 0.25 * this.roar - 0.12 * this.dead - 0.08 * this.breath + 0.02 * Math.sin(TAU * 2 * ph + 1.2) * run
      - 0.3 * this.bite;
    const n2 = -0.28 * duck + 0.3 * this.roar + 0.2 * this.dead - 0.05 * this.breath + 0.32 * this.bite;
    const headStab = -(hipsPitch + chestPitch + n1 + n2) * 0.65;
    bn[B.neck1].rotation.set(0, 0.02 * Math.sin(TAU * ph + 0.5) * run, n1);
    bn[B.neck2].rotation.set(0, 0, n2);
    bn[B.head].rotation.set(0, 0, headStab + 0.12 * duck - 0.1 * this.roar + 0.02 * breathe + 0.06 * this.dead + 0.1 * this.breath
      - 0.12 * this.bite);
    const jawOpen = 0.02 + 0.04 * (0.5 + 0.5 * Math.sin(time * 3)) * (1 - this.run) + 0.06 * run * (0.5 + 0.5 * Math.sin(TAU * 2 * ph))
      + 0.65 * this.roar + 0.55 * this.breath + 0.35 * this.dead + 0.8 * this.bite;
    bn[B.jaw].rotation.z = -jawOpen;

    // ---- the Golden Hydra: side heads sway on their own necks, wings beat with the stride ----
    if (this.sideHeads) {
      for (const { pivot, side } of this.sideHeads) {
        const p2 = time * 1.6 + side * 1.9;
        pivot.rotation.set(
          0.06 * Math.sin(p2 * 0.7) * side,
          side * (0.1 * Math.sin(p2) - 0.05),
          0.07 * Math.sin(p2 * 1.3) - 0.45 * duck + 0.25 * this.roar - 0.1 * this.dead + 0.1 * this.breath,
        );
      }
      const beat = Math.sin(TAU * ph * 2) * 0.32 * run + Math.sin(time * 2.2) * 0.12 * (1 - this.run);
      for (const { group, side } of this.wings) {
        group.rotation.set(side * (0.1 + beat + 0.35 * this.air - 0.5 * duck), 0, 0.3 + 0.2 * duck);
      }
    }

    // ---- legs (IK) ----
    const stanceF = 0.5 - 0.1 * Math.min(1, speed / 24);
    const v = speed / DRAGON_SCALE;
    const stride = THREE.MathUtils.clamp((v * stanceF) / freq / 2, 0.2, 1.4) * this.run;
    const xc = 0.42 - 0.12 * duck;
    for (let leg = 0; leg < 2; leg++) {
      const p = (ph + leg * 0.5) % 1;
      let fx, fy, meta, toe;
      if (p < stanceF) {
        const u = p / stanceF;
        fx = xc + stride - 2 * stride * u;
        fy = 0;
        meta = 0.48 - 0.25 * u * this.run;
        toe = 0;
      } else {
        const u = (p - stanceF) / (1 - stanceF);
        const e = u * u * (3 - 2 * u);
        fx = xc - stride + 2 * stride * e;
        fy = Math.sin(Math.PI * u) * (0.35 + 0.35 * Math.min(1, speed / 20)) * this.run;
        meta = 0.48 - 0.5 * Math.sin(Math.PI * u) * this.run;
        toe = -0.7 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * this.run;
      }
      // idle stance: feet slightly staggered
      const idleX = xc + (leg === 0 ? 0.22 : -0.22);
      fx = fx * this.run + idleX * (1 - this.run);
      // in-air tuck
      const ax = xc + (leg === 0 ? 0.45 : 0.05), ay = leg === 0 ? 0.95 : 0.6;
      fx += (ax - fx) * this.air;
      fy += (ay - fy) * this.air;
      meta += (0.05 - meta) * this.air;
      toe += (-0.65 - toe) * this.air;
      this._solveLeg(leg === 0 ? B.thighR : B.thighL, hipsY, hipsPitch, fx, fy, meta, toe);

      const inStance = p < stanceF && this.air < 0.3 && this.run > 0.5;
      if (inStance && !this.lastStance[leg] && this.onFootstep) this.onFootstep(leg, fx);
      this.lastStance[leg] = inStance;
    }

    // ---- glow (dorsal plates) ----
    this.group.updateMatrixWorld(true);
  }

  _solveLeg(thigh, hipsY, hipsPitch, tx, ty, meta, toe) {
    const c = Math.cos(hipsPitch), s = Math.sin(hipsPitch);
    const hx = HIP_OFF.x * c - HIP_OFF.y * s;
    const hy = hipsY + HIP_OFF.x * s + HIP_OFF.y * c;
    // ankle from toe target and metatarsus angle
    const ax = tx - L3 * Math.sin(meta);
    const ay = ty + L3 * Math.cos(meta);
    let dx = ax - hx, dy = ay - hy;
    let dist = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 0.001;
    if (dist > maxD) { dx *= maxD / dist; dy *= maxD / dist; dist = maxD; }
    const thD = Math.atan2(dx, -dy);
    const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const th1 = thD + Math.acos(cosA);
    const kx = hx + L1 * Math.sin(th1), ky = hy - L1 * Math.cos(th1);
    const th2 = Math.atan2(hx + dx - kx, -(hy + dy - ky));
    const b = this.bones;
    b[thigh].rotation.z = th1 - hipsPitch;
    b[thigh + 1].rotation.z = th2 - th1;
    b[thigh + 2].rotation.z = meta - th2;
    b[thigh + 3].rotation.z = toe - meta;
  }

  /** Writes world-space AABBs [minX, minY, maxX, maxY] into out (array of Float32Array(4)). Returns count. */
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
    // Deliberately about 75% of the visible body so near misses feel fair. The tail has no box:
    // brushing a cactus with it never ends a run. The skin's build (hitX) widens or narrows every box
    // along x only; heights never change. (The body is drawn at the same x-scale, so the anchors
    // already spread out or close in to match.)
    const k = this.hitX;
    box(a.head, 0.36 * k, 0.2);
    box(a.neck, 0.2 * k, 0.2);
    box(a.chest, 0.34 * k, 0.32);
    box(a.hips, 0.38 * k, 0.3);
    const hx = w.x, hy = w.y;
    // legs: from the feet up to the hips
    a.toeR.getWorldPosition(w);
    let minX = w.x, maxX = w.x, minY = w.y;
    a.toeL.getWorldPosition(w);
    minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x); minY = Math.min(minY, w.y);
    const b = out[n++];
    b[0] = Math.max(hx - 0.45 * k, minX);
    b[1] = minY + 0.05;
    b[2] = Math.min(hx + 0.55 * k, maxX + 0.05);
    b[3] = hy - 0.35;
    return n;
  }

  getMouthWorld(target) {
    return this.anchor.snout.getWorldPosition(target);
  }

  /** World positions of the Golden Hydra's side mouths (empty for one-headed monsters). */
  getSideMouths(targets) {
    if (!this.sideHeads) return 0;
    this.sideHeads.forEach((h, i) => h.mouth.getWorldPosition(targets[i]));
    return this.sideHeads.length;
  }
}

function skinRigid(g, bone) {
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
}

function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

function clean(g) {
  const keep = ['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'];
  const q = g;
  for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
  if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
  if (!q.attributes.color) q.setAttribute('color', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 3).fill(1), 3));
  return q;
}
