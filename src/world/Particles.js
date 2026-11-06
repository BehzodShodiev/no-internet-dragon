// GPU point-sprite particle system (dust, sparks) + the atomic breath beam + footprint decals.
import * as THREE from 'three';

export class Particles {
  constructor(max, texture, { additive = false, lit = true } = {}) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max * 2);
    this.col = new Float32Array(max * 4);
    this.phys = new Float32Array(max * 3); // drag, gravity, scroll factor
    this.geometry = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.aPos);
    this.geometry.setAttribute('aSize', this.aSize);
    this.geometry.setAttribute('aColor', this.aColor);
    this.geometry.setDrawRange(0, 0);
    this.uniforms = {
      uMap: { value: texture },
      uScale: { value: 500 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec4 aColor;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.5, -mv.z);
          vColor = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uTint;
        varying vec4 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor.rgb * uTint, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.lit = lit;
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, gravity = 0, scroll = 1) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life;
    this.size[i * 2] = s0; this.size[i * 2 + 1] = s1;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.phys[i * 3] = drag; this.phys[i * 3 + 1] = gravity; this.phys[i * 3 + 2] = scroll;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    const copy = (arr, n) => { for (let k = 0; k < n; k++) arr[i * n + k] = arr[j * n + k]; };
    copy(this.pos, 3); copy(this.vel, 3); copy(this.size, 2); copy(this.col, 4); copy(this.phys, 3);
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
  }

  update(dt, worldSpeed) {
    const P = this.aPos.array, S = this.aSize.array, C = this.aColor.array;
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) this._kill(i);
    }
    for (let i = 0; i < this.count; i++) {
      const drag = Math.exp(-this.phys[i * 3] * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] -= this.phys[i * 3 + 1] * dt;
      this.pos[i * 3] += (this.vel[i * 3] - worldSpeed * this.phys[i * 3 + 2]) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.phys[i * 3 + 1] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      const t = this.life[i] / this.maxLife[i];
      P[i * 3] = this.pos[i * 3]; P[i * 3 + 1] = this.pos[i * 3 + 1]; P[i * 3 + 2] = this.pos[i * 3 + 2];
      S[i] = this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * t;
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      C[i * 4] = this.col[i * 4]; C[i * 4 + 1] = this.col[i * 4 + 1]; C[i * 4 + 2] = this.col[i * 4 + 2];
      C[i * 4 + 3] = this.col[i * 4 + 3] * fade * fade;
    }
    this.geometry.setDrawRange(0, this.count);
    if (this.count) {
      this.aPos.needsUpdate = this.aSize.needsUpdate = this.aColor.needsUpdate = true;
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, this.count * 3);
      this.aSize.clearUpdateRanges(); this.aSize.addUpdateRange(0, this.count);
      this.aColor.clearUpdateRanges(); this.aColor.addUpdateRange(0, this.count * 4);
    }
  }

  clear() {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }
}

/** Glowing beam for the atomic breath. Length is set every frame. */
export class BreathBeam {
  constructor() {
    const g = new THREE.CylinderGeometry(1, 1, 1, 24, 32, true);
    g.rotateZ(-Math.PI / 2);
    g.translate(0.5, 0, 0);
    this.uniforms = {
      uTime: { value: 0 }, uIntensity: { value: 0 }, uLen: { value: 10 },
      // breath colours (HDR), set by the dragon's skin: the outer flame and the white-hot core
      uColA: { value: new THREE.Vector3(0.1, 0.45, 1.6) }, uColB: { value: new THREE.Vector3(1.4, 2.2, 3.2) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uLen;
        varying vec2 vUv; varying float vView;
        void main() {
          vUv = uv;
          vec3 p = position;
          float along = p.x;
          // narrow where it leaves the jaws, then flaring out
          float r = mix(0.16, 1.0, smoothstep(0.0, 0.2, along));
          float wob = 1.0 + 0.18 * sin(along * uLen * 1.3 - uTime * 40.0) + 0.1 * sin(along * uLen * 3.1 + uTime * 23.0);
          p.yz *= r * wob;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec3 n = normalize(normalMatrix * normalize(vec3(0.0, position.y, position.z)));
          vView = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uIntensity;
        uniform vec3 uColA; uniform vec3 uColB;
        varying vec2 vUv; varying float vView;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          float along = vUv.y;
          float n = noise(vec2(vUv.x * 10.0, along * 30.0 - uTime * 28.0));
          n = 0.5 * n + 0.5 * noise(vec2(vUv.x * 22.0, along * 70.0 - uTime * 50.0));
          // pow(0, y) can yield NaN on D3D (ANGLE) at the silhouette, so keep the base positive
          float vv = clamp(vView, 1e-4, 1.0);
          // the sheath carries the skin's breath colour; only a narrow core runs white-hot (a wide hot
          // core tone-maps every breath to the same pale white)
          float core = smoothstep(0.72, 1.0, vv);
          float edge = pow(vv, 0.7);
          vec3 c = uColA * (0.55 + 0.9 * n) * 2.6 + uColB * core * (0.8 + 0.4 * n) * 2.4;
          float a = edge * (0.45 + 0.55 * n) * smoothstep(1.0, 0.85, along) * uIntensity;
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    this.light = new THREE.PointLight(0x55bbff, 0, 28, 2);
  }

  /** Breath colours from a skin: beam = [outer, core] HDR rgb. */
  setColors(beam) {
    this.uniforms.uColA.value.set(...beam[0]);
    this.uniforms.uColB.value.set(...beam[1]);
    const [r, g, b] = beam[0]; // the light takes the sheath's colour (the core is near white for every skin)
    const m = Math.max(r, g, b);
    this.light.color.setRGB(r / m, g / m, b / m);
  }

  set(from, length, radius, intensity, time, angle = -0.06) {
    const m = this.mesh;
    m.visible = intensity > 0.01;
    m.position.copy(from);
    m.scale.set(length, radius, radius);
    m.rotation.z = angle;
    this.uniforms.uTime.value = time;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uLen.value = length;
    this.light.position.set(from.x + Math.min(length, 8) * 0.5, from.y + 0.6, from.z + 1.2);
    this.light.intensity = intensity * 40;
  }
}

/** Instanced footprint decals that ride along with the ground. */
export class Footprints {
  constructor(texture, max = 48) {
    const g = new THREE.PlaneGeometry(0.62, 0.62);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, opacity: 0.32, color: 0x3a2412,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.max = max;
    this.items = [];
    this._m = new THREE.Matrix4();
  }

  add(x, z) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, z });
  }

  update(dt, speed) {
    const m = this._m;
    let k = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.x -= speed * dt;
      if (it.x < -60) { this.items.splice(i, 1); continue; }
    }
    for (const it of this.items) {
      m.makeTranslation(it.x, 0.015, it.z);
      this.mesh.setMatrixAt(k++, m);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}
