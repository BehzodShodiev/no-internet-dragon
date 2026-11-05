// Geometry helpers: sweep a cross-section along a spine curve, organic displacement, etc.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _P = new THREE.Vector3();
const _T = new THREE.Vector3();
const _S = new THREE.Vector3();
const _N = new THREE.Vector3();
const _c = new THREE.Color();
const _sec = { x: 0, y: 0 };

/**
 * Sweeps a closed cross-section along a path.
 * section(t, a, out) writes the lateral (out.x) and vertical (out.y) offsets for angle a (0 = top).
 * Optional: color(t, a, out: THREE.Color), skin(t) -> [i0, i1, w0, w1], caps.
 */
export function sweep({
  points,
  segments = 48,
  radial = 24,
  section,
  sideHint = new THREE.Vector3(0, 0, 1),
  uvScale = [1, 1],
  color = null,
  skin = null,
  capStart = false,
  capEnd = false,
  curveType = 'centripetal',
}) {
  const curve = new THREE.CatmullRomCurve3(points, false, curveType);
  const rows = segments + 1;
  const cols = radial + 1;
  const vCount = rows * cols + (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = color ? new Float32Array(vCount * 3) : null;
  const sIdx = skin ? new Uint16Array(vCount * 4) : null;
  const sW = skin ? new Float32Array(vCount * 4) : null;
  const centers = [];

  for (let i = 0; i < rows; i++) {
    const t = i / segments;
    curve.getPointAt(t, _P);
    curve.getTangentAt(t, _T);
    _S.copy(sideHint).addScaledVector(_T, -_T.dot(sideHint)).normalize();
    _N.crossVectors(_S, _T).normalize();
    centers.push(_P.clone());
    const sk = skin ? skin(t) : null;
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * Math.PI * 2;
      section(t, a, _sec);
      const k = i * cols + j;
      pos[k * 3] = _P.x + _S.x * _sec.x + _N.x * _sec.y;
      pos[k * 3 + 1] = _P.y + _S.y * _sec.x + _N.y * _sec.y;
      pos[k * 3 + 2] = _P.z + _S.z * _sec.x + _N.z * _sec.y;
      uv[k * 2] = t * uvScale[0];
      uv[k * 2 + 1] = (j / radial) * uvScale[1];
      if (col) {
        color(t, a, _c);
        col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
      }
      if (sk) {
        sIdx[k * 4] = sk[0]; sIdx[k * 4 + 1] = sk[1];
        sW[k * 4] = sk[2]; sW[k * 4 + 1] = sk[3];
      }
    }
  }

  const idx = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = i * cols + j + 1;
      const d = (i + 1) * cols + j + 1;
      idx.push(a, c, b, c, d, b);
    }
  }

  let next = rows * cols;
  const addCap = (ring, center, t, flip) => {
    const ci = next++;
    pos[ci * 3] = center.x; pos[ci * 3 + 1] = center.y; pos[ci * 3 + 2] = center.z;
    uv[ci * 2] = t * uvScale[0]; uv[ci * 2 + 1] = 0.5 * uvScale[1];
    if (col) {
      const r0 = ring * cols;
      col[ci * 3] = col[r0 * 3]; col[ci * 3 + 1] = col[r0 * 3 + 1]; col[ci * 3 + 2] = col[r0 * 3 + 2];
    }
    if (skin) {
      const r0 = ring * cols;
      for (let q = 0; q < 4; q++) { sIdx[ci * 4 + q] = sIdx[r0 * 4 + q]; sW[ci * 4 + q] = sW[r0 * 4 + q]; }
    }
    for (let j = 0; j < radial; j++) {
      const a = ring * cols + j, b = ring * cols + j + 1;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) addCap(0, centers[0], 0, true);
  if (capEnd) addCap(segments, centers[segments], 1, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (skin) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  fixSeamNormals(g, rows, cols);
  return g;
}

// Average the normals of the duplicated first/last column so the seam is invisible.
function fixSeamNormals(g, rows, cols) {
  const n = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = i * cols, b = i * cols + cols - 1;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

export const ellipse = (rz, ry) => (t, a, out) => {
  out.x = Math.sin(a) * rz;
  out.y = Math.cos(a) * ry;
};

/** Smooth organic blob: displaces an icosphere with a user function; returns smooth-shaded geometry with box-projected UVs. */
export function blob(radius, detail, displace, uvScale = 1) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    displace(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  boxProjectUV(g, uvScale);
  return g;
}

export function boxProjectUV(g, scale = 1) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, w;
    if (ay >= ax && ay >= az) { u = p.getX(i); w = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); w = p.getY(i); }
    else { u = p.getX(i); w = p.getY(i); }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = w * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function setVertexColor(g, color) {
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Merge geometries that may have different attribute sets by keeping only common ones. */
export function mergeLoose(list) {
  const keep = ['position', 'normal', 'uv', 'color'];
  const prepared = list.map((g) => {
    let q = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(q.attributes)) if (!keep.includes(name)) q.deleteAttribute(name);
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    if (!q.attributes.color) setVertexColor(q, 0xffffff);
    return q;
  });
  return mergeGeometries(prepared, false);
}

export { mergeGeometries, mergeVertices };
