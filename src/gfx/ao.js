// Baked ambient occlusion: soft shading in corners and where a model meets the ground, written into its
// vertex colours once at load. Rays from each vertex march through a coarse grid of the model's own surface,
// and rays that point down meet the ground plane at the model's base. Because the shading belongs to the
// model (not to the world, as a lightmap would), it stays right on pooled objects that scroll past, turn or
// get restyled. Deterministic: the same model always gets the same shading.
import * as THREE from 'three';

// cosine-weighted directions around +y (a Fibonacci spiral), so a plain average gives the occlusion
function hemisphere(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, r = Math.sqrt(u), phi = i * 2.399963;
    out.push([r * Math.cos(phi), Math.sqrt(1 - u), r * Math.sin(phi)]);
  }
  return out;
}
const DIRS = {};

/**
 * Darkens geo's vertex colours (adding white ones first if it has none) by its ambient occlusion.
 * opts: ground (the base of the model stands on the ground, default true), strength (0..1, default 0.7),
 * floor (darkest factor, default 0.35), rays (default 16), cell and reach (world units; default from size).
 * Dense meshes are cheap: vertices in the same grid cell facing the same way share one result.
 */
export function bakeAO(geo, opts = {}) {
  const P = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const Nm = geo.attributes.normal;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const cell = opts.cell || Math.max(maxDim / 48, 0.02);
  const reach = opts.reach || Math.min(maxDim * 0.35, 2.2);
  const rays = opts.rays || 16, strength = opts.strength ?? 0.7, floor = opts.floor ?? 0.35, ground = opts.ground ?? true;
  const gY = bb.min.y;

  // occupancy grid of the surface
  const pad = 2;
  const ox = bb.min.x - pad * cell, oy = bb.min.y - pad * cell, oz = bb.min.z - pad * cell;
  const nx = Math.ceil(size.x / cell) + 2 * pad + 1, ny = Math.ceil(size.y / cell) + 2 * pad + 1, nz = Math.ceil(size.z / cell) + 2 * pad + 1;
  const occ = new Uint8Array(nx * ny * nz);
  const at = (x, y, z) => {
    const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + nx * (j + ny * k);
  };
  const idx = geo.index ? geo.index.array : null;
  const triCount = idx ? idx.length / 3 : P.count / 3;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    A.fromBufferAttribute(P, idx ? idx[t * 3] : t * 3);
    B.fromBufferAttribute(P, idx ? idx[t * 3 + 1] : t * 3 + 1);
    C.fromBufferAttribute(P, idx ? idx[t * 3 + 2] : t * 3 + 2);
    const n = Math.max(1, Math.ceil(Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)) / (cell * 0.5)));
    for (let u = 0; u <= n; u++) {
      for (let v = 0; v <= n - u; v++) {
        const fu = u / n, fv = v / n;
        const c = at(A.x + (B.x - A.x) * fu + (C.x - A.x) * fv, A.y + (B.y - A.y) * fu + (C.y - A.y) * fv, A.z + (B.z - A.z) * fu + (C.z - A.z) * fv);
        if (c >= 0) occ[c] = 1;
      }
    }
  }

  // colours to darken
  let col = geo.attributes.color;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(P.count * 3).fill(1), 3);
    geo.setAttribute('color', col);
  }
  const dirs = (DIRS[rays] ||= hemisphere(rays));
  const n = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), o = new THREE.Vector3(), w = new THREE.Vector3();
  const step = cell * 0.8;
  const memo = new Map();
  for (let i = 0; i < P.count; i++) {
    n.fromBufferAttribute(Nm, i).normalize();
    const c0 = at(P.getX(i), P.getY(i), P.getZ(i));
    const key = c0 * 27 + (Math.round(n.x) + 1) * 9 + (Math.round(n.y) + 1) * 3 + (Math.round(n.z) + 1);
    let k = memo.get(key);
    if (k === undefined) { k = shade(i); memo.set(key, k); }
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return geo;

  function shade(i) {
    tA.set(Math.abs(n.y) < 0.99 ? 0 : 1, Math.abs(n.y) < 0.99 ? 1 : 0, 0).cross(n).normalize();
    tB.crossVectors(n, tA);
    o.fromBufferAttribute(P, i).addScaledVector(n, cell * 1.5); // start clear of the vertex's own cell
    let occl = 0;
    for (const [dx, dy, dz] of dirs) {
      w.set(0, 0, 0).addScaledVector(tA, dx).addScaledVector(n, dy).addScaledVector(tB, dz);
      let hit = 0;
      if (ground && w.y < -1e-3) {
        const tg = Math.max(0, (o.y - gY) / -w.y);
        if (tg < reach) hit = 1 - tg / reach;
      }
      for (let s = step; s < reach; s += step) {
        const c = at(o.x + w.x * s, o.y + w.y * s, o.z + w.z * s);
        if (c >= 0 && occ[c]) { hit = Math.max(hit, 1 - s / reach); break; }
      }
      occl += hit;
    }
    return Math.max(floor, 1 - strength * (occl / rays));
  }
}

// Bakes queued at load run later in small slices (Game calls runAOQueue every frame), so the shading never
// adds to the loading time; a model's shading appears within the first second or so.
const queue = [];
export function bakeAOLater(geo, opts) {
  queue.push([geo, opts]);
}
/** Bakes queued models for up to budgetMs; returns how many are left. */
export function runAOQueue(budgetMs = 6) {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const [geo, opts] = queue.shift();
    bakeAO(geo, opts);
  }
  return queue.length;
}
