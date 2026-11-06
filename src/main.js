import './font.css';
import './style.css';
import { Game } from './game/Game.js';

// Pixel-art dragon icon in the spirit of Chrome's offline T-rex.
const DINO = [
  '..........#.#.#.....',
  '.........########...',
  '........##.#######..',
  '........##########..',
  '........##########..',
  '........#####.......',
  '.......#.########...',
  '#.....######........',
  '#....#######........',
  '##..##########......',
  '###.#########.#.....',
  '#############.......',
  '.###########........',
  '..#########.........',
  '...#######..........',
  '....###.##..........',
  '....##...#..........',
  '....#....#..........',
  '....##...##.........',
];
function dinoSVG() {
  const w = DINO[0].length, h = DINO.length;
  let rects = '';
  DINO.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '#') rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
  }));
  return `<svg viewBox="-1 -1 ${w + 2} ${h + 2}" fill="#9aa0a6" shape-rendering="crispEdges">${rects}</svg>`;
}
document.getElementById('dino-icon').innerHTML = dinoSVG();

function fail(msg) {
  const el = document.getElementById('load-text');
  el.textContent = msg;
  el.style.color = '#ff8a73';
  console.error(msg);
}

const canvas = document.getElementById('scene');
if (!document.createElement('canvas').getContext('webgl2')) {
  fail('Your browser does not support WebGL 2, which this game needs.');
} else {
  const game = new Game(canvas);
  window.__game = game;
  game.init().catch((e) => fail(`Failed to start: ${e.message}`));
}

// Offline support: the whole point of the game is playing without internet.
// (The single-file build has no sw.js next to it, and embedded viewers don't allow service workers.)
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'single' && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
