// Obstacles: procedural saguaro cacti, boulders and pterodactyls, pooled and spawned Chrome-dino style.
import * as THREE from 'three';
import { sweep, blob, mergeLoose } from '../gfx/geometry.js';
import { mulberry32, createNoise, hash32 } from '../gfx/noise.js';
import { Military } from './Military.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const RIBS = 12;
const ribFactor = (a) => 0.9 + 0.1 * Math.pow(Math.abs(Math.cos((a * RIBS) / 2)), 0.6);
const valley = new THREE.Color(0x2f4a24);
const ridge = new THREE.Color(0x6f8a4a);
const base = new THREE.Color(0x7c7140);

function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
}

function stem(points, R, len, { dome = true, ground = false } = {}) {
  const g = sweep({
    points,
    segments: Math.max(10, Math.round(len * 14)),
    radial: 48,
    uvScale: [len / (2 * Math.PI * R * 2), 1],
    curveType: 'catmullrom',
    section: (t, a, out) => {
      const d = t * len;
      let r = R * (1 + 0.025 * Math.sin(d * 4.1));
      if (dome && d > len - R) {
        const k = (d - (len - R)) / R;
        r *= Math.sqrt(Math.max(0, 1 - k * k));
      }
      r *= ribFactor(a);
      out.x = Math.sin(a) * r;
      out.y = Math.cos(a) * r;
    },
    color: (t, a, out) => {
      const rf = (ribFactor(a) - 0.9) / 0.1;
      out.copy(valley).lerp(ridge, rf);
      const d = t * len;
      if (ground) out.lerp(base, smooth(0.6, 0.0, d) * 0.6);
      if (dome) out.lerp(ridge, smooth(len - R * 1.5, len, d) * 0.35);
    },
    capEnd: dome,
  });
  swapUV(g);
  return g;
}

/** Builds a saguaro. Returns { geometry, boxes } with boxes in local space (x-y plane). */
export function buildCactus(rand, { height, radius, arms }) {
  const geos = [];
  const boxes = [[-radius * 0.7, 0, radius * 0.7, height * 0.92]];
  const trunkLen = height + 0.3;
  geos.push(stem([V(0, -0.3), V(0.02 * (rand() - 0.5), height * 0.5), V(0, height)], radius, trunkLen, { ground: true }));
  const used = [];
  for (let i = 0; i < arms; i++) {
    let side = rand() < 0.5 ? 1 : -1;
    if (used.includes(side)) side = -side;
    used.push(side);
    const ar = radius * (0.55 + rand() * 0.15);
    const h0 = height * (0.32 + rand() * 0.22);
    const outX = radius + ar * (1.2 + rand() * 0.8);
    const h1 = Math.min(height * (0.7 + rand() * 0.25), h0 + ar * 6 + rand() * height * 0.25);
    const pts = [
      V(0, h0 - ar * 0.2), V(radius * 0.8, h0), V(outX - ar * 0.6, h0 + ar * 0.15),
      V(outX, h0 + ar * 1.4), V(outX + ar * 0.05, h1),
    ];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += pts[k].distanceTo(pts[k - 1]);
    const g = stem(pts, ar, len);
    const ang = side > 0 ? (rand() - 0.5) * 0.7 : Math.PI + (rand() - 0.5) * 0.7;
    g.rotateY(ang);
    geos.push(g);
    const ex = Math.cos(ang) * (outX + ar);
    boxes.push([Math.min(0, ex) * 0.75, h0 - ar * 0.2, Math.max(0, ex) * 0.75, h1 * 0.92]);
  }
  return { geometry: mergeLoose(geos), boxes };
}

