// Crystal shards: small glowing crystals the Kaiju's prism beam throws off along its length and splashes
// where it hits. Pooled in one instanced mesh; additive, in the beam's spark colour (HDR, so they bloom).
import * as THREE from 'three';

export class Shards {
  constructor(max = 160) {
    const g = new THREE.OctahedronGeometry(0.11, 0);
    g.scale(0.7, 1.9, 0.7);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.max = max;
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** rgb: the skin's spark colour (HDR). */
  setColor([r, g, b]) {
    this.mat.color.setRGB(r * 0.8, g * 0.8, b * 0.8);
  }

  /** One shard. gravity pulls it down; ground: it rides with the ground (scrolls with the run). */
  emit(x, y, z, vx, vy, vz, life, size, gravity = 0, ground = false) {
    if (this.items.length >= this.max) this.items.shift();
    const r = Math.random;
    this.items.push({
      x, y, z, vx, vy, vz, life, size, gravity, ground, t: 0,
      ax: r() * 6, ay: r() * 6, wx: (r() - 0.5) * 16, wy: (r() - 0.5) * 16,
    });
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  update(dt, speed) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const s = it[i];
      s.t += dt;
      if (s.t >= s.life) { it.splice(i, 1); continue; }
      s.vy -= s.gravity * dt;
      s.x += (s.vx - (s.ground ? speed : 0)) * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.05 && s.vy < 0) { s.y = 0.05; s.vy *= -0.3; s.vx *= 0.5; s.vz *= 0.5; }
      s.ax += s.wx * dt;
      s.ay += s.wy * dt;
    }
    const m = this._m;
    for (let i = 0; i < it.length; i++) {
      const s = it[i];
      const k = s.t / s.life;
      const sc = s.size * Math.min(1, s.t * 12) * (1 - k * k);
      this._p.set(s.x, s.y, s.z);
      this._q.setFromEuler(this._e.set(s.ax, s.ay, 0));
      m.compose(this._p, this._q, this._s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
