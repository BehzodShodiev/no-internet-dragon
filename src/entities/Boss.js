// The gunship boss: flies in, hovers ahead of the monster and fires telegraphed missile volleys.
// Breath and batted-back missiles bring it down. The shared boss machinery is in BossBase.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sweep, mergeLoose, setVertexColor } from '../gfx/geometry.js';
import { BossBase, WARN_TIME, MISSILE_LOW, MISSILE_MID } from './BossBase.js';

export { WARN_TIME, MISSILE_LOW, MISSILE_MID };

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const part = (g, color, x = 0, y = 0, z = 0) => setVertexColor(g.translate(x, y, z), color);
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, r);
const cylX = (r, len, seg = 14) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
// L = low (jump), M = head height (duck). Later cycles unlock the longer volleys.
const VOLLEYS = [['L'], ['M'], ['L', 'M'], ['M', 'L'], ['L', 'L'], ['M', 'L', 'M'], ['L', 'M', 'L']];
// Phase 2 (at half health), one move per level (LEVELS bossMove):
//   'volleys' the long mixed volleys from the first gunship on, 'strafe' a chin-gun burst at head height
//   (one duck held through STRAFE rounds), 'mines' bombs dropped onto the track ahead (jump the craters).
export const STRAFE = { rounds: 4, gap: 0.14 };
const MINE_GAP = 0.95; // between two mines: a full jump and a landing fit between their craters
const MINE_CLEAR = 2.1; // after the last mine drops, nothing else is aimed until its crater has passed
const NAMES = { 1: 'GUNSHIP', 2: 'CITY GUNSHIP', 3: 'INFERNO GUNSHIP' };