export function buildRock(seed, w, h, d) {
  const noise = createNoise(seed);
  const g = blob(1, 9, (v) => {
    const n = noise.fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 4) * 0.35;
    const facets = Math.abs(noise.noise3(v.x * 3 + 7, v.y * 3, v.z * 3)) * 0.08;
    v.multiplyScalar(1 + n - facets);
    v.x *= w * 0.5; v.z *= d * 0.5;
    v.y = v.y > 0 ? v.y * h : v.y * h * 0.25;
  }, 1.6);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const r1 = new THREE.Color(0x9a6a4a), r2 = new THREE.Color(0x6e4c38), r3 = new THREE.Color(0xb88d67);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const n = noise.noise3(p.getX(i) * 0.8, y * 4, p.getZ(i) * 0.8);
    c.copy(r1).lerp(r2, smooth(-0.4, 0.6, n)).lerp(r3, smooth(0.6, 1.0, y / h) * 0.4);
    c.multiplyScalar(0.75 + 0.25 * smooth(-0.2, h * 0.5, y));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildPterodactyl(materials) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dark = new THREE.Color(0x9a5a34), belly = new THREE.Color(0xf0d2a4);

  const torso = sweep({
    points: [V(-0.62, -0.02), V(-0.2, 0), V(0.25, 0.03), V(0.48, 0.12), V(0.62, 0.18)],
    segments: 30, radial: 16, uvScale: [1.4, 0.8],
    section: (t, a, out) => {
      const r = t < 0.15 ? 0.02 + t * 0.6 : t < 0.65 ? 0.11 + 0.06 * Math.sin(((t - 0.15) / 0.5) * Math.PI) : 0.12 - (t - 0.65) * 0.16;
      out.x = Math.sin(a) * r * 0.9;
      out.y = Math.cos(a) * r;
    },
    color: (t, a, out) => out.copy(dark).lerp(belly, smooth(0.2, -0.7, Math.cos(a))),
    capStart: true,
  });
  const head = sweep({
    points: [V(0.32, 0.42), V(0.5, 0.26), V(0.66, 0.2), V(0.95, 0.14), V(1.25, 0.08)],
    segments: 30, radial: 12, uvScale: [1, 0.5],
    section: (t, a, out) => {
      const r = t < 0.3 ? 0.012 + t * 0.25 : t < 0.45 ? 0.09 : 0.09 * (1 - (t - 0.45) / 0.55) + 0.006;
      out.x = Math.sin(a) * r * (t < 0.3 ? 0.25 : 0.75);
      out.y = Math.cos(a) * r * (t < 0.3 ? 1.3 : 1);
    },
    color: (t, a, out) => out.copy(dark).lerp(new THREE.Color(0xf2c690), smooth(0.55, 1, t) * 0.6),
    capStart: true, capEnd: true,
  });
  const bodyMesh = new THREE.Mesh(mergeLoose([torso, head]), materials.skin);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);
  const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eyeGeo, materials.eye);
    e.position.set(0.62, 0.25, 0.055 * s);
    body.add(e);
  }

  // wings: inner (shoulder->wrist) and outer (wrist->tip) membranes with a bony leading edge
  const membrane = (pts) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
    const g = new THREE.ShapeGeometry(shape, 6);
    g.rotateX(Math.PI / 2); // shape x/y -> world x/z
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      // slight camber
      p.setY(i, Math.sin(Math.min(1, Math.abs(p.getZ(i)) * 1.2) * Math.PI) * 0.03);
      c.set(0xe08a48).lerp(new THREE.Color(0x9a4a26), smooth(0.2, -0.4, p.getX(i)));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const bone = (a, b, r) => sweep({
    points: [a, a.clone().lerp(b, 0.5), b], segments: 8, radial: 6,
    sideHint: V(1, 0, 0),
    section: (t, ang, out) => { out.x = Math.sin(ang) * r * (1 - 0.5 * t); out.y = Math.cos(ang) * r * (1 - 0.5 * t); },
    color: (t, a2, out) => out.copy(dark),
  });
  const innerGeo = membrane([[0.18, 0.06], [0.12, 0.5], [0.22, 0.95], [-0.08, 0.82], [-0.3, 0.45], [-0.45, 0.08]]);
  const outerGeo = membrane([[0, 0], [-0.2, 0.55], [-0.55, 1.0], [-0.32, 0.45], [-0.3, -0.13]]);
  const innerBone = bone(V(0.18, 0.02, 0.06), V(0.22, 0.02, 0.95), 0.035);
  const outerBone = bone(V(0, 0.02, 0), V(-0.55, 0.01, 1.0), 0.025);
  const wings = [];
  for (const s of [1, -1]) {
    const inner = new THREE.Group();
    inner.position.set(0.12, 0.06, 0.08 * s);
    inner.scale.z = s;
    const im = new THREE.Mesh(innerGeo, materials.membrane);
    const ib = new THREE.Mesh(innerBone, materials.skin);
    im.castShadow = ib.castShadow = true;
    inner.add(im, ib);
    const outer = new THREE.Group();
    outer.position.set(0.22, 0, 0.95);
    const om = new THREE.Mesh(outerGeo, materials.membrane);
    const ob = new THREE.Mesh(outerBone, materials.skin);
    om.castShadow = ob.castShadow = true;
    outer.add(om, ob);
    inner.add(outer);
    body.add(inner);
    wings.push({ inner, outer, s });
  }
  root.rotation.y = Math.PI; // face -x, towards the dragon
  root.userData.wings = wings;
  root.userData.body = body;
  return root;
}

// ---------------------------------------------------------------------------

