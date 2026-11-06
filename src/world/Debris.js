// Instanced debris chunks for smashed obstacles: they fly, tumble, bounce on the sand and ride away with it.
import * as THREE from 'three';

const MAX = 220;

export class Debris {
  constructor(scene, tex) {
    // rubble chunks rather than cubes: a squashed, jagged low-poly stone
    const g = new THREE.IcosahedronGeometry(0.62, 0);
    const pos = g.attributes.position;
    // the geometry isn't indexed: each corner exists once per face, so the jitter is keyed on the
    // position (every copy of a corner moves the same way and the faces stay closed)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 0.72 + 0.45 * Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719));
      pos.setXYZ(i, x * k * 1.15, y * k * 0.8, z * k);
    }
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, normalMap: tex.rock.normalMap }),
      MAX,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** Bursts n chunks from (x, y) spread over a w×h area; color is a hex or THREE.Color. */
  burst(x, y, w, h, n, color, size = 0.3, power = 1) {
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      if (this.items.length >= MAX) this.items.shift();
      const s = size * (0.5 + Math.random());
      this.items.push({
        x: x + (Math.random() - 0.5) * w, y: y + Math.random() * h, z: (Math.random() - 0.5) * 1.2,
        vx: (2 + Math.random() * 8) * power, vy: (2 + Math.random() * 7) * power, vz: (Math.random() - 0.5) * 7 * power,
        rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14,
        sx: s * (0.6 + Math.random() * 0.8), sy: s * (0.5 + Math.random() * 0.7), sz: s * (0.6 + Math.random() * 0.8),
        r: this._c.r * (0.75 + Math.random() * 0.4), g: this._c.g * (0.75 + Math.random() * 0.4), b: this._c.b * (0.75 + Math.random() * 0.4),
        life: 2.2 + Math.random() * 1.2,
      });
    }
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }

  update(dt, speed) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const d = items[i];
      d.life -= dt;
      d.vy -= 22 * dt;
      d.x += (d.vx - speed) * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.rx += d.wx * dt;
      d.ry += d.wy * dt;
      const floor = d.sy * 0.5;
      if (d.y < floor) {
        // bounce, then settle and ride along with the ground
        d.y = floor;
        d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.35 : 0;
        d.vx *= 0.55;
        d.vz *= 0.55;
        d.wx *= 0.6;
        d.wy *= 0.6;
      }
      if (d.life <= 0 || d.x < -30) items.splice(i, 1);
    }
    const col = this.mesh.instanceColor;
    for (let i = 0; i < items.length; i++) {
      const d = items[i];
      const k = Math.min(1, d.life * 2); // shrink away at the end
      this._p.set(d.x, d.y, d.z);
      this._q.setFromEuler(this._e.set(d.rx, d.ry, 0));
      this._s.set(d.sx * k, d.sy * k, d.sz * k);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      col.setXYZ(i, d.r, d.g, d.b);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }
}
