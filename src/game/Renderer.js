// WebGL renderer + post-processing chain + quality presets + dynamic resolution scaling.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY = {
  low: { pr: 1.0, msaa: 0, shadow: 1024, soft: false, bloom: false, terrain: 200, density: 0.4 },
  medium: { pr: 1.5, msaa: 2, shadow: 2048, soft: true, bloom: true, terrain: 400, density: 0.7 },
  high: { pr: 2.0, msaa: 4, shadow: 2048, soft: true, bloom: true, terrain: 400, density: 1 },
};

// Clamps HDR values and removes NaN/Inf before bloom, so a single bad pixel can never black out the frame.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      // isnan() gets optimised away by the D3D shader compiler (ANGLE), but IEEE min/max drop NaN:
      // max(NaN, 0) -> 0, and min() then caps +Inf.
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = min(max(c, vec3(0.0)), vec3(48.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.028 },
    uCA: { value: 0.006 },
    uHaze: { value: 0 },
    uHorizon: { value: 0.5 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.2, 0.1) },
    uSat: { value: 1.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uCA, uFlash, uSat, uHaze, uHorizon;
    uniform vec2 uRes;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // heat haze: rising shimmer concentrated just below the horizon
      float band = exp(-pow((vUv.y - uHorizon + 0.015) * 16.0, 2.0)) * uHaze * (vUv.y < uHorizon ? 1.0 : 0.35);
      if (band > 0.002) {
        float w = sin(vUv.y * 380.0 + uTime * 7.0) * sin(vUv.x * 41.0 - uTime * 2.3) + 0.6 * sin(vUv.y * 900.0 - uTime * 11.0 + vUv.x * 30.0);
        uv += vec2(0.0011, 0.0005) * w * band;
      }
      vec2 dc = uv - 0.5;
      float ca = uCA * dot(dc, dc);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - dc * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + dc * ca).b;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSat);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);
      float v = smoothstep(0.95, 0.25, length(dc * vec2(1.0, 0.8)));
      col *= mix(1.0 - uVignette, 1.0, v);
      col += uFlashColor * uFlash * (0.6 + 0.4 * (1.0 - v));
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.62;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scale = 1;
    this.qualityName = 'high';
    this.quality = QUALITY.high;
    this.frameTimes = [];
    this.goodTime = 0;
    this.evalTimer = 0;
    this.onQualityDrop = null;
  }

  setup(scene, camera, light) {
    this.scene = scene;
    this.camera = camera;
    this.light = light;
    this._buildComposer();
  }

  _buildComposer() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    const q = this.quality;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.5, 1.7);
    this.bloom.enabled = q.bloom;
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.composer = composer;
    this.resize();
  }

  setQuality(name) {
    this.qualityName = name;
    this.quality = QUALITY[name];
    const q = this.quality;
    this.renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.light) {
      this.light.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.light.shadow.map) {
        this.light.shadow.map.dispose();
        this.light.shadow.map = null;
      }
    }
    // shadow map type changes require material recompiles
    this.scene?.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    if (this.scene) this._buildComposer();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pr) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.grade.uniforms.uRes.value.set(w * pr, h * pr);
    }
    this.aspect = w / h;
  }

  get pixelHeight() {
    return this.renderer.domElement.height;
  }

  /** Called every frame with the real frame delta to adapt render resolution. */
  adapt(dtMs, auto) {
    if (!auto) return;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.evalTimer += dtMs;
    if (this.evalTimer < 1000 || this.frameTimes.length < 45) return;
    this.evalTimer = 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    if (p50 > 19.5) {
      this.goodTime = 0;
      if (this.scale > 0.62) {
        this.scale = Math.max(0.6, this.scale - 0.1);
        this.resize();
      } else if (this.qualityName !== 'low') {
        const next = this.qualityName === 'high' ? 'medium' : 'low';
        this.scale = 0.85;
        this.setQuality(next);
        this.onQualityDrop?.(next);
      }
      this.frameTimes.length = 0;
    } else if (p50 < 17.6) {
      this.goodTime += 1;
      if (this.goodTime >= 4 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.05);
        this.goodTime = 0;
        this.resize();
      }
    }
  }

  setHaze(amount, horizon) {
    this.grade.uniforms.uHaze.value = amount;
    this.grade.uniforms.uHorizon.value = horizon;
  }

  render(time, flash, flashColor) {
    const g = this.grade.uniforms;
    g.uTime.value = time;
    g.uFlash.value = flash;
    if (flashColor) g.uFlashColor.value.copy(flashColor);
    this.composer.render();
  }
}