const SPAWN_X = 120;
const DESPAWN_X = -25;
export const PTERO_HEIGHTS = [0.95, 1.95, 3.2];
const SHELL_SPEED = 16; // on top of the ground speed
const FLYERS = ['ptero', 'heli', 'shell', 'missile'];
export const isFlyer = (type) => FLYERS.includes(type);
// What the smash does to each type: points when it breaks, 0 = too solid (jump it), 'reflect' = batted back.
export const SMASH = {
  cactusS: 10, cactusL: 10, ptero: 20, heli: 25, tank: 30, car: 20, tower: 40, fuel: 50, building: 50, pillar: 40,
  rock: 0, hedgehog: 0, lava: 0, meteor: 0, shell: 'reflect', missile: 'reflect',
};
// Too tall to jump: smash it or burn it.
export const TALL = { tower: true, fuel: true, building: true, pillar: true };
// Can't be smashed, but nothing to clang off either: the smash just passes over.
export const SILENT = { lava: true, meteor: true };
// How each type must be answered. 'height': by the height it flies at (see respond()). The spawner,
// the tips and the autopilot all read this, so a new type can't be added without saying how to beat it.
export const RESPONSE = {
  cactusS: 'jump', cactusL: 'jump', rock: 'jump', hedgehog: 'jump', lava: 'jump', meteor: 'jump', car: 'jump', tank: 'jump',
  tower: 'smash', fuel: 'smash', building: 'smash', pillar: 'smash',
  ptero: 'height', heli: 'height', shell: 'height', missile: 'height',
};
/** 'jump' | 'duck' | 'under' | 'smash' for one obstacle: low flyers are jumped, mid ones ducked, high ones run under. */
export function respond(o) {
  const r = RESPONSE[o.type];
  if (r !== 'height') return r;
  const y = o.ty ?? o.y;
  return y > 2.5 ? 'under' : y > 1.5 ? 'duck' : 'jump';
}
// Spawn weights per stage (the desert keeps Chrome's original table in _pickType).
const TABLES = {
  army: [['tank', 22], ['heli', 20], ['hedgehog', 14], ['tower', 12], ['fuel', 8], ['cactusS', 12], ['cactusL', 8], ['rock', 4]],
  city: [['car', 30], ['building', 30], ['heli', 18], ['hedgehog', 14]],
  siege: [['building', 22], ['tank', 20], ['heli', 18], ['car', 16], ['hedgehog', 12], ['fuel', 6]],
  ashlands: [['lava', 22], ['rock', 16], ['meteor', 14], ['ptero', 18], ['pillar', 14]],
  inferno: [['tank', 16], ['heli', 16], ['lava', 14], ['meteor', 12], ['tower', 10], ['fuel', 8], ['pillar', 10], ['rock', 8], ['hedgehog', 6]],
};

