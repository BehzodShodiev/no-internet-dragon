// Sky, sun/moon lighting, stars, clouds, fog and image-based lighting with a day/night cycle.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from '../gfx/noise.js';
import { makeCloudTexture, makeMoonTexture } from '../gfx/textures.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

// --- CPU port of three's Sky (Preetham) shader, used to colour the fog to match the horizon ---
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
// scratch for skyColor (it runs twice a frame; nothing is allocated)
const _betaR = [0, 0, 0], _betaM = [0, 0, 0], _res = [0, 0, 0];
const SKY_FLOOR = [0, 0.0003, 0.00075];
// constant colours used by update() (read-only)
const C_SUN_DAY = new THREE.Color(1.0, 0.93, 0.84);
const C_GROUND_DAY = new THREE.Color(0.55, 0.4, 0.28);
const C_CLOUD_DUSK = new THREE.Color(0.75, 0.42, 0.46);
const C_CLOUD_NIGHT = new THREE.Color(0.06, 0.08, 0.13);
const C_CLOUD_ASH = new THREE.Color(0.2, 0.08, 0.06);
const UP = new THREE.Vector3(0, 1, 0);

function skyColor(dir, sunDir, p, out) {
  const EE = 1000, cutoff = 1.6110731556870734, steep = 1.5;
  const zc = Math.max(-1, Math.min(1, sunDir.y));
  const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoff - Math.acos(zc)) / steep)));
  const c = 0.2 * p.turbidity * 10e-18;
  const betaR = _betaR, betaM = _betaM;
  for (let i = 0; i < 3; i++) {
    betaR[i] = totalRayleigh[i] * p.rayleigh;
    betaM[i] = 0.434 * c * MieConst[i] * p.mieCoefficient;
  }
  const zenith = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zenith) + 0.15 * Math.pow(93.885 - (zenith * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = dir.x * sunDir.x + dir.y * sunDir.y + dir.z * sunDir.z;
  const rc = cosT * 0.5 + 0.5;
  const rPhase = 0.05968310365946075 * (1 + rc * rc);
  const g = p.mieDirectionalG, g2 = g * g;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const horizonMix = Math.min(1, Math.max(0, Math.pow(1 - sunDir.y, 5)));
  const res = _res;
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM));
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * horizonMix;
    const L0 = 0.1 * Fex;
    const tex = (Lin + L0) * 0.04 + SKY_FLOOR[i];
    res[i] = Math.pow(tex, 1 / 2.4);
  }
  return out.setRGB(res[0], res[1], res[2], THREE.LinearSRGBColorSpace);
}

// Twilight ramp, keyed by sun elevation in degrees (descending). Above the first key the
// day values (derived from the sky model) take over.
const TWI_KEYS = [12, 2, -2, -6, -11];
const TWI_SKY = [[0.6, 0.66, 0.8], [0.85, 0.55, 0.55], [0.55, 0.42, 0.65], [0.26, 0.3, 0.6], [0.14, 0.2, 0.42]].map((c) => new THREE.Color(...c));
const TWI_GROUND = [[0.4, 0.3, 0.2], [0.32, 0.2, 0.14], [0.18, 0.13, 0.14], [0.08, 0.08, 0.12], [0.05, 0.05, 0.08]].map((c) => new THREE.Color(...c));
const TWI_HEMI_I = [0.42, 0.75, 0.95, 0.9, 0.72];
const TWI_EXPOSURE = [0.5, 0.58, 0.7, 0.8, 0.82];

function keyed(x, keys, vals) {
  if (x >= keys[0]) return vals[0];
  for (let i = 0; i < keys.length - 1; i++) {
    if (x >= keys[i + 1]) return vals[i] + (vals[i + 1] - vals[i]) * smooth(keys[i], keys[i + 1], x);
  }
  return vals[vals.length - 1];
}

