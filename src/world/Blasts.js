// Explosion effects: a fireball that swells and cools, a shockwave ring racing over the ground, and a
// scorch mark left behind that rides away with the sand. Each is a single instanced draw; everything
// exists from load (count 0), so the shaders compile with the rest during loading.
import * as THREE from 'three';

const FIRE_MAX = 10;
const RING_MAX = 10;
const SCORCH_MAX = 24;

export class Blasts {
  /** noiseTex: the shared tileable fbm texture (textures.makeNoiseTexture) for the fireball's turbulence. */
  constructor(scene, noiseTex) {
    // ---- fireballs: noise-shaded spheres; aLife 0..1 drives size, temperature and fade. Premultiplied
    // blending: hot parts are nearly additive (alpha ~0, they glow), cooled parts occlude, so the ball
    // burns out into a dark puff of smoke that keeps rising.
    const fireGeo = new THREE.IcosahedronGeometry(1, 3);
    this.fireLife = new THREE.InstancedBufferAttribute(new Float32Array(FIRE_MAX), 1);
    this.fireSeed = new THREE.InstancedBufferAttribute(new Float32Array(FIRE_MAX), 1);
    fireGeo.setAttribute('aLife', this.fireLife);
    fireGeo.setAttribute('aSeed', this.fireSeed);
    const fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSmoke: { value: new THREE.Color(0.2, 0.18, 0.16) }, uNoise: { value: noiseTex } },
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSeed;
        uniform float uTime;
        varying float vLife; varying vec3 vN; varying vec3 vP; varying vec3 vO;
        void main() {
          vLife = aLife;
          vec3 p = position;
          // lumpy, boiling surface
          float w = sin(p.x * 3.1 + uTime * 7.0 + aSeed * 9.0) * sin(p.y * 2.7 - uTime * 5.0) * sin(p.z * 3.3 + aSeed * 4.0);
          p *= 1.0 + 0.07 * w; // small: normals aren't recomputed, and the soft edge needs them
          vO = position * 2.2 + vec3(aSeed * 3.7, aSeed * 1.9 - uTime * 1.6, aSeed * 2.3);
          vec4 wp = instanceMatrix * vec4(p, 1.0);
          vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
          vec4 mv = modelViewMatrix * wp;
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSmoke; uniform sampler2D uNoise;
        varying float vLife; varying vec3 vN; varying vec3 vP; varying vec3 vO;
        void main() {
          float facing = clamp(abs(dot(normalize(vN), normalize(-vP))), 1e-4, 1.0);
          // turbulence: the baked fbm on two crossing planes, the second one churning upward
          float n = 0.6 * texture2D(uNoise, vO.xy * 0.25).r + 0.4 * texture2D(uNoise, vO.zy * 0.45 + vec2(0.0, uTime * 0.35)).g;
          float core = pow(facing, 1.4);
          // temperature: white at a young core, through yellow, orange and red, to black smoke
          float heat = clamp(core * 1.3 - vLife * 1.25 + (n - 0.5) * 1.1, 0.0, 1.0);
          vec3 col = mix(uSmoke * (0.6 + 0.8 * n), vec3(0.9, 0.12, 0.02), smoothstep(0.0, 0.25, heat));
          col = mix(col, vec3(3.2, 1.2, 0.25), smoothstep(0.2, 0.55, heat));
          col = mix(col, vec3(4.5, 3.6, 2.2), smoothstep(0.6, 1.0, heat));
          // ragged, soft silhouette; smoke breaks into lumps; everything thins out at the end of its life
          float smoke = 1.0 - smoothstep(0.1, 0.45, heat);
          float edge = smoothstep(0.0, 0.7, facing + (n - 0.5) * 0.8);
          float lumps = smoothstep(0.3, 0.75, n + 0.3 * facing);
          float cov = edge * mix(1.0, lumps, smoke) * (1.0 - smoothstep(0.55, 1.0, vLife));
          gl_FragColor = vec4(col * cov, cov * smoke * 0.8);
        }`,
      transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
    });
    this.fire = new THREE.InstancedMesh(fireGeo, fireMat, FIRE_MAX);
    this.fire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fire.frustumCulled = false;
    this.fire.count = 0;
    this.fire.renderOrder = 3;
    this.fires = [];

    // ---- shockwave rings on the ground
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.ringLife = new THREE.InstancedBufferAttribute(new Float32Array(RING_MAX), 1);
    ringGeo.setAttribute('aLife', this.ringLife);
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aLife; varying float vLife; varying vec2 vUv;
        void main() { vLife = aLife; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float a = (1.0 - vLife) * (1.0 - vLife) * 0.9;
          gl_FragColor = vec4(vec3(2.2, 1.3, 0.6) * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.ring = new THREE.InstancedMesh(ringGeo, ringMat, RING_MAX);
    this.ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    this.rings = [];

    // ---- scorch marks: a dark, ragged radial stain that scrolls with the ground
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x / size - 0.5, dy = y / size - 0.5;
        const r = Math.hypot(dx, dy) * 2, a = Math.atan2(dy, dx);
        const ragged = 0.78 + 0.12 * Math.sin(a * 7 + 1.3) + 0.08 * Math.sin(a * 13 + 0.4);
        const k = Math.max(0, 1 - Math.pow(r / ragged, 2.2));
        const i = (y * size + x) * 4;
        data[i] = 20; data[i + 1] = 14; data[i + 2] = 10;
        const grain = Math.sin(x * 0.23 + 2 * Math.sin(y * 0.17)) * Math.sin(y * 0.29 + 1.5 * Math.sin(x * 0.13 + 1.7));
        data[i + 3] = Math.round(255 * k * (0.78 + 0.22 * grain));
      }
    }
    const scorchTex = new THREE.DataTexture(data, size, size);
    scorchTex.needsUpdate = true;
    scorchTex.magFilter = scorchTex.minFilter = THREE.LinearFilter;
    const scorchGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(scorchGeo, new THREE.MeshBasicMaterial({
      map: scorchTex, transparent: true, depthWrite: false, opacity: 0.8,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), SCORCH_MAX);
    this.scorch.frustumCulled = false;
    this.scorch.count = 0;
    this.scorches = [];

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    scene.add(this.fire, this.ring, this.scorch);
  }

  /** An explosion at (x, y): size ~0.5..2. ground: leave a ring and a scorch mark. */
  burst(x, y, size = 1, ground = true) {
    if (this.fires.length >= FIRE_MAX) this.fires.shift();
    this.fires.push({ x, y: y + 0.3 * size, z: 0, t: 0, life: 1.0 + 0.35 * size, r: 1.1 * size, seed: Math.random() * 10 });
    if (!ground || y > 2.5) return;
    if (this.rings.length >= RING_MAX) this.rings.shift();
    this.rings.push({ x, z: 0, t: 0, life: 0.45 + 0.1 * size, r: 4.5 * size });
    if (this.scorches.length >= SCORCH_MAX) this.scorches.shift();
    this.scorches.push({ x, z: (Math.random() - 0.5) * 0.6, s: 1.6 + 1.4 * size, rot: Math.random() * Math.PI * 2 });
  }

  /** hemi: the scene's hemisphere light, so smoke is lit like everything else (pale by day, dark at night). */
  update(dt, groundSpeed, time, hemi) {
    const u = this.fire.material.uniforms;
    u.uTime.value = time;
    if (hemi) u.uSmoke.value.copy(hemi.color).multiplyScalar(0.3 * hemi.intensity);
    const m = this._m, q = this._q, p = this._p, sc = this._s;
    let k = 0;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      f.x -= groundSpeed * dt * 0.6; // drags along a little behind the scrolling ground
      f.y += dt * (0.5 + 2.2 * (f.t / f.life)); // the smoke rises faster as it cools
      if (f.t >= f.life) this.fires.splice(i, 1);
    }
    for (const f of this.fires) {
      const life = f.t / f.life;
      const r = f.r * (0.35 + 0.8 * Math.pow(life, 0.4) + 0.35 * life);
      m.compose(p.set(f.x, f.y, f.z), q.identity(), sc.set(r, r * 0.9, r));
      this.fire.setMatrixAt(k, m);
      this.fireLife.array[k] = life;
      this.fireSeed.array[k] = f.seed;
      k++;
    }
    this.fire.count = k;
    this.fire.instanceMatrix.needsUpdate = this.fireLife.needsUpdate = this.fireSeed.needsUpdate = true;

    k = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      r.x -= groundSpeed * dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (const r of this.rings) {
      const life = r.t / r.life;
      const rr = r.r * (0.15 + 0.85 * Math.pow(life, 0.6));
      m.compose(p.set(r.x, 0.05, r.z), q.identity(), sc.set(rr, 1, rr));
      this.ring.setMatrixAt(k, m);
      this.ringLife.array[k] = life;
      k++;
    }
    this.ring.count = k;
    this.ring.instanceMatrix.needsUpdate = this.ringLife.needsUpdate = true;

    k = 0;
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.x -= groundSpeed * dt;
      if (s.x < -60) this.scorches.splice(i, 1);
    }
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    for (const s of this.scorches) {
      m.compose(p.set(s.x, 0.02, s.z), q.setFromAxisAngle(up, s.rot), sc.set(s.s, 1, s.s));
      this.scorch.setMatrixAt(k++, m);
    }
    this.scorch.count = k;
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.fires.length = this.rings.length = this.scorches.length = 0;
    this.fire.count = this.ring.count = this.scorch.count = 0;
  }
}
