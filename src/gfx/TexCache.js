// Caches procedurally generated textures in IndexedDB, so repeat visits skip the generation (the first
// visit generates and stores them). The key is a hash of the generator sources, set at build time
// (vite.config.js, __TEX_KEY__), so changing a generator invalidates the cache by itself. Everything here
// is optional: if IndexedDB is missing, blocked or slow, textures are generated exactly as before.
import * as THREE from 'three';

/* global __TEX_KEY__ */
const KEY = typeof __TEX_KEY__ === 'string' ? __TEX_KEY__ : 'dev';
const DB = 'dragon-cache';
const STORE = 'textures';

const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

function pack(t) {
  return {
    data: t.image.data, w: t.image.width, h: t.image.height, format: t.format, type: t.type,
    srgb: t.colorSpace === THREE.SRGBColorSpace, wrapS: t.wrapS, wrapT: t.wrapT,
    mag: t.magFilter, min: t.minFilter, mips: t.generateMipmaps, aniso: t.anisotropy,
  };
}

function unpack(p) {
  const t = new THREE.DataTexture(p.data, p.w, p.h, p.format, p.type);
  t.wrapS = p.wrapS;
  t.wrapT = p.wrapT;
  t.magFilter = p.mag;
  t.minFilter = p.min;
  t.generateMipmaps = p.mips;
  t.anisotropy = p.aniso;
  if (p.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export class TexCache {
  /** Opens the cache (gives up after `ms`, then every call just generates). */
  async open(ms = 400) {
    this.db = null;
    if (typeof indexedDB === 'undefined') return this;
    const opened = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    this.db = await withTimeout(opened, ms, null);
    return this;
  }

  _get(key) {
    if (!this.db) return Promise.resolve(null);
    return withTimeout(new Promise((resolve) => {
      try {
        const req = this.db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    }), 300, null);
  }

  _put(key, value) {
    if (!this.db) return;
    try { this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key); } catch { /* quota or blocked: fine */ }
  }

  /**
   * A generator's result, from the cache when it's there. generate() returns a DataTexture or an object
   * whose values are DataTextures (as the generators in textures.js do).
   */
  async textures(name, generate) {
    const key = `${KEY}:${name}`;
    const hit = await this._get(key);
    if (hit) {
      try {
        if (hit.single) return unpack(hit.single);
        return Object.fromEntries(Object.entries(hit.parts).map(([k, p]) => [k, unpack(p)]));
      } catch { /* corrupt entry: regenerate below */ }
    }
    const out = generate();
    if (out?.isDataTexture) this._put(key, { single: pack(out) });
    else if (out && Object.values(out).every((t) => t?.isDataTexture)) {
      this._put(key, { parts: Object.fromEntries(Object.entries(out).map(([k, t]) => [k, pack(t)])) });
    }
    return out;
  }
}
