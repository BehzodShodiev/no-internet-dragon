// Infinite scrolling desert. Heights are generated once on the CPU (periodic in x), stored in a
// half-float texture and displaced in the vertex shader. The mesh is snapped to its own grid so the
// surface never "swims" while scrolling.
import * as THREE from 'three';
import { createNoise } from '../gfx/noise.js';

export const TERRAIN_PERIOD = 512;
const Z_MIN = -440, Z_MAX = 340;
const TEX_W = 512, TEX_H = 512;
const DX = TERRAIN_PERIOD / TEX_W;
const DZ = (Z_MAX - Z_MIN) / TEX_H;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// three's tangent-space normal map chunk, with the sand ripples flattened on city ground
const NORMAL_MAPS = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - 0.85 * uCity);');
if (NORMAL_MAPS === THREE.ShaderChunk.normal_fragment_maps) console.warn('Terrain: normal map chunk changed; city ground keeps sand ripples');

export class Terrain {
  constructor(sand, segmentsX = 400) {
    this.noise = createNoise(77);
    this.heights = new Float32Array(TEX_W * TEX_H);
    this._generate();
    this.uniforms = {
      uHeight: { value: this._makeTexture() },
      uScroll: { value: 0 },
      uNear: { value: 1 },
      uAsh: { value: 0 }, // 0 = desert sand, 1 = volcanic ash
      uLava: { value: 0 }, // glowing lava veins off the track
      uCity: { value: 0 }, // 0 = dunes, 1 = Night City: flat ground painted as streets, sidewalks and plazas
      uNight: { value: 0 }, // street-lamp pools on the sidewalk after dark
      uLampScroll: { value: 0 }, // scroll % 4004, the same phase City's lamps use
    };
    this.material = new THREE.MeshStandardMaterial({
      map: sand.map,
      normalMap: sand.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.6,
    });
    this.material.onBeforeCompile = (shader) => this._patch(shader);
    this.mesh = new THREE.Mesh(this._makeGeometry(segmentsX), this.material);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'terrain';
  }

  _rawHeight(x, z) {
    const { noise3, fbm3 } = this.noise;
    const th = (x / TERRAIN_PERIOD) * Math.PI * 2;
    const R = TERRAIN_PERIOD / (Math.PI * 2);
    const cx = Math.cos(th) * R, sx = Math.sin(th) * R;
    const az = Math.abs(z);
    const track = smooth(3.5, 16, az);
    const f1 = 1 / 85;
    let dune = 1 - Math.abs(noise3(cx * f1, sx * f1, z * f1 * 1.6));
    dune = dune * dune * (3 - 2 * dune);
    const f2 = 1 / 38;
    const roll = fbm3(cx * f2, sx * f2, z * f2 + 9.3, 3);
    const f3 = 1 / 9;
    const small = noise3(cx * f3, sx * f3, z * f3 + 50);
    const far = z < 0 ? smooth(6, 150, -z) : smooth(8, 120, z);
    const amp = z < 0 ? 17 : 11;
    let h = dune * amp * far + roll * (0.9 + 6 * far) + small * 0.32;
    // distant rise so the horizon reads as rolling dunes
    h += (z < 0 ? smooth(200, 420, -z) : smooth(160, 330, z)) * 12;
    return h * track;
  }

  _generate() {
    const H = this.heights;
    for (let j = 0; j < TEX_H; j++) {
      const z = Z_MIN + (j + 0.5) * DZ;
      for (let i = 0; i < TEX_W; i++) {
        H[j * TEX_W + i] = this._rawHeight((i + 0.5) * DX, z);
      }
    }
  }

