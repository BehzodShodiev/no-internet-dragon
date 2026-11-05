// Radiation crystals: instanced pickups that ride with the ground and feed the combo chain and the rage meter.
import * as THREE from 'three';

const MAX = 96;
const R = 0.5; // pickup radius: generous, so a well-timed jump always collects a whole arc

export class Crystals {
  constructor(scene) {
    const g = new THREE.OctahedronGeometry(0.24, 0);
    g.scale(0.8, 1.6, 0.8);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x9fffe0, emissive: 0x2dffb0, emissiveIntensity: 3.4, roughness: 0.15, metalness: 0.1, flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  add(x, y) {
    if (this.items.length < MAX) this.items.push({ x, y, t: Math.random() * 6 });
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  /**
   * Moves crystals with the ground and tests them against the dragon's hitboxes.
   * Calls onPick(item) for each one collected and onMiss(item) for each that slips behind the dragon.
   * magnet (0..1) pulls nearby crystals in, during Kaiju Rage.
   */
  update(dt, speed, boxes, n, { magnet = 0, onPick, onMiss } = {}) {
    let rear = Infinity;
    for (let i = 0; i < n; i++) rear = Math.min(rear, boxes[i][0]);
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const c = items[i];
      c.x -= speed * dt;
      c.t += dt;
      if (magnet > 0 && c.x < 9 && c.x > rear - 1) {
        const k = 1 - Math.exp(-dt * 9 * magnet);
        c.x += (0.6 - c.x) * k;
        c.y += (1.6 - c.y) * k;
      }
      let hit = false;
      if (n && c.x < 4 && c.x > rear - R) {
        for (let j = 0; j < n && !hit; j++) {
          const b = boxes[j];
          const dx = Math.max(b[0] - c.x, 0, c.x - b[2]);
          const dy = Math.max(b[1] - c.y, 0, c.y - b[3]);
          hit = dx * dx + dy * dy < R * R;
        }
      }
      if (hit) {
        items.splice(i, 1);
        onPick?.(c);
      } else if (n && c.x < rear - R) {
        items.splice(i, 1);
        onMiss?.(c);
      } else if (c.x < -30) {
        items.splice(i, 1);
      }
    }
    const m = this._m;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      this._p.set(c.x, c.y + 0.08 * Math.sin(c.t * 3), 0);
      this._q.setFromEuler(this._e.set(0, c.t * 2.2, 0.15 * Math.sin(c.t * 1.7)));
      m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
