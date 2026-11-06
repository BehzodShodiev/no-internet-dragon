// Desert landmarks, modelled in code: the bleached skeleton of a giant kaiju half-buried in the dunes, and
// the ruins of a colonnade. Scenery places them on a tile twice the terrain period, so they don't come
// round with every repeat of the dunes. Both are single merged meshes with vertex colours.
import * as THREE from 'three';
import { mergeLoose, setVertexColor } from '../gfx/geometry.js';

const V = THREE.Vector3;
const part = (g, color, x = 0, y = 0, z = 0) => setVertexColor(g.translate(x, y, z), color);
const BONE = 0xd9cfb6, BONE_DARK = 0xb3a68a, SOCKET = 0x3a3226;

/** About 46 m from snout to tail tip, lying along x with the head at -x; y = 0 is the sand line. */
export function buildSkeleton() {
  const parts = [];
  const spine = new THREE.CatmullRomCurve3([
    new V(-16, 1.4, 0), new V(-9, 3.4, 0), new V(-1, 4.0, 0), new V(7, 3.3, 0), new V(15, 1.6, 0), new V(22, 0.2, 0.8), new V(28, -0.8, 2.2),
  ]);
  parts.push(part(new THREE.TubeGeometry(spine, 48, 0.45, 8), BONE));
  // vertebrae along the spine, shrinking toward the tail
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, p = spine.getPoint(t), s = 1 - 0.6 * t;
    parts.push(part(new THREE.SphereGeometry(0.62 * s, 8, 6).scale(0.8, 1.25, 0.9), BONE_DARK, p.x, p.y + 0.35 * s, p.z));
  }
  // dorsal plates, some snapped off
  for (let i = 0; i < 9; i++) {
    const p = spine.getPoint(0.12 + i * 0.07);
    const h = (2.4 - i * 0.18) * (i % 3 === 2 ? 0.45 : 1);
    parts.push(part(new THREE.ConeGeometry(0.95 - i * 0.06, h, 4).scale(1, 1, 0.22), BONE_DARK, p.x, p.y + 0.6 + h / 2, p.z));
  }
  // the rib cage: arcs from the spine down into the sand on both sides
  for (let i = 0; i < 10; i++) {
    const t = 0.16 + i * 0.035, top = spine.getPoint(t);
    const w = 4.4 - Math.abs(i - 3.5) * 0.32;
    for (const s of [-1, 1]) {
      if (i === 7 && s > 0) continue; // a broken rib
      const c = new THREE.QuadraticBezierCurve3(
        new V(top.x, top.y, 0), new V(top.x + 0.7, top.y + 0.9, s * w * 1.15), new V(top.x + 1.4, -1.2, s * w)
      );
      parts.push(part(new THREE.TubeGeometry(c, 16, 0.24 - i * 0.008, 6), BONE));
    }
  }
  // the skull: a long head, dark sockets, teeth, and the lower jaw fallen open on the sand
  parts.push(part(new THREE.SphereGeometry(1.6, 16, 12).scale(1.3, 1.0, 0.85), BONE, -17.4, 1.9, 0)); // cranium
  parts.push(part(new THREE.CylinderGeometry(0.62, 1.15, 4.4, 12).rotateZ(Math.PI / 2).scale(1, 0.85, 0.9), BONE, -20.8, 1.45, 0)); // snout
  parts.push(part(new THREE.BoxGeometry(2.4, 0.35, 2.5), BONE_DARK, -16.9, 2.95, 0)); // brow ridge
  for (const z of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.5, 10, 8).scale(1.2, 1, 0.6), SOCKET, -17.9, 2.3, z * 1.12)); // eye sockets
    parts.push(part(new THREE.SphereGeometry(0.2, 6, 5), SOCKET, -22.9, 1.75, z * 0.32)); // nostrils
  }
  for (let i = 0; i < 7; i++) {
    for (const z of [-0.62, 0.62]) parts.push(part(new THREE.ConeGeometry(0.14, 0.6, 5).rotateZ(Math.PI), 0xf2ecdc, -22.6 + i * 0.66, 0.78, z * (1 - i * 0.04)));
  }
  parts.push(part(new THREE.BoxGeometry(6.0, 0.45, 1.5).rotateZ(-0.22).rotateY(0.25), BONE_DARK, -20.2, 0.0, 1.5)); // the fallen jaw
  // a forelimb reaching out of the sand: upper arm, forearm, three claws
  parts.push(part(new THREE.CylinderGeometry(0.3, 0.38, 3.2, 8).rotateZ(0.9), BONE, -10.5, 0.6, 4.8));
  parts.push(part(new THREE.CylinderGeometry(0.22, 0.28, 2.6, 8).rotateZ(-0.5), BONE, -12.6, 1.2, 5.2));
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.ConeGeometry(0.16, 1.1, 5).rotateZ(-2.2 - k * 0.25), BONE_DARK, -13.8 - k * 0.2, 0.3, 5.0 + k * 0.4));
  return mergeLoose(parts);
}

/** A ruined colonnade about 26 m long: fluted columns (some broken or toppled), a lintel, fallen blocks. */
export function buildRuins(seed = 5) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [];
  const STONE = 0xcdb38a, STONE_DARK = 0xa88d66;
  const column = (h) => {
    const g = new THREE.CylinderGeometry(0.62, 0.7, h, 14, 1);
    // fluting: pull every other ring vertex in a little
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > 0.3) {
        const k = 1 - 0.06 * (0.5 + 0.5 * Math.cos(a * 14));
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
    }
    g.computeVertexNormals();
    return g;
  };
  const xs = [-12, -8, -4, 0, 4, 8, 12];
  xs.forEach((x, i) => {
    const broken = i === 1 || i === 5 || rnd() < 0.2;
    const h = broken ? 2.2 + rnd() * 3 : 8;
    parts.push(part(new THREE.BoxGeometry(1.8, 0.5, 1.8), STONE_DARK, x, 0.25, 0)); // plinth
    parts.push(part(column(h), STONE, x, 0.5 + h / 2, 0));
    if (!broken) parts.push(part(new THREE.BoxGeometry(1.7, 0.45, 1.7), STONE_DARK, x, 8.7, 0)); // capital
  });
  // the lintel survives over the first unbroken pair, a broken piece leans against a column
  parts.push(part(new THREE.BoxGeometry(9.4, 1.1, 1.6), STONE, -4 + 2, 9.45, 0));
  parts.push(part(new THREE.BoxGeometry(5.5, 1.0, 1.5).rotateZ(0.55), STONE_DARK, 9.6, 2.3, 1.3));
  // a toppled column lying in drums, and scattered blocks
  for (let k = 0; k < 4; k++) parts.push(part(column(1.9).rotateZ(Math.PI / 2).rotateY(0.3), STONE, -6 + k * 2.05, 0.5, 4.2 + k * 0.6));
  for (let k = 0; k < 7; k++) {
    const b = 0.6 + rnd() * 0.9;
    parts.push(part(new THREE.BoxGeometry(b * 1.4, b, b).rotateY(rnd() * 3).rotateX(rnd() * 0.4), STONE_DARK, -14 + rnd() * 28, b * 0.35, -3 + rnd() * 8));
  }
  return mergeLoose(parts);
}
