// WebGL renderer + post-processing chain + quality presets + dynamic resolution scaling.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from '../gfx/FXAAShader.js';

// verylow: for weak laptops and old phones: 75% resolution, no shadows, no bloom, no edge smoothing
export const QUALITY = {
  verylow: { pr: 0.75, msaa: 0, shadow: 0, soft: false, bloom: false, fxaa: false, terrain: 120, density: 0.2 },
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

// The last pass: ACES tone mapping and sRGB output (what OutputPass did) merged with the grade, in one draw.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 },
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
    uContrast: { value: 1 },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    precision highp float;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    #define ACES_FILMIC_TONE_MAPPING
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uCA, uFlash, uSat, uHaze, uHorizon, uContrast;
    uniform vec3 uGain, uLift;
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
      col = sRGBTransferOETF(vec4(ACESFilmicToneMapping(col), 1.0)).rgb;
      // the world's grade: gain on the highlights, lift in the shadows (split toning), contrast
      col = col * uGain + uLift * (1.0 - col);
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
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

/**
 * Renders the scene into its own multisampled HDR target, then resolves and sanitizes it into the
 * composer's chain. Only this target is multisampled: bloom and the final pass work on plain targets,
 * which saves a resolve and most of the bandwidth of every later pass.
 */
class ScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial(SanitizeShader));
    this.needsSwap = true;
  }

  setSize(w, h) {
    this.target.setSize(w, h);
  }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.quad.material.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
  }
}

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
    this.vsyncMs = Infinity; // fastest steady frame interval seen: the display's (or browser's) cadence
    this.topPreset = null; // the preset Auto started at, to climb back to
    this.onPreset = null; // Auto wants another preset: the game applies it between runs
    // GPU time per frame (EXT_disjoint_timer_query_webgl2, where the browser exposes it)
    this.gl = r.getContext();
    this.timerExt = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.gpuPending = [];
    this.gpuTimes = []; // recent GPU frame times (ms), for Auto
    this.gpuNew = []; // results since the last read, for the ?perf monitor
  }

  setup(scene, camera, light) {
    this.scene = scene;
    this.camera = camera;
    this.light = light;
    this._buildComposer();
  }

  _buildComposer() {
    if (this.composer) {
      // a rebuild (quality change) frees the whole old chain
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.scenePass.dispose();
      this.bloom.dispose();
      this.grade.material.dispose();
      this.fxaa?.material.dispose();
    }
    const q = this.quality;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, depthBuffer: false });
    const composer = new EffectComposer(this.renderer, rt);
    this.scenePass = new ScenePass(this.scene, this.camera, q.msaa);
    composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.5, 1.7);
    this.bloom.enabled = q.bloom;
    composer.addPass(this.bloom);
    this.grade = new ShaderPass(new THREE.RawShaderMaterial(GradeShader));
    composer.addPass(this.grade);
    // Low has no MSAA: FXAA smooths edges for the price of one cheap full-screen pass
    this.fxaa = q.msaa || q.fxaa === false ? null : new ShaderPass(FXAAShader);
    if (this.fxaa) composer.addPass(this.fxaa);
    this.composer = composer;
    this.resize();
  }

  setQuality(name) {
    this.qualityName = name;
    this.quality = QUALITY[name];
    const q = this.quality;
    // The shadow filter is chosen once per session: switching it changes every lit material's program,
    // which would recompile them all. Later preset changes only resize the shadow map.
    if (this.shadowType == null && this.scene) {
      this.shadowType = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.renderer.shadowMap.type = this.shadowType;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    }
    if (this.topPreset == null && this.scene) this.topPreset = name;
    if (this.light) {
      // shadows off on Very Low (a whole pass saved; lit materials rebuild once, between runs)
      this.light.castShadow = q.shadow > 0;
      if (q.shadow) this.light.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.light.shadow.map) {
        this.light.shadow.map.dispose();
        this.light.shadow.map = null;
      }
    }
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
      this.fxaa?.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
    this.aspect = w / h;
  }

  get pixelHeight() {
    return this.renderer.domElement.height;
  }

  /**
   * Auto quality, called every frame with the real frame delta. Render scale moves first (cheap); a preset
   * change is handed to onPreset, which the game applies between runs (no recompiles mid-run). It only
   * steps down when the GPU is what's slow: a 30 fps cap, a 50 Hz display or a busy CPU leave quality
   * alone. With steady headroom it climbs back up, to the preset it started at.
   */
  adapt(dtMs, auto) {
    if (!auto) return;
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.evalTimer += dtMs;
    if (this.evalTimer < 1000 || this.frameTimes.length < 45) return;
    this.evalTimer = 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    this.vsyncMs = Math.min(this.vsyncMs, p10);
    const budget = Math.max(19.5, this.vsyncMs * 1.15);
    const g = [...this.gpuTimes].sort((a, b) => a - b);
    const gpu = g.length >= 10 ? g[Math.floor(g.length / 2)] : null;
    const gpuBound = gpu == null || gpu > 0.7 * p50;
    const order = ['verylow', 'low', 'medium', 'high'];
    if (p50 > budget && gpuBound) {
      this.goodTime = 0;
      if (this.scale > 0.62) {
        this.scale = Math.max(0.6, this.scale - 0.1);
        this.resize();
      } else if (this.qualityName !== 'verylow' && this.wantPreset !== order[order.indexOf(this.qualityName) - 1]) {
        this.wantPreset = order[order.indexOf(this.qualityName) - 1];
        this.onPreset?.(this.wantPreset);
      }
      this.frameTimes.length = 0;
    } else if (p50 < budget * 0.85 && (gpu == null || gpu < budget * 0.6)) {
      this.goodTime += 1;
      if (this.goodTime >= 4 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.05);
        this.goodTime = 0;
        this.resize();
      } else if (this.goodTime >= 20 && this.scale >= 1 && gpu != null && gpu < budget * 0.4 && order.indexOf(this.qualityName) < order.indexOf(this.topPreset)) {
        this.goodTime = 0;
        this.wantPreset = order[order.indexOf(this.qualityName) + 1];
        this.onPreset?.(this.wantPreset);
      }
    }
  }

  /** Post-processing materials, by the kind of target they draw into (for compiling them during loading). */
  postMaterials() {
    const b = this.bloom;
    const hdr = [this.scenePass.quad.material, b.materialHighPassFilter, ...(b.separableBlurMaterials || []), b.compositeMaterial, b.blendMaterial].filter(Boolean);
    return this.fxaa ? { hdr: [...hdr, this.grade.material], screen: [this.fxaa.material] } : { hdr, screen: [this.grade.material] };
  }

  /** Applies a preset chosen by Auto (the game calls this between runs). */
  applyPreset(name) {
    this.wantPreset = null;
    this.scale = name === this.qualityName ? this.scale : 0.9;
    this.setQuality(name);
  }

  _pollGpu() {
    const gl = this.gl, ext = this.timerExt;
    while (this.gpuPending.length && gl.getQueryParameter(this.gpuPending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.gpuPending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuTimes.push(ms);
        if (this.gpuTimes.length > 90) this.gpuTimes.shift();
        if (this.gpuNew.length < 240) this.gpuNew.push(ms);
      }
      gl.deleteQuery(q);
    }
  }

  /** The colour grade, eased in from the game: saturation, contrast, highlight gain and shadow lift. */
  setGrade(sat, contrast, gain, lift) {
    const g = this.grade.uniforms;
    g.uSat.value = sat;
    g.uContrast.value = contrast;
    g.uGain.value.copy(gain);
    g.uLift.value.copy(lift);
  }

  setHaze(amount, horizon) {
    this.grade.uniforms.uHaze.value = amount;
    this.grade.uniforms.uHorizon.value = horizon;
  }

  render(time, flash, flashColor) {
    const g = this.grade.uniforms;
    g.uTime.value = time;
    g.uFlash.value = flash;
    g.toneMappingExposure.value = this.renderer.toneMappingExposure;
    if (flashColor) g.uFlashColor.value.copy(flashColor);
    let q = null;
    if (this.timerExt && this.gpuPending.length < 4) {
      q = this.gl.createQuery();
      this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    }
    this.composer.render();
    if (q) {
      this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.gpuPending.push(q);
    }
    if (this.timerExt) this._pollGpu();
  }
}
