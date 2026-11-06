// Procedurally generated PBR textures. Nothing is downloaded, so the game runs fully offline.
import * as THREE from 'three';
import { mulberry32, createTileableNoise } from './noise.js';

const tn = createTileableNoise(1337);

function dataTexture(data, w, h, { srgb = false, repeat = true, mips = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function heightToNormal(hgt, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w;
    const yd = ((y + 1) % h) * w;
    const yr = y * w;
    for (let x = 0; x < w; x++) {
      const l = hgt[yr + ((x - 1 + w) % w)];
      const r = hgt[yr + ((x + 1) % w)];
      const u = hgt[yu + x];
      const d = hgt[yd + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (yr + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// Tileable Voronoi: returns F1, F2 distances (in cell units) and a random value per nearest cell.
function voronoi(size, cells, seed, jitter = 0.85) {
  const rand = mulberry32(seed);
  const n = cells * cells;
  const px = new Float32Array(n), py = new Float32Array(n), rv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = 0.5 + (rand() - 0.5) * jitter;
    py[i] = 0.5 + (rand() - 0.5) * jitter;
    rv[i] = rand();
  }
  const f1 = new Float32Array(size * size);
  const f2 = new Float32Array(size * size);
  const id = new Float32Array(size * size);
  const k = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * k;
    const cy = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = x * k;
      const cx = Math.floor(fx);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        const iy = (ny + cells) % cells;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ix = (nx + cells) % cells;
          const c = iy * cells + ix;
          const ddx = fx - (nx + px[c]);
          const ddy = fy - (ny + py[c]);
          const d = ddx * ddx + ddy * ddy;
          if (d < d1) { d2 = d1; d1 = d; best = c; } else if (d < d2) d2 = d;
        }
      }
      const i = y * size + x;
      f1[i] = Math.sqrt(d1);
      f2[i] = Math.sqrt(d2);
      id[i] = rv[best];
    }
  }
  return { f1, f2, id };
}

export function makeSandTextures(size = 512) {
  const rand = mulberry32(11);
  const hgt = new Float32Array(size * size);
  const col = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = tn.fbm(u, v, 3, 3) * 0.9;
      const ripple = Math.sin((u * 14 + warp * 2.2 + tn.fbm(u, v, 6, 2) * 0.4) * Math.PI * 2);
      const r = Math.pow(ripple * 0.5 + 0.5, 1.6);
      const grain = rand();
      const big = tn.fbm(u, v, 2, 4);
      const i = y * size + x;
      hgt[i] = r * 0.55 + grain * 0.18 + big * 0.4;
      // albedo: warm sand with mottling, darker troughs and a few dark grains
      const m = 0.5 + 0.5 * tn.fbm(u, v, 5, 4);
      let br = 0.86 + 0.12 * m + 0.05 * r - (grain > 0.985 ? 0.35 : 0) + (grain < 0.01 ? 0.12 : 0);
      const o = i * 4;
      col[o] = clamp01(br * 0.93) * 255;
      col[o + 1] = clamp01(br * 0.76) * 255;
      col[o + 2] = clamp01(br * 0.55) * 255;
      col[o + 3] = 255;
    }
  }
  const nrm = heightToNormal(hgt, size, size, 2.2);
  return {
    map: dataTexture(col, size, size, { srgb: true }),
    normalMap: dataTexture(nrm, size, size),
  };
}

export function makeScaleTextures(size = 512) {
  const big = voronoi(size, 22, 21, 0.9);
  const small = voronoi(size, 54, 22, 0.9);
  const hgt = new Float32Array(size * size);
  const col = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const e1 = smooth(0.0, 0.28, big.f2[i] - big.f1[i]);
      const e2 = smooth(0.0, 0.22, small.f2[i] - small.f1[i]);
      const dome = 1 - Math.min(1, big.f1[i] * 0.9);
      const n = tn.fbm(x / size, y / size, 16, 2);
      const h = e1 * (0.55 + 0.45 * dome) * 0.75 + e2 * 0.25 + n * 0.05;
      hgt[i] = h;
      const tone = 0.62 + 0.38 * big.id[i] * 0.6 + 0.22 * dome * e1 - (1 - e1) * 0.28 - (1 - e2) * 0.08;
      const o = i * 4;
      const t = clamp01(tone);
      col[o] = t * 255;
      col[o + 1] = clamp01(t * 1.02) * 255;
      col[o + 2] = clamp01(t * 0.96) * 255;
      col[o + 3] = 255;
      orm[o] = (0.55 + 0.45 * e1) * 255; // AO in crevices
      orm[o + 1] = clamp01(0.82 - 0.32 * e1 * dome + (1 - e2) * 0.12) * 255; // roughness
      orm[o + 2] = 0;
      orm[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, size, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(hgt, size, size, 5), size, size),
    ormMap: dataTexture(orm, size, size),
  };
}

