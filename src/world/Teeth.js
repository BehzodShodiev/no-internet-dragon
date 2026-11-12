// The Rex's attack, the Tooth Quake: a wave of giant teeth erupts from the ground ahead of it and impales what
// is in the way. It replaces the breath beam's look only; what it hits is decided exactly as for the beam
// (Game, breath update), so scores stay comparable. Two looks: sculpted fangs (Classic skin) and stacked
// cubes (Pixel skin). Teeth are pooled instances that scroll with the ground, shoot up, hold, then sink.
import * as THREE from 'three';
import { mergeGeometries } from '../gfx/geometry.js';
import { curvedSpike, spikeColors } from '../entities/DragonHD.js';

const MAX = 200;
const RISE = 0.13, SINK = 0.4;
const GUM = new THREE.Color(0x4a2a22), IVORY = new THREE.Color(0xe8dcc0);

/** A fang along +y (base at 0, tip at 1), curving forward, from a dark gum-coloured root to ivory. */
function fangGeometry() {
  const g = curvedSpike(1, 0.2, 0.16, 12, 9);
  return spikeColors(g, 1, GUM, IVORY);
}

/** The same fang as stacked cubes, narrowing to a point, each a step forward. */
function cubeFangGeometry() {
  const rows = 7, parts = [];
  for (let i = 0; i < rows; i++) {
    const y0 = i / rows, h = 1 / rows;
    const w = 0.4 * (1 - i / rows) + 0.06;
    const b = new THREE.BoxGeometry(w, h, w).translate(0.02 * i * i / rows, y0 + h / 2, 0);
    const c = GUM.clone().lerp(IVORY, Math.min(1, (i + 0.5) / (rows * 0.55)));
    const col = new Float32Array(b.attributes.position.count * 3);
    for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
    b.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(b.toNonIndexed());
  }
  return mergeGeometries(parts, false);
}

export class Teeth {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
    this.meshes = { smooth: new THREE.InstancedMesh(fangGeometry(), mat, MAX), pixel: new THREE.InstancedMesh(cubeFangGeometry(), mat, MAX) };
    for (const m of Object.values(this.meshes)) {
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.list = [];
    this.style = 'pixel';
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** 'pixel' or 'smooth': the look of teeth from now on (the Rex's skin). */
  setStyle(style) {
    this.style = style === 'pixel' ? 'pixel' : 'smooth';
  }

  /** A tooth at ground position (x, z), h tall, rising after `delay` s and sinking after `hold` s. */
  erupt(x, z, h, { delay = 0, hold = 0.9, lean = 0, rand = Math.random } = {}) {
    if (this.list.length >= MAX) this.list.shift();
    const px = this.style === 'pixel';
    this.list.push({
      x: px ? Math.round(x * 4) / 4 : x, z: px ? Math.round(z * 4) / 4 : z, h,
      w: 0.55 + 0.45 * Math.min(1, h / 4) + 0.15 * rand(),
      // pixel teeth stand straight and square to the grid; fangs lean and turn a little
      age: -delay, hold, lean: px ? 0 : lean + (rand() - 0.5) * 0.35, yaw: px ? 0 : rand() * Math.PI * 2,
      style: this.style,
    });
  }

  /** True while any tooth is up (or about to rise). */
  get active() {
    return this.list.length > 0;
  }

  update(dt, speed) {
    const counts = { smooth: 0, pixel: 0 };
    let n = 0;
    for (const t of this.list) {
      t.x -= speed * dt;
      t.age += dt;
      if (t.age > t.hold + SINK || t.x < -40) continue;
      this.list[n++] = t;
      if (t.age < 0) continue;
      // shoot up with a little overshoot, hold, then sink back into the ground
      const r = Math.min(1, t.age / RISE);
      const up = r < 1 ? 1 - Math.pow(1 - r, 3) * (1 - 2.2 * r * (1 - r)) : 1;
      const down = t.age > t.hold ? 1 - Math.min(1, (t.age - t.hold) / SINK) : 1;
      const k = up * down;
      if (k <= 0.001) continue;
      const mesh = this.meshes[t.style];
      this._p.set(t.x, -0.25 - 0.4 * (1 - down), t.z);
      this._q.setFromEuler(this._e.set(0, t.yaw, -t.lean));
      this._s.set(t.w * t.h * 0.9, t.h * k, t.w * t.h * 0.9);
      mesh.setMatrixAt(counts[t.style]++, this._m.compose(this._p, this._q, this._s));
    }
    this.list.length = n;
    for (const [style, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[style];
      if (counts[style]) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Drops every tooth at once (a new run). */
  clear() {
    this.list.length = 0;
    for (const m of Object.values(this.meshes)) m.count = 0;
  }
}
