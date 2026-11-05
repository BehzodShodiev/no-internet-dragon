// Minimal dependency-free CDP driver. Run with: node --experimental-websocket cdp.mjs <url> <outdir> <steps.json> [w h]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [url, outdir, stepsFile, w = '1280', h = '720'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outdir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-prof-'));
const chrome = spawn('C:/Users/behzod.shadiev/AppData/Local/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  `--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch { /* not up yet */ }
  await sleep(200);
}
if (!target) { console.log('no target'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
};
const KEYS = {
  Space: { key: ' ', code: 'Space', keyCode: 32 }, ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, KeyV: { key: 'v', code: 'KeyV', keyCode: 86 },
  KeyF: { key: 'f', code: 'KeyF', keyCode: 70 }, KeyP: { key: 'p', code: 'KeyP', keyCode: 80 }, KeyQ: { key: 'q', code: 'KeyQ', keyCode: 81 }, KeyL: { key: 'l', code: 'KeyL', keyCode: 76 }, KeyD: { key: 'd', code: 'KeyD', keyCode: 68 }, Digit1: { key: '1', code: 'Digit1', keyCode: 49 }, Digit2: { key: '2', code: 'Digit2', keyCode: 50 }, Digit3: { key: '3', code: 'Digit3', keyCode: 51 }, Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
};
const key = async (type, k) => send('Input.dispatchKeyEvent', { type, key: KEYS[k].key, code: KEYS[k].code, windowsVirtualKeyCode: KEYS[k].keyCode });

const t0 = Date.now();
for (const s of steps) {
  if (s.waitState) {
    const end = Date.now() + 60000;
    while (Date.now() < end && (await evaluate(`window.__game && window.__game.state`)) !== s.waitState) await sleep(150);
  }
  if (s.wait) await sleep(s.wait);
  if (s.key) { await key('keyDown', s.key); await sleep(s.hold || 40); await key('keyUp', s.key); }
  if (s.down) await key('keyDown', s.down);
  if (s.up) await key('keyUp', s.up);
  if (s.cdp) { const r = await send(s.cdp, s.params || {}); if (r.error) logs.push(`[cdp-error] ${s.cdp}: ${r.error.message}`); }
  if (s.click) {
    const [x, y] = s.click;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  if (s.reload) { await send('Page.reload', { ignoreCache: false }); await sleep(500); }
  if (s.eval) { const r = await evaluate(s.eval); if (r !== undefined) logs.push(`[eval] ${typeof r === 'string' ? r : JSON.stringify(r)}`); }
  if (s.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outdir, s.shot + '.png'), Buffer.from(r.result.data, 'base64'));
  }
}
logs.push(`elapsed ${(Date.now() - t0) / 1000}s`);
console.log(logs.join('\n'));
ws.close();
chrome.kill();
setTimeout(() => process.exit(0), 300);
