// Helpers for the detailed models in Dragon.js: curved spikes (the Very High Kaiju's teeth and claws, the
// Hydra's horns and spines) and a shared noise for mottling.
import * as THREE from 'three';
import { createNoise } from '../gfx/noise.js';

const N = createNoise(1977);
/** Smooth noise in [-1, 1]. */
export const noise3 = (x, y, z) => N.noise3(x, y, z);

/**
 * A tapered spike along +y (base at y = 0, tip at y = len) whose tip bends toward +x by `bend` × len:
 * teeth, claws, horns. Rings get thinner toward the tip with a slightly rounded base. ridge > 0 adds growth
 * rings (horns and spines; needs enough `rings` to show).
 */
export function curvedSpike(len, r0, bend, radial = 8, rings = 7, ridge = 0) {
  const g = new THREE.CylinderGeometry(0, r0, len, radial, rings, false);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = Math.min(1, Math.max(0, p.getY(i) / len));
    // a fuller base and a sharper point than a straight cone
    const k = (1 + 0.25 * Math.sin(Math.PI * Math.min(1, f * 1.6)) * (1 - f)) * (1 + ridge * 0.09 * Math.abs(Math.sin(f * 26)) * (1 - 0.7 * f));
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
