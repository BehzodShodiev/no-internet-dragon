// Volcano biome: smoking volcanoes on the horizon, plus the lava pools, meteors and basalt pillars
// that Obstacles spawns on the track.
import * as THREE from 'three';
import { mergeLoose, setVertexColor } from '../gfx/geometry.js';
import { createNoise } from '../gfx/noise.js';

const part = (g, color, x = 0, y = 0, z = 0) => setVertexColor(g.translate(x, y, z), color);

/** Molten rock: flowing noise drawn in each object's own coordinates, so it doesn't slide as it scrolls. */
function lavaMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0x1a0603, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLW = (modelMatrix * vec4(position, 1.0)).xyz - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vLW;
        float lHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(lHash(i), lHash(i + vec2(1, 0)), u.x), mix(lHash(i + vec2(0, 1)), lHash(i + vec2(1, 1)), u.x), u.y);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ln = lNoise(vLW.xz * 2.2 + vec2(uTime * 0.6, uTime * 0.25)) * 0.6 + lNoise(vLW.xz * 5.0 - uTime * 0.8) * 0.4;
        vec3 hot = mix(vec3(1.4, 0.2, 0.02), vec3(3.6, 1.5, 0.25), smoothstep(0.3, 0.8, ln));
        totalEmissiveRadiance += hot * (0.8 + 0.2 * sin(uTime * 3.0 + ln * 6.0));`);
  };
  return m;
}

export class Volcano {
  constructor(scene, tex) {
    this.uniforms = { uTime: { value: 0 } };
    this.lavaMat = lavaMaterial(this.uniforms);
    this.basalt = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, normalMap: tex.rock.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    });
    this.crust = new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.95 });
    this.hotMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a10, emissiveIntensity: 6, roughness: 0.6 });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.dot = tex.dot;
    this._buildPieces();
    this._buildMountains(scene);
    this.active = false;
  }

  // ------------------------------------------------------------------ track pieces
  _buildPieces() {
    this.poolGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
    this.rimGeo = new THREE.RingGeometry(0.98, 1.16, 40).rotateX(-Math.PI / 2).translate(0, 0.025, 0);
    this.markGeo = new THREE.RingGeometry(0.85, 1.2, 36).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
    this.ballGeo = new THREE.IcosahedronGeometry(0.6, 1);
    // basalt, a shade lighter than the ash so the silhouette reads, with glowing cracks at the base
    const col = (h, c) => part(new THREE.CylinderGeometry(0.42, 0.5, h, 6), c, 0, h / 2, 0);
    this.pillarGeo = mergeLoose([
      col(4.4, 0x5a4a42), part(new THREE.CylinderGeometry(0.4, 0.46, 3.3, 6), 0x6a5850, 0.62, 1.65, 0.3),
      part(new THREE.CylinderGeometry(0.38, 0.45, 3.9, 6), 0x4e403a, -0.55, 1.95, -0.25),
      part(new THREE.CylinderGeometry(0.43, 0.43, 0.06, 6), 0x8a7a70, 0, 4.42, 0), // weathered top
    ]);
    this.pillarGlowGeo = new THREE.TorusGeometry(0.62, 0.06, 6, 18).rotateX(Math.PI / 2).translate(0, 0.08, 0);
  }

  makeLava() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.poolGeo, this.lavaMat), new THREE.Mesh(this.rimGeo, this.crust));
    return g;
  }

  makeMeteor() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.markGeo, this.ringMat.clone()); // landing marker
    const ball = new THREE.Mesh(this.ballGeo, this.hotMat);
    const crater = new THREE.Group();
    crater.add(new THREE.Mesh(this.poolGeo, this.lavaMat), new THREE.Mesh(this.rimGeo, this.crust));
    crater.scale.set(1.05, 1, 0.9);
    g.add(ring, ball, crater);
    g.userData = { ring, ball, crater };
    return g;
  }

  makePillar() {
    const m = new THREE.Mesh(this.pillarGeo, this.basalt);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m, new THREE.Mesh(this.pillarGlowGeo, this.hotMat));
    return g;
  }

  // ------------------------------------------------------------------ volcanoes on the horizon
  _buildMountains(scene) {
    const noise = createNoise(911);
    const g = new THREE.CylinderGeometry(9, 75, 62, 56, 10, true);
    const p = g.attributes.position;
    const c = new Float32Array(p.count * 3);
    const v = new THREE.Vector3(), base = new THREE.Color(0x2a211f), streak = new THREE.Color(0x5a1a0a), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x);
      const r = Math.hypot(v.x, v.z);
      const k = 1 + noise.fbm3(Math.cos(a) * 2, v.y * 0.04, Math.sin(a) * 2, 4) * 0.22;
      v.x = Math.cos(a) * r * k;
      v.z = Math.sin(a) * r * k;
      v.y += 31;
      p.setXYZ(i, v.x, v.y, v.z);
      // lava streaks running down from the crater
      const s = Math.max(0, Math.sin(a * 7 + noise.noise3(a, v.y * 0.05, 0) * 3)) ** 8 * (v.y / 62);
      tmp.copy(base).lerp(streak, s);
      c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    const coneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.3, 0.25), fog: false });
    const glow = new THREE.TorusGeometry(9.5, 1.6, 8, 40).rotateX(Math.PI / 2).translate(0, 62, 0);
    this.smokeMat = new THREE.SpriteMaterial({ map: this.dot, color: 0x2a2220, transparent: true, opacity: 0.7, depthWrite: false });
    this.mountains = [];
    [[-120, -300, 1.2], [260, -360, 1.5], [700, -280, 1.0]].forEach(([x, z, s]) => {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(g, coneMat), new THREE.Mesh(glow, glowMat));
      const puffs = [];
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Sprite(this.smokeMat);
        m.add(sp);
        puffs.push({ sp, t: i / 6 });
      }
      m.scale.setScalar(s);
      m.position.set(x, -4, z);
      m.visible = false;
      scene.add(m);
      this.mountains.push({ m, puffs });
    });
  }

  setActive(on) {
    this.active = on;
    for (const { m } of this.mountains) m.visible = on;
  }

  update(dt, speed, time) {
    this.uniforms.uTime.value = time;
    this.hotMat.emissiveIntensity = 5 + 1.5 * Math.sin(time * 9);
    if (!this.active) return;
    for (const { m, puffs } of this.mountains) {
      m.position.x -= speed * dt;
      if (m.position.x < -560) m.position.x += 1500;
      for (const p of puffs) {
        p.t = (p.t + dt * 0.05) % 1; // a slow, endless column of smoke
        const s = 18 + p.t * 60;
        p.sp.position.set(Math.sin(p.t * 5 + m.position.z) * 8, 66 + p.t * 120, 0);
        p.sp.scale.set(s, s, 1);
      }
    }
    this.smokeMat.opacity = 0.65;
  }
}
