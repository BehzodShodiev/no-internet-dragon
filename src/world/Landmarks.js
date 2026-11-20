// Desert landmarks, modelled in code: the bleached skeleton of a giant kaiju half-buried in the dunes, the
// ruins of a colonnade, and an oasis. Scenery places them on a tile twice the terrain period, so they don't come
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

/**
 * An oasis about 30 m across: a pond (deeper teal in the middle, a ring of wet sand), reeds at the water's
 * edge, and five date palms of different heights leaning out over it. Vertex colours; y = 0 is the sand.
 */
export function buildOasis(seed = 11) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts = [];
  // the pond and its wet rim (a flattened disc with colours by radius)
  const pond = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
  const pc = pond.attributes.position, col = new Float32Array(pc.count * 3), c = new THREE.Color();
  const deep = new THREE.Color(0x1f6a6e), shallow = new THREE.Color(0x4fa69a), wet = new THREE.Color(0x8a6a44);
  for (let i = 0; i < pc.count; i++) {
    const r = Math.hypot(pc.getX(i), pc.getY(i));
    if (r < 0.82) c.copy(deep).lerp(shallow, (r / 0.82) ** 2); else c.copy(shallow).lerp(wet, (r - 0.82) / 0.18);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  pond.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(pond.rotateX(-Math.PI / 2).scale(13, 1, 9).translate(0, 0.08, 0));
  // reeds in clumps around the edge
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2, x = Math.cos(a) * 12.2, z = Math.sin(a) * 8.3;
    for (let j = 0; j < 4; j++) {
      const h = 0.9 + rnd() * 1.1;
      parts.push(part(new THREE.ConeGeometry(0.06, h, 4).rotateZ((rnd() - 0.5) * 0.5).rotateX((rnd() - 0.5) * 0.5), j % 2 ? 0x6f8a3c : 0x58722e, x + (rnd() - 0.5) * 0.8, h / 2, z + (rnd() - 0.5) * 0.8));
    }
  }
  // date palms: a curved, ringed trunk and a crown of drooping fronds
  const palms = [[-9, 7, 11], [-11, -4, 9], [7, 8.5, 12.5], [10, -6, 8], [2, -9.5, 10]];
  for (const [px, pz, h] of palms) {
    const lean = new V(-px, 0, -pz).normalize().multiplyScalar(h * 0.18); // leaning out over the water
    const trunk = new THREE.CatmullRomCurve3([new V(px, 0, pz), new V(px + lean.x * 0.2, h * 0.5, pz + lean.z * 0.2), new V(px + lean.x, h, pz + lean.z)]);
    const tg = new THREE.TubeGeometry(trunk, 20, 0.32, 8);
    const tp = tg.attributes.position, tcol = new Float32Array(tp.count * 3);
    for (let i = 0; i < tp.count; i++) {
      c.set(0x7a5a3a).multiplyScalar(0.8 + 0.25 * (Math.sin(tp.getY(i) * 7) > 0.6 ? 1 : 0)); // growth rings
      tcol[i * 3] = c.r; tcol[i * 3 + 1] = c.g; tcol[i * 3 + 2] = c.b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
    parts.push(tg);
    const top = trunk.getPoint(1);
    const n = 11;
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + rnd() * 0.3, len = 4.2 + rnd() * 1.4;
      // a frond: a narrow strip arching up and drooping down at the tip
      const leaf = new THREE.PlaneGeometry(len, 0.7, 12, 1);
      const lp = leaf.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const u = (lp.getX(i) + len / 2) / len;
        lp.setY(i, lp.getY(i) * (1 - 0.7 * u)); // tapers to the tip
        lp.setZ(i, 1.1 * Math.sin(u * Math.PI * 0.9) - 2.4 * u * u); // arch, then droop
      }
      leaf.translate(len / 2, 0, 0).rotateX(-Math.PI / 2).rotateY(-a).translate(top.x, top.y, top.z);
      parts.push(setVertexColor(leaf, f % 2 ? 0x3f6a2a : 0x4d7d32));
    }
    parts.push(part(new THREE.SphereGeometry(0.5, 8, 6).scale(1, 0.7, 1), 0x6a4a2a, top.x, top.y - 0.2, top.z)); // the crown's base
  }
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
