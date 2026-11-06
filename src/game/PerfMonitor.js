// Performance instrumentation, on with ?perf: frame-time distribution, CPU time in update and render,
// GPU time (EXT_disjoint_timer_query_webgl2, when the browser exposes it), draw calls and triangles per
// frame (all passes, shadows and post included), and a small overlay. tools/perf.mjs reads window.__perf.
export class PerfMonitor {
  constructor(renderer, { overlay = true } = {}) {
    this.r = renderer;
    this.r.info.autoReset = false; // count every pass of the frame, not just the last one
    this.gl = this.r.getContext();
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.n = 600;
    this.intervals = new Float32Array(this.n);
    this.idx = 0;
    this.filled = 0;
    this.last = 0;
    this.t0 = 0;
    this.acc = this._zero();
    this.stats = { frames: 0, long33: 0, long50: 0, p50: 0, p95: 0, p99: 0, fps: 0, cpuUpdate: 0, cpuRender: 0, gpu: null, calls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0, heapMB: null };
    window.__perf = { stats: this.stats, reset: () => this.reset(), snapshot: () => this.snapshot() };
    if (overlay) {
      this.el = document.createElement('pre');
      this.el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;margin:0;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.6);color:#cfe;font:11px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre';
      document.body.appendChild(this.el);
    }
  }

  _zero() {
    return { frames: 0, cpuUpdate: 0, cpuRender: 0, gpu: 0, gpuN: 0, calls: 0, triangles: 0, long33: 0, long50: 0 };
  }

  reset() {
    this.acc = this._zero();
    this.filled = 0;
    this.idx = 0;
    this.t0 = performance.now();
  }

  frameStart(now) {
    if (this.last) {
      const dt = now - this.last;
      this.intervals[this.idx] = dt;
      this.idx = (this.idx + 1) % this.n;
      this.filled = Math.min(this.n, this.filled + 1);
      if (dt > 33.4) this.acc.long33++;
      if (dt > 50) this.acc.long50++;
    }
    this.last = now;
    this.r.info.reset();
  }

  update(ms) {
    this.acc.cpuUpdate += ms;
  }

  renderBegin() {
    this._rt = performance.now();
    if (this.ext && !this._q) {
      this._q = this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this._q);
    }
  }

  renderEnd() {
    this.acc.cpuRender += performance.now() - this._rt;
    if (this._q) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this._q);
      this._q = null;
    }
    const gl = this.gl;
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        this.acc.gpu += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.acc.gpuN++;
      }
      gl.deleteQuery(q);
    }
    const info = this.r.info;
    this.acc.calls += info.render.calls;
    this.acc.triangles += info.render.triangles;
    this.acc.frames++;
    if (performance.now() - (this._shown || 0) > 500) {
      this._shown = performance.now();
      this.snapshot();
      if (this.el) this._draw();
    }
  }

  /** Stats since the last reset (frame-time percentiles over the last 600 frames). */
  snapshot() {
    const a = this.acc, s = this.stats, f = Math.max(1, a.frames);
    const sorted = Array.from(this.intervals.subarray(0, this.filled)).sort((x, y) => x - y);
    const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const mem = this.r.info.memory;
    Object.assign(s, {
      frames: a.frames, long33: a.long33, long50: a.long50,
      p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
      fps: +(a.frames / Math.max(0.001, (performance.now() - this.t0) / 1000)).toFixed(1),
      cpuUpdate: +(a.cpuUpdate / f).toFixed(2), cpuRender: +(a.cpuRender / f).toFixed(2),
      gpu: a.gpuN ? +(a.gpu / a.gpuN).toFixed(2) : null,
      calls: Math.round(a.calls / f), triangles: Math.round(a.triangles / f),
      programs: this.r.info.programs?.length || 0, textures: mem.textures, geometries: mem.geometries,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    });
    return s;
  }

  _draw() {
    const s = this.stats;
    this.el.textContent = `fps ${s.fps}  frame p50 ${s.p50} p95 ${s.p95} p99 ${s.p99} ms  long>33 ${s.long33} >50 ${s.long50}\n`
      + `cpu update ${s.cpuUpdate} ms  render ${s.cpuRender} ms  gpu ${s.gpu ?? 'n/a'} ms\n`
      + `draws ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k  programs ${s.programs}  tex ${s.textures}  geo ${s.geometries}${s.heapMB != null ? `  heap ${s.heapMB} MB` : ''}`;
  }
}
