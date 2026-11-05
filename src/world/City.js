// City biome: a skyline that rolls in behind the track, a road under the dragon, and the buildings and
// cars that line it (smashable obstacles, built here and spawned by Obstacles).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeLoose, setVertexColor } from '../gfx/geometry.js';

const part = (g, color, x = 0, y = 0, z = 0) => setVertexColor(g.translate(x, y, z), color);
const SKYLINE_MAX = 48;
const ROAD_HALF = 3.2; // the terrain is flat for |z| < 3.5
const LAMP_GAP = 14; // street lamps along the far kerb; the road shader paints their light pools
const LAMP_MAX = 16;

/**
 * Facade material: windows are drawn procedurally from each object's own (scaled) coordinates, so every
 * building, of any size, gets evenly spaced windows that light up at night. Works on instanced meshes too.
 */
function facadeMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0.05 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFLocal;\nvarying vec3 vFN;\nvarying float vFSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 fM = modelMatrix;
        #ifdef USE_INSTANCING
          fM = modelMatrix * instanceMatrix;
        #endif
        vec3 fO = (fM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vFLocal = (fM * vec4(position, 1.0)).xyz - fO;
        vFN = normalize(mat3(fM) * normal);
        vFSeed = fO.z * 7.13;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vFLocal;
        varying vec3 vFN;
        varying float vFSeed;
        float fHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fSide = 1.0 - step(0.6, abs(vFN.y));
        vec2 fUV = vec2(abs(vFN.x) > 0.5 ? vFLocal.z : vFLocal.x, vFLocal.y) / vec2(1.1, 1.3);
        vec2 fCell = floor(fUV);
        vec2 fF = fract(fUV);
        float fWin = fSide * step(0.2, fF.x) * step(fF.x, 0.8) * step(0.3, fF.y) * step(fF.y, 0.82) * step(1.0, vFLocal.y);
        float fLit = step(0.5, fHash(vec3(fCell, vFSeed)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.1, 0.13), fWin);
        diffuseColor.rgb *= 1.0 - 0.45 * step(0.6, vFN.y);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, fWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.76, 0.45) * fWin * fLit * uNight * 1.8;`);
  };
  return m;
}

export class City {
  constructor(scene) {
    this.uniforms = { uNight: { value: 0 } };
    this.facade = facadeMaterial(this.uniforms);
    this.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45 });
    this.glass = new THREE.MeshStandardMaterial({ color: 0x16202a, roughness: 0.05, metalness: 0.8 });
    this.sign = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff3d7f, emissiveIntensity: 0.4, roughness: 0.5 });
    this.lightsMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3, 3, 3), toneMapped: true });
    this._buildBuildings();
    this._buildCars();
    this._buildSkyline(scene);
    this._buildRoad(scene);
    this._buildLamps(scene);
    this.active = false;
  }

  // ------------------------------------------------------------------ street lamps
  _buildLamps(scene) {
    const pole = mergeLoose([
      part(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), 0x2e3236, 0, 2.6, 0),
      part(new RoundedBoxGeometry(0.1, 0.1, 2.0, 1, 0.03), 0x2e3236, 0, 5.15, 1.0),
    ]);
    this.lampPoles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), LAMP_MAX);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc77a, emissiveIntensity: 0.2 });
    this.lampHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.14, 0.32).translate(0, 5.08, 1.85), this.lampMat, LAMP_MAX);
    for (const m of [this.lampPoles, this.lampHeads]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.lampPoles.castShadow = true;
  }

  // ------------------------------------------------------------------ buildings in the dragon's path
  _buildBuildings() {
    const walls = [0xd8cbb4, 0xc9a98a, 0xb7bcc2, 0xe2d5c0, 0xa88f7a];
    const v = [];
    // shop with an awning and a rooftop sign
    v.push({
      w: 2.8, h: 3.9, d: 2.6, sign: true,
      geo: (c) => mergeLoose([
        part(new THREE.BoxGeometry(2.8, 3.9, 2.6), c, 0, 1.95, 0),
        part(new RoundedBoxGeometry(0.6, 0.08, 2.7, 1, 0.03).rotateZ(-0.25), 0xb3261e, -1.6, 1.55, 0),
        part(new THREE.BoxGeometry(2.9, 0.18, 2.7), 0x8a8a8a, 0, 3.95, 0),
      ]),
    });
    // house with a pitched roof
    v.push({
      w: 2.6, h: 4.4, d: 2.4,
      geo: (c) => {
        // triangular prism, ridge along z, so the gable faces the side-on 2D camera
        const roof = new THREE.CylinderGeometry(1, 1, 2.6, 3, 1).rotateX(-Math.PI / 2).scale(1.5, 0.87, 1);
        return mergeLoose([part(new THREE.BoxGeometry(2.6, 3.1, 2.4), c, 0, 1.55, 0), part(roof, 0x6e3b2c, 0, 3.535, 0)]);
      },
    });
    // apartment block with a water tank
    v.push({
      w: 3.0, h: 5.4, d: 2.8,
      geo: (c) => mergeLoose([
        part(new THREE.BoxGeometry(3.0, 4.9, 2.8), c, 0, 2.45, 0),
        part(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 12), 0x5a4a3a, 0.6, 5.15, 0.4),
        part(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x333333, 0.6, 4.95, 0.4),
      ]),
    });
    this.buildingVariants = [];
    v.forEach((b, i) => walls.forEach((c, k) => {
      if ((i + k) % 2) this.buildingVariants.push({ ...b, geometry: b.geo(c) });
    }));
    this.signGeo = new THREE.BoxGeometry(1.6, 0.5, 0.08);
  }

  makeBuilding(rand) {
    const v = this.buildingVariants[Math.floor(rand() * this.buildingVariants.length)];
    const g = new THREE.Group();
    const m = new THREE.Mesh(v.geometry, this.facade);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (v.sign) {
      const s = new THREE.Mesh(this.signGeo, this.sign);
      s.position.set(-0.4, 4.35, 0);
      s.rotation.y = Math.PI / 2;
      g.add(s);
    }
    g.userData = { w: v.w, h: v.h };
    return g;
  }

  // ------------------------------------------------------------------ cars
  _buildCars() {
    const colors = [0xc62828, 0x1565c0, 0xf9a825, 0xeeeeee, 0x2e7d32, 0x37474f];
    this.carVariants = colors.map((c) => {
      const parts = [
        part(new RoundedBoxGeometry(2.2, 0.55, 1.1, 2, 0.12), c, 0, 0.5, 0),
        part(new RoundedBoxGeometry(1.2, 0.48, 1.0, 2, 0.12), c, 0.15, 0.95, 0),
      ];
      for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) parts.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 14).rotateX(Math.PI / 2), 0x1c1c1c, x, 0.22, z));
      return mergeLoose(parts);
    });
    this.carGlass = new RoundedBoxGeometry(1.24, 0.3, 1.04, 2, 0.08).translate(0.15, 1.0, 0);
    // headlights face the dragon (-x), tail lights the other way: they keep cars readable at night
    const lamp = () => new THREE.BoxGeometry(0.06, 0.12, 0.22);
    this.carLights = mergeLoose([
      part(lamp(), 0xfff4d6, -1.11, 0.58, 0.34), part(lamp(), 0xfff4d6, -1.11, 0.58, -0.34),
      part(lamp(), 0xff2a1a, 1.11, 0.6, 0.36), part(lamp(), 0xff2a1a, 1.11, 0.6, -0.36),
    ]);
  }

  makeCar(rand) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.carVariants[Math.floor(rand() * this.carVariants.length)], this.paint);
    body.castShadow = true;
    g.add(body, new THREE.Mesh(this.carGlass, this.glass), new THREE.Mesh(this.carLights, this.lightsMat));
    return g;
  }

  // ------------------------------------------------------------------ skyline behind the track
  _buildSkyline(scene) {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    setVertexColor(g, 0xffffff);
    this.sky = new THREE.InstancedMesh(g, this.facade, SKYLINE_MAX);
    this.sky.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sky.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SKYLINE_MAX * 3), 3);
    this.sky.frustumCulled = false;
    this.sky.count = 0;
    scene.add(this.sky);
    this.towers = [];
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
    this.rand = Math.random;
  }

  _spawnTower(x) {
    const tones = [0x9aa3ad, 0xc2b8a8, 0x7d8894, 0xb0a490, 0x8c96a0, 0xd0c8bb];
    const near = Math.random() < 0.45;
    this.towers.push({
      x,
      z: near ? -(24 + Math.random() * 22) : -(52 + Math.random() * 60),
      w: 5 + Math.random() * 9,
      d: 5 + Math.random() * 8,
      h: near ? 9 + Math.random() * 18 : 18 + Math.random() * 45,
      c: tones[Math.floor(Math.random() * tones.length)],
    });
  }

  // ------------------------------------------------------------------ road
  _buildRoad(scene) {
    const g = new THREE.PlaneGeometry(1, ROAD_HALF * 2).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
    this.roadUniforms = { uScroll: { value: 0 }, uNight: this.uniforms.uNight };
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.roadUniforms);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uScroll;\nuniform float uNight;\nvarying vec3 vRW;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float rx = vRW.x + uScroll;
          float az = abs(vRW.z);
          float edge = step(${(ROAD_HALF - 0.45).toFixed(2)}, az) * step(az, ${(ROAD_HALF - 0.3).toFixed(2)});
          float dash = step(az, 0.08) * step(0.5, fract(rx / 4.0));
          float grain = fract(sin(dot(floor(vec2(rx, vRW.z) * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.9 + 0.2 * grain;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.82, 0.7), max(edge, dash));
          // pools of street light under each lamp
          float ld = (fract(rx / ${LAMP_GAP.toFixed(1)} + 0.5) - 0.5) * ${LAMP_GAP.toFixed(1)};
          float pool = exp(-ld * ld / 14.0) * exp(-pow(vRW.z + 1.6, 2.0) / 9.0) * uNight;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * pool * 0.28;`);
    };
    this.road = new THREE.Mesh(g, mat);
    this.road.position.y = 0.015;
    this.road.receiveShadow = true;
    this.road.visible = false;
    scene.add(this.road);
    this.roadX0 = Infinity; // the road's near and far ends, riding with the ground
    this.roadX1 = -Infinity;
  }

  /** Turn the city on (it rolls in from the horizon) or off (it rolls away behind the dragon). */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on && this.roadX1 < -40) this.roadX0 = 125;
    if (!on) this.roadX1 = Math.min(this.roadX1, 125); // the road ends just past the horizon
  }

  reset() {
    this.active = false;
    this.towers.length = 0;
    this.sky.count = 0;
    this.roadX0 = Infinity;
    this.roadX1 = -Infinity;
    this.road.visible = false;
    this.lampPoles.count = this.lampHeads.count = 0;
  }

  /** Builds the whole city at once (for the title-screen preview and the start of the city level). */
  prefill() {
    this.active = true;
    this.roadX0 = -40;
    this.roadX1 = 420;
    this.towers.length = 0;
    for (let x = -90; x < 320; x += 6 + Math.random() * 12) this._spawnTower(x);
  }

  update(dt, speed, scroll, night) {
    this.uniforms.uNight.value = night;
    this.sign.emissiveIntensity = 0.4 + 2.6 * night;
    this.lampMat.emissiveIntensity = 0.2 + 5 * night;
    // road: extend it while the city is on, let it scroll away when it's off
    this.roadX0 -= speed * dt;
    this.roadX1 = this.active ? 420 : this.roadX1 - speed * dt;
    const x0 = Math.max(this.roadX0, -40), x1 = Math.min(this.roadX1, 420);
    this.road.visible = x1 > x0;
    if (this.road.visible) {
      this.road.position.x = x0;
      this.road.scale.x = x1 - x0;
    }
    this.roadUniforms.uScroll.value = scroll % 4004;
    // street lamps where the road is, in step with the light pools painted on it
    let n = 0;
    if (this.road.visible) {
      const off = (scroll % 4004) % LAMP_GAP;
      for (let x = -off - LAMP_GAP * 3; x < Math.min(x1, 160) && n < LAMP_MAX; x += LAMP_GAP) {
        if (x < x0) continue;
        this._p.set(x, 0, -4.4);
        this._s.set(1, 1, 1);
        this._m.compose(this._p, this._q, this._s);
        this.lampPoles.setMatrixAt(n, this._m);
        this.lampHeads.setMatrixAt(n, this._m);
        n++;
      }
    }
    this.lampPoles.count = this.lampHeads.count = n;
    this.lampPoles.instanceMatrix.needsUpdate = this.lampHeads.instanceMatrix.needsUpdate = true;
    // skyline
    const t = this.towers;
    for (let i = t.length - 1; i >= 0; i--) {
      t[i].x -= speed * dt;
      if (t[i].x + t[i].w < -120) t.splice(i, 1);
    }
    if (this.active) {
      let far = -Infinity;
      for (const tw of t) far = Math.max(far, tw.x);
      if (far === -Infinity) far = 220; // first towers appear out in the haze and roll in
      while (far < 320 && t.length < SKYLINE_MAX) {
        far += 6 + Math.random() * 12;
        this._spawnTower(far);
      }
    }
    for (let i = 0; i < t.length; i++) {
      const tw = t[i];
      this._p.set(tw.x, -2, tw.z); // sunk a little so dunes never leave one floating
      this._s.set(tw.w, tw.h, tw.d);
      this._m.compose(this._p, this._q, this._s);
      this.sky.setMatrixAt(i, this._m);
      this._c.set(tw.c);
      this.sky.instanceColor.setXYZ(i, this._c.r, this._c.g, this._c.b);
    }
    this.sky.count = t.length;
    this.sky.instanceMatrix.needsUpdate = true;
    this.sky.instanceColor.needsUpdate = true;
  }
}
