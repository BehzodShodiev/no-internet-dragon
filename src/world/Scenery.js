// Instanced desert scenery. Each layer is a tile of length L (a multiple of the terrain period) drawn
// twice side by side, so scrolling is just a mesh offset: no per-frame instance updates.
import * as THREE from 'three';
import { mulberry32, createNoise } from '../gfx/noise.js';
import { buildCactus, buildRock } from '../entities/Obstacles.js';
import { TERRAIN_PERIOD } from './Terrain.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function buildMesa(seed, radius, height) {
  const noise = createNoise(seed);
  const g = new THREE.CylinderGeometry(radius, radius * 1.1, height, 96, 28, false);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const bands = [0xb5653f, 0xd08a5a, 0x9c4f33, 0xe1b083, 0xa85a3a, 0xc77b4e].map((h) => new THREE.Color(h));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r0 = Math.hypot(x, z);
    const th = Math.atan2(z, x);
    const yn = y / height;
    let k = 1;
    if (r0 > 1e-3) {
      const ca = Math.cos(th), sa = Math.sin(th);
      k += 0.28 * noise.fbm3(ca * 1.6, sa * 1.6, yn * 0.6, 4);
      k += 0.08 * noise.noise3(ca * 9, sa * 9, yn * 2.5); // erosion gullies
      k -= 0.05 * Math.abs(Math.sin(yn * 22 + noise.noise3(ca, sa, yn) * 3)); // ledges
      k += 0.5 * Math.pow(smooth(0.42, 0.0, yn), 2); // talus slope
    }
    const nx = x * k, nz = z * k;
    let ny = y;
    if (yn > 0.999) ny = y + noise.noise3(x * 0.05, z * 0.05, 3) * 1.2;
    p.setXYZ(i, nx, ny, nz);
    const bi = Math.floor((yn * 7 + noise.noise3(th, yn * 2, 1) * 0.6 + 7) % bands.length);
    c.copy(bands[Math.abs(bi) % bands.length]);
    c.lerp(bands[(Math.abs(bi) + 1) % bands.length], 0.5 + 0.5 * noise.noise3(th * 2, yn * 10, 5));
    c.multiplyScalar(0.8 + 0.25 * smooth(0, 0.3, yn));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * radius * 0.25, uv.getY(i) * height * 0.04);
  return g;
}