export class Obstacles {
  constructor(scene, tex) {
    this.scene = scene;
    this.rand = mulberry32(2024);
    this.active = [];
    this.pools = {
      cactusS: [], cactusL: [], rock: [], ptero: [], tank: [], heli: [], shell: [], missile: [],
      tower: [], fuel: [], hedgehog: [], building: [], car: [], lava: [], meteor: [], pillar: [],
    };
    this.city = null; // set by the game: builds the city's buildings and cars
    this.volcano = null; // set by the game: builds lava pools, meteors and basalt pillars
    this.levelTight = 0; // harder levels tighten gaps and arm more tanks
    this.onMeteor = null;
    this.time = 0;
    this.mil = new Military(tex);
    this.stage = 'desert';
    this.cycle = 0;
    this.spawning = true;
    this.night = 0;
    this.warnings = []; // [{x, y}] incoming shells being aimed, for the HUD
    this.crystals = null; // set by the game: crystal patterns are laid out with the obstacles
    this.jump = { v: 19.6, g: 58 }; // the dragon's full jump, used to lay crystals along its arc
    this.onFire = null;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.cactusMat = new THREE.MeshStandardMaterial({
      map: tex.cactus.map, normalMap: tex.cactus.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true, roughness: 0.72, metalness: 0,
    });
    this.rockMat = new THREE.MeshStandardMaterial({
      map: tex.rock.map, normalMap: tex.rock.normalMap, vertexColors: true, roughness: 0.92, metalness: 0,
    });
    // Flyers get a warm rim glow around their silhouettes (stronger after dark) so they read against
    // any sky. The shared uniform is set from the night level in update().
    this.rim = { uRim: { value: 0.5 } };
    const rimmed = (m, color) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.rim);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uRim;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float rimF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
            totalEmissiveRadiance += vec3(${color.r.toFixed(3)}, ${color.g.toFixed(3)}, ${color.b.toFixed(3)}) * rimF * uRim;`);
      };
      return m;
    };
    const rimC = new THREE.Color(1.0, 0.78, 0.5);
    this.pteroMats = {
      skin: rimmed(new THREE.MeshStandardMaterial({ normalMap: tex.scales.normalMap, vertexColors: true, roughness: 0.7 }), rimC),
      membrane: rimmed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), rimC),
      eye: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffbb33, emissiveIntensity: 2.5, roughness: 0.25 }),
    };

    // pre-built variants
    const r = mulberry32(99);
    this.cactusVariants = { cactusS: [], cactusL: [] };
    for (let i = 0; i < 6; i++) {
      this.cactusVariants.cactusS.push(buildCactus(r, { height: 1.0 + r() * 0.4, radius: 0.17 + r() * 0.05, arms: r() < 0.45 ? 1 : 0 }));
      this.cactusVariants.cactusL.push(buildCactus(r, { height: 1.65 + r() * 0.55, radius: 0.24 + r() * 0.06, arms: 1 + (r() < 0.55 ? 1 : 0) }));
    }
    this.rockVariants = [];
    for (let i = 0; i < 4; i++) {
      const w = 1.3 + r() * 0.5, h = 0.85 + r() * 0.3;
      this.rockVariants.push({ geometry: buildRock(50 + i, w, h, 1.1 + r() * 0.4), w, h });
    }
    // helicopters (and the missiles sharing their paint) get a subtler version of the same rim
    rimmed(this.mil.mats.paint, new THREE.Color(0.75, 0.85, 1.0));
    this.lastType = null;
    this.repeat = 0;
    this.nextGap = 30;
  }

  /**
   * seed: the run's seed. Every spawn draws from its own stream (seed, spawn index), so the sequence of
   * types and variants is the same for everyone on that seed even when speeds (and so gaps) differ.
   */
  reset(seed = this.seed ?? 2024) {
    for (const o of this.active) this._release(o);
    this.active.length = 0;
    this.seed = seed >>> 0;
    this.spawnIdx = 0;
    this.rand = mulberry32(hash32(this.seed, 0x5eed));
    this.lastType = null;
    this.repeat = 0;
    this.nextGap = 40;
    this.firstSpawnX = 72;
    this.pendingShooter = false;
    this.spawning = true;
    this.warnings.length = 0;
  }

  /** How an obstacle must be answered: 'jump' | 'duck' | 'under' | 'smash' (also used by the autopilot). */
  respond(o) {
    return respond(o);
  }

  /** Whether a type is answered by its flight height (flyers and projectiles). */
  flies(o) {
    return RESPONSE[o.type] === 'height';
  }

  _acquire(type) {
    const pool = this.pools[type];
    let o = pool.pop();
    if (!o) o = { type, group: new THREE.Group(), boxes: [], width: 0, x: 0, y: 0, vx: 0, t: 0, ptero: null, model: null };
    o.group.visible = true;
    o.dead = false;
    o.passed = false;
    o.near = Infinity; // smallest vertical clearance seen while overlapping the dragon (close calls)
    o.projectile = false;
    o.shooter = false;
    o.reflected = false;
    o.clanged = false;
    o.vm = 0;
    o.smash = SMASH[type];
    o.tall = !!TALL[type];
    o.t = this.rand() * 10;
    o.group.rotation.set(0, 0, 0);
    this.root.add(o.group);
    return o;
  }

  _release(o) {
    o.group.visible = false;
    this.root.remove(o.group);
    if (o.type.startsWith('cactus') || o.type === 'rock' || o.type === 'building' || o.type === 'car') {
      o.group.clear();
    }
    this.pools[o.type].push(o);
  }

  _spawnStructure(kind) {
    const o = this._acquire(kind);
    this._model(o, () => this.mil.makeStructure(kind));
    o.boxes.length = 0;
    if (kind === 'tower') { o.boxes.push([-0.8, 0, 0.8, 3.0], [-0.9, 3.0, 0.9, 4.8]); o.width = 1.9; }
    else if (kind === 'fuel') { o.boxes.push([-1.0, 0, 1.0, 3.7]); o.width = 2.3; }
    else { o.boxes.push([-0.6, 0, 0.6, 0.95]); o.width = 1.4; }
    o.vx = 0;
    return o;
  }

  _spawnBuilding() {
    const o = this._acquire('building');
    const m = this.city.makeBuilding(this.rand);
    o.group.add(m);
    const { w, h } = m.userData;
    o.boxes.length = 0;
    o.boxes.push([-w / 2, 0, w / 2, h]);
    o.width = w;
    o.vx = 0;
    return o;
  }

  _spawnCar() {
    const o = this._acquire('car');
    o.group.add(this.city.makeCar(this.rand));
    o.boxes.length = 0;
    o.boxes.push([-1.1, 0, 1.1, 1.15]);
    o.width = 2.2;
    o.vx = 0;
    return o;
  }

  _spawnLava() {
    const o = this._acquire('lava');
    const m = this._model(o, () => this.volcano.makeLava());
    const w = 2.2 + this.rand() * 1.6;
    m.scale.set(w / 2, 1, 1.25);
    o.boxes.length = 0;
    o.boxes.push([-w / 2 + 0.35, 0, w / 2 - 0.35, 0.3]);
    o.width = w;
    o.vx = 0;
    return o;
  }

  /** A meteor: a marker on the sand first, then a fireball lands on it and leaves a burning crater. */
  _spawnMeteor() {
    const o = this._acquire('meteor');
    const { ring, ball, crater } = this._model(o, () => this.volcano.makeMeteor()).userData;
    ring.visible = true;
    ball.visible = false;
    crater.visible = false;
    o.landed = false;
    o.fallT = -1;
    o.boxes.length = 0; // harmless until it lands
    o.width = 2.3;
    o.vx = 0;
    return o;
  }

  _spawnPillar() {
    const o = this._acquire('pillar');
    this._model(o, () => this.volcano.makePillar());
    o.boxes.length = 0;
    o.boxes.push([-0.9, 0, 0.9, 4.4]);
    o.width = 1.9;
    o.vx = 0;
    return o;
  }

  _updateMeteor(o, dt, speed) {
    if (o.landed) return;
    const { ring, ball } = o.model.userData;
    ring.material.opacity = 0.45 + 0.35 * Math.sin(o.t * 12);
    // falls for a second, timed to land well ahead of the dragon (on screen in 2D)
    if (o.fallT < 0 && o.x < 18 + speed) o.fallT = 0;
    if (o.fallT < 0) return;
    o.fallT += dt;
    const k = Math.min(1, o.fallT);
    ball.visible = true;
    ball.position.set(9 * (1 - k), 0.6 + 17 * (1 - k), 0);
    ball.rotation.x += dt * 6;
    if (k < 1) return;
    o.landed = true;
    ball.visible = false;
    ring.visible = false;
    o.model.userData.crater.visible = true;
    o.boxes.push([-1.0, 0, 1.0, 0.35]);
    this.onMeteor?.(o);
  }

  /** Bats a shell or missile back the way it came. */
  reflect(o, speed) {
    o.reflected = true;
    o.vm = -26;
    o.vx = o.vm - speed;
    o.ty = o.y;
    o.group.rotation.y = Math.PI;
  }

  /** Calls hit(o) once for each live obstacle overlapping the box [x0, y0, x1, y1]. */
  inZone(x0, y0, x1, y1, hit) {
    for (const o of this.active) {
      if (o.dead || o.reflected) continue;
      for (const b of o.boxes) {
        if (o.x + b[0] < x1 && o.x + b[2] > x0 && o.y + b[1] < y1 && o.y + b[3] > y0) {
          hit(o);
          break;
        }
      }
    }
  }

  _model(o, make) {
    if (!o.model) {
      o.model = make();
      o.group.add(o.model);
    }
    return o.model;
  }

  _spawnCactus(type, count) {
    const o = this._acquire(type);
    o.boxes.length = 0;
    const variants = this.cactusVariants[type];
    let x = 0;
    const spacing = type === 'cactusS' ? 0.62 : 0.95;
    for (let i = 0; i < count; i++) {
      const v = variants[Math.floor(this.rand() * variants.length)];
      const m = new THREE.Mesh(v.geometry, this.cactusMat);
      m.castShadow = true;
      m.receiveShadow = true;
      const s = 0.92 + this.rand() * 0.16;
      m.scale.setScalar(s);
      m.position.set(x, 0, (this.rand() - 0.5) * 0.5);
      m.rotation.y = (this.rand() - 0.5) * 0.4;
      o.group.add(m);
      for (const b of v.boxes) o.boxes.push([x + b[0] * s, b[1] * s, x + b[2] * s, b[3] * s]);
      x += spacing * (0.85 + this.rand() * 0.4);
    }
    // centre the group
    const minX = Math.min(...o.boxes.map((b) => b[0]));
    const maxX = Math.max(...o.boxes.map((b) => b[2]));
    const cx = (minX + maxX) / 2;
    o.group.children.forEach((c) => (c.position.x -= cx));
    o.boxes.forEach((b) => { b[0] -= cx; b[2] -= cx; });
    o.width = maxX - minX;
    o.vx = 0;
    return o;
  }

  _spawnRock() {
    const o = this._acquire('rock');
    const v = this.rockVariants[Math.floor(this.rand() * this.rockVariants.length)];
    const m = new THREE.Mesh(v.geometry, this.rockMat);
    m.castShadow = m.receiveShadow = true;
    m.rotation.y = this.rand() * Math.PI * 2;
    m.position.y = -0.05;
    o.group.add(m);
    o.boxes.length = 0;
    o.boxes.push([-v.w * 0.3, 0, v.w * 0.3, v.h * 0.75]);
    o.width = v.w;
    o.vx = 0;
    return o;
  }

  _spawnPtero(speed) {
    const o = this._acquire('ptero');
    if (!o.ptero) {
      o.ptero = buildPterodactyl(this.pteroMats);
      o.group.add(o.ptero);
    }
    const level = Math.floor(this.rand() * PTERO_HEIGHTS.length);
    o.y = PTERO_HEIGHTS[level];
    o.boxes.length = 0;
    o.boxes.push([-0.6, -0.15, 0.6, 0.18]);
    o.width = 1.6;
    o.vx = speed > 16 ? 1.5 + this.rand() * 2.0 : 0.6;
    return o;
  }

  _spawnHeli(speed) {
    const o = this._acquire('heli');
    this._model(o, () => this.mil.makeHeli());
    o.y = PTERO_HEIGHTS[Math.floor(this.rand() * PTERO_HEIGHTS.length)];
    o.boxes.length = 0;
    o.boxes.push([-0.9, -0.15, 0.9, 0.35]);
    o.width = 2.0;
    o.vx = speed > 16 ? 1.8 + this.rand() * 2.0 : 0.8;
    return o;
  }

  _spawnTank(speed, shooter) {
    const o = this._acquire('tank');
    this._model(o, () => this.mil.makeTank());
    o.boxes.length = 0;
    o.boxes.push([-1.3, 0, 1.3, 0.78], [-0.45, 0.78, 0.8, 1.26]);
    o.width = 2.8;
    o.vx = 0;
    o.shooter = shooter;
    o.fired = false;
    o.aim = 0;
    o.flashT = 0;
    // fire ~2.4 s before the tank arrives, so the shell lands well clear of the jump over the tank
    o.fireX = 2.4 * speed;
    o.shellY = this.rand() < 0.5 ? PTERO_HEIGHTS[0] : PTERO_HEIGHTS[1];
    return o;
  }

  spawnShell(x, y) {
    const o = this._acquire('shell');
    this._model(o, () => this.mil.makeShell());
    o.projectile = true;
    o.x = x;
    o.y = y;
    o.vx = SHELL_SPEED;
    o.width = 0.6;
    o.boxes.length = 0;
    o.boxes.push([-0.3, -0.12, 0.3, 0.12]);
    o.group.position.set(o.x, o.y, 0);
    this.active.push(o);
    return o;
  }

  /** A boss missile: launched at (x, y0), levels out at height ty and closes at vm units/s. */
  spawnMissile(x, y0, ty, vm, speed) {
    const o = this._acquire('missile');
    this._model(o, () => this.mil.makeMissile());
    o.projectile = true;
    o.x = x;
    o.y = y0;
    o.ty = ty;
    o.vm = vm;
    o.vx = vm - speed;
    o.width = 0.9;
    o.boxes.length = 0;
    o.boxes.push([-0.45, -0.14, 0.45, 0.14]);
    o.group.position.set(o.x, o.y, 0);
    this.active.push(o);
    return o;
  }

  /** hard: 0 = 2D rules, 1 = 3D rules (tighter sequences, more flyers). dist: distance points so far. */
  update(dt, speed, dist, hard = 0) {
    this.warnings.length = 0;
    this.time += dt;
    this.rim.uRim.value = 0.45 + 1.1 * this.night;
    // hedgehog beacons blink, brighter after dark
    this.mil.mats.beacon.emissiveIntensity = (Math.sin(this.time * 7) > 0 ? 1 : 0.15) * (1.5 + 6 * this.night);
    // move & animate
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.vm) {
        // missiles hold their closing speed whatever the ground does, and drop to their flight level
        o.vx = o.vm - speed;
        o.y += (o.ty - o.y) * (1 - Math.exp(-dt * 10));
      }
      o.x -= (speed + o.vx) * dt;
      o.t += dt;
      o.group.position.set(o.x, o.y, 0);
      if (o.type === 'ptero') this._animatePtero(o);
      else if (o.type === 'heli') this._animateHeli(o);
      else if (o.type === 'tank') this._updateTank(o, dt, speed);
      else if (o.type === 'meteor') this._updateMeteor(o, dt, speed);
      if (o.x < DESPAWN_X || o.dead) {
        this._release(o);
        this.active.splice(i, 1);
      }
    }
    // spawn: measure the free run-in from the furthest obstacle (projectiles don't count)
    if (!this.spawning) return;
    let edge = -Infinity;
    for (const o of this.active) if (!o.projectile) edge = Math.max(edge, o.x + o.width / 2);
    const freeSpace = SPAWN_X - edge;
    if (freeSpace >= this.nextGap) this._spawnNext(speed, dist, hard, freeSpace);
  }

  _pickType(dist, hard, avoid) {
    const r = this.rand();
    const table = TABLES[this.stage];
    if (table) {
      // 3D adds flyers, as it does in the desert
      let total = 0;
      for (const [t, w] of table) if (t !== avoid) total += t === 'heli' ? w + 8 * hard : w;
      let acc = r * total;
      for (const [t, w] of table) {
        if (t === avoid) continue;
        acc -= t === 'heli' ? w + 8 * hard : w;
        if (acc <= 0) return t;
      }
      return table[0][0];
    }
    const pteroOk = dist > 250 - 130 * hard;
    if (pteroOk && r < 0.2 + 0.1 * hard) return 'ptero';
    if (r < 0.5) return 'cactusS';
    if (r < 0.84) return 'cactusL';
    return 'rock';
  }

  _spawnNext(speed, dist, hard, freeSpace) {
    // this spawn's own stream (a held-back shooter retries with the same one)
    this.rand = mulberry32(hash32(this.seed ?? 2024, this.spawnIdx));
    let type;
    if (this.pendingShooter) type = 'tank';
    else {
      type = this._pickType(dist, hard);
      if (type === this.lastType && this.repeat >= 2) {
        type = TABLES[this.stage] ? this._pickType(dist, hard, type) : type === 'cactusS' ? 'cactusL' : 'cactusS';
      }
    }

    let shooter = false;
    if (type === 'tank') {
      shooter = this.pendingShooter || this.rand() < Math.min(0.8, 0.45 + 0.1 * (this.cycle + this.levelTight));
      // A shooting tank needs the track between it and the dragon clear by the time it fires, so the
      // shell is the only thing to react to. Hold the spawn back until there is that much room.
      const need = 2.4 * speed + 4;
      if (shooter && !this.pendingShooter && freeSpace < need && this.firstSpawnX == null) {
        this.pendingShooter = true;
        this.nextGap = need;
        return;
      }
      this.pendingShooter = false;
    }
    this.repeat = type === this.lastType ? this.repeat + 1 : 1;
    this.lastType = type;

    let o;
    if (type === 'ptero') o = this._spawnPtero(speed);
    else if (type === 'heli') o = this._spawnHeli(speed);
    else if (type === 'tank') o = this._spawnTank(speed, shooter);
    else if (type === 'rock') o = this._spawnRock();
    else if (type === 'tower' || type === 'fuel' || type === 'hedgehog') o = this._spawnStructure(type);
    else if (type === 'building') o = this._spawnBuilding();
    else if (type === 'car') o = this._spawnCar();
    else if (type === 'lava') o = this._spawnLava();
    else if (type === 'meteor') o = this._spawnMeteor();
    else if (type === 'pillar') o = this._spawnPillar();
    else {
      const maxCount = speed < 13 ? 1 : speed < 17 ? 2 : 3;
      o = this._spawnCactus(type, 1 + Math.floor(this.rand() * maxCount));
    }
    const flyer = type === 'ptero' || type === 'heli';
    if (!flyer) o.y = 0;
    o.x = (this.firstSpawnX ?? SPAWN_X) + o.width / 2;
    this.firstSpawnX = null;
    // Flyers move faster than the ground scrolls and would eat into the gap behind the previous
    // obstacle on the way in; push them back by that amount plus time to land and duck.
    if (flyer) o.x += o.vx * (SPAWN_X / Math.max(1, speed)) + speed * 0.3;
    o.group.position.set(o.x, o.y, 0);
    this.active.push(o);
    this.spawnIdx++;

    // Chrome-like gap: enough room to land between obstacles, growing with speed. The 3D view sees
    // far down the track, so it gives up reaction room for tighter sequences (still clearable with full jumps).
    // Each boss beaten tightens it a little more.
    const tight = 1 - 0.05 * Math.min(this.cycle + this.levelTight, 4);
    const air = (0.72 - 0.16 * hard) * speed;
    const minGap = (air + 3.5 - 1.5 * hard + speed * 0.15) * tight + o.width;
    const maxGap = minGap * (1.55 - 0.35 * hard) + 6 - 3 * hard;
    this.nextGap = minGap + this.rand() * (maxGap - minGap);
    if (!flyer) this._layCrystals(o, speed);
  }

  /** Lays one crystal pattern on or after a ground obstacle, shaped by the dragon's real jump. */
  _layCrystals(o, speed) {
    const cr = this.crystals;
    if (!cr) return;
    const { v, g } = this.jump;
    const apex = (v * v) / (2 * g);
    const half = (v / g) * speed; // horizontal distance from take-off to apex
    const lift = 1.15; // crystals sit at the middle of the dragon's body
    const arcY = (dx) => apex + lift - 0.5 * g * (dx / speed) ** 2;
    const r = this.rand();
    const start = o.x + o.width / 2 + half + 1.2; // past the landing of a jump over o
    const end = o.x + o.width / 2 + this.nextGap - half * 0.9 - 1.5; // before the take-off for the next one
    if (o.tall) {
      // nothing to jump here: a line just past it, to grab right after the smash
      if (r < 0.5 && end - (o.x + o.width / 2 + 2) > 3) {
        for (let k = 0; k < 4; k++) cr.add(o.x + o.width / 2 + 2 + k * 1.5, 1.0);
      }
      return;
    }
    if (r < 0.4) {
      // arc over the obstacle: a full jump timed over its middle collects all five
      for (let k = -2; k <= 2; k++) cr.add(o.x + k * 0.09 * speed, arcY(k * 0.09 * speed));
    } else if (r < 0.6) {
      if (end - start < 3) return;
      const n = Math.min(6, Math.floor((end - start) / 1.5) + 1);
      for (let k = 0; k < n; k++) cr.add(start + k * 1.5, 1.0); // ground line: just keep running
    } else if (r < 0.72) {
      if (end - start < 2 * half + 2) return;
      const c = (start + end) / 2; // high trio: worth an extra jump in the gap, if there's time
      for (let k = -1; k <= 1; k++) cr.add(c + k * 0.09 * speed, arcY(k * 0.09 * speed));
    }
  }

  _updateTank(o, dt, speed) {
    const { barrel, flash } = o.model.userData;
    if (o.shooter && !o.fired && o.x < o.fireX + 0.75 * speed) {
      // aim for 0.75 s before firing, with a warning on screen
      o.aim = Math.min(1, o.aim + dt * 3);
      this.warnings.push({ x: o.x - 1.6, y: o.shellY });
      if (o.x <= o.fireX) {
        o.fired = true;
        o.flashT = 0.14;
        this.spawnShell(o.x - 2.2, o.shellY);
        this.onFire?.(o);
      }
    } else if (o.fired) o.aim = Math.max(0, o.aim - dt * 1.5);
    const target = o.shellY > 1.5 ? -0.42 : 0.06; // barrel up for a head-height shell
    barrel.rotation.z = target * o.aim;
    barrel.position.x = -0.6 + (o.flashT > 0 ? 0.18 : 0); // recoil
    o.flashT = Math.max(0, o.flashT - dt);
    flash.visible = o.flashT > 0;
    flash.material.opacity = o.flashT / 0.14;
    flash.scale.setScalar(1 + (0.14 - o.flashT) * 9);
    o.model.position.y = Math.sin(o.t * 40) * 0.008; // engine rumble
  }

  _animateHeli(o) {
    const { rotor, tail, beam } = o.model.userData;
    rotor.rotation.y = o.t * 28;
    tail.rotation.z = o.t * 40;
    o.model.position.y = 0.06 * Math.sin(o.t * 2.1);
    o.model.rotation.z = 0.08 + 0.03 * Math.sin(o.t * 1.3); // nose down, flying at the dragon
    beam.material.opacity = 0.22 * this.night;
    beam.visible = this.night > 0.05;
  }

  _animatePtero(o) {
    const w = o.ptero.userData.wings;
    const t = o.t * 2.3 * Math.PI * 2;
    for (const { inner, outer, s } of w) {
      inner.rotation.x = s * (0.55 * Math.sin(t) - 0.1);
      outer.rotation.x = s * (0.45 * Math.sin(t - 0.9) - 0.05);
    }
    const body = o.ptero.userData.body;
    body.position.y = -0.09 * Math.sin(t + 0.4);
    body.rotation.z = 0.05 * Math.sin(t + 1.2);
  }

  /**
   * Returns the first obstacle overlapping any of the dragon boxes, or null. Also records each
   * obstacle's smallest vertical clearance while it passes, for close calls.
   */
  collide(boxes, n) {
    for (const o of this.active) {
      if (o.dead || o.reflected || o.x > 12 || o.x < -8) continue;
      for (const b of o.boxes) {
        const ox0 = o.x + b[0], oy0 = o.y + b[1], ox1 = o.x + b[2], oy1 = o.y + b[3];
        for (let i = 0; i < n; i++) {
          const d = boxes[i];
          if (d[0] >= ox1 || d[2] <= ox0) continue;
          const sep = Math.max(oy0 - d[3], d[1] - oy1);
          if (sep < 0) return o;
          if (sep < o.near) o.near = sep;
        }
      }
    }
    return null;
  }

  /** Reports each obstacle once as it clears the dragon's rear: onPass(o, clearance). */
  passed(rear, onPass) {
    for (const o of this.active) {
      if (o.passed || o.dead || o.reflected || o.x + o.width / 2 >= rear) continue;
      o.passed = true;
      onPass(o, o.near);
    }
  }
}
