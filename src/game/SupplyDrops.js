// Supply drops: now and then a crate parachutes onto the track. Run through it, smash it or burn it to
// open it. MAGNET pulls in every crystal ahead for 10 s, ATOMIC CORE fills the breath, RAGE SHARD adds half
// a Rage meter. Crates never hurt and never block, and they come from their own seeded stream
// (hash32(seed, 3000)), so a seeded run replays the same drops and the obstacle sequence is untouched.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32, hash32 } from '../gfx/noise.js';

export const POWERUPS = {
  magnet: { label: 'MAGNET', sub: 'Crystals fly to you for 10 s', color: 0x3ff0c0 },
  core: { label: 'ATOMIC CORE', sub: 'Breath fully charged', color: 0x4aa2ff },
  rage: { label: 'RAGE SHARD', sub: '+50% Kaiju Rage', color: 0xff6a35 },
};
const KINDS = Object.keys(POWERUPS);
const SKY_Y = 24;
const FALL = 7.5; // parachute descent, units a second
const PARK = new THREE.Vector3(0, -200, 0); // where the crate waits, still "visible" so it compiles at load

export class SupplyDrops {
  constructor(scene) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b6a43, roughness: 0.82, metalness: 0 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xece4d2, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });

    this.crate = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.1, 1.3, 2, 0.08), wood);
    body.position.y = 0.55;
    body.castShadow = true;
    // glowing bands in the power-up's colour, and a beacon on top
    const bands = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.16, 1.36), this.glowMat);
    bands.position.y = 0.55;
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.glowMat);
    beacon.position.y = 1.5;
    this.beacon = beacon;
    // the parachute: a shallow dome on four lines, dropped when the crate lands
    this.chute = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), canopyMat);
    canopy.position.y = 3.6;
    this.chute.add(canopy);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const top = new THREE.Vector3(x * 2.4, 3.65, z * 2.4), bot = new THREE.Vector3(x, 1.1, z);
      const len = top.distanceTo(bot);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), lineMat);
      line.position.copy(top).add(bot).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
      this.chute.add(line);
    }
    this.crate.add(body, bands, beacon, this.chute);
    this.crate.position.copy(PARK);
    scene.add(this.crate);
    this.drop = null;
    this.reset(1);
  }

  reset(seed) {
    this.rand = mulberry32(hash32(seed >>> 0, 3000));
    this.t = 0;
    this.nextT = 22 + this.rand() * 10; // the first drop comes a little into the run
    this.drop = null;
    this.crate.position.copy(PARK);
  }

  /** obstacles: the active list (a crate lands clear of anything static). */
  update(dt, speed, running, obstacles, time) {
    if (running) this.t += dt;
    if (running && !this.drop && this.t >= this.nextT) {
      this.nextT = this.t + 34 + this.rand() * 22;
      const kind = KINDS[Math.floor(this.rand() * KINDS.length)];
      // it scrolls with the ground while it falls, so it lands where it starts relative to the obstacles
      let x = 30 + this.rand() * 8 + speed * ((SKY_Y - 0.1) / FALL);
      for (let k = 0; k < 8 && obstacles.some((o) => !o.vx && Math.abs(o.x - x) < 3.5); k++) x += 2.5;
      this.drop = { kind, x, y: SKY_Y, landed: false, taken: false };
      this.glowMat.color.set(POWERUPS[kind].color).multiplyScalar(2.2);
    }
    const d = this.drop;
    if (!d) return;
    d.x -= speed * dt;
    if (!d.landed) {
      d.y -= FALL * dt;
      if (d.y <= 0) { d.y = 0; d.landed = true; }
    }
    this.chute.visible = !d.landed;
    this.crate.position.set(d.x, d.y, 0);
    this.crate.rotation.z = d.landed ? 0 : Math.sin(time * 2.3) * 0.08; // swinging under the canopy
    this.beacon.rotation.y = time * 3;
    this.beacon.position.y = 1.5 + Math.sin(time * 4) * 0.12;
    if (d.x < -20) this.clear();
  }

  clear() {
    this.drop = null;
    this.crate.position.copy(PARK);
  }
}
