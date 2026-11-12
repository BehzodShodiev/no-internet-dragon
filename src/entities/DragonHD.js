// Helpers for the Very High ('hd') Kaiju model built in Dragon._buildMeshesHD: curved teeth and claws,
// bony dorsal plates with ridged faces, and a shared noise for mottling. Nothing here is used by the
// standard model, so the other quality levels build exactly what they always did.
import * as THREE from 'three';
import { createNoise, mulberry32 } from '../gfx/noise.js';

const N = createNoise(1977);
const smoothstep01 = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
/** Smooth noise in [-1, 1]. */
export const noise3 = (x, y, z) => N.noise3(x, y, z);

/**
 * A tapered spike along +y (base at y = 0, tip at y = len) whose tip bends toward +x by `bend` × len:
 * teeth and claws. Rings get thinner toward the tip with a slightly rounded base.
 */
export function curvedSpike(len, r0, bend, radial = 8, rings = 7) {
  const g = new THREE.CylinderGeometry(0, r0, len, radial, rings, false);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = Math.min(1, Math.max(0, p.getY(i) / len));
    // a fuller base and a sharper point than a straight cone
    const k = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, f * 1.6)) * (1 - f);
    p.setX(i, p.getX(i) * k + bend * len * f * f);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Fills a colour attribute along a spike's height: root colour to tip colour. */
export function spikeColors(g, len, root, tip) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const f = Math.min(1, Math.max(0, p.getY(i) / len));
    c.copy(root).lerp(tip, Math.pow(f, 0.7));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Godzilla's plate silhouette (x along the spine, y up, tip at y = 1): a spire with lobed edges.
const PLATE_OUTLINE = [
  [-0.5, 0], [-0.4, 0.22], [-0.64, 0.3], [-0.36, 0.43], [-0.52, 0.58], [-0.24, 0.64],
  [-0.32, 0.8], [-0.1, 0.84], [0, 1], [0.1, 0.83], [0.28, 0.78], [0.15, 0.63],
  [0.4, 0.56], [0.24, 0.43], [0.46, 0.3], [0.34, 0.2], [0.5, 0],
];

// half-widths of the outline at height v (0 root .. 1 tip), back (-x) and front (+x) edges, from PLATE_OUTLINE
function outlineWidths(v) {
  const y = v * 1.25 - 0.25;
  let back = 0, front = 0;
  const pick = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return y1 === y0 ? x0 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  // the outline runs up the back edge to the tip (index 8), then down the front edge
  const ys = (p) => p.map(([x, yy], i) => [x, i === 0 || i === PLATE_OUTLINE.length - 1 ? yy - 0.25 : yy]);
  back = pick(ys(PLATE_OUTLINE.slice(0, 9)));
  front = pick(ys(PLATE_OUTLINE.slice(8)).reverse());
  return [back, front];
}

/**
 * One bony dorsal plate (seeded so no two match): the lobed silhouette as a grid of two curved faces that
 * meet at a thin edge, thick at the root and carved with growth ridges fanning out from it. A grid (not an
 * extrusion) so the faces have inner vertices for the ridges and smooth shading. Plate units: root at
 * y = -0.25, tip at y = 1, z = thickness; uv.y runs root (0) to tip (1) for the glow gradient.
 */
export function plateGeometry(seed, VN = 30) {
  const rand = mulberry32(seed);
  const U = 10;
  const ph = rand() * 10, jit = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  const pos = [], uv = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= VN; j++) {
      const v = j / VN, y = v * 1.25 - 0.25;
      const [b, f] = outlineWidths(v);
      const wob = 0.03 * Math.sin(v * 9 + jit[0] * 6) * (1 - v);
      for (let i = 0; i <= U; i++) {
        const u = i / U, s = 2 * u - 1;
        const x = b + (f - b) * u + wob - 0.28 * y + jit[1] * 0.06 * v;
        const lens = Math.sqrt(Math.max(0, 1 - s * s));
        const thick = (0.018 + 0.05 * (1 - v) ** 1.6) * lens;
        const ridge = (0.6 * Math.abs(Math.sin((x + 0.28 * y) * 24 + ph)) + 0.4 * noise3(x * 6, y * 6, ph)) * lens * (0.3 + 0.7 * v);
        pos.push(x, y, side * (thick + 0.008 * ridge));
        uv.push(u, v);
      }
    }
    for (let j = 0; j < VN; j++) {
      for (let i = 0; i < U; i++) {
        const a = base + j * (U + 1) + i, b2 = a + 1, c = a + U + 1, d = c + 1;
        if (side > 0) idx.push(a, b2, d, a, d, c); else idx.push(a, d, b2, a, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Bone colours for a plate: dark root, weathered bone, pale worn tips, darker in the ridge grooves. */
export function plateColors(g, size, seed) {
  const p = g.attributes.position, uv = g.attributes.uv;
  const col = new Float32Array(p.count * 3);
  const root = new THREE.Color(0x1c1f20), mid = new THREE.Color(0x6a675f), tip = new THREE.Color(0xd2ccbb);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const f = uv.getY(i);
    if (f < 0.62) c.copy(root).lerp(mid, smoothstep01(f / 0.62));
    else c.copy(mid).lerp(tip, smoothstep01((f - 0.62) / 0.38));
    c.multiplyScalar(1 - 0.35 * (1 - Math.abs(2 * uv.getX(i) - 1)) * (1 - f)); // darker down the thick middle
    const streak = 0.85 + 0.15 * Math.sin((x / size + 0.28 * y / size) * 26 + seed);
    const m = 1 + 0.12 * noise3(x * 5, y * 5, seed * 0.37);
    c.multiplyScalar(streak * m);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