export class Gunship extends BossBase {
  constructor(scene, tex) {
    super();
    this.id = 'gunship';
    this.noun = 'gunship';
    this.sound = 'rotor';
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.42, metalness: 0.55,
      normalMap: tex.rock.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
    });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff2a1a, emissiveIntensity: 1.5, roughness: 0.4 });
    this.glass = new THREE.MeshStandardMaterial({ color: 0x141d26, roughness: 0.05, metalness: 0.75 });
    this.blur = new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    this.group = this._build();
    this.group.scale.setScalar(1.2);
    this.group.visible = false;
    scene.add(this.group);
  }

  _build() {
    const gun = new THREE.Color(0x3a3f45), belly = new THREE.Color(0x5b6168);
    const sp = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
    const hull = sweep({
      points: [V(-2.7, -0.1), V(-2.1, 0), V(-0.8, 0.05), V(0.8, 0.1), V(2.0, 0.25), V(2.8, 0.45)],
      segments: 36, radial: 20,
      section: (t, a, out) => {
        const r = t < 0.12 ? 0.18 + t * 4.6 : t < 0.7 ? 0.75 : 0.75 - (t - 0.7) * 1.5;
        out.x = sp(Math.sin(a), 0.6) * r * 0.82; // squared-off, armoured section
        out.y = sp(Math.cos(a), 0.6) * r * 0.9;
      },
      color: (t, a, out) => out.copy(gun).lerp(belly, Math.max(0, -Math.cos(a)) * 0.7),
      capStart: true, capEnd: true,
    });
    const dark = 0x23272b;
    const parts = [
      hull,
      part(rbox(0.9, 0.5, 0.62, 0.12), 0x3a3f45, -1.7, 0.78, 0), // front rotor pylon
      part(rbox(1.0, 0.6, 0.62, 0.12), 0x3a3f45, 1.95, 1.05, 0), // rear rotor pylon
      part(rbox(1.0, 0.12, 3.6, 0.05), dark, 0.1, -0.28, 0), // stub wings
      part(new THREE.SphereGeometry(0.26, 14, 10), dark, -2.05, -0.62, 0), // chin turret
      part(cylX(0.05, 0.8, 8), dark, -2.45, -0.66, 0), // chin gun
    ];
    for (const s of [1, -1]) {
      parts.push(part(cylX(0.24, 1.25), dark, 0.25, 0.78, 0.48 * s)); // engines
      parts.push(part(cylX(0.2, 1.1), 0x2c3035, 0.1, -0.48, 1.15 * s)); // missile pods
      parts.push(part(cylX(0.2, 1.1), 0x2c3035, 0.1, -0.48, 1.62 * s));
      parts.push(part(rbox(0.5, 0.36, 0.08, 0.03), 0x30353a, -0.9, -0.05, 0.69 * s)); // door armour
    }
    const root = new THREE.Group();
    const body = new THREE.Mesh(mergeLoose(parts), this.mat);
    body.castShadow = true;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14).scale(1.5, 0.7, 1).translate(-2.0, 0.28, 0), this.glass);
    // pod muzzles and the sensor eye glow red; they flare while a volley is being aimed
    const tips = [];
    for (const s of [1, -1]) for (const z of [1.15, 1.62]) tips.push(new THREE.SphereGeometry(0.15, 10, 8).translate(-0.47, -0.48, z * s));
    tips.push(new THREE.SphereGeometry(0.09, 10, 8).translate(-2.68, -0.08, 0));
    const glow = new THREE.Mesh(mergeLoose(tips), this.glowMat);
    root.add(body, canopy, glow);
    this.rotors = [];
    for (const [x, y] of [[-1.7, 1.08], [1.95, 1.4]]) {
      const r = new THREE.Group();
      r.position.set(x, y, 0);
      const blades = [];
      for (let k = 0; k < 3; k++) blades.push(setVertexColor(new RoundedBoxGeometry(2.1, 0.04, 0.2, 1, 0.015).translate(1.05, 0, 0).rotateY((k * Math.PI * 2) / 3), 0x1b1e21));
      const bm = new THREE.Mesh(mergeLoose(blades), this.mat);
      bm.castShadow = true;
      r.add(bm, new THREE.Mesh(new THREE.CircleGeometry(2.15, 40).rotateX(-Math.PI / 2), this.blur));
      root.add(r);
      this.rotors.push(r);
    }
    return root;
  }

  /** World-space box the breath has to reach. */
  box(out) {
    out[0] = this.x - 2.6; out[1] = this.y - 0.9; out[2] = this.x + 2.6; out[3] = this.y + 0.9;
    return out;
  }

  title(levelId, n) {
    return `${NAMES[levelId] || 'GUNSHIP'} MK-${n}`;
  }

  /** opts.move: its phase-2 move ('volleys' | 'strafe' | 'mines'). */
  _start(cycle, home, opts) {
    this.move = opts.move || 'volleys';
    this.lastMove = false;
    this.hp = this.maxHp = 4 + cycle;
    this.cool = 0.8; // opens fire almost as soon as it's in position
    this.x = home.x + 32;
    this.y = home.y + 9;
  }

  _enter(k, time, ctx) {
    this._spin(ctx);
    const e = ease(k);
    this.x = this.home.x + 32 * (1 - e);
    this.y = this.home.y + 9 * (1 - e);
    this.group.rotation.z = 0.25 * (1 - e); // nose down while it closes in
  }

  _fightPose(dt, time, ctx) {
    this._spin(ctx);
    this.x = this.home.x + Math.sin(time * 0.6) * 0.6 + this.flinch * 1.2;
    this.y = this.home.y + Math.sin(time * 1.3) * 0.25 + this.flinch * 0.5;
    this.group.rotation.z = Math.sin(time * 0.9) * 0.04 - this.flinch * 0.25;
  }

  /** yaw turns it partly side-on, so the chase camera sees its profile rather than its nose. */
  _spin(ctx) {
    this.group.rotation.y = ctx.yaw;
  }

  _afterUpdate(dt, time) {
    for (const r of this.rotors) r.rotation.y += dt * 26;
    // pods glow while a volley is being aimed
    const aiming = this.queue.length ? 1 : 0;
    this.glowMat.emissiveIntensity = 1.5 + aiming * (5 + 3 * Math.sin(time * 30));
  }

  _fire(s, ctx) {
    if (s.kind === 'mine') { ctx.drop(this.x - 0.6, this.y - 0.7); this.hold = MINE_CLEAR; }
    else if (s.kind === 'strafe') ctx.shoot(s.y, this.x - 2.6, this.y - 0.65);
    else ctx.fire(s.y, this.x - 0.5, this.y - 0.5);
  }

  _die() {
    this.vy = 1.5;
  }

  _dying(dt, ctx) {
    // spin out, trailing smoke, and crash
    const g = this.group;
    this.vy -= 9 * dt;
    this.y = Math.max(0.6, this.y + this.vy * dt);
    this.x += dt * 2.5;
    g.rotation.y += dt * (2 + this.t * 3);
    g.rotation.z = -0.3 - this.t * 0.2;
    if (Math.random() < dt * 14) ctx.smoke(this.x + (Math.random() - 0.5) * 3, this.y + Math.random());
    if (Math.random() < dt * 4) ctx.blast(this.x + (Math.random() - 0.5) * 3, this.y, 0.5);
    if (this.t > 2.3 || this.y <= 0.6) {
      ctx.blast(this.x, this.y, 1.6);
      return true;
    }
    return false;
  }

  _attack() {
    const rand = this.rand || Math.random;
    const rest = Math.max(0.9, 1.5 - 0.15 * this.cycle);
    const p2 = this.phase === 2;
    // phase 2: its level's move every other attack (never twice running, never mixed with missiles)
    if (p2 && this.move !== 'volleys' && !this.lastMove) {
      this.lastMove = true;
      if (this.move === 'strafe') {
        // one warning, then a burst at head height: a single duck held through it
        for (let i = 0; i < STRAFE.rounds; i++) this.queue.push({ t: WARN_TIME + i * STRAFE.gap, y: MISSILE_MID, kind: 'strafe', quiet: i > 0 });
        this.cool = WARN_TIME + STRAFE.rounds * STRAFE.gap + rest;
      } else {
        const n = this.cycle >= 1 ? 2 : 1;
        for (let i = 0; i < n; i++) this.queue.push({ t: WARN_TIME + i * MINE_GAP, y: 0.4, kind: 'mine' });
        this.cool = WARN_TIME + (n - 1) * MINE_GAP + MINE_CLEAR;
      }
      return;
    }
    this.lastMove = false;
    const pool = this.cycle === 0 && !p2 ? 4 : VOLLEYS.length; // phase 2 brings the long volleys early
    const v = VOLLEYS[Math.floor(rand() * pool)];
    const gap = Math.max(0.78, 0.9 - 0.04 * this.cycle); // between launches; full jumps still fit between low missiles
    v.forEach((k, i) => this.queue.push({ t: WARN_TIME + i * gap, y: k === 'L' ? MISSILE_LOW : MISSILE_MID, kind: 'missile' }));
    this.cool = WARN_TIME + v.length * gap + rest;
  }
}
