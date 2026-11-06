// Minimal dependency-free Chrome DevTools Protocol driver shared by the test tools.
// One Session = one headless Chrome with one page. Needs Node 22+ (global WebSocket) or --experimental-websocket.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome: $CHROME, else the usual install locations (per-user or machine-wide). */
export function findChrome() {
  return [
    process.env.CHROME,
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => p && fs.existsSync(p));
}

const KEYS = {
  Space: [' ', 32], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
  Enter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9],
  Digit1: ['1', 49], Digit2: ['2', 50], Digit3: ['3', 51], Digit4: ['4', 52], Digit5: ['5', 53],
};
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') KEYS['Key' + c] = [c.toLowerCase(), c.charCodeAt(0)];

export class Session {
  /** opts: { w, h, dpr, mobile } */
  static async launch({ w = 1280, h = 720, dpr = 1, mobile = false } = {}) {
    const chromePath = findChrome();
    if (!chromePath) throw new Error('Chrome not found: set CHROME to its path');
    const port = 9300 + Math.floor(Math.random() * 600);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-prof-'));
    const proc = spawn(chromePath, [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      `--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', 'about:blank',
    ], { stdio: 'ignore' });
    let target;
    for (let i = 0; i < 75 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* not up yet */ }
      if (!target) await sleep(200);
    }
    if (!target) { proc.kill(); throw new Error('Chrome did not start'); }
    const s = new Session(proc, profile, target.webSocketDebuggerUrl);
    await s._open();
    await s.send('Runtime.enable');
    await s.send('Page.enable');
    await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
    if (mobile) await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return s;
  }

  constructor(proc, profile, wsUrl) {
    this.proc = proc;
    this.profile = profile;
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
  }

  _open() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); return; }
      if (msg.method === 'Runtime.consoleAPICalled') this.logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      if (msg.method === 'Runtime.exceptionThrown') this.logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    };
    return new Promise((r) => (this.ws.onopen = r));
  }

  send(method, params = {}) {
    return new Promise((r) => {
      const i = ++this.id;
      this.pending.set(i, r);
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }

  async evaluate(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
    return r.result?.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
  }

  /** Waits until window.__game.state equals state; returns false on timeout. */
  async waitState(state, timeout = 60000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await this.evaluate('window.__game && window.__game.state')) === state) return true;
      await sleep(150);
    }
    return false;
  }

  async key(type, k) {
    const [key, code] = KEYS[k] || [k, 0];
    if (!KEYS[k]) throw new Error(`unknown key ${k}`);
    await this.send('Input.dispatchKeyEvent', { type, key, code: k, windowsVirtualKeyCode: code });
  }

  async press(k, hold = 40) {
    await this.key('keyDown', k);
    await sleep(hold);
    await this.key('keyUp', k);
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async tap(x, y, hold = 60) {
    const p = [{ x, y, id: 1 }];
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p });
    await sleep(hold);
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }

  async close() {
    try { this.ws.close(); } catch { /* already closed */ }
    this.proc.kill();
    await sleep(300);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
  }
}