function keyedColor(x, keys, cols, out) {
  if (x >= keys[0]) return out.copy(cols[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    if (x >= keys[i + 1]) return out.copy(cols[i]).lerp(cols[i + 1], smooth(keys[i], keys[i + 1], x));
  }
  return out.copy(cols[cols.length - 1]);
}

// CPU mirror of the twilight sky blended into the Sky shader (used for the fog colour).
function twilightSky(dir, sunDir, deep, glow, out) {
  const up = Math.max(dir.y, 0);
  const hz = Math.pow(1 - up, 4);
  const z0 = 0.05 + (0.006 - 0.05) * deep, z1 = 0.09 + (0.011 - 0.09) * deep, z2 = 0.22 + (0.03 - 0.22) * deep;
  const h0 = 0.24 + (0.03 - 0.24) * deep, h1 = 0.18 + (0.045 - 0.18) * deep, h2 = 0.32 + (0.085 - 0.32) * deep;
  const dl = Math.hypot(dir.x, dir.z) || 1, sl = Math.hypot(sunDir.x, sunDir.z) || 1;
  const az = Math.max(0, (dir.x * sunDir.x + dir.z * sunDir.z) / (dl * sl));
  const g1 = Math.pow(az, 4) * Math.exp(-up * 8) * glow;
  const g2 = Math.pow(az, 1.5) * Math.exp(-up * 4) * glow * 0.35;
  return out.setRGB(
    z0 + (h0 - z0) * hz + 0.95 * g1 + 0.5 * g2,
    z1 + (h1 - z1) * hz + 0.4 * g1 + 0.25 * g2,
    z2 + (h2 - z2) * hz + 0.16 * g1 + 0.35 * g2,
    THREE.LinearSRGBColorSpace
  );
}

export class Environment {
  /** noiseTex: the shared tileable fbm texture (textures.makeNoiseTexture) for clouds and the Milky Way. */
  constructor(renderer, scene, noiseTex) {
    this.renderer = renderer;
    this.scene = scene;
    this.params = { turbidity: 2.4, rayleigh: 1.8, mieCoefficient: 0.0014, mieDirectionalG: 0.88 };

    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    const u = this.sky.material.uniforms;
    for (const k of Object.keys(this.params)) u[k].value = this.params[k];
    u.uNight = { value: 0 };
    u.uDeep = { value: 0 };
    u.uGlow = { value: 0 };
    u.uVolc = { value: 0 };
    u.uCity = { value: 0 };
    // procedural clouds (lit by the sun, scrolling with the run), the Milky Way, shooting stars
    u.uSkyGain = { value: 1 }; // the visible sky's brightness (mirrored in the fog colour)
    u.uNoise = { value: noiseTex };
    u.uCloudOff = { value: new THREE.Vector2() };
    u.uCloudCover = { value: 0.45 };
    u.uCloudLit = { value: new THREE.Color(1, 1, 1) };
    u.uCloudShade = { value: new THREE.Color(0.6, 0.62, 0.7) };
    u.uStreakA = { value: new THREE.Vector3(0, 1, 0) };
    u.uStreakB = { value: new THREE.Vector3(0, 1, 0) };
    u.uStreak = { value: 0 };
    this.streak = { t: 8, life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() };
    // biome blend: 0..1 weights for the volcano's ember sky and the city's light pollution
    this.biome = { volc: 0, city: 0, tVolc: 0, tCity: 0 };
    // Three's Preetham sky turns muddy black around sunset. Blend in a twilight sky instead:
    // blue hour with a sunset glow on the sun's side, deepening into navy night (mirrored by twilightSky()).
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float mieDirectionalG;', `uniform float mieDirectionalG;
        uniform float uNight; uniform float uDeep; uniform float uGlow; uniform float uVolc; uniform float uCity;
        uniform sampler2D uNoise; uniform float uSkyGain; uniform vec2 uCloudOff; uniform float uCloudCover; uniform vec3 uCloudLit; uniform vec3 uCloudShade;
        uniform vec3 uStreakA; uniform vec3 uStreakB; uniform float uStreak;
        // fbm from the baked noise texture (one lattice cell = a quarter of it): 5 octaves in R, 3 in G
        float skyFbm(vec2 p) { return texture2D(uNoise, p * 0.25).r; }
        float skyFbm3(vec2 p) { return texture2D(uNoise, p * 0.25).g; }`)
      .replace(
        'gl_FragColor = vec4( retColor, 1.0 );',
        /* glsl */ `retColor *= uSkyGain; // keeps a high sun's sky blue instead of tone-mapping to white
        float up = max(direction.y, 0.0);
        float hz = pow(1.0 - up, 4.0);
        vec3 zen = mix(vec3(0.05, 0.09, 0.22), vec3(0.006, 0.011, 0.03), uDeep);
        vec3 hor = mix(vec3(0.24, 0.18, 0.32), vec3(0.03, 0.045, 0.085), uDeep);
        vec3 twi = mix(zen, hor, hz);
        float az = max(dot(normalize(direction.xz + 1e-5), normalize(vSunDirection.xz + 1e-5)), 0.0);
        twi += vec3(0.95, 0.4, 0.16) * pow(az, 4.0) * exp(-up * 8.0) * uGlow;
        twi += vec3(0.5, 0.25, 0.35) * pow(az, 1.5) * exp(-up * 4.0) * uGlow * 0.35;
        retColor = mix(retColor, twi, uNight);
        // volcano: a smoky ember sky, glowing low on the sun's side
        vec3 volc = mix(vec3(0.07, 0.035, 0.03), vec3(0.62, 0.2, 0.07), pow(1.0 - up, 3.0));
        volc += vec3(0.9, 0.3, 0.08) * pow(az, 3.0) * exp(-up * 6.0) * 0.5;
        retColor = mix(retColor, volc, uVolc);
        // city: light pollution glowing up from the horizon after dark
        retColor += vec3(0.3, 0.17, 0.08) * pow(1.0 - up, 7.0) * uCity * uNight;
        // the Milky Way: a soft, mottled band across the night sky (washed out by city lights).
        // Noise is fetched outside any branch, so its mip selection always has valid derivatives.
        float mwK = uNight * uDeep * (1.0 - 0.75 * uCity) * (1.0 - uVolc);
        vec3 mwN = normalize(vec3(0.32, 0.46, -0.83));
        float mwD = dot(direction, mwN);
        float mw = exp(-mwD * mwD * 26.0) * (0.45 + 0.55 * skyFbm(direction.xz * 7.0 + direction.y * 3.0));
        mw *= smoothstep(0.35, 0.65, skyFbm3(direction.xy * 11.0 + 4.0)) * 0.7 + 0.3;
        retColor += vec3(0.2, 0.24, 0.34) * mw * mwK * smoothstep(0.0, 0.25, up);
        // a shooting star: a bright streak along a short arc, fading toward its tail
        if (uStreak > 0.0) {
          vec3 sn = normalize(cross(uStreakA, uStreakB));
          float sd = abs(dot(direction, sn));
          float inSeg = step(0.0, dot(cross(uStreakA, direction), sn)) * step(0.0, dot(cross(direction, uStreakB), sn));
          float along = clamp(dot(direction - uStreakA, normalize(uStreakB - uStreakA)) / max(length(uStreakB - uStreakA), 1e-4), 0.0, 1.0);
          retColor += vec3(0.9, 0.95, 1.0) * exp(-pow(sd / 0.0016, 2.0)) * inSeg * along * along * uStreak * 3.0;
        }
        // clouds: fbm on a high plane, lit on the sun's side, thinning toward the horizon
        {
          vec2 cp = direction.xz / (up + 0.06) * 0.55 + uCloudOff;
          float n = skyFbm(cp * 0.9);
          float cover = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.15, n);
          float edge = smoothstep(0.0, 0.18, direction.y) * (1.0 - smoothstep(0.55, 0.95, direction.y) * 0.5);
          float sunSide = pow(max(dot(direction, vSunDirection), 0.0), 5.0);
          float thick = smoothstep(1.0 - uCloudCover, 1.0, skyFbm(cp * 0.9 + 0.35));
          vec3 cloud = mix(uCloudLit, uCloudShade, thick * 0.75) + uCloudLit * sunSide * 0.6 * (1.0 - thick);
          retColor = mix(retColor, cloud, cover * edge * 0.85);
        }
        gl_FragColor = vec4( retColor, 1.0 );`
      );
    scene.add(this.sky);

    // separate scene used to bake the sky into an environment map
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    this.envSky.scale.setScalar(900);
    this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(
      new THREE.CircleGeometry(800, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8a6a48 })
    );
    this.envGround.position.y = -2;
    this.envScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.renderer = renderer;
    // IBL re-bakes reuse the same targets: the sky renders into a persistent cube target and PMREM
    // refills the same environment target, so a bake allocates nothing and the scene's environment
    // texture never changes identity (no material re-validation).
    this.cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(1, 2000, this.cubeRT);
    this.envRT = null;
    this.lastEnvSun = new THREE.Vector3(0, -1, 0);
    this.envTimer = 0;

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(0.35, 0.42, -0.84).normalize(); // where the moon is drawn
    this.moonLightDir = new THREE.Vector3(-0.25, 0.62, 0.74).normalize(); // where moonlight comes from (kept camera-side so the dragon reads at night)
    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.castShadow = true;
    const sc = this.light.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.035;
    this.light.shadow.radius = 3;
    this.light.target.position.set(14, 0, -4);
    scene.add(this.light, this.light.target);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x8a6a4a, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xcfd8e0, 0.003);
    this.fogDensity = 0.003;

    this._buildStars();
    this._buildMoon();
    this._buildClouds();

    this.nightness = 0;
    this.exposure = 0.5;
    this._tmpC2 = new THREE.Color();
    this.sunElev = 20;
    this._tmpC = new THREE.Color();
    this._tmpV = new THREE.Vector3();
    this.cloudTint = new THREE.Color();
  }

  _buildStars() {
    const rand = mulberry32(5);
    const n = 2200;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rand(), v = rand() * 0.95 + 0.05;
      const th = u * Math.PI * 2, y = v;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * 3000;
      pos[i * 3 + 1] = y * 3000;
      pos[i * 3 + 2] = Math.sin(th) * r * 3000;
      size[i] = Math.pow(rand(), 6) * 3.2 + 0.7;
      phase[i] = rand() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uPR: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aPhase;
        uniform float uTime; uniform float uPR;
        varying float vTw; varying float vH;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vTw = 0.65 + 0.35 * sin(uTime * (1.5 + fract(aPhase) * 3.0) + aPhase);
          vH = normalize(position).y;
          gl_PointSize = aSize * uPR * (0.8 + 0.4 * vTw);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vTw; varying float vH;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a *= uOpacity * vTw * smoothstep(0.02, 0.18, vH);
          gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * 2.2 * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  _buildMoon() {
    const mat = new THREE.MeshBasicMaterial({
      map: makeMoonTexture(), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(2.2, 2.2, 2.3),
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.moon.scale.setScalar(150);
    this.moon.renderOrder = -1;
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(180,200,255,0.55)');
      gr.addColorStop(0.3, 'rgba(140,170,255,0.18)');
      gr.addColorStop(1, 'rgba(120,150,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.moonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
    );
    this.moonGlow.scale.setScalar(900);
    this.moonGlow.renderOrder = -2;
    this.scene.add(this.moonGlow, this.moon);
  }

  _buildClouds() {
    const rand = mulberry32(17);
    const textures = [1, 2, 3, 4].map((s) => makeCloudTexture(s * 13));
    this.clouds = [];
    this.cloudGroup = new THREE.Group();
    this.cloudSpan = 2400;
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({
        map: textures[i % textures.length], transparent: true, depthWrite: false, fog: false, opacity: 0.9,
      });
      const s = new THREE.Sprite(mat);
      const far = rand() < 0.65;
      const z = far ? -(380 + rand() * 900) : 250 + rand() * 600;
      const w = 220 + rand() * 360;
      s.scale.set(w, w * 0.42, 1);
      s.userData.baseX = rand() * this.cloudSpan;
      s.position.set(0, 110 + rand() * 260 + (far ? 0 : 60), z);
      s.renderOrder = -1;
      s.visible = false; // the sky shader draws the clouds now (lit, and 26 fewer draws)
      this.clouds.push(s);
      this.cloudGroup.add(s);
    }
    this.scene.add(this.cloudGroup);
  }

  /**
   * cycleT in [0,1): 0 = morning, ~0.25 = noon, 0.5 = dusk, 0.62-0.86 = night, 1 = dawn.
   */
  setTimeOfDay(cycleT) {
    const t = ((cycleT % 1) + 1) % 1;
    let elev;
    if (t < 0.5) elev = 9 + 46 * Math.sin((t / 0.5) * Math.PI);
    else if (t < 0.6) elev = 9 - ((t - 0.5) / 0.1) * 21;
    else if (t < 0.86) elev = -12 - 10 * Math.sin(((t - 0.6) / 0.26) * Math.PI);
    else elev = -12 + ((t - 0.86) / 0.14) * 21;
    this.sunElev = elev;
    // by day the sun travels from the runner's right side to behind it; while it is below the
    // horizon it swings back, so dawn starts where the next morning expects it (no jump at the wrap)
    const az = (t < 0.6 ? 72 + 105 * t : 135 - 63 * ((t - 0.6) / 0.4)) * DEG;
    const e = elev * DEG;
    this.sunDir.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e) * 0.85).normalize();
  }

  /** 'desert' | 'city' | 'volcano'. The look eases over in about a second; instant skips the ease. */
  setBiome(name, instant = false) {
    const b = this.biome;
    b.tVolc = name === 'volcano' ? 1 : 0;
    b.tCity = name === 'city' ? 1 : 0;
    if (instant) { b.volc = b.tVolc; b.city = b.tCity; }
    this.envTimer = 0;
    this.lastEnvSun.set(0, -1, 0); // force the image-based lighting to re-bake
  }

  update(dt, camera, time, viewBlend) {
    const elev = this.sunElev;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    const b = this.biome;
    const k = 1 - Math.exp(-dt * 2.5);
    b.volc += (b.tVolc - b.volc) * k;
    b.city += (b.tCity - b.city) * k;
    const volc = b.volc, city = b.city;
    {
      const hi = smooth(15, 50, this.sunElev);
      const p = this.params, su = this.sky.material.uniforms;
      p.turbidity = 2.4 - 0.8 * hi;
      p.rayleigh = 1.8 + 0.5 * hi;
      su.turbidity.value = p.turbidity;
      su.rayleigh.value = p.rayleigh;
      su.uSkyGain.value = 1 - 0.38 * hi;
    }
    u.uVolc.value = volc;
    u.uCity.value = city;

    // Everything below is driven by the sun's elevation (degrees) so dusk and dawn are one continuous
    // sequence: golden hour -> sunset glow -> blue hour -> moonlit night, with no dark gap.
    const day = smooth(-2, 10, elev);
    const night = smooth(0, -9, elev); // gradual "how much night" used across the game
    const deep = smooth(-3, -11, elev); // blue hour -> full night
    this.nightness = night;
    const golden = 1 - smooth(4, 32, elev);

    // shadow-casting light: the sun sets fully before the moon starts fading in, so the single
    // light can swap direction while it is dark and nothing visibly jumps
    const sunCol = this._tmpC.setRGB(1.0, 0.42, 0.18).lerp(C_SUN_DAY, smooth(2, 38, elev));
    const useMoon = elev < -2;
    const dir = useMoon ? this.moonLightDir : this.sunDir;
    // 3D sees far down the track: the shadow box stretches forward with the view (2D keeps it tight and sharp)
    const reach = 34 + 18 * viewBlend;
    const shc = this.light.shadow.camera;
    if (Math.abs(shc.right - reach) > 0.5) {
      shc.left = shc.bottom = -reach;
      shc.right = shc.top = reach;
      shc.updateProjectionMatrix();
    }
    this.light.target.position.x = 14 + 16 * viewBlend;
    this.light.position.copy(this.light.target.position).addScaledVector(dir, 80);
    if (useMoon) {
      this.light.color.setRGB(0.5, 0.64, 1.0);
      this.light.intensity = 1.0 * smooth(-2, -10, elev);
    } else {
      this.light.color.copy(sunCol);
      this.light.intensity = 6.2 * day * (1 - 0.2 * golden);
    }

    // sky blend toward the twilight / night sky
    u.uNight.value = smooth(4, -6, elev);
    u.uDeep.value = deep;
    u.uGlow.value = smooth(7, 0, elev) * smooth(-11, -3, elev);

    // ambient: the sky's own colour by day, a hand-tuned twilight ramp after sunset
    const skyZen = (this._skyZen ||= new THREE.Color());
    skyColor(UP, this.sunDir, this.params, skyZen);
    const zen2 = (this._zen2 ||= new THREE.Color());
    const dayW = smooth(1, 12, elev);
    keyedColor(elev, TWI_KEYS, TWI_SKY, this.hemi.color).lerp(zen2.copy(skyZen).multiplyScalar(1.4), dayW);
    keyedColor(elev, TWI_KEYS, TWI_GROUND, this.hemi.groundColor).lerp(
      (this._grnd ||= new THREE.Color()).copy(C_GROUND_DAY).multiplyScalar(0.35 + 0.65 * day), dayW
    );
    this.hemi.intensity = keyed(elev, TWI_KEYS, TWI_HEMI_I);
    this.exposure = keyed(elev, TWI_KEYS, TWI_EXPOSURE);
    this.scene.environmentIntensity = 0.45 * day + 0.2 + 0.25 * night;
    // city after dark: warm street-light ambient, so the road and everything on it stays readable
    const cityNight = city * night;
    this.hemi.color.lerp(this._tmpC2.setRGB(0.9, 0.78, 0.66), 0.5 * cityNight);
    this.hemi.groundColor.lerp(this._tmpC2.setRGB(0.5, 0.36, 0.22), 0.6 * cityNight);
    this.hemi.intensity += 0.5 * cityNight;
    this.exposure += 0.08 * cityNight;
    // volcano: lava-lit from below, ember light from the sky
    if (volc > 0.001) {
      this.hemi.color.lerp(this._tmpC2.setRGB(1.0, 0.52, 0.34), volc);
      this.hemi.groundColor.lerp(this._tmpC2.setRGB(0.6, 0.18, 0.05), volc);
      this.hemi.intensity = THREE.MathUtils.lerp(this.hemi.intensity, 1.15, volc);
      this.exposure = THREE.MathUtils.lerp(this.exposure, Math.max(this.exposure, 0.74), volc);
      this.light.color.lerp(this._tmpC2.setRGB(1.0, 0.42, 0.22), volc);
    }

    // fog matches the horizon in the camera's viewing direction (same blend as the sky shader)
    camera.getWorldDirection(this._tmpV);
    this._tmpV.y = 0;
    this._tmpV.normalize();
    this._tmpV.y = 0.035;
    this._tmpV.normalize();
    const fogC = skyColor(this._tmpV, this.sunDir, this.params, (this._fogA ||= new THREE.Color())).multiplyScalar(u.uSkyGain.value);
    fogC.lerp(twilightSky(this._tmpV, this.sunDir, deep, u.uGlow.value, (this._fogB ||= new THREE.Color())), u.uNight.value);
    fogC.lerp(this._tmpC2.setRGB(0.17, 0.12, 0.12), 0.45 * cityNight);
    fogC.lerp(this._tmpC2.setRGB(0.3, 0.11, 0.05), volc);
    this.scene.fog.color.copy(fogC);
    const density = THREE.MathUtils.lerp(0.0017, 0.002, viewBlend);
    // midday is clear air: thinner haze with the sun high (the volcano keeps its smoke)
    const noon = smooth(15, 50, elev) * (1 - volc) * (1 - city);
    this.scene.fog.density = density * (1 + 0.4 * night) * (1 - 0.35 * noon);
    this.noonK = noon;

    // stars, moon
    this.starMat.uniforms.uOpacity.value = smooth(-4, -11, elev) * (1 - volc);
    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uPR.value = this.renderer.getPixelRatio();
    this.stars.position.copy(camera.position);
    const moonPos = this._tmpV.copy(this.moonDir).multiplyScalar(2600).add(camera.position);
    this.moon.position.copy(moonPos);
    this.moon.lookAt(camera.position);
    this.moonGlow.position.copy(moonPos).addScaledVector(this.moonDir, 50);
    this.moonGlow.lookAt(camera.position);
    const moonVis = smooth(2, -8, elev);
    this.moon.material.opacity = moonVis;
    this.moonGlow.material.opacity = moonVis;
    this.moon.visible = this.moonGlow.visible = moonVis > 0.01;
    this.sky.position.copy(camera.position);

    // clouds take on the light of the sky: white by day, lit pink at sunset, blue-grey at night
    const ct = this.cloudTint;
    ct.copy(sunCol).multiplyScalar(1.1 * day).add(zen2.copy(skyZen).multiplyScalar(0.9));
    ct.lerp(C_CLOUD_DUSK, smooth(8, 0, elev));
    ct.lerp(C_CLOUD_NIGHT, deep);
    ct.lerp(C_CLOUD_ASH, volc); // ash clouds
    for (const c of this.clouds) c.material.color.copy(ct);
    // sky clouds: lit colour from the same tint, shade a darker, cooler version; cover by biome
    u.uCloudLit.value.copy(ct);
    u.uCloudShade.value.copy(ct).multiplyScalar(0.62).lerp(C_CLOUD_NIGHT, 0.25);
    u.uCloudCover.value = 0.42 - 0.05 * smooth(15, 50, elev) + 0.08 * city + 0.18 * volc;
    // a shooting star now and then, after dark
    const sk = this.streak;
    sk.t -= dt;
    if (sk.life > 0) {
      sk.life -= dt;
      const k = 1 - Math.max(0, sk.life) / 0.7;
      u.uStreakB.value.copy(sk.a).lerp(sk.b, k).normalize();
      u.uStreakA.value.copy(sk.a).lerp(sk.b, Math.max(0, k - 0.35)).normalize();
      u.uStreak.value = Math.sin(Math.PI * k) * night * (1 - city * 0.6) * (1 - volc);
    } else u.uStreak.value = 0;
    if (sk.t <= 0) {
      sk.t = 5 + Math.random() * 9;
      if (night > 0.6) {
        const az = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.4;
        sk.a.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
        const az2 = az + (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2), el2 = el - 0.1 - Math.random() * 0.12;
        sk.b.set(Math.cos(az2) * Math.cos(el2), Math.sin(el2), Math.sin(az2) * Math.cos(el2));
        sk.life = 0.7;
      }
    }

    // refresh image-based lighting when the sun has moved enough
    this.envTimer -= dt;
    if (this.envTimer <= 0 && (this.lastEnvSun.angleTo(this.sunDir) > 1.2 * DEG || !this.envRT)) {
      this.envTimer = 0.4;
      this._bakeEnv();
    }
  }

  scrollClouds(scroll) {
    this.sky.material.uniforms.uCloudOff.value.set(scroll * 0.0009, scroll * 0.0002);
    const span = this.cloudSpan;
    const off = scroll * 0.06;
    for (const c of this.clouds) {
      let x = (c.userData.baseX - off) % span;
      if (x < 0) x += span;
      c.position.x = x - span * 0.35;
    }
  }

  _bakeEnv() {
    this.lastEnvSun.copy(this.sunDir);
    const night = this.nightness;
    void night;
    this.envGround.material.color.setRGB(0.35, 0.26, 0.17).multiplyScalar(Math.max(0.03, smooth(-4, 20, this.sunElev)))
      .lerp(this._tmpC2.setRGB(0.22, 0.07, 0.03), this.biome.tVolc);
    this.cubeCam.update(this.renderer, this.envScene);
    if (!this.envRT) this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    else this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    if (this.scene.environment !== this.envRT.texture) this.scene.environment = this.envRT.texture;
    this.scene.backgroundIntensity = 1;
    void night;
  }
}
