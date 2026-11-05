// Camera rig that blends between the classic side-scrolling (2D) view and a third-person (3D) view.
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = '3d';
    this.blend = 1; // 0 = 2D, 1 = 3D (eased value)
    this.raw = 1;
    this.shakeAmp = 0;
    this.time = 0;
    this.followY = 0;
    this._p2 = new THREE.Vector3();
    this._t2 = new THREE.Vector3();
    this._p3 = new THREE.Vector3();
    this._t3 = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this.intro = 0; // 1 = cinematic orbit used on the title screen
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setMode(mode) {
    this.mode = mode;
  }

  toggle() {
    this.setMode(this.mode === '3d' ? '2d' : '3d');
    return this.mode;
  }

  shake(amount) {
    if (this.reducedMotion) return;
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount);
  }

  update(dt, { aspect, dragonY, speed, rage = 0 }) {
    this.time += dt;
    const target = this.mode === '3d' ? 1 : 0;
    const step = dt / 1.15;
    this.raw = target > this.raw ? Math.min(target, this.raw + step) : Math.max(target, this.raw - step);
    const b = (this.blend = ease(this.raw));

    this.followY += (dragonY - this.followY) * (1 - Math.exp(-6 * dt));
    const fy = this.followY;

    // 2D: telephoto side view, keeps ~22 units of track visible ahead of the dragon
    const fov2 = 28;
    const portrait = aspect < 1;
    const halfW = portrait ? 8.8 : 12.4;
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov2 / 2));
    const dist2 = Math.max(30, halfW / (tanH * aspect));
    const cx = portrait ? 4.6 : 7.9;
    // portrait screens have spare height: aim higher so the track sits lower and the sky gets the room
    const ty = portrait ? 4.2 : 2.55;
    this._p2.set(cx, ty + 0.95 + fy * 0.12, dist2);
    this._t2.set(cx, ty + fy * 0.12, 0);

    // 3D: over-the-shoulder chase cam
    const fov3 = aspect < 1 ? 64 : 50;
    const sway = Math.sin(this.time * 0.35) * 0.4;
    const speedPush = Math.min(1, speed / 24);
    if (portrait) {
      // narrow screens: sit further behind the dragon so it stays centred
      this._p3.set(-9.8 - speedPush * 1.2, 4.9 + fy * 0.45, 2.6 + sway * 0.5);
      this._t3.set(9.5, 1.6 + fy * 0.55, -0.4);
    } else {
      this._p3.set(-8.4 - speedPush * 1.2, 4.3 + fy * 0.45, 6.4 + sway);
      this._t3.set(9.5, 1.7 + fy * 0.55, -1.6);
    }

    // Kaiju Rage: the bigger dragon gets a wider, slightly pulled-back chase
    this._p3.x -= rage * 1.8;
    this._p3.y += rage * 1.1;

    const pos = this._pos.lerpVectors(this._p2, this._p3, b);
    const tgt = this._tgt.lerpVectors(this._t2, this._t3, b);
    // cinematic swoop while transitioning
    const mid = Math.sin(Math.PI * b);
    pos.y += mid * 5;
    pos.z += mid * 6;
    let fov = THREE.MathUtils.lerp(fov2, fov3, b) + rage * 4;

    // title screen: slow cinematic orbit around the dragon (front three-quarter view)
    const k = this.intro;
    if (k > 0.001) {
      const a = 0.55 + Math.sin(this.time * 0.11) * 0.55;
      const r = aspect < 1 ? 13 : 10;
      pos.lerp(this._p2.set(Math.cos(a) * r + 2, 2.1 + Math.sin(this.time * 0.17) * 0.3, Math.sin(a) * r + 3), k);
      tgt.lerp(this._t2.set(aspect < 1 ? 0.6 : -1.2, 1.75, 0), k);
      fov = THREE.MathUtils.lerp(fov, 42, k);
    }

    // shake
    this.shakeAmp *= Math.exp(-5 * dt);
    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp;
      pos.x += (Math.random() - 0.5) * s * 0.5;
      pos.y += (Math.random() - 0.5) * s * 0.5;
      tgt.y += (Math.random() - 0.5) * s * 0.3;
    }

    const cam = this.camera;
    cam.position.copy(pos);
    cam.fov = fov;
    cam.aspect = aspect;
    cam.near = 0.3;
    cam.far = 6000;
    cam.lookAt(tgt);
    cam.updateProjectionMatrix();
  }
}
