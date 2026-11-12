// Voxel ("pixel") versions of skinned models, built from the smooth model itself. Solid parts are filled by
// casting rays along z through every (x, y) column of a grid and filling the cells between pairs of
// crossings; small parts (teeth, claws, eyes) fill the cells their vertices fall in. A cell takes the colour
// and dominant bone of the nearest surface crossing in its column. Faces are kept only where a cell meets
// empty space or a different part, so the result is a hollow shell of cubes. Spine cells get per-corner
// skin weights from a function of position, so neighbouring cubes bend together without gaps; the other
// parts (head, jaw, legs, toes) are rigid to their bone.
import * as THREE from 'three';

const EMPTY = -32768;
const SPINE = -2;
// faces: direction, then the four corners of a unit cube counter-clockwise seen from outside
const FACES = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

const domBone = (si, sw, v) => {
  let best = 0;
  for (let k = 1; k < 4; k++) if (sw.getComponent(v, k) > sw.getComponent(v, best)) best = k;
  return si.getComponent(v, best);
};

/**
 * solids: skinned BufferGeometries in rest pose (position, color, skinIndex, skinWeight), each closed enough
 *   that a ray along z crosses it an even number of times.
 * points: [{ geo, color?, eye? }]: small parts; eye cells go into a separate geometry (the glowing material).
 * opts: { size, isSpine(bone), cornerSkin(x, y, z) -> [i0, i1, w0, w1], jitter }
 * Returns { skin, eye } BufferGeometries (eye may be null).
 */