  _makeTexture() {
    const H = this.heights;
    const data = new Uint16Array(TEX_W * TEX_H * 4);
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < TEX_H; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(TEX_H - 1, j + 1);
      for (let i = 0; i < TEX_W; i++) {
        const im = (i - 1 + TEX_W) % TEX_W, ip = (i + 1) % TEX_W;
        const h = H[j * TEX_W + i];
        const dhdx = (H[j * TEX_W + ip] - H[j * TEX_W + im]) / (2 * DX);
        const dhdz = (H[jp * TEX_W + i] - H[jm * TEX_W + i]) / ((jp - jm) * DZ);
        const o = (j * TEX_W + i) * 4;
        data[o] = toHalf(h);
        data[o + 1] = toHalf(dhdx);
        data[o + 2] = toHalf(dhdz);
        data[o + 3] = toHalf(1);
      }
    }
    const t = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat, THREE.HalfFloatType);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  _makeGeometry(segX) {
    const width = 800, depth = Z_MAX - Z_MIN - 30;
    const segZ = Math.round(segX * 0.62);
    const g = new THREE.PlaneGeometry(width, depth, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(-160 + width / 2, 0, Z_MIN + 15 + depth / 2);
    this.cell = width / segX;
    return g;
  }

  setResolution(segX) {
    const old = this.mesh.geometry;
    this.mesh.geometry = this._makeGeometry(segX);
    old.dispose();
  }

  /** CPU height lookup in terrain coordinates (x periodic). Matches the GPU sampling. */
  heightAt(x, z) {
    const fx = x / DX - 0.5;
    const fz = Math.min(TEX_H - 1, Math.max(0, (z - Z_MIN) / DZ - 0.5));
    const i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    const ia = ((i0 % TEX_W) + TEX_W) % TEX_W, ib = (ia + 1) % TEX_W;
    const ja = j0, jb = Math.min(TEX_H - 1, j0 + 1);
    const H = this.heights;
    const a = H[ja * TEX_W + ia] * (1 - tx) + H[ja * TEX_W + ib] * tx;
    const b = H[jb * TEX_W + ia] * (1 - tx) + H[jb * TEX_W + ib] * tx;
    return a * (1 - tz) + b * tz;
  }

  update(scroll, near) {
    const s = scroll % TERRAIN_PERIOD;
    this.uniforms.uScroll.value = s;
    this.uniforms.uNear.value = near;
    this.uniforms.uLampScroll.value = scroll % 4004;
    this.mesh.position.x = -(s % this.cell);
  }

  _patch(shader) {
    Object.assign(shader.uniforms, this.uniforms);
    const head = /* glsl */ `
      uniform sampler2D uHeight;
      uniform float uScroll;
      uniform float uNear;
      uniform float uCity;
      varying float vTH;
      varying vec3 vTW;
      vec3 terrainSample(vec3 wp) {
        vec2 tuv = vec2((wp.x + uScroll) / ${TERRAIN_PERIOD.toFixed(1)}, (wp.z - (${Z_MIN.toFixed(1)})) / ${(Z_MAX - Z_MIN).toFixed(1)});
        vec4 s = textureLod(uHeight, tuv, 0.0);
        float k = wp.z > 0.0 ? uNear : 1.0;
        return s.xyz * k;
      }
    `;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + head)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec3 tWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 tS = terrainSample(tWorld);
        float tFlat = 1.0 - uCity; // the city stands on flat ground
        vec3 objectNormal = normalize(vec3(-tS.y * tFlat, 1.0, -tS.z * tFlat));
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        transformed.y += tS.x * tFlat;
        vTH = tS.x * tFlat;
        vTW = tWorld;
        `
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `
        #include <uv_vertex>
        {
          vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
          vec2 tuv = vec2(w.x + uScroll, w.z) * 0.125;
          vMapUv = tuv;
          vNormalMapUv = tuv;
        }
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying float vTH;
        varying vec3 vTW;
        uniform float uScroll;
        uniform float uAsh;
        uniform float uLava;
        uniform float uCity;
        uniform float uNight;
        uniform float uLampScroll;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1, 0)), u.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), u.x), u.y);
        }`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        float tLava = 0.0, tWet = 0.0, tPool = 0.0;
        {
          // break up tiling with a low-frequency lookup of the same texture
          vec2 wuv = vec2(vTW.x + uScroll, vTW.z);
          float macro = texture2D(map, wuv * 0.015625).r;
          float macro2 = texture2D(map, wuv * 0.00390625 + 0.37).g;
          diffuseColor.rgb *= 0.78 + 0.32 * macro + 0.18 * (macro2 - 0.5);
          float crest = clamp(vTH / 16.0, 0.0, 1.0);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.07, 1.0, 0.92), crest);
          float track = 1.0 - smoothstep(1.2, 4.5, abs(vTW.z));
          diffuseColor.rgb *= 1.0 - 0.1 * track;
          // volcano: sand turns to dark ash, with lava veins glowing away from the track
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.16) * (0.5 + lum), uAsh);
          // a paler ash path down the track, so dark obstacles stand out against it
          diffuseColor.rgb *= 1.0 + 0.7 * track * uAsh;
          // thin veins, kept well clear of the track so they never read as lava pools in the way
          float vein = tNoise(wuv * 0.07) * 0.65 + tNoise(wuv * 0.19 + 3.7) * 0.35;
          tLava = (1.0 - smoothstep(0.0, 0.016, abs(vein - 0.5))) * smoothstep(14.0, 22.0, abs(vTW.z)) * uLava;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.02, 0.01), tLava);
          // Night City: kerb and sidewalk slabs along the road, then city blocks (pale tiled plazas or dark
          // lots); a cross street every 64 m (City keeps its buildings out of them) with a zebra crossing
          // by the road; wet patches that catch the sky; lamp pools on the far sidewalk after dark
          if (uCity > 0.001) {
            float cx = vTW.x + uScroll;
            float cz = vTW.z;
            float az = abs(cz);
            float bx = mod(cx, 64.0);
            float cross = 1.0 - step(10.0, bx);
            float gh = tHash(floor(vec2(cx, cz) * 3.0));
            vec2 slab = fract(vec2(cx, cz) / 1.5);
            float seam = 1.0 - step(0.06, slab.x) * step(0.06, slab.y);
            vec3 walk = vec3(0.4, 0.39, 0.37) * (0.9 + 0.14 * tHash(floor(vec2(cx, cz) / 1.5))) * (1.0 - 0.35 * seam);
            walk = mix(walk, vec3(0.62, 0.61, 0.58), step(3.2, az) * (1.0 - step(3.5, az)));
            vec3 asph = vec3(0.075, 0.078, 0.085) * (0.85 + 0.3 * gh);
            float bh = tHash(vec2(floor(cx / 64.0), floor(cz / 40.0)) + 7.0);
            vec2 tile = fract(vec2(cx, cz) / 3.0);
            float tseam = 1.0 - step(0.04, tile.x) * step(0.04, tile.y);
            vec3 plaza = mix(vec3(0.3, 0.29, 0.28) * (1.0 - 0.3 * tseam), vec3(0.11, 0.115, 0.12) * (0.9 + 0.2 * gh), step(0.55, bh));
            float onWalk = 1.0 - step(7.5, az);
            vec3 cityCol = mix(plaza, walk, onWalk);
            float zebra = step(3.5, az) * step(az, 6.5) * step(0.5, fract(bx / 1.1)) * step(0.8, bx) * step(bx, 9.2);
            vec3 street = mix(asph, vec3(0.75, 0.74, 0.7), zebra);
            street = mix(street, vec3(0.7, 0.6, 0.2), step(abs(bx - 5.0), 0.08) * step(7.5, az) * step(0.5, fract(cz / 3.0)));
            cityCol = mix(cityCol, street, cross);
            cityCol *= 0.88 + 0.22 * tNoise(vec2(cx, cz) * 0.35);
            diffuseColor.rgb = mix(diffuseColor.rgb, cityCol, uCity);
            tWet = smoothstep(0.58, 0.68, tNoise(vec2(cx, cz) * 0.06 + 1.3)) * (1.0 - 0.6 * onWalk * (1.0 - cross)) * uCity;
            diffuseColor.rgb *= 1.0 - 0.35 * tWet;
            float ld = (fract((vTW.x + uLampScroll) / 14.0 + 0.5) - 0.5) * 14.0;
            tPool = exp(-ld * ld / 12.0) * exp(-(cz + 3.6) * (cz + 3.6) / 5.0) * uNight * uCity;
          }
        }
        `
      )
      .replace('#include <normal_fragment_maps>', NORMAL_MAPS)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.82, 0.16, tWet), uCity);
        `
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(2.0, 0.55, 0.1) * tLava;
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * tPool * 0.3;
        `
      );
  }
}
