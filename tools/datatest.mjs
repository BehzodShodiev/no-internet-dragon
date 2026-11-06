// Data-safety gate: leaderboard writes never lose a player's other fields, and old local saves still load.
//   node tools/datatest.mjs [--url URL]
// Runs the game against tools/mock-claude.js with injected failures. Exit 1 on any failed check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, sleep } from './lib/cdp.mjs';
import { serve, args } from './lib/server.mjs';

const A = args();
const mock = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mock-claude.js'), 'utf8');
const { url, close } = await serve(A.url);
const s = await Session.launch({ w: 960, h: 540 });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: mock });

let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
async function open(params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  await s.navigate(u.toString());
  if (!(await s.waitState('title', 90000))) throw new Error('no title');
  for (let i = 0; i < 40; i++) {
    if ((await s.evaluate('window.__game.board.status')) === 'ready') break;
    await sleep(150);
  }
}
const row = () => s.evaluate("JSON.stringify(window.__mockDocs.get('scores/u_me') || null)").then((j) => JSON.parse(j));
const writes = () => s.evaluate('JSON.stringify(window.__mockWrites)').then((j) => JSON.parse(j));
const submit = (field, score) => s.evaluate(`window.__game.board.submit('${field}', ${score}, { view: '3d', stage: 2 })`);
const sync = () => s.evaluate("(async () => { const b = window.__game.board; b.syncProgress({ stats: { crystals: 1 }, unlocked: ['kaiju'] }); await b._writing; return true; })()");

// 1. existing row, every read of it fails: the post must not replace the row
await open({ mockmine: '1', mockfail: 'get' });
await submit('l2', 1234);
await sync();
let r = await row(), w = await writes();
check('row kept when its reads fail', r && r.best === 500 && r.l3 === 900 && r.l2 === 1234 && r.progress?.stats?.crystals === 42, JSON.stringify(r));
check('no set() without a successful read', !w.some((x) => x.op === 'set'), w.map((x) => x.op).join(','));
check('progress not overwritten blind', !w.some((x) => 'progress' in x.body));

// 2. existing row, first read fails, retry succeeds
await open({ mockmine: '1', mockfail: 'get1' });
await submit('l2', 2222);
r = await row();
check('retry reads the row, then updates', r && r.best === 500 && r.l3 === 900 && r.l2 === 2222 && r.progress?.stats?.crystals === 42, JSON.stringify(r));
const merged = await s.evaluate('window.__game.progress.stats.crystals');
check('remote progress merged after the retry', merged >= 42, `crystals ${merged}`);

// 3. a new player: the first post creates the row
await open({});
await submit('l3', 3333);
await sync();
r = await row();
check('new row created', r && r.l3 === 3333 && r.best === 0 && r.progress?.stats?.crystals === 1, JSON.stringify(r));

// 4. no row and reads fail: nothing is created blind, and the viewer isn't marked read-only
await open({ mockfail: 'get' });
const ok4 = await submit('l2', 4444);
r = await row();
const ro = await s.evaluate('window.__game.board.readOnly');
check('no blind create', ok4 === false && r === null, `posted ${ok4}, row ${JSON.stringify(r)}`);
check('not wrongly read-only', ro === false);

// 5. view-only viewer
await open({ mockro: '1' });
const ok5 = await submit('best', 5555);
const err5 = await s.evaluate('window.__game.board.saveError');
check('view-only viewer is told', ok5 === false && err5 === 'readonly', `saveError ${err5}`);

// 6. old local saves keep working (pre-unlock progress, local bests, saved picks)
await open({ mockro: '1' });
await s.evaluate(`(() => { localStorage.setItem('dragon.progress', JSON.stringify({ stats: { crystals: 600, gunships: 5, runs: 9 }, unlocked: ['kaiju'] }));
  localStorage.setItem('dragon.hi', '777'); localStorage.setItem('dragon.hi.2', '888'); localStorage.setItem('dragon.monster', 'mothra');
  localStorage.setItem('dragon.skin', 'shin'); localStorage.setItem('dragon.level', '1'); return true; })()`);
await s.send('Page.reload', {});
await sleep(500);
await s.waitState('title', 90000);
const st = await s.evaluate(`JSON.stringify({ crystals: window.__game.progress.stats.crystals, unlocked: [...window.__game.progress.unlocked],
  monster: window.__game.monster.id, bests: window.__game.localBests, level: window.__game.levelIndex, skin: window.__game.skinIndex })`).then((j) => JSON.parse(j));
check('old progress loads', st.crystals === 600, JSON.stringify(st));
check('met goals unlock on load', st.unlocked.includes('ghidorah') && st.unlocked.includes('mothra'));
check('saved monster, level and bests restored', st.monster === 'mothra' && st.level === 1 && st.bests[0] === 777 && st.bests[1] === 888);

await s.close();
await close();
console.log(fails ? `\n${fails} check(s) failed` : '\nall data checks passed');
process.exit(fails ? 1 : 0);