export function makeRockTextures(size = 512) {
  const cr = voronoi(size, 7, 31, 1);
  const hgt = new Float32Array(size * size);
  const col = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const f = tn.fbm(u, v, 4, 6, 0.55);
      const crack = 1 - smooth(0, 0.06, cr.f2[i] - cr.f1[i]);
      const strata = Math.sin((v * 18 + f * 1.5) * Math.PI) * 0.5 + 0.5;
      hgt[i] = f * 0.9 - crack * 0.5 + strata * 0.08;
      const b = 0.62 + 0.3 * f + 0.08 * strata - crack * 0.3;
      const tint = 0.5 + 0.5 * tn.fbm(u, v, 2, 3);
      const o = i * 4;
      col[o] = clamp01(b * (0.92 + 0.08 * tint)) * 255;
      col[o + 1] = clamp01(b * 0.82) * 255;
      col[o + 2] = clamp01(b * (0.72 - 0.06 * tint)) * 255;
      col[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, size, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(hgt, size, size, 3), size, size),
  };
}

// Cactus skin: u wraps around the stem (ribs), v runs along it. Areoles sit on the rib crests.
export function makeCactusTextures(ribs = 12, w = 256, h = 512) {
  const rand = mulberry32(41);
  const hgt = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  const rows = 26;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;
      const ru = u * ribs;
      const du = (ru - Math.round(ru)) / ribs; // distance to nearest crest (u units)
      const rowOff = (Math.round(ru) % 2) * 0.5;
      const rv = v * rows + rowOff;
      const dv = (rv - Math.round(rv)) / rows;
      const d = Math.hypot(du * 1.0, dv * 0.5) * 100;
      const areole = Math.exp(-d * d * 2.2);
      const streak = tn.fbm(u * 1, v * 0.1, 8, 3) * 0.5 + 0.5;
      hgt[i] = areole * 0.9 + streak * 0.1 + rand() * 0.03;
      const o = i * 4;
      const b = 0.88 + 0.12 * streak;
      col[o] = clamp01(b + areole * 0.6) * 255;
      col[o + 1] = clamp01(b + areole * 0.5) * 255;
      col[o + 2] = clamp01(b * 0.9 + areole * 0.55) * 255;
      col[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, w, h, { srgb: true }),
    normalMap: dataTexture(heightToNormal(hgt, w, h, 4), w, h),
  };
}

export function makeCloudTexture(seed = 1, w = 256, h = 128) {
  const rand = mulberry32(seed);
  const data = new Uint8Array(w * h * 4);
  const blobs = [];
  const count = 5 + Math.floor(rand() * 4);
  for (let b = 0; b < count; b++) {
    blobs.push({
      x: 0.22 + rand() * 0.56,
      y: 0.42 + (rand() - 0.5) * 0.18,
      r: 0.12 + rand() * 0.14,
    });
  }
  const off = rand() * 10;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let d = 0;
      for (const b of blobs) {
        const dx = (u - b.x) / b.r;
        const dy = ((v - b.y) / b.r) * (h / w) * 2.2;
        d += Math.exp(-(dx * dx + dy * dy) * 1.6);
      }
      const n = tn.fbm(u + off, v + off, 4, 5, 0.55);
      let a = clamp01((d * 0.9 + n * 0.75 - 0.35) * 1.6);
      a *= smooth(0, 0.18, u) * smooth(1, 0.82, u) * smooth(0, 0.2, v) * smooth(1, 0.8, v);
      // flatter, darker undersides
      const shade = clamp01(0.72 + 0.28 * (1 - v) + n * 0.15);
      const o = (y * w + x) * 4;
      data[o] = shade * 255;
      data[o + 1] = shade * 255;
      data[o + 2] = clamp01(shade * 1.04) * 255;
      data[o + 3] = a * 255;
    }
  }
  const t = dataTexture(data, w, h, { srgb: true, repeat: false });
  t.flipY = false;
  return t;
}

