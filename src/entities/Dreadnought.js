// The Dreadnought: Night City's ground boss, an original armoured land battleship on two tracks that
// reverses up the road ahead of the monster. It has a ram blade in hazard stripes, a turret with a long
// cannon and two missile racks, a sensor mast with a red eye and a laser in its nose.
// Its attacks, one at a time, each telegraphed (BossBase WARN_TIME, the ram RAM.warn):
//   missile volleys from the racks (jump the low ones, duck the high ones, smash to bat them back),
//   a cannon shot into the road that sends a shockwave rolling at you (jump),
//   a laser sweep at head height from the nose (duck, and hold it until the beam is gone),
//   a ram: it charges with the blade (smash it as it arrives to PARRY: a hit point and a knock-back).
// Breath, batted-back missiles and parries all hurt it. Phase 2 (half health): shockwaves come in pairs
// and it rests less between attacks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeLoose, setVertexColor } from '../gfx/geometry.js';
import { BossBase, WARN_TIME, MISSILE_LOW, MISSILE_MID } from './BossBase.js';

const S = 1.15; // model scale
const BLADE = 4.15 * S; // the ram blade's front edge, ahead of its centre
const NOSE = 3.0 * S; // the laser in the nose
export const LASER_Y = 1.95; // head height: duck it
const LASER = { sweep: 48, hold: 0.45, reach: -6 }; // tip speed (units/s), seconds held at full length, where the tip stops
export const RAM = { warn: 1.0, speed: 24, recoil: 0.9 };
const SHOCK_GAP = 0.95; // two shockwaves: a full jump and a landing fit between them
const VOLLEYS = [['L'], ['M'], ['L', 'M'], ['M', 'L'], ['L', 'M', 'L'], ['M', 'L', 'M']];
const ATTACKS = [['missiles', 3], ['shock', 2], ['laser', 2], ['ram', 2]];
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const part = (g, color, x = 0, y = 0, z = 0) => setVertexColor(g.translate(x, y, z), color);
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cylX = (r, len, seg = 14) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylZ = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/** The shockwave's model (for Obstacles): a glowing ridge of broken road rolling at you. */
export function makeShock() {
  const g = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 0.62, 1.7),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.32, 0.4, 1.3),
    new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const rubble = [];
  for (let i = 0; i < 9; i++) {
    const s = 0.12 + ((i * 37) % 10) / 60;
    rubble.push(part(new THREE.DodecahedronGeometry(s, 0), 0x3a3633, 0.25 - ((i * 13) % 7) / 10, s * 0.6, -1.4 + i * 0.35));
  }
  const rock = new THREE.Mesh(mergeLoose(rubble), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  g.add(glow, core, rock);
  g.userData = { glow, core };
  return g;
}

