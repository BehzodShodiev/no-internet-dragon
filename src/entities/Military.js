// Army-stage vehicles and projectiles: tanks, attack helicopters, tank shells and missiles.
// Geometry and materials are built once and shared by every pooled instance.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sweep, mergeLoose, setVertexColor } from '../gfx/geometry.js';
import { bakeAOLater as bakeAO } from '../gfx/ao.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const part = (g, color, x = 0, y = 0, z = 0) => {
  g.translate(x, y, z);
  return setVertexColor(g, color);
};
const rbox = (w, h, d, r = 0.08, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
const cyl = (r0, r1, len, seg = 12) => new THREE.CylinderGeometry(r0, r1, len, seg);
const alongX = (g) => g.rotateZ(Math.PI / 2);
const alongZ = (g) => g.rotateX(Math.PI / 2);

export class Military {
  constructor(tex) {
    this.mats = {
      camo: new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.8, metalness: 0.18,
        normalMap: tex.rock.normalMap, normalScale: new THREE.Vector2(0.25, 0.25),
      }),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.06, metalness: 0.7 }),
      blur: new THREE.MeshBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      hot: new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: 0xff8a2a, emissiveIntensity: 8, roughness: 0.5 }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      beam: new THREE.MeshBasicMaterial({
        color: 0xfff1c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    };
    this._buildTank();
    this._buildHeli();
    this._buildProjectiles();
    this._buildStructures();
    // baked shading: corners and the base where things stand on the ground (flyers: their own corners only)
    for (const [g, ground] of [[this.towerGeo, true], [this.fuelGeo, true], [this.hedgehogGeo, true], [this.tankHull, true],
      [this.tankBarrel, false], [this.heliBody, false], [this.missileGeo, false]]) bakeAO(g, { ground });
  }

  // ------------------------------------------------------------------ outpost structures
  _buildStructures() {
    const wood = 0x7a5a3c, dark = 0x4a3826, steel = 0x55595e;
    // watchtower: four splayed legs, a cabin, a roof: far too tall to jump
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(cyl(0.07, 0.09, 3.1, 6).rotateZ(-0.08 * sx).rotateX(0.08 * sz), wood, 0.68 * sx, 1.5, 0.68 * sz));
    for (const y of [0.9, 2.0]) {
      parts.push(part(rbox(1.5, 0.06, 0.06, 0.02, 1), dark, 0, y, 0.7), part(rbox(1.5, 0.06, 0.06, 0.02, 1), dark, 0, y, -0.7));
      parts.push(part(rbox(0.06, 0.06, 1.5, 0.02, 1), dark, 0.7, y, 0), part(rbox(0.06, 0.06, 1.5, 0.02, 1), dark, -0.7, y, 0));
    }
    parts.push(part(rbox(1.8, 0.12, 1.8, 0.03), dark, 0, 3.05, 0)); // floor
    parts.push(part(rbox(1.7, 0.6, 1.7, 0.04), wood, 0, 3.4, 0)); // parapet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(cyl(0.05, 0.05, 0.8, 5), dark, 0.78 * sx, 4.05, 0.78 * sz));
    parts.push(part(new THREE.ConeGeometry(1.45, 0.65, 4).rotateY(Math.PI / 4), 0x5b4a36, 0, 4.75, 0)); // roof
    this.towerGeo = mergeLoose(parts);
    // fuel tank: banded cylinder on a plinth; goes up in a big fireball
    this.fuelGeo = mergeLoose([
      part(rbox(2.3, 0.3, 2.3, 0.06), 0x6e6e6e, 0, 0.15, 0),
      part(cyl(1.0, 1.0, 3.2, 28), 0xd9d4c7, 0, 1.9, 0),
      part(new THREE.SphereGeometry(1.0, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), 0xd9d4c7, 0, 3.5, 0),
      part(cyl(1.01, 1.01, 0.28, 28), 0xc0392b, 0, 1.2, 0),
      part(cyl(1.01, 1.01, 0.28, 28), 0xc0392b, 0, 2.6, 0),
      part(cyl(0.05, 0.05, 3.3, 5), steel, 1.05, 1.9, 0), // ladder rail
    ]);
    // Czech hedgehog: three crossed steel beams. Unsmashable: jump it.
    const beam = () => rbox(1.55, 0.13, 0.13, 0.02, 1);
    // one beam in hazard yellow and a red beacon on top, so it reads on a dark road
    this.hedgehogGeo = mergeLoose([
      part(beam().rotateZ(0.62).rotateY(0.3), 0xd8a91f, 0, 0.5, 0),
      part(beam().rotateZ(-0.62).rotateY(-0.3), steel, 0, 0.5, 0),
      part(beam().rotateY(Math.PI / 2).rotateX(0.62), steel, 0, 0.5, 0),
    ]);
    this.beaconGeo = new THREE.SphereGeometry(0.09, 10, 8).translate(0, 1.0, 0);
    this.mats.beacon = new THREE.MeshStandardMaterial({ color: 0x330505, emissive: 0xff2a1a, emissiveIntensity: 2, roughness: 0.4 });
  }

  makeStructure(kind) {
    const geo = kind === 'tower' ? this.towerGeo : kind === 'fuel' ? this.fuelGeo : this.hedgehogGeo;
    const m = new THREE.Mesh(geo, kind === 'hedgehog' ? this.mats.paint : this.mats.camo);
    m.castShadow = m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    if (kind === 'hedgehog') g.add(new THREE.Mesh(this.beaconGeo, this.mats.beacon));
    return g;
  }

  // ------------------------------------------------------------------ tank (faces -x, towards the dragon)
  _buildTank() {
    const tan = 0x8d7c56, dark = 0x5f5541, track = 0x2a2926, wheel = 0x46423a;
    const parts = [
      part(rbox(2.5, 0.48, 1.42, 0.12, 3), tan, 0, 0.62, 0), // hull
      part(rbox(0.75, 0.22, 1.38).rotateZ(0.45), tan, -1.22, 0.72, 0), // sloped glacis
      part(rbox(0.62, 0.06, 1.0, 0.02), dark, 1.0, 0.88, 0), // engine grille
      part(rbox(1.25, 0.42, 1.05, 0.14, 3), tan, 0.18, 1.08, 0), // turret
      part(rbox(0.32, 0.3, 0.5, 0.06), dark, -0.5, 1.06, 0), // gun mantlet
      part(cyl(0.18, 0.2, 0.1), dark, 0.42, 1.33, 0.25), // commander's hatch
      part(cyl(0.012, 0.012, 0.9, 4), dark, 0.62, 1.7, -0.36), // antenna
    ];
    for (const s of [1, -1]) {
      parts.push(part(rbox(2.8, 0.5, 0.34, 0.2, 3), track, 0, 0.26, 0.6 * s));
      for (let i = 0; i < 5; i++) parts.push(part(alongZ(cyl(0.17, 0.17, 0.06, 14)), wheel, -1.0 + i * 0.5, 0.25, 0.78 * s));
      parts.push(part(rbox(2.6, 0.08, 0.3, 0.03), dark, 0, 0.56, 0.6 * s)); // track guard
    }
    this.tankHull = mergeLoose(parts);
    this.tankBarrel = mergeLoose([
      part(alongX(cyl(0.055, 0.07, 1.5, 10)), dark, -0.75, 0, 0),
      part(alongX(cyl(0.09, 0.09, 0.26, 10)), dark, -0.62, 0, 0), // fume extractor
      part(alongX(cyl(0.085, 0.085, 0.16, 10)), dark, -1.44, 0, 0), // muzzle brake
    ]);
    this.flashGeo = new THREE.SphereGeometry(0.28, 12, 8);
  }

  makeTank() {
    const root = new THREE.Group();
    const hull = new THREE.Mesh(this.tankHull, this.mats.camo);
    hull.castShadow = hull.receiveShadow = true;
    const barrel = new THREE.Group();
    barrel.position.set(-0.6, 1.08, 0);
    const bm = new THREE.Mesh(this.tankBarrel, this.mats.camo);
    bm.castShadow = true;
    const flash = new THREE.Mesh(this.flashGeo, this.mats.flash.clone());
    flash.position.set(-1.6, 0, 0);
    flash.visible = false;
    barrel.add(bm, flash);
    root.add(hull, barrel);
    root.userData = { barrel, flash };
    return root;
  }

  // ------------------------------------------------------------------ attack helicopter (nose at -x)
  _buildHeli() {
    const olive = new THREE.Color(0x56603f), belly = new THREE.Color(0x7c8168), dark = 0x2f3427;
    const body = sweep({
      points: [V(-1.1, -0.05), V(-0.7, 0.02), V(0, 0.05), V(0.6, 0.1), V(1.3, 0.2), V(1.9, 0.28)],
      segments: 28, radial: 16,
      section: (t, a, out) => {
        const r = t < 0.1 ? 0.06 + t * 2.4 : t < 0.5 ? 0.3 : 0.3 * Math.max(0.22, 1 - (t - 0.5) * 1.9);
        out.x = Math.sin(a) * r * 0.75;
        out.y = Math.cos(a) * r * (t < 0.55 ? 1.05 : 0.8);
      },
      color: (t, a, out) => out.copy(olive).lerp(belly, Math.max(0, -Math.cos(a)) * 0.6),
      capStart: true, capEnd: true,
    });
    const parts = [
      body,
      part(rbox(0.8, 0.22, 0.42, 0.08), 0x56603f, 0.15, 0.33, 0), // engine hump
      part(cyl(0.05, 0.06, 0.2, 8), dark, 0.1, 0.5, 0), // rotor mast
      part(rbox(0.42, 0.06, 1.34, 0.03), dark, 0.05, -0.06, 0), // stub wings
      part(rbox(0.3, 0.46, 0.04, 0.02), 0x56603f, 1.86, 0.48, 0), // tail fin
      part(rbox(0.26, 0.03, 0.62, 0.01), dark, 1.52, 0.27, 0), // stabiliser
    ];
    for (const s of [1, -1]) {
      parts.push(part(alongX(cyl(0.085, 0.085, 0.5, 10)), dark, -0.02, -0.15, 0.6 * s)); // rocket pod
      parts.push(part(alongX(cyl(0.025, 0.025, 1.3, 6)), dark, -0.05, -0.42, 0.3 * s)); // skid
      for (const x of [-0.4, 0.3]) parts.push(part(cyl(0.018, 0.018, 0.3, 5).rotateX(0.35 * s), dark, x, -0.29, 0.25 * s));
    }
    this.heliBody = mergeLoose(parts);
    this.heliCanopy = new THREE.SphereGeometry(0.26, 18, 12).scale(1.45, 0.8, 0.85).translate(-0.55, 0.18, 0);
    const blades = [];
    for (let k = 0; k < 4; k++) blades.push(part(rbox(2.3, 0.025, 0.1, 0.01, 1).rotateY((k * Math.PI) / 2), 0x1e211b));
    this.heliRotor = mergeLoose(blades);
    this.heliDisc = new THREE.CircleGeometry(1.15, 36).rotateX(-Math.PI / 2);
    this.heliTail = mergeLoose([part(rbox(0.03, 0.5, 0.06, 0.01, 1), 0x1e211b), part(rbox(0.5, 0.03, 0.06, 0.01, 1), 0x1e211b)]);
    // searchlight cone: apex at the nose, opening forward and down
    this.heliBeam = new THREE.ConeGeometry(1.1, 5, 20, 1, true).translate(0, -2.5, 0).rotateZ(-0.62);
  }

  makeHeli() {
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.heliBody, this.mats.paint);
    body.castShadow = true;
    const canopy = new THREE.Mesh(this.heliCanopy, this.mats.glass);
    const rotor = new THREE.Group();
    rotor.position.set(0.1, 0.61, 0);
    const blades = new THREE.Mesh(this.heliRotor, this.mats.paint);
    blades.castShadow = true;
    rotor.add(blades, new THREE.Mesh(this.heliDisc, this.mats.blur));
    const tail = new THREE.Mesh(this.heliTail, this.mats.paint);
    tail.position.set(1.92, 0.38, 0.07);
    const beam = new THREE.Mesh(this.heliBeam, this.mats.beam.clone());
    beam.position.set(-1.08, -0.08, 0);
    beam.renderOrder = 2;
    root.add(body, canopy, rotor, tail, beam);
    root.userData = { rotor, tail, beam };
    return root;
  }

  // ------------------------------------------------------------------ shells and missiles (fly towards -x)
  _buildProjectiles() {
    this.shellGeo = alongX(new THREE.CapsuleGeometry(0.08, 0.34, 4, 10));
    const grey = 0xc9ccd0;
    const fins = [];
    for (let k = 0; k < 4; k++) fins.push(part(rbox(0.2, 0.02, 0.24, 0.005, 1).rotateX((k * Math.PI) / 2), 0x55595e, 0.33, 0, 0));
    this.missileGeo = mergeLoose([
      part(alongX(cyl(0.09, 0.09, 0.8, 14)), grey),
      part(new THREE.ConeGeometry(0.09, 0.24, 14).rotateZ(Math.PI / 2), grey, -0.52, 0, 0),
      part(alongX(cyl(0.092, 0.092, 0.06, 14)), 0xb3261e, -0.26, 0, 0), // warning band
      ...fins,
    ]);
    this.exhaustGeo = new THREE.SphereGeometry(0.1, 10, 8).scale(1.6, 1, 1);
  }

  makeShell() {
    const m = new THREE.Mesh(this.shellGeo, this.mats.hot);
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  makeMissile() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.missileGeo, this.mats.paint);
    body.castShadow = true;
    const flame = new THREE.Mesh(this.exhaustGeo, this.mats.hot);
    flame.position.x = 0.5;
    g.add(body, flame);
    return g;
  }
}
