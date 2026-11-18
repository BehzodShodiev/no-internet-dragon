// The Kaiju's back crystals: clusters of faceted shards growing out of its spine, the same kind of crystal
// it collects on the run. Each cluster is one big shard leaning back with smaller ones splaying out of its
// base. Cluster units: x along the spine (+x toward the head), y up from the back, z to the side; uv.y runs
// from the base (0) to the tip (1), for the glow gradient in Dragon's plate material.
import * as THREE from 'three';
import { mergeGeometries } from '../gfx/geometry.js';
import { mulberry32 } from '../gfx/noise.js';

const BASE = new THREE.Color(0x1a2326), BODY = new THREE.Color(0x7c9c9a), TIP = new THREE.Color(0xe4fbf5);
const smooth01 = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

/**
 * One shard: an irregular `sides`-gon prism (sunk a little below y = 0) tapering into a pointed tip at
 * y = h + tipH. Flat faces, each a slightly different shade so the facets read even in flat light.
 */
function shard(rand, h, r, tipH, sides, rings) {
  const rad = Array.from({ length: sides }, () => r * (0.78 + 0.44 * rand()));
  const rot = rand() * Math.PI * 2;
  const taper = 0.72 + 0.16 * rand();
  const y0 = -0.25 * h;
  const top = h + tipH;
  // a gentle kink part-way up (with more than one ring), so long shards aren't perfectly straight
  const kink = [(rand() - 0.5) * r * 0.5, (rand() - 0.5) * r * 0.5];
  const ring = (k) => {
    const y = y0 + (h - y0) * k, s = 1 + (taper - 1) * k, bend = rings > 1 ? Math.sin(Math.PI * k) : 0;
    return rad.map((rr, i) => {
      const a = rot + (i / sides) * Math.PI * 2;
      return [Math.cos(a) * rr * s + kink[0] * bend, y, Math.sin(a) * rr * s + kink[1] * bend];
    });
  };
  const R = [];
  for (let j = 0; j <= rings; j++) R.push(ring(j / rings));
  const apex = [(rand() - 0.5) * r * 0.4, top, (rand() - 0.5) * r * 0.4];
  const pos = [], uv = [], col = [];
  const c = new THREE.Color();
  const vert = (p, shade) => {
    pos.push(p[0], p[1], p[2]);
    const v = (p[1] - y0) / (top - y0);
    uv.push(0.5, v);
    if (v < 0.45) c.copy(BASE).lerp(BODY, smooth01(v / 0.45));
    else c.copy(BODY).lerp(TIP, smooth01((v - 0.45) / 0.55));
    c.multiplyScalar(shade);
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < sides; i++) {
    const i2 = (i + 1) % sides;
    const shade = 0.82 + 0.3 * rand();
    for (let j = 0; j < rings; j++) {
      const a = R[j][i], b = R[j][i2], cc = R[j + 1][i2], d = R[j + 1][i];
      for (const p of [a, d, b, b, d, cc]) vert(p, shade);
    }
    for (const p of [R[rings][i], apex, R[rings][i2]]) vert(p, shade * 1.08);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A cluster about `size` tall: a main shard leaning back (toward -x) and `extra` smaller ones splaying
 * out of its base. hd: more facets and shards, and kinked rather than straight.
 */
export function crystalCluster(seed, size, { extra = 2, hd = false } = {}) {
  const rand = mulberry32(seed);
  const sides = hd ? 6 : 5;
  const rings = hd ? 2 : 1;
  const parts = [];
  const main = shard(rand, 0.6 * size, 0.15 * size, 0.4 * size, sides, rings);
  main.rotateX((rand() - 0.5) * 0.16);
  main.rotateZ(0.26 + rand() * 0.14);
  parts.push(main);
  for (let i = 0; i < extra; i++) {
    const k = 0.38 + 0.3 * rand();
    const side = i % 2 ? -1 : 1;
    const s = shard(rand, 0.6 * size * k, 0.15 * size * k * (0.9 + 0.3 * rand()), 0.4 * size * k, sides, 1);
    s.rotateX(side * (0.45 + 0.4 * rand()));
    s.rotateZ(0.15 + rand() * 0.5);
    s.translate((rand() - 0.6) * 0.3 * size, 0, side * (0.04 + 0.08 * rand()) * size);
    parts.push(s);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}