export class Dreadnought extends BossBase {
  constructor(scene) {
    super();
    this.id = 'dreadnought';
    this.noun = 'dreadnought';
    this.sound = 'treads';
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.5 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff2a1a, emissiveIntensity: 1.5, roughness: 0.4 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x302a20, emissive: 0xffe2a8, emissiveIntensity: 2.2, roughness: 0.3 });
    this.markMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffa020, emissiveIntensity: 2.5, roughness: 0.4 });
    this.group = this._build();
    this.group.scale.setScalar(S);
    this.group.visible = false;
    scene.add(this.group);
    this.fx = this._buildFx();
    scene.add(this.fx);
    this.mode = 'idle'; // idle | ram | recoil
    this.beam = null;
    this.wheelSpin = 0;
  }

  _build() {
    const steel = 0x75828f, dark = 0x404850, rubber = 0x1c1d20, hazard = 0xd9a11c, black = 0x161616;
    const root = new THREE.Group();
    const parts = [];
    // tracks: rubber belts with treads, fenders on top
    for (const z of [-1.3, 1.3]) {
      parts.push(part(rbox(7.0, 1.1, 0.82, 0.42), rubber, 0, 0.6, z));
      for (let i = 0; i < 16; i++) {
        const x = -3.3 + i * 0.44;
        parts.push(part(new THREE.BoxGeometry(0.22, 0.09, 0.86), 0x2b2d31, x, 1.17, z));
        parts.push(part(new THREE.BoxGeometry(0.22, 0.09, 0.86), 0x2b2d31, x, 0.04, z));
      }
      parts.push(part(rbox(7.3, 0.22, 1.02, 0.06), steel, 0, 1.3, z));
      parts.push(part(rbox(1.1, 0.5, 0.06, 0.03), dark, -2.6, 1.05, z * 1.32)); // side armour skirts
      parts.push(part(rbox(1.1, 0.5, 0.06, 0.03), dark, 2.6, 1.05, z * 1.32));
    }
    // hull: a side profile with a sloped glacis, extruded across
    const prof = new THREE.Shape();
    prof.moveTo(3.4, 1.0); prof.lineTo(3.4, 2.3); prof.lineTo(-1.7, 2.45); prof.lineTo(-3.2, 1.6); prof.lineTo(-3.0, 1.0); prof.lineTo(3.4, 1.0);
    const hull = new THREE.ExtrudeGeometry(prof, { depth: 2.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 4 });
    hull.translate(0, 0, -1.15);
    parts.push(setVertexColor(hull, steel));
    parts.push(part(rbox(0.9, 0.12, 0.9, 0.04), dark, 0.9, 2.5, -0.6)); // hatch
    parts.push(part(rbox(4.2, 0.06, 0.08, 0.02), dark, 0.6, 2.42, 1.0)); // panel lines
    parts.push(part(rbox(4.2, 0.06, 0.08, 0.02), dark, 0.6, 2.42, -1.0));
    // exhaust stacks
    for (const z of [-0.7, 0.7]) parts.push(part(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 12), dark, 3.0, 2.75, z));
    // nose: the laser housing and two headlamps
    parts.push(part(cylX(0.24, 0.5, 16), dark, -2.62, LASER_Y / S, 0));
    // ram blade: a plate leaning forward, hazard stripes, teeth along the bottom, two hydraulic arms
    const blade = new THREE.Group();
    const bl = [part(rbox(0.28, 1.5, 3.5, 0.06), hazard, 0, 0, 0)];
    for (let i = -3; i <= 3; i++) bl.push(part(new THREE.BoxGeometry(0.04, 0.26, 1.9).rotateX(0.85), black, -0.15, 0, i * 0.5));
    for (let i = 0; i < 7; i++) bl.push(part(new THREE.ConeGeometry(0.1, 0.28, 6).rotateZ(Math.PI / 2 + 0.3), 0x8a8f96, -0.22, -0.72, -1.5 + i * 0.5));
    for (const z of [-1.0, 1.0]) bl.push(part(cylX(0.08, 1.0, 10).rotateZ(-0.35), 0x8a8f96, 0.6, 0.15, z));
    const bladeMesh = new THREE.Mesh(mergeLoose(bl), this.mat);
    bladeMesh.castShadow = true;
    blade.add(bladeMesh);
    blade.position.set(-3.75, 1.0, 0);
    blade.rotation.z = -0.18;
    root.add(blade);
    this.blade = blade;
    const body = new THREE.Mesh(mergeLoose(parts), this.mat);
    body.castShadow = true;
    root.add(body);
    const lamps = new THREE.Mesh(mergeLoose([0.85, -0.85].map((z) => new THREE.SphereGeometry(0.12, 10, 8).translate(-3.05, 1.35, z))), this.lampMat);
    // amber marker lamps along both fenders, so its length reads at night
    const marks = [];
    for (const z of [-1.82, 1.82]) for (let i = 0; i < 5; i++) marks.push(new THREE.BoxGeometry(0.22, 0.08, 0.04).translate(-2.8 + i * 1.4, 1.3, z));
    root.add(new THREE.Mesh(mergeLoose(marks), this.markMat));
    root.add(lamps);
    // road wheels, instanced so each spins on its own axle
    const wheel = mergeLoose([
      part(cylZ(0.42, 0.2, 18), 0x22252a),
      part(cylZ(0.26, 0.24, 14), 0x5d6670),
      part(cylZ(0.08, 0.3, 8), 0x2b3138),
    ]);
    this.wheels = new THREE.InstancedMesh(wheel, this.mat, 12);
    this.wheelPos = [];
    for (const z of [-1.74, 1.74]) for (let i = 0; i < 6; i++) this.wheelPos.push(new THREE.Vector3(-2.75 + i * 1.1, 0.52, z));
    root.add(this.wheels);
    // turret: it turns a little toward the monster; the cannon pitches down for the shockwave shot
    const turret = new THREE.Group();
    turret.position.set(0.5, 2.45, 0);
    const tp = [
      part(rbox(2.9, 1.0, 2.2, 0.28), steel, 0, 0.5, 0),
      part(rbox(0.7, 0.8, 1.1, 0.12), dark, -1.55, 0.5, 0), // mantlet
      part(rbox(1.0, 0.18, 0.8, 0.06), dark, 0.5, 1.05, 0.4), // commander's hatch
    ];
    // missile racks with 2x3 tubes each
    for (const z of [-1.45, 1.45]) {
      tp.push(part(rbox(1.35, 0.85, 0.6, 0.08), dark, 0.1, 0.75, z));
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) tp.push(part(cylX(0.1, 0.08, 10), 0x0d0f12, -0.6, 0.55 + r * 0.38, z - 0.18 + c * 0.18));
    }
    // sensor mast with the eye
    tp.push(part(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 8), dark, 1.0, 1.6, -0.5));
    tp.push(part(rbox(0.75, 0.38, 0.55, 0.1), steel, 1.0, 2.35, -0.5));
    tp.push(part(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), 0x1a1a1a, 1.3, 2.9, -0.7)); // antenna
    const tm = new THREE.Mesh(mergeLoose(tp), this.mat);
    tm.castShadow = true;
    turret.add(tm);
    const glowParts = [new THREE.SphereGeometry(0.13, 12, 10).translate(0.6, 2.35, -0.5)]; // the eye
    for (const z of [-1.45, 1.45]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) glowParts.push(new THREE.SphereGeometry(0.06, 8, 6).translate(-0.64, 0.55 + r * 0.38, z - 0.18 + c * 0.18));
    turret.add(new THREE.Mesh(mergeLoose(glowParts), this.glowMat));
    const cannon = new THREE.Group();
    cannon.position.set(-1.85, 0.5, 0);
    const cm = new THREE.Mesh(mergeLoose([
      part(cylX(0.17, 3.6, 16), 0x3a424b, -1.8, 0, 0),
      part(cylX(0.22, 0.9, 16), dark, -0.4, 0, 0), // breech sleeve
      part(rbox(0.5, 0.32, 0.46, 0.06), dark, -3.75, 0, 0), // muzzle brake
    ]), this.mat);
    cm.castShadow = true;
    cannon.add(cm);
    turret.add(cannon);
    root.add(turret);
    this.turret = turret;
    this.cannon = cannon;
    // the laser lens in the nose glows with the eye
    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10).translate(-2.9, LASER_Y / S, 0), this.glowMat));
    this.root = root;
    return root;
  }

  /** The laser and its aiming line live in the world (not the model), so they stay on the track in 3D. */
  _buildFx() {
    const fx = new THREE.Group();
    const unit = (r, seg) => new THREE.CylinderGeometry(r, r, 1, seg, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0); // spans x -1..0
    const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamCore = new THREE.Mesh(unit(0.06, 8), add(0xfff4f0, 1));
    this.beamGlow = new THREE.Mesh(unit(0.2, 12), add(0xff2a2a, 0.55));
    this.aimLine = new THREE.Mesh(unit(0.025, 6), add(0xff3030, 0.5));
    for (const m of [this.beamCore, this.beamGlow, this.aimLine]) { m.frustumCulled = false; m.visible = false; fx.add(m); }
    return fx;
  }

  box(out) {
    out[0] = this.x - BLADE; out[1] = 0.2; out[2] = this.x + 3.5 * S; out[3] = 3.6 * S;
    return out;
  }

  front() {
    return this.x - BLADE;
  }

  title(levelId, n) {
    return `DREADNOUGHT MK-${n}`;
  }

  _start(cycle, home) {
    this.hp = this.maxHp = 6 + cycle;
    this.cool = 1.0;
    this.mode = 'idle';
    this.count = 0;
    this.sinceRam = 0;
    this.last = null;
    this.ram = null;
    this._endBeam();
    this.hx = this._homeX(home);
    this.x = this.hx + 30;
    this.y = 2.4; // what the breath aims at (the model stays on the ground)
    this.turret.position.y = 2.45;
    this.turret.rotation.set(0, 0, 0);
    this.cannon.rotation.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  _homeX(home) {
    return Math.max(home.x + 1, 13.5);
  }

  reset() {
    super.reset();
    this._endBeam();
    this.aimLine.visible = false;
    this.mode = 'idle';
  }

  _place() {
    this.group.position.set(this.x, 0, 0);
  }

  _enter(k, time, ctx) {
    this.group.rotation.y = ctx.yaw * 0.35;
    this.x = this.hx + 30 * (1 - ease(k));
    this.root.rotation.z = 0.03 * Math.sin(time * 9) * (1 - k);
    if (Math.random() < 0.5) ctx.smoke(this.x + 3.4 * S, 3.3 * S);
  }

  _fightPose(dt, time, ctx) {
    this.hx = this._homeX(ctx.home);
    this.group.rotation.y = ctx.yaw * 0.35;
    if (this.mode === 'ram') {
      const o = this.ram;
      if (o && !o.dead && o.x > -20) this.x = o.x + BLADE - 1;
      else { this.mode = 'recoil'; this.recoilT = 0; this.recoilFrom = this.x; this.flinch = 1; this.ram = null; }
    } else if (this.mode === 'recoil') {
      this.recoilT += dt;
      this.x = this.recoilFrom + (this.hx - this.recoilFrom) * ease(this.recoilT / RAM.recoil);
      if (this.recoilT >= RAM.recoil) this.mode = 'idle';
    } else {
      this.x = this.hx + Math.sin(time * 0.5) * 0.4 + this.flinch * 0.9;
    }
    // engine judder, a jolt when hit
    this.root.rotation.z = 0.012 * Math.sin(time * 23) + this.flinch * 0.06;
  }

  _ready() {
    return this.mode === 'idle';
  }

  _attack() {
    const rand = this.rand || Math.random;
    const rest = Math.max(0.9, 1.5 - 0.15 * this.cycle) * (this.phase === 2 ? 0.8 : 1);
    let kind;
    if (this.count === 0) kind = 'missiles'; // opens with something everyone knows
    else if (this.sinceRam >= 3) kind = 'ram'; // and rams at least every fourth attack
    else {
      let total = 0;
      for (const [k, w] of ATTACKS) if (k !== this.last) total += w;
      let r = rand() * total;
      for (const [k, w] of ATTACKS) {
        if (k === this.last) continue;
        if ((r -= w) <= 0) { kind = k; break; }
      }
      kind ||= 'missiles';
    }
    this.count++;
    this.sinceRam = kind === 'ram' ? 0 : this.sinceRam + 1;
    this.last = kind;
    if (kind === 'missiles') {
      const v = VOLLEYS[Math.floor(rand() * (this.cycle <= 1 ? 4 : VOLLEYS.length))];
      const gap = Math.max(0.78, 0.9 - 0.04 * this.cycle);
      v.forEach((k, i) => this.queue.push({ t: WARN_TIME + i * gap, y: k === 'L' ? MISSILE_LOW : MISSILE_MID, kind: 'missile' }));
      this.cool = WARN_TIME + v.length * gap + rest;
    } else if (kind === 'shock') {
      const n = this.phase === 2 ? 2 : 1;
      for (let i = 0; i < n; i++) this.queue.push({ t: WARN_TIME + i * SHOCK_GAP, y: 0.3, kind: 'shock' });
      this.cool = WARN_TIME + (n - 1) * SHOCK_GAP + 0.7 + rest;
    } else if (kind === 'laser') {
      this.queue.push({ t: WARN_TIME, y: LASER_Y, kind: 'beam' });
      this.cool = WARN_TIME + LASER.hold + 0.45 + rest;
    } else {
      this.queue.push({ t: RAM.warn, warn: RAM.warn, y: 2.2, kind: 'smash' });
      this.cool = RAM.warn + rest; // and it waits until it has recovered (_ready)
    }
  }

  _fire(s, ctx) {
    if (s.kind === 'missile') {
      ctx.fire(s.y, this.x + 0.6 * S, 3.25 * S);
      this.turret.position.y = 2.45 - 0.05;
    } else if (s.kind === 'shock') {
      // the cannon pitches into the road just ahead of the blade
      const x0 = this.x - BLADE - 0.4;
      ctx.shock(x0, this.x - 5.5 * S, 2.6 * S);
      this.kick = 1;
      this.hold = 1.1;
    } else if (s.kind === 'beam') {
      this.beam = { t: 0, o: ctx.beam(this.x - NOSE, LASER_Y) };
      this.hold = 1.0;
    } else if (s.kind === 'smash') {
      this.mode = 'ram';
      this.ram = ctx.ram(this.x - BLADE + 1, RAM.speed);
    }
  }

  _endBeam() {
    if (this.beam?.o) this.beam.o.dead = true;
    this.beam = null;
    if (this.beamCore) this.beamCore.visible = this.beamGlow.visible = false;
  }

  _afterUpdate(dt, time, ctx) {
    // wheels turn with the road (it reverses at the monster's speed)
    this.wheelSpin += (dt * (ctx.speed || 10)) / (0.42 * S);
    const m = this._m || (this._m = new THREE.Matrix4());
    const q = this._q || (this._q = new THREE.Quaternion());
    const one = this._one || (this._one = new THREE.Vector3(1, 1, 1));
    const zAxis = this._z || (this._z = new THREE.Vector3(0, 0, 1));
    q.setFromAxisAngle(zAxis, this.wheelSpin);
    for (let i = 0; i < this.wheelPos.length; i++) this.wheels.setMatrixAt(i, m.compose(this.wheelPos[i], q, one));
    this.wheels.instanceMatrix.needsUpdate = true;
    // turret settles after a launch; the cannon pitches down while a shockwave is aimed and kicks back on the shot
    this.turret.position.y += (2.45 - this.turret.position.y) * Math.min(1, dt * 8);
    const aimingShock = this.queue.some((s) => s.kind === 'shock' && s.t < WARN_TIME);
    this.kick = Math.max(0, (this.kick || 0) - dt * 4);
    const pitch = aimingShock ? 0.42 : this.kick > 0 ? 0.42 - this.kick * 0.25 : 0;
    this.cannon.rotation.z += (pitch - this.cannon.rotation.z) * Math.min(1, dt * 10);
    this.cannon.position.x = -1.85 + this.kick * 0.35;
    // the ram blade lowers while it winds up; the eye and the lens flare while anything is aimed
    const ramming = this.mode === 'ram' || this.queue.some((s) => s.kind === 'smash');
    this.blade.position.y += ((ramming ? 0.82 : 1.0) - this.blade.position.y) * Math.min(1, dt * 8);
    const aiming = this.queue.length || this.beam ? 1 : 0;
    this.glowMat.emissiveIntensity = 1.5 + aiming * (5 + 3 * Math.sin(time * 30));
    if (ramming && Math.random() < dt * 30) ctx.smoke(this.x + 3.0 * S, 3.4 * S);
    // laser: the aiming line during its warning, then the beam sweeps out from the nose and holds
    const nose = this.x - NOSE;
    const aimBeam = this.queue.find((s) => s.kind === 'beam' && s.t < WARN_TIME);
    this.aimLine.visible = !!aimBeam && this.state === 'fight';
    if (this.aimLine.visible) {
      this.aimLine.position.set(nose, LASER_Y, 0);
      this.aimLine.scale.set(nose - LASER.reach, 1, 1);
      this.aimLine.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 28));
    }
    if (this.beam) {
      const b = this.beam;
      b.t += dt;
      const len = Math.min(b.t * LASER.sweep, nose - LASER.reach);
      const full = (nose - LASER.reach) / LASER.sweep;
      const o = b.o;
      if (o) { o.x = nose - len; o.boxes[0][2] = len; }
      const flick = 0.85 + 0.15 * Math.sin(time * 60);
      for (const mesh of [this.beamCore, this.beamGlow]) {
        mesh.visible = true;
        mesh.position.set(nose, LASER_Y, 0);
        mesh.scale.set(Math.max(0.01, len), flick, flick);
      }
      if (b.t > full + LASER.hold || this.state !== 'fight') this._endBeam();
    }
  }

  _die() {
    this._endBeam();
    this.aimLine.visible = false;
    if (this.ram) { this.ram.dead = true; this.ram = null; }
    this.mode = 'idle';
    this.turretV = 6;
  }

  _dying(dt, ctx) {
    // it rolls on, burning; the turret is blown off and tumbles; then the hull goes up
    this.x += dt * 3;
    this.turretV -= 14 * dt;
    this.turret.position.y = Math.max(2.45, this.turret.position.y + this.turretV * dt);
    this.turret.rotation.z += dt * 2.5;
    this.turret.rotation.x += dt * 1.3;
    this.root.rotation.z = -0.05 - this.t * 0.03;
    if (Math.random() < dt * 16) ctx.smoke(this.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 3);
    if (Math.random() < dt * 5) ctx.blast(this.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, 0.6);
    if (this.t > 2.3) {
      ctx.blast(this.x, 1.6, 2.0);
      return true;
    }
    return false;
  }
}