export function voxelize(solids, points, opts) {
  const s = opts.size;
  const box = new THREE.Box3();
  for (const g of [...solids, ...points.map((p) => p.geo)]) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const x0 = box.min.x - s, y0 = box.min.y - s, z0 = box.min.z - s;
  const nx = Math.ceil((box.max.x - x0) / s) + 2, ny = Math.ceil((box.max.y - y0) / s) + 2, nz = Math.ceil((box.max.z - z0) / s) + 2;
  const N = nx * ny * nz;
  const part = new Int16Array(N).fill(EMPTY);
  const bone = new Uint8Array(N);
  const col = new Float32Array(N * 3);
  const eye = new Uint8Array(N);
  const cell = (ix, iy, iz) => ix + nx * (iy + ny * iz);
  const partOf = (b) => (opts.isSpine(b) ? SPINE : b);

  // ---- solids: z-ray parity per solid ----
  for (const g of solids) {
    const P = g.attributes.position, C = g.attributes.color, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    const idx = g.index ? g.index.array : null;
    const triCount = idx ? idx.length / 3 : P.count / 3;
    const cross = new Map(); // column -> [z, r, g, b, bone, ...]
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const ax = P.getX(a), ay = P.getY(a), bx = P.getX(b), by = P.getY(b), cx = P.getX(c), cy = P.getY(c);
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / s - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / s - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / s - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / s - 0.5));
      for (let j = j0; j <= j1; j++) {
        const py = y0 + (j + 0.5) * s + 1.37e-6; // off-grid nudge: rays never pass exactly through an edge
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * s + 2.71e-6;
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const z = l1 * P.getZ(a) + l2 * P.getZ(b) + l3 * P.getZ(c);
          const v = l1 >= l2 && l1 >= l3 ? a : l2 >= l3 ? b : c;
          const key = i + nx * j;
          let list = cross.get(key);
          if (!list) cross.set(key, (list = []));
          list.push(z,
            l1 * C.getX(a) + l2 * C.getX(b) + l3 * C.getX(c),
            l1 * C.getY(a) + l2 * C.getY(b) + l3 * C.getY(c),
            l1 * C.getZ(a) + l2 * C.getZ(b) + l3 * C.getZ(c),
            domBone(SI, SW, v));
        }
      }
    }
    for (const [key, list] of cross) {
      const n = list.length / 5;
      const order = Array.from({ length: n }, (_, k) => k).sort((p, q) => list[p * 5] - list[q * 5]);
      const i = key % nx, j = (key - i) / nx;
      for (let k = 0; k + 1 < n; k += 2) {
        const A = order[k] * 5, Bk = order[k + 1] * 5;
        const za = list[A], zb = list[Bk];
        for (let kz = Math.max(0, Math.ceil((za - z0) / s - 0.5)); kz < nz; kz++) {
          const z = z0 + (kz + 0.5) * s;
          if (z > zb) break;
          const id = cell(i, j, kz);
          if (part[id] !== EMPTY) continue; // the first solid to claim a cell keeps it
          const src = z - za < zb - z ? A : Bk;
          col[id * 3] = list[src + 1]; col[id * 3 + 1] = list[src + 2]; col[id * 3 + 2] = list[src + 3];
          bone[id] = list[src + 4];
          part[id] = partOf(bone[id]);
        }
      }
    }
  }

  // ---- small parts: the cells their vertices fall in ----
  for (const { geo, color, eye: isEye } of points) {
    const P = geo.attributes.position, C = geo.attributes.color, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    for (let v = 0; v < P.count; v++) {
      const i = Math.floor((P.getX(v) - x0) / s), j = Math.floor((P.getY(v) - y0) / s), k = Math.floor((P.getZ(v) - z0) / s);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const id = cell(i, j, k);
      const c = color || (C ? [C.getX(v), C.getY(v), C.getZ(v)] : [1, 1, 1]);
      col[id * 3] = c[0]; col[id * 3 + 1] = c[1]; col[id * 3 + 2] = c[2];
      bone[id] = domBone(SI, SW, v);
      part[id] = isEye ? 1000 + bone[id] : partOf(bone[id]) + (color ? 500 : 0);
      eye[id] = isEye ? 1 : 0;
    }
  }

  // ---- faces ----
  const out = [0, 1].map(() => ({ pos: [], nrm: [], col: [], si: [], sw: [], idx: [] }));
  const corner = new Map();
  const jitter = opts.jitter ?? 0.07;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = cell(i, j, k);
    const p = part[id];
    if (p === EMPTY) continue;
    // a little per-cube colour variation, so the cubes read as cubes
    const h = Math.sin(id * 12.9898) * 43758.5453;
    const f = 1 + jitter * 2 * (h - Math.floor(h) - 0.5);
    const r = col[id * 3] * f, g = col[id * 3 + 1] * f, b = col[id * 3 + 2] * f;
    const o = out[eye[id]];
    for (const [[dx, dy, dz], quad] of FACES) {
      const ni = i + dx, nj = j + dy, nk = k + dz;
      const inside = ni >= 0 && nj >= 0 && nk >= 0 && ni < nx && nj < ny && nk < nz;
      if (inside && part[cell(ni, nj, nk)] === p) continue;
      const base = o.pos.length / 3;
      for (const [ox, oy, oz] of quad) {
        const cx = i + ox, cy = j + oy, cz = k + oz;
        const x = x0 + cx * s, y = y0 + cy * s, z = z0 + cz * s;
        o.pos.push(x, y, z);
        o.nrm.push(dx, dy, dz);
        o.col.push(r, g, b);
        if (p === SPINE) {
          const key = cx + (nx + 1) * (cy + (ny + 1) * cz);
          let w = corner.get(key);
          if (!w) corner.set(key, (w = opts.cornerSkin(x, y, z)));
          o.si.push(w[0], w[1], 0, 0);
          o.sw.push(w[2], w[3], 0, 0);
        } else {
          o.si.push(bone[id], 0, 0, 0);
          o.sw.push(1, 0, 0, 0);
        }
      }
      o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const build = (o) => {
    if (!o.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(o.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(o.sw, 4));
    g.setIndex(o.idx);
    return g;
  };
  return { skin: build(out[0]), eye: build(out[1]) };
}
