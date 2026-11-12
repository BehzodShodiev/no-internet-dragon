// Close-up screenshots of a monster on the title screen, for judging models.
//   node tools/closeup.mjs <outDir> [--quality high] [--monster kaiju] [--skin 0] [--level 1] [--tag name] [--day 0.25] [--noglow 1]
// Writes <tag>-side.png, <tag>-front.png, <tag>-head.png, <tag>-back.png (1280x720).
import path from 'node:path';
import { Session, sleep } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const out = A._[0];
if (!out) { console.log('usage: node tools/closeup.mjs <outDir> [--quality high] [--monster kaiju] [--skin 0] [--level 1] [--tag name]'); process.exit(1); }
const quality = A.quality || 'high';
const monster = A.monster || 'kaiju';
const tag = A.tag || `${monster}-${quality}`;
// camera offsets from the monster's middle: [x, y, z], look-at offset [x, y, z], fov
const VIEWS = {
  side: [[0.3, 0.5, 7.2], [0.3, 0.1, 0], 30],
  front: [[5.2, 1.0, 4.2], [0.6, 0.2, 0], 30],
  head: [[3.6, 1.0, 2.6], [1.75, 0.75, 0], 26],
  back: [[-4.6, 2.2, 4.4], [0, 0.2, 0], 30],
};

const { url, close } = await serve(A.url);
const s = await Session.launch({ w: 1280, h: 720 });
await s.navigate(url);
if (!(await s.waitState('title', 120000))) { console.log('no title'); process.exit(1); }
const setup = await s.evaluate(`(async () => { const g = window.__game;
  g.selectLevel(${Number(A.level || 1) - 1}, true);
  g._setQuality('${quality}', false);
  g.selectMonster('${monster}', true);
  ${A.skin != null ? `g.selectSkin(${Number(A.skin)});` : ''}
  ${A.day != null ? `g.dayT = ${Number(A.day)}; g.env.setTimeOfDay(g.dayT);` : ''}
  ${A.noglow ? 'g.dragon.setGlow(0, 0, -1); g.dragon.setGlow = () => {};' : ''}
  for (const id of ['title-screen', 'hud', 'toast']) document.getElementById(id).style.display = 'none';
  window.__cam = null;
  const rig = g.rig, up = rig.update.bind(rig);
  rig.update = (dt, o) => { up(dt, o); const c = window.__cam; if (!c) return;
    const p = g.dragon.group.position; const cx = p.x, cy = p.y + 1.25;
    g.camera.fov = c[2]; g.camera.position.set(cx + c[0][0], cy + c[0][1], c[0][2]);
    g.camera.lookAt(cx + c[1][0], cy + c[1][1], c[1][2]); g.camera.updateProjectionMatrix(); };
  return g.monster.id + ' ' + g.renderer.qualityName + ' detail ' + (g.dragon.detail || 'std') + ' tris ' + g.dragon.group.children.reduce((n, m) => n + (m.geometry ? (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 : 0), 0); })()`);
console.log(setup);
await sleep(2500); // a pending model swap and its shader compile
for (const [name, cam] of Object.entries(VIEWS)) {
  await s.evaluate(`window.__cam = ${JSON.stringify(cam)}; 1`);
  await sleep(700);
  await s.screenshot(path.join(out, `${tag}-${name}.png`));
}
console.log(await s.evaluate(`(() => { const g = window.__game; return 'now: detail ' + (g.dragon.detail || 'std') + ', programs ' + g.renderer.renderer.info.programs.length + ', buffer ' + g.renderer.renderer.domElement.width + 'x' + g.renderer.renderer.domElement.height; })()`));
const errs = s.logs.filter((l) => /exception|error/i.test(l));
if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 8).join('\n'));
await s.close();
await close();
