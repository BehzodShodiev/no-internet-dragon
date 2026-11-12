// Contact shadows: a soft dark patch on the ground under the monster and under everything standing on the
// track, so things look planted even where the sun's shadow map is soft, faint or (on Very Low) absent.
// One instanced draw of the soft-dot texture, refreshed every frame.
import * as THREE from 'three';

const MAX = 48;

export class ContactShadows {
  constructor(scene, dot) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, map: dot, transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  /** A patch centred at ground (x, z), sx by sz, faded by k (0..1: lighter as things leave the ground). */
  add(x, z, sx, sz, k = 1) {
    if (this.n >= MAX || k <= 0.02) return;
    this._p.set(x, 0.03, z);
    this._s.set(sx * (0.7 + 0.3 * k), 1, sz * (0.7 + 0.3 * k));
    this.mesh.setMatrixAt(this.n++, this._m.compose(this._p, this._q, this._s));
  }

  end(strength = 1) {
    this.mesh.count = this.n;
    this.mesh.material.opacity = 0.42 * strength;
    if (this.n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