export function makeSoftDotTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = tn.fbm(x / size, y / size, 4, 3) * 0.25;
      const a = clamp01(Math.pow(clamp01(1 - d), 1.8) + n * (1 - d));
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = a * 255;
    }
  }
  return dataTexture(data, size, size, { repeat: false });
}

export function makeBrushTexture(seed = 3) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  for (let i = 0; i < 70; i++) {
    const bx = 128 + (rand() - 0.5) * 40;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 2.2;
    const len = 70 + rand() * 150;
    const bend = (rand() - 0.5) * 0.8;
    const hue = 30 + rand() * 18;
    const light = 35 + rand() * 35;
    g.strokeStyle = `hsl(${hue}, ${30 + rand() * 25}%, ${light}%)`;
    g.lineWidth = 1 + rand() * 2.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(bx, 256);
    const ex = bx + Math.cos(ang) * len, ey = 256 + Math.sin(ang) * len;
    g.quadraticCurveTo(bx + Math.cos(ang + bend) * len * 0.5, 256 + Math.sin(ang + bend) * len * 0.5, ex, ey);
    g.stroke();
    // twigs
    if (rand() < 0.6) {
      const tx = bx + (ex - bx) * 0.6, ty = 256 + (ey - 256) * 0.6;
      g.lineWidth *= 0.6;
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx + (rand() - 0.5) * 50, ty - rand() * 40);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Tileable fbm noise for shaders (sky clouds, the Milky Way, fireballs): R = 5 octaves, G = 3 octaves
 * at another offset. One lattice cell spans a quarter of the texture (sample at p * 0.25). Both channels
 * are remapped to the mean and spread of a shader value-noise fbm, so thresholds tuned on that still hold.
 * A texture fetch replaces dozens of hash evaluations, which is cheaper to run and far cheaper to compile.
 */
export function makeNoiseTexture(size = 256) {
  const n = size * size;
  const r = new Float32Array(n), g = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      r[y * size + x] = tn.fbm(u, v, 4, 5);
      g[y * size + x] = tn.fbm((u + 0.37) % 1, (v + 0.61) % 1, 4, 3);
    }
  }
  const remap = (a, mean, sd) => {
    let m = 0, q = 0;
    for (let i = 0; i < n; i++) m += a[i];
    m /= n;
    for (let i = 0; i < n; i++) q += (a[i] - m) * (a[i] - m);
    const k = sd / Math.sqrt(q / n);
    for (let i = 0; i < n; i++) a[i] = clamp01(mean + (a[i] - m) * k);
  };
  remap(r, 0.484, 0.115);
  remap(g, 0.5, 0.13);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const t = dataTexture(data, size, size);
  t.anisotropy = 4;
  return t;
}

export function makeFootprintTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 128;
  const grad = (x, y, r) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(0.7, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    return gr;
  };
  // heel pad
  g.fillStyle = grad(64 * s, 88 * s, 26 * s);
  g.beginPath(); g.ellipse(64 * s, 88 * s, 22 * s, 26 * s, 0, 0, Math.PI * 2); g.fill();
  // three toes
  const toes = [[-0.42, 30], [0, 22], [0.42, 30]];
  for (const [a, len] of toes) {
    g.save();
    g.translate(64 * s, 72 * s);
    g.rotate(a);
    g.fillStyle = grad(0, -len * s, 16 * s);
    g.beginPath(); g.ellipse(0, -len * s, 9 * s, 26 * s, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function makeMoonTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const cr = voronoi(size, 6, 77, 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const i = y * size + x;
      const n = tn.fbm(x / size, y / size, 3, 5);
      const crater = smooth(0.25, 0.0, cr.f1[i]) * 0.25;
      const b = clamp01(0.82 + n * 0.25 - crater - (n > 0.15 ? 0.12 : 0));
      const limb = Math.sqrt(clamp01(1 - d * d));
      const o = i * 4;
      data[o] = b * (0.85 + 0.15 * limb) * 255;
      data[o + 1] = b * (0.86 + 0.14 * limb) * 255;
      data[o + 2] = b * (0.9 + 0.1 * limb) * 255;
      data[o + 3] = smooth(1, 0.97, d) * 255;
    }
  }
  return dataTexture(data, size, size, { srgb: true, repeat: false });
}