function buildBush() {
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const q = new THREE.PlaneGeometry(1, 1, 1, 1);
    q.translate(0, 0.5, 0);
    q.rotateY((i / 3) * Math.PI);
    geos.push(q);
  }
  const g = new THREE.BufferGeometry();
  const merged = geos.map((q) => q.toNonIndexed());
  const pos = [], nrm = [], uv = [];
  for (const m of merged) {
    pos.push(...m.attributes.position.array);
    uv.push(...m.attributes.uv.array);
    for (let i = 0; i < m.attributes.position.count; i++) nrm.push(0, 1, 0); // soft, sky-facing normals
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export class Scenery {
  constructor(scene, terrain, tex, materials) {
    this.scene = scene;
    this.terrain = terrain;
    this.layers = [];
    this.nearMeshes = [];
    this.density = 1;
    const rand = mulberry32(31337);

    const bushMat = new THREE.MeshStandardMaterial({
      map: tex.brush, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0,
    });
    const mesaMat = (this.mesaMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.rock.map, normalMap: tex.rock.normalMap, roughness: 0.95, metalness: 0,
    }));
    this.rockMat = materials.rock;

    // geometry variants
    const bush = buildBush();
    // background props get lighter meshes than the obstacles you run into (same look at their size)
    const rocks = [0, 1, 2].map((i) => buildRock(300 + i, 1.4, 1.0, 1.2, 4));
    const bigRocks = [0, 1, 2].map((i) => buildRock(300 + i, 1.4, 1.0, 1.2, 6));
    const cactusR = mulberry32(5);
    const cacti = [0, 1, 2].map(() => buildCactus(cactusR, { height: 3.4 + cactusR() * 1.2, radius: 0.36, arms: 2, radial: 18, rings: 4 }).geometry);
    const mesas = [
      buildMesa(1, 42, 62), buildMesa(2, 60, 40), buildMesa(3, 28, 78), buildMesa(4, 75, 30),
    ];

    const P = TERRAIN_PERIOD;
    // --- near layer: bushes + pebbles + small boulders around the track
    this._layer({
      kind: 'bush', geometry: bush, material: bushMat, L: P, x0: -60, count: 150, rand,
      zRanges: [[-70, -5.5], [5.5, 70]], scale: [0.6, 1.7], shadow: false, yaw: true,
    });
    for (const g of rocks) {
      this._layer({
        geometry: g, material: materials.rock, L: P, x0: -60, count: 26, rand,
        zRanges: [[-80, -6], [6, 80]], scale: [0.25, 0.9], shadow: true, sink: 0.15, yaw: true,
      });
    }
    // --- mid layer: big saguaros + boulders (kept away from the track so they never read as obstacles)
    for (const g of cacti) {
      this._layer({
        kind: 'cactus', geometry: g, material: materials.cactus, L: P, x0: -100, count: 18, rand,
        zRanges: [[-200, -32], [26, 220]], scale: [0.8, 1.6], shadow: true, yaw: true,
      });
    }
    for (const g of bigRocks) {
      this._layer({
        geometry: g, material: materials.rock, L: P, x0: -100, count: 8, rand,
        zRanges: [[-260, -40], [40, 240]], scale: [2, 6], shadow: false, sink: 0.3, yaw: true,
      });
    }
    // --- far layer: mesas and buttes
    mesas.forEach((g, i) => {
      this._layer({
        geometry: g, material: mesaMat, L: P * 2, x0: -260, count: 3, rand,
        zRanges: i % 2 ? [[-420, -260]] : [[-400, -250], [230, 320]], scale: [0.75, 1.25], shadow: false, sink: 4, yaw: true,
      });
    });
  }

  _layer({ kind = 'rock', geometry, material, L, x0, count, rand, zRanges, scale, shadow, sink = 0, yaw = false }) {
    const sides = [[], []]; // far (z<0), near (z>0)
    for (let i = 0; i < count; i++) {
      const zr = zRanges[Math.floor(rand() * zRanges.length)];
      const z = zr[0] + rand() * (zr[1] - zr[0]);
      const x = rand() * L;
      const s = scale[0] + rand() * (scale[1] - scale[0]);
      sides[z > 0 ? 1 : 0].push({ x, z, s, ry: yaw ? rand() * Math.PI * 2 : 0 });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    sides.forEach((list, near) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length * 2);
      let k = 0;
      for (const it of list) {
        const h = this.terrain.heightAt(x0 + it.x, it.z);
        q.setFromAxisAngle(up, it.ry);
        sc.setScalar(it.s);
        for (let copy = 0; copy < 2; copy++) {
          pos.set(x0 + it.x + copy * L, h - sink * it.s, it.z);
          m.compose(pos, q, sc);
          mesh.setMatrixAt(k++, m);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData = { L, near: !!near, full: list.length * 2, kind, hidden: false };
      this.scene.add(mesh);
      this.layers.push(mesh);
      if (near) this.nearMeshes.push(mesh);
    });
  }

  setDensity(d) {
    this.density = d;
    for (const m of this.layers) {
      // instances were written in pairs (two tile copies), keep pairs together
      const pairs = Math.max(1, Math.round((m.userData.full / 2) * d));
      m.count = Math.min(m.userData.full, pairs * 2);
    }
  }

  /** Desert plants only grow in the desert; the volcano blackens rock and mesa. */
  setBiome(name) {
    for (const m of this.layers) {
      const k = m.userData.kind;
      m.userData.hidden = (k === 'cactus' && name !== 'desert') || (k === 'bush' && name === 'volcano');
    }
    this.rockMat.color.set(name === 'volcano' ? 0x8a6c62 : 0xffffff);
    this.mesaMat.color.set(name === 'volcano' ? 0x5a3028 : 0xffffff);
  }

  update(scroll, near) {
    for (const m of this.layers) {
      const L = m.userData.L;
      m.position.x = -(scroll % L);
      if (m.userData.near) m.scale.y = Math.max(0.0001, near);
      m.visible = !m.userData.hidden && (!m.userData.near || near > 0.01);
    }
  }
}
