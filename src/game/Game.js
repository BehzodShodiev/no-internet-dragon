// Main game: state machine, physics, scoring, combos, stages, the boss, effects and the render loop.
import * as THREE from 'three';
import { Renderer, QUALITY } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { AudioEngine } from './Audio.js';
import { HUD } from './HUD.js';
import { Leaderboard } from './Leaderboard.js';
import { Stages, LEVELS } from './Stages.js';
import { Dragon, DRAGON_SCALE } from '../entities/Dragon.js';
import { Moth } from '../entities/Moth.js';
import { Obstacles, SMASH, SILENT } from '../entities/Obstacles.js';
import { Crystals } from '../entities/Crystals.js';
import { Boss } from '../entities/Boss.js';
import { SKINS } from '../entities/Skins.js';
import { MONSTERS } from '../entities/Monsters.js';
import { Progress } from './Progress.js';
import { PerfMonitor } from './PerfMonitor.js';
import { Terrain } from '../world/Terrain.js';
import { City } from '../world/City.js';
import { Volcano } from '../world/Volcano.js';
import { Debris } from '../world/Debris.js';
import { Blasts } from '../world/Blasts.js';
import { SupplyDrops, POWERUPS } from './SupplyDrops.js';
import { CRESCENDO } from './Patterns.js';
import { Environment } from '../world/Environment.js';
import { Scenery } from '../world/Scenery.js';
import { Particles, BreathBeam, Footprints } from '../world/Particles.js';
import { Teeth } from '../world/Teeth.js';
import { ContactShadows } from '../world/ContactShadows.js';
import { runAOQueue } from '../gfx/ao.js';
import * as TX from '../gfx/textures.js';
import { TexCache } from '../gfx/TexCache.js';
import { mulberry32, hash32 } from '../gfx/noise.js';

export const CFG = {
  startSpeed: 11,
  maxSpeed: 24,
  accel: 0.12,
  gravity: 58,
  jumpV: 19.6,
  jumpCut: 9,
  minCutHeight: 1.4,
  fastFall: 2.8,
  scoreRate: 0.75,
  dayLength: 1500, // distance points per full day/night cycle
  breathFill: 70, // distance points to fully charge the atomic breath
  breathStart: 0.6, // every run starts mostly charged, so the first breath comes within seconds
  breathTime: 1.3,
  breathRange: 34,
  // The 3D chase cam shows ~120 units of track ahead (2D: ~20), so 3D runs faster and denser to stay a challenge.
  pace3d: 1.2, // world speed multiplier in 3D
  accel3d: 1.5, // acceleration multiplier in 3D
  // combo and rewards (points are multiplied by the combo multiplier)
  multTiers: [10, 30, 60, 100], // combo chain needed for ×2, ×3, ×4 and ×5
  crystalPoints: 5,
  closeCall: 0.35, // vertical clearance (units) that counts as a close call
  closePoints: 10,
  killPoints: 25,
  bossPoints: 500,
  // Kaiju Rage
  rageCrystals: 40, // crystals to fill the meter on the Desert (harder levels set their own)
  rageTime: 7,
  rageScale: 1.35,
  rageSpeed: 0.15,
  // boss
  missileSpeed: 19, // closing speed of the gunship's missiles, +1.5 per gunship downed
  // per-level breath and rage rates (and the gunship-fight boost) live in LEVELS (Stages.js)
  // smash: a jaws-first lunge that breaks most things in front of the snout
  smashTime: 0.45, // seconds the lunge can break things (generous: people's timing varies)
  smashReach: 3.0, // units ahead of the snout
  smashRecover: 0.12, // cooldown after a smash that connected
  smashMiss: 0.38, // cooldown after a whiff, so mashing the key is a gamble
  hitStop: 0.05, // freeze-frame on impact
  jumpBuffer: 0.12, // a jump pressed this long before landing still happens, the moment you land
  // smash mastery
  perfectLead: 1.2, // pressed when the target was within this many units of the jaws: PERFECT
  smashStreak: 1.5, // seconds between smashes that still count as a DOUBLE / TRIPLE SMASH
  smashRage: 0.6, // each smash fills Kaiju Rage like this share of a crystal
  lateDuck: 0.25, // a duck counts as a close call only if it started this close (seconds) to the threat
  // gliding (the Moth Queen): holding jump on the way down
  glideGravity: 0.3, // share of gravity while gliding
  glideFall: 6.5, // fastest fall while gliding (units/s)
  loopSpeed: 0.1, // every completed stage loop raises the speed cap by this much (up to 4 loops)
  rushTime: 4, // seconds of Crystal Rush (a river of crystals, nothing to dodge) after each gunship
  bossEvery: 14000, // after the first gunship, the next comes once you've scored this many more points (was 7000: too often)
};

// Auto starts at Medium on every device (and never climbs above where it started); it can still step down.
const AUTO_START = 'medium';
const qualityLabel = (name) => ({ verylow: 'VERY LOW', veryhigh: 'VERY HIGH' })[name] || name.toUpperCase();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.hud = new HUD();
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.board = new Leaderboard();
    this.stages = new Stages();
    this.levelIndex = Math.min(LEVELS.length - 1, Math.max(0, Number(store.get('dragon.level', 0)) || 0));
    this.level = LEVELS[this.levelIndex];
    this.stages.setLevel(this.level);
    // local bests per level (the Desert keeps the pre-levels key)
    this.progress = new Progress();
    // a goal reached in a run that ended without a death (tab closed) unlocks now, before the saved pick is restored
    this.lateUnlocks = this.progress.check(MONSTERS);
    if (this.lateUnlocks.length) this.progress.save();
    const savedMonster = MONSTERS.find((m) => m.id === store.get('dragon.monster', 'rex')); // new players start as the Pixel Rex
    this.monster = savedMonster && this.progress.isUnlocked(savedMonster) ? savedMonster : MONSTERS[0];
    this.preview = false; // the owner trying a locked monster
    this.skinIndex = Math.min(SKINS.length - 1, Math.max(0, SKINS.findIndex((k) => k.id === store.get('dragon.skin', 'classic'))));
    // other monsters' chosen skins (the Kaiju's stays in skinIndex and 'dragon.skin', as before)
    this.skinIdx = {};
    for (const m of MONSTERS) {
      if (!m.skins || m.id === 'kaiju') continue;
      this.skinIdx[m.id] = Math.max(0, m.skins.findIndex((k) => k.id === store.get(`dragon.skin.${m.id}`, '')));
    }
    this.skin = SKINS[this.skinIndex];
    this.scoreK = this.skin.hitX; // score factor of the current look (see _applyLook)
    this.gliding = false;
    this.localBests = LEVELS.map((lv) => Number(store.get(lv.id === 1 ? 'dragon.hi' : `dragon.hi.${lv.id}`, 0)) || 0);
    this.state = 'loading';
    this.time = 0;
    this.scroll = 0;
    this.pace = 0; // base run speed, as in the 2D view
    this.speed = 0; // actual world speed: pace scaled up in the 3D view and during Kaiju Rage
    this.score = 0;
    this.dist = 0; // distance points: the score before combo multipliers; drives stages, breath and day
    this.hi = this.localBests[this.levelIndex];
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.cutPending = false;
    this.charge = 0;
    this.breathT = 0;
    this.timeScale = 1;
    this.flash = 0;
    this.flashColor = new THREE.Color(1, 0.25, 0.1);
    this.dayT = 0.035;
    this.settings = {
      view: store.get('dragon.view', '2d'), // new players start in the classic 2D view (a hint offers 3D)
      quality: ['auto', 'veryhigh', 'high', 'medium', 'low', 'verylow'].includes(store.get('dragon.quality', 'auto')) ? store.get('dragon.quality', 'auto') : 'auto',
    };
    this.boxes = Array.from({ length: 8 }, () => new Float32Array(4));
    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
    // ?sim=N: fixed-step fast simulation for automated tests (N steps of 1/60 s per frame; never posts or saves)
    this.sim = Math.min(32, Math.max(0, Math.floor(Number(params.get('sim')) || 0)));
    // ?seed=N replays runs: run k of this page uses seed N + k (a random base otherwise)
    this.seedFixed = params.has('seed');
    this.seedBase = this.seedFixed ? Number(params.get('seed')) >>> 0 : (Math.random() * 4294967296) >>> 0;
    this.runCount = 0;
    this.seed = this.seedBase;
    this._dustDay = new THREE.Color();
    this._dir = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._mouth = new THREE.Vector3();
    this._bossBox = new Float32Array(4);
    this._v3c = new THREE.Color();
    this._sideMouths = [new THREE.Vector3(), new THREE.Vector3()];
    // per-frame scratch (the main loop allocates nothing)
    this.coarseMQ = matchMedia('(pointer: coarse)');
    this.reducedMotion = store.get('dragon.motion', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full') === 'reduce';
    this._scr = { x: 0, y: 0, behind: false };
    this._warnList = Array.from({ length: 8 }, () => ({ x: 0, y: 0, kind: 'low' }));
    this._warns = [];
    this._homes = { wide: { x: 15.5, y: 4.6 }, tall: { x: 9, y: 5.4 } };
    this._dst = { speed: 0, grounded: true, vy: 0, ducking: false, running: false, dead: false, roar: 0, breath: 0, bite: 0, glide: false };
    this._rigOpts = { aspect: 1, dragonY: 0, speed: 0, rage: 0, dead: 0, boss: 0 };
    this._crystalOpts = { magnet: 0, onPick: (c) => this._pickCrystal(c), onMiss: () => this._missCrystal() };
    this._bossCtx = {
      home: null, yaw: 0,
      fire: (y, x0, y0) => {
        this.obstacles.spawnMissile(x0, y0, y, CFG.missileSpeed + 1.5 * Math.min(this.bossesDowned + this.level.tight, 5), this.speed);
        this.audio.missileLaunch(x0);
        for (let i = 0; i < 8; i++) this.dust.emit(x0, y0, 0, Math.random() * 2, -1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.7, 0.4, 2, 0.5, 0.5, 0.5, 0.5, 2, 0, 0);
      },
      smoke: (x, y) => this.dust.emit(x, y, (Math.random() - 0.5), Math.random() * 2, 1 + Math.random() * 2, 0, 1.4, 1, 4, 0.12, 0.11, 0.1, 0.6, 1.5, -0.4, 0),
      blast: (x, y, size) => this._blast(x, y, size),
      onGone: () => this._afterBoss(),
    };
    // one-time hints already shown (remembered across visits)
    try { this.tips = JSON.parse(store.get('dragon.tips', '{}')) || {}; } catch { this.tips = {}; }
    this._resetRun();
  }

  /** Per-run state shared by the first start and every restart. */
  _resetRun() {
    this.seed = (this.seedBase + this.runCount++) >>> 0;
    this.viewHintT = 8; // seconds into the run before the 3D hint (see _viewHint)
    this.score = 0;
    this.dist = 0;
    this.chain = 0;
    this.mult = 1;
    this.bestMult = 1;
    this.rage = 0;
    this.rageT = 0;
    this.rageK = 0;
    this.graceT = 0;
    this.slowT = 0;
    this.crystalsRun = 0;
    this.bossesDowned = 0;
    this.bossesSeen = 0;
    this.nextBossScore = Infinity; // set when a gunship falls
    this.toastAfter = null;
    this.bossPending = false;
    this.bossHitThisBreath = false;
    this.pendingBanner = null;
    this.lastRun = null;
    this.rivalRow = null;
    this.passToastT = 0;
    this.toldPB = false;
    this.warnCount = 0;
    this.smashT = 0;
    this.smashCool = 0;
    this.smashHit = false;
    this.hitStopT = 0;
    this.smashes = 0;
    this.jumpBuf = 0;
    this.rageReady = false;
    this.streak = 0;
    this.streakT = 0;
    this.breathKills = 0;
    this.perfects = 0;
    this.charge = CFG.breathStart;
    this.toldReady = false;
    this.breathT = 0;
    this.breathGlow = 0;
    this.stages.reset();
    if (this.obstacles) {
      this.obstacles.reset(this.seed);
      this.obstacles.cycle = 0;
      this.crystals.clear();
      this.boss.reset();
      this.debris.clear();
      this.blasts?.clear();
      this.supply?.reset(this.seed);
      this.magnetT = 0;
      this._setupWorld();
      this.dragon.setRage(0);
      this.hud.setBoss('', -1, 0);
      this.hud.setCombo(1, 0);
      this.hud.setRage(0, false, false);
      this.hud.resetRival();
      this.hud.setWarnings([]);
      this.audio.setRotor(0);
    }
  }

  /** Lays out the current level's world: biome, city or volcano set dressing, time of day, first stage. */
  _setupWorld(instant = true) {
    const lv = this.level;
    this.env.setBiome(lv.biome, instant);
    this.audio.setBiome(lv.biome);
    this.scenery.setBiome(lv.biome);
    this.obstacles.setBiome(lv.biome);
    this.city.reset();
    if (lv.biome === 'city') this.city.prefill();
    this.volcano.setActive(lv.biome === 'volcano');
    const ash = lv.biome === 'volcano' ? 1 : 0;
    if (instant) {
      this.terrain.uniforms.uAsh.value = this.terrain.uniforms.uLava.value = ash;
      this.terrain.uniforms.uCity.value = lv.biome === 'city' ? 1 : 0;
    }
    this.obstacles.stage = this.stages.current.key;
    this.obstacles.levelTight = lv.tight;
    this.dayT = lv.time ?? lv.startT;
    this.env.setTimeOfDay(this.dayT);
    // each level's gunship has its own livery
    this.boss.mat.color.set(lv.id === 3 ? 0xff9a80 : lv.id === 2 ? 0xc4d0ff : 0xffffff);
  }

  /** Points for a scoring event: the combo multiplier and the skin's build (or the monster's score factor) both apply. */
  _pts(base) {
    return Math.round(base * this.mult * this.scoreK);
  }

  /** The current monster's roar (the Moth Queen's is a high cry). */
  _roar(duration, pitch = 1) {
    this.audio.roar(duration, pitch * (this.monster.voice ?? 1), this.monster.sound?.roar);
  }

  /**
   * Picks a skin of the current monster (only between runs); the monster on screen changes straight away.
   * A monster without skins switches to the Kaiju, as before.
   */
  selectSkin(index) {
    const m = this.monster.skins ? this.monster : MONSTERS[0];
    index = (index + m.skins.length) % m.skins.length;
    if (m.id === 'kaiju') {
      this.skinIndex = index;
      store.set('dragon.skin', m.skins[index].id);
    } else {
      this.skinIdx[m.id] = index;
      store.set(`dragon.skin.${m.id}`, m.skins[index].id);
    }
    if (m !== this.monster) { this.selectMonster(m.id); return; }
    this.hud.setSkin(index);
    this._applyLook();
  }

  /** The chosen skin index of a monster with skins. */
  _skinIndexOf(m) {
    return m.id === 'kaiju' ? this.skinIndex : this.skinIdx[m.id] || 0;
  }

  /** The current monster's colours, breath and build (from its chosen skin, if it has skins). */
  _applyLook() {
    this.skin = this.monster.skins ? this.monster.skins[this._skinIndexOf(this.monster)] : this.monster.look;
    this.scoreK = this.skin.score ?? this.skin.hitX;
    this.dragon.setSkin(this.skin);
    this.beam.setColors(this.skin.beam);
    for (const b of this.sideBeams) b.setColors(this.skin.beam);
    this.teeth?.setStyle(this.skin.model);
    // the breath's own colour (its sheath, normalised): scorch marks and the impact light use it
    const [r, g, b] = this.skin.beam[0], m = Math.max(r, g, b);
    (this.breathColor ||= new THREE.Color()).setRGB(r / m, g / m, b / m);
  }

  /** Switches monster between runs. Locked ones need preview (owner only). Models are built on first use. */
  selectMonster(id, preview = false) {
    const m = MONSTERS.find((x) => x.id === id);
    if (!m || (!this.progress.isUnlocked(m) && !preview)) return;
    const d = this.dragons[m.id] || this._buildMonster(m);
    for (const k in this.dragons) this.dragons[k].group.visible = k === m.id;
    d.group.position.copy(this.dragon.group.position);
    this.dragon = d;
    this.monster = m;
    this.preview = preview && !this.progress.isUnlocked(m);
    if (!this.preview) store.set('dragon.monster', m.id);
    this._applyLook();
    this.hud.setMonster(m, this.preview);
    if (m.skins) {
      if (this.hud.skins !== m.skins) this.hud.buildSkins(m.skins, this._onSkinPick);
      this.hud.setSkin(this._skinIndexOf(m));
    }
    this.hud.renderMonsters(this.progress, m.id, this.board.isOwner);
  }

  /** Builds a monster's model (hidden) and keeps it for later picks. */
  _buildMonster(m) {
    const d = (this.dragons[m.id] = m.model === 'moth' ? new Moth() : new Dragon(this.tex.scales, m.variant, this.modelDetail || 'std'));
    d.onFootstep = (leg, fx) => this._footstep(leg, fx);
    d.onWingbeat = (k) => this._wingbeat(k);
    d.group.visible = false;
    this.scene.add(d.group);
    return d;
  }

  /**
   * While the title sits idle, builds the other monsters one at a time and compiles their shaders in the
   * background, so picking one later is instant instead of a visible freeze.
   */
  _prebuildMonsters() {
    const queue = MONSTERS.filter((m) => !this.dragons[m.id]);
    const next = () => {
      if (!queue.length) return;
      if (this.state !== 'title' && this.state !== 'over') { setTimeout(next, 3000); return; }
      const m = queue.shift();
      if (!this.dragons[m.id]) this._buildMonster(m);
      this._compileScene().then(() => setTimeout(next, 400));
    };
    setTimeout(next, this.sim ? 0 : 2500);
  }

  toggleMonsters(force) {
    if (this.state !== 'title' && this.state !== 'over') return;
    const want = force ?? !this.hud.isMonstersOpen();
    if (want) this.hud.renderMonsters(this.progress, this.monster.id, this.board.isOwner);
    if (want !== this.hud.isMonstersOpen()) this.audio.ui(want ? 'open' : 'close');
    this.hud.showMonsters(want);
  }

  /** Picks a level (on the title screen the world behind the menu changes with it). */
  selectLevel(index, instant = false) {
    index = (index + LEVELS.length) % LEVELS.length;
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.stages.setLevel(this.level);
    store.set('dragon.level', String(index));
    this.hi = Math.max(this.localBests[index], this.board.myBest(this.level.field));
    this.hud.setHi(this.hi);
    this.hud.boardField = null;
    if (this.obstacles) {
      this.obstacles.reset();
      this.crystals.clear();
      this.debris.clear();
      this.blasts?.clear();
      this.supply?.clear();
      this.magnetT = 0;
      this._setupWorld(instant);
    }
    this._onBoard();
  }

  async init() {
    // load-step timestamps (ms since navigation), for tools/perf.mjs and the ?perf overlay
    this.loadTimes = [];
    const mark = (this._mark = (text) => this.loadTimes.push({ text, t: Math.round(performance.now()) }));
    const step = async (p, text) => { mark(text); this.hud.loading(p, text); await nextFrame(); };
    await step(0.05, 'Warming up the GPU…');
    this.renderer = new Renderer(this.canvas);
    if (new URLSearchParams(location.search).has('perf')) this.perf = new PerfMonitor(this.renderer);
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 6000);
    this.rig = new CameraRig(this.camera);
    this.rig.reducedMotion = this.reducedMotion;
    this.rig.mode = this.settings.view;
    this.rig.raw = this.rig.blend = this.settings.view === '3d' ? 1 : 0;
    this.rig.intro = 1;

    await step(0.12, 'Raking the sand…');
    const tex = {};
    // procedural textures come from the browser's cache after the first visit (see TexCache)
    const cache = await new TexCache().open();
    tex.sand = await cache.textures('sand', () => TX.makeSandTextures());
    await step(0.24, 'Growing dragon scales…');
    tex.scales = await cache.textures('scales', () => TX.makeScaleTextures());
    await step(0.36, 'Weathering rocks…');
    tex.rock = await cache.textures('rock', () => TX.makeRockTextures());
    tex.cactus = await cache.textures('cactus', () => TX.makeCactusTextures());
    tex.brush = await cache.textures('brush', () => TX.makeBrushTexture());
    tex.dot = await cache.textures('dot', () => TX.makeSoftDotTexture());
    tex.footprint = await cache.textures('footprint', () => TX.makeFootprintTexture());
    tex.noise = await cache.textures('noise', () => TX.makeNoiseTexture());
    this.tex = tex;

    await step(0.48, 'Shaping dunes…');
    const qName = this.settings.quality === 'auto' ? AUTO_START : this.settings.quality;
    this.terrain = new Terrain(tex.sand, QUALITY[qName].terrain);
    scene.add(this.terrain.mesh);

    await step(0.58, 'Painting the sky…');
    this.env = new Environment(this.renderer.renderer, scene, tex.noise);
    this.env.setTimeOfDay(this.dayT);

    await step(0.68, 'Hatching the dragon…');
    this.dragon = new Dragon(tex.scales);
    this.dragons = { kaiju: this.dragon }; // other monsters are built the first time they're picked
    scene.add(this.dragon.group);
    this.dragon.onFootstep = (leg, fx) => this._footstep(leg, fx);

    await step(0.78, 'Planting cacti, rolling out tanks…');
    this.obstacles = new Obstacles(scene, tex);
    this.obstacles.jump = { v: CFG.jumpV, g: CFG.gravity };
    this.obstacles.onFire = (o) => this._tankFired(o);
    this.crystals = new Crystals(scene);
    this.obstacles.crystals = this.crystals;
    this.boss = new Boss(scene, tex);
    this.city = new City(scene);
    this.obstacles.city = this.city;
    this.volcano = new Volcano(scene, tex);
    this.obstacles.volcano = this.volcano;
    this.obstacles.onMeteor = (o) => this._meteorImpact(o);
    this.obstacles.onPiece = (p) => this._onPiece(p);
    this.debris = new Debris(scene, tex);
    this.blasts = new Blasts(scene, this.tex.noise);
    this.supply = new SupplyDrops(scene);
    this.magnetT = 0;
    // volcano plumes and eruptions are drawn by Blasts (one instanced draw)
    this.volcano.onPuff = (x, y, z, r, life, rise, heat) => this.blasts.puff(x, y, z, r, life, rise, heat);
    this.volcano.onErupt = (x, y, z, s) => this._erupt(x, y, z, s);
    // explosions light up what's around them: one pooled light, present from load at zero (the light
    // set never changes, so no shader ever recompiles for it)
    this.blastLight = new THREE.PointLight(0xff8a3a, 0, 26, 2);
    this.blastLightT = 0;
    this.blastPeak = 0;
    scene.add(this.blastLight);
    // The dragon's glow lights the way after dark: a soft forward beam that picks out what's coming.
    // It always exists (at zero by day) so the shaders compile with it during loading.
    this.dragonLight = new THREE.SpotLight(0xcfe6ff, 0, 42, 0.62, 0.75, 1);
    scene.add(this.dragonLight, this.dragonLight.target);
    this.scenery = new Scenery(scene, this.terrain, tex, { rock: this.obstacles.rockMat, cactus: this.obstacles.cactusMat });

    await step(0.86, 'Stirring up dust…');
    this.dust = new Particles(900, tex.dot);
    this.sparks = new Particles(900, tex.dot, { additive: true });
    scene.add(this.dust.points, this.sparks.points);
    this.beam = new BreathBeam();
    // the Golden Hydra breathes from all three heads: two extra beams (without their own lights)
    this.sideBeams = [new BreathBeam(), new BreathBeam()];
    for (const b of this.sideBeams) scene.add(b.mesh);
    scene.add(this.beam.mesh, this.beam.light);
    this.teeth = new Teeth(scene); // the Rex's Tooth Quake
    this.contact = new ContactShadows(scene, tex.dot);
    this.footprints = new Footprints(tex.footprint);
    scene.add(this.footprints.mesh);

    this.renderer.setup(scene, this.camera, this.env.light);
    // Auto quality asks for another preset: applied now on menus, or when the current run ends
    this.renderer.onPreset = (name) => {
      if (this.state === 'running' || this.state === 'intro' || this.state === 'dying' || this.state === 'paused') this.pendingPreset = name;
      else this._autoPreset(name);
    };
    this._setQuality(this.settings.quality, false);

    await step(0.93, 'Compiling shaders…');
    await this._prewarm();

    this._bindUI();
    this.selectLevel(this.levelIndex, true);
    // restore the saved skin and monster (selectSkin would switch to the Kaiju, so only mark the swatch)
    this.hud.setSkin(this.skinIndex);
    this.selectMonster(this.monster.id);
    this.hud.setHi(this.hi);
    this.hud.setScore(0, 0);
    this.hud.setView(this.rig.mode);
    this.hud.setMuted(this.audio.muted);
    window.addEventListener('resize', () => { this.renderer.resize(); this._pausedDrawn = false; });
    // Lifetime stats count during a run; keep them if the tab is hidden or closed mid-run.
    const saveProgress = () => { if (!this.sim) this.progress.save(); };
    window.addEventListener('pagehide', saveProgress);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { if (this.state !== 'paused') this.audio.setPaused(false); return; }
      saveProgress();
      if (this.state === 'running') this.togglePause(true);
      this.audio.setPaused(true);
    });
    // clicking another window mid-run would otherwise mean an unfair death
    window.addEventListener('blur', () => { if (this.state === 'running' && !this.sim) this.togglePause(true); });
    if (this.lateUnlocks.length) {
      const m = this.lateUnlocks[0];
      setTimeout(() => this.hud.toast(`${m.name} unlocked! Pick it in Monsters.`, 4200), 1200);
    }

    // Opening the audio device can stall the main thread for ~100ms, so do it now (suspended)
    // rather than on the first key press; the first gesture merely resumes it.
    this.audio.init();

    // the company leaderboard lights up when the claude.ai viewer answers (never blocks the game)
    this.board.onChange = () => this._onBoard();
    this.board.connect().catch(() => {});

    await step(1, 'Ready');
    window.__loadTimes = this.loadTimes;
    this.state = 'title';
    this.hud.setMenu(true);
    this.hud.hideLoading();
    this._prebuildMonsters();
    this.hud.show('title', true);
    this.last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  async _prewarm() {
    // spawn one of everything so every material/program is compiled before play
    const o = this.obstacles;
    // one sample of every pool type, keyed by type (a new type without a sample is reported)
    const T = {
      cactusS: o._spawnCactus('cactusS', 1), cactusL: o._spawnCactus('cactusL', 1), rock: o._spawnRock(), ptero: o._spawnPtero(12),
      tank: o._spawnTank(12, true), heli: o._spawnHeli(12), shell: o.spawnShell(0, 1), missile: o.spawnMissile(0, 1, 1, 10, 0),
      tower: o._spawnStructure('tower'), fuel: o._spawnStructure('fuel'), hedgehog: o._spawnStructure('hedgehog'), building: o._spawnBuilding(),
      car: o._spawnCar(), lava: o._spawnLava(), meteor: o._spawnMeteor(), pillar: o._spawnPillar(),
      boulder: o._spawnBoulder(12), jeep: o._spawnJeep(12),
    };
    const unwarmed = Object.keys(o.pools).filter((k) => !T[k]);
    if (unwarmed.length) console.warn('prewarm: no sample for', unwarmed.join(', '), '(its shaders will compile mid-run)');
    const temp = Object.values(T);
    temp.forEach((t, i) => t.group.position.set(-2 + i * 2.5, 1, 2));
    const met = T.meteor.model.userData;
    met.ball.visible = met.crater.visible = true;
    this.volcano.setActive(true);
    this.dragonLight.intensity = 1;
    this.city.setActive(true);
    this.city.update(0, 0, 0, 1);
    this.city.towers.forEach((t, i) => { t.x = 10 + i * 4; });
    this.city.update(0, 0, 0, 1);
    this.city.road.visible = true;
    this.debris.burst(2, 1, 1, 1, 6, 0x888888);
    this.debris.update(0, 0);
    const heli = T.heli.model.userData;
    heli.beam.visible = true;
    const tank = T.tank.model.userData;
    tank.flash.visible = true;
    this.crystals.add(1, 1);
    this.crystals.update(0, 0, this.boxes, 0);
    this.boss.group.visible = true;
    this.boss.group.position.set(6, 4, 0);
    this.beam.mesh.visible = true;
    for (const b of this.sideBeams) b.mesh.visible = true;
    // empty particle systems and decals are skipped by the renderer, so give them something to draw
    this.dust.emit(4, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1);
    this.sparks.emit(4, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1);
    this.dust.update(0, 0);
    this.sparks.update(0, 0);
    this.footprints.add(4, 0);
    this.footprints.update(0, 0);
    this.env.update(0, this.camera, 0, this.rig.blend);
    // Compile against the composer's HDR target: that is what the scene really renders into, and its
    // program variants (no tone mapping, linear output) differ from the on-screen ones.
    const gl = this.renderer.renderer;
    gl.setRenderTarget(this.renderer.scenePass.target);
    try {
      this._mark('Compiling: programs');
      // The scene and the post-processing shaders compile together (in parallel where the browser can),
      // each against the kind of target it really draws into, so the first frame has nothing left to build.
      const post = this.renderer.postMaterials();
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadScene = (mats) => {
        const sc = new THREE.Scene();
        const geo = new THREE.PlaneGeometry(2, 2);
        for (const m of mats) sc.add(new THREE.Mesh(geo, m));
        return sc;
      };
      const jobs = [gl.compileAsync(this.scene, this.camera), gl.compileAsync(quadScene(post.hdr), cam)];
      gl.setRenderTarget(null);
      jobs.push(gl.compileAsync(quadScene(post.screen), cam));
      await Promise.all(jobs);
    } catch { /* compileAsync unsupported: first render compiles instead */ }
    gl.setRenderTarget(null);
    this.rig.update(0.016, { aspect: this.renderer.aspect, dragonY: 0, speed: 0 });
    this._mark(`Compiling: first frame (${gl.info.programs.length} programs before)`);
    this.renderer.render(0, 0);
    this._mark(`Compiling: cleanup (${gl.info.programs.length} after)`);
    heli.beam.visible = false;
    tank.flash.visible = false;
    o.active.length = 0; // the shell and missile registered themselves as active
    temp.forEach((t) => o._release(t));
    this.crystals.clear();
    this.boss.reset();
    this.city.reset();
    this.volcano.setActive(false);
    this.dragonLight.intensity = 0;
    this.debris.clear();
    this.beam.mesh.visible = false;
    for (const b of this.sideBeams) b.mesh.visible = false;
    this.dust.clear();
    this.sparks.clear();
    this.footprints.clear();
  }

  _bindUI() {
    const inp = this.input;
    inp.allowUi = () => this.state !== 'running' && this.state !== 'intro' && this.state !== 'dying';
    // interface sounds: a soft tick when the mouse moves onto a button, a click when one is pressed
    let hovered = null;
    document.addEventListener('pointerover', (e) => {
      const b = e.target.closest?.('button');
      if (b === hovered) return;
      hovered = b;
      if (b && e.pointerType === 'mouse' && !b.classList.contains('tbtn')) this.audio.ui('hover');
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('button');
      if (b && !b.classList.contains('tbtn')) this.audio.ui('select');
    }, true);
    inp.on('jump', () => this._onJump());
    inp.on('tap', () => this.audio.init());
    inp.on('jumpRelease', () => { if (!this.grounded && this.vy > 0) this.cutPending = true; });
    inp.on('duck', () => { if (this.state === 'title') this.audio.init(); });
    inp.on('breath', () => this._breath());
    inp.on('rage', () => this._triggerRage());
    // on the title screen → / ← and 1-3 pick the level; in a run → smashes
    inp.on('smash', () => (this.state === 'title' ? this.selectLevel(this.levelIndex + 1) : this._smash()));
    inp.on('prev', () => { if (this.state === 'title') this.selectLevel(this.levelIndex - 1); });
    // picking a level: on the title it changes the world behind the menu; on game over it starts a run there
    const pick = (i) => {
      this.audio.init();
      if (this.state === 'title') this.selectLevel(i);
      else if (this.state === 'over' && this.overT > 0.45) {
        this.selectLevel(i, true);
        this._restart();
      }
    };
    for (let i = 0; i < LEVELS.length; i++) inp.on(`level${i + 1}`, () => pick(i));
    this.hud.buildLevels(LEVELS, pick);
    this.hud.onBoardTab = () => this._onBoard();
    inp.on('view', () => this.toggleView());
    inp.on('pause', () => {
      if (this.hud.isMonstersOpen()) this.toggleMonsters(false);
      else if (this.hud.isBoardOpen()) this.toggleBoard(false);
      else if (this.state === 'over') this._toTitle(); // Esc from game over: back to the title menu
      else this.togglePause();
    });
    inp.on('mute', () => this.toggleMute());
    inp.on('start', () => this._onJump());
    inp.on('quality', () => this._cycleQuality());
    inp.on('monsters', () => this.toggleMonsters());
    this.hud.buildMonsters(MONSTERS, (id) => this.selectMonster(id), (id) => this.selectMonster(id, true));
    inp.on('skin', () => {
      if (this.state === 'title' || this.state === 'over') this.selectSkin(this.monster.skins ? this._skinIndexOf(this.monster) + 1 : this.skinIndex + 1);
    });
    this._onSkinPick = (i) => { this.audio.init(); if (this.state === 'title' || this.state === 'over') this.selectSkin(i); };
    this.hud.buildSkins(SKINS, this._onSkinPick);
    inp.on('board', () => this.toggleBoard());

    const click = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); });
    click('btn-view', () => this.toggleView());
    click('btn-sound', () => this.toggleMute());
    click('btn-quality', () => this._cycleQuality());
    click('btn-pause', () => this.togglePause());
    click('btn-fullscreen', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    });
    click('btn-start', () => this._onJump());
    click('btn-restart', () => this._onJump());
    click('btn-menu-over', () => this._toTitle());
    click('btn-resume', () => this.togglePause(false));
    click('btn-board', () => this.toggleBoard());
    click('btn-board-more', () => this.toggleBoard(true));
    click('btn-board-close', () => this.toggleBoard(false));
    click('btn-monsters', () => this.toggleMonsters(true));
    click('btn-monsters-over', () => this.toggleMonsters(true));
    click('btn-monsters-close', () => this.toggleMonsters(false));
    document.getElementById('monsters').addEventListener('click', (e) => { if (e.target.id === 'monsters') this.toggleMonsters(false); });
    document.getElementById('board').addEventListener('click', (e) => { if (e.target.id === 'board') this.toggleBoard(false); });
    document.querySelectorAll('[data-act]').forEach((el) => inp.bindButton(el, el.dataset.act));
  }

  // ------------------------------------------------------------------ state changes
  _onJump() {
    this.audio.init();
    if (this.hud.isMonstersOpen()) return this.toggleMonsters(false);
    if (this.hud.isBoardOpen()) return this.toggleBoard(false);
    if (this.state === 'title') return this._startIntro();
    if (this.state === 'over') {
      if (this.overT > 0.45) this._restart();
      return;
    }
    if (this.state === 'paused') return this.togglePause(false);
    if (this.state === 'running' || this.state === 'intro') {
      if (this.grounded) this._doJump();
      else this.jumpBuf = CFG.jumpBuffer; // pressed a moment early: jump on landing
    }
  }

  _doJump() {
    this.jumpBuf = 0;
    this.vy = CFG.jumpV;
    this.grounded = false;
    this.cutPending = !this.input.jump;
    this.audio.jump();
    this._dustBurst(0.4, 10, 1.2);
  }

  _startIntro() {
    this.state = 'intro';
    this.hud.setMenu(false);
    this.introT = 0;
    this.hud.show('title', false);
    this._roar(1.7);
    this.rig.shake(0.35);
    this._resetRun();
    this.pace = 0;
    this.pendingBanner = { t: 0.4, sub: `LEVEL ${this.level.id} · STAGE 1`, title: this.stages.current.title, kind: '' };
    this._monsterTip();
  }

  /** One-time hint for a monster that plays differently. */
  _monsterTip() {
    if (!this.monster.glide) return;
    const touch = matchMedia('(pointer: coarse)').matches;
    const who = this.monster.name;
    this._tip('glide', touch ? `${who}: keep your finger down after a jump to glide. Let go to drop.` : `${who}: keep holding jump after the top of a jump to glide. Let go to drop.`);
  }

  _restart() {
    this.hud.show('over', false);
    this.hud.setMenu(false);
    this.dust.clear();
    this.sparks.clear();
    this.footprints.clear();
    this.teeth.clear();
    this._resetRun();
    this.pace = CFG.startSpeed * this.level.pace;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.timeScale = 1;
    this.state = 'running';
    this.hud.setScore(0, 0);
    this._roar(0.9, 1.15);
    this.hud.banner(`LEVEL ${this.level.id} · STAGE 1`, this.stages.current.title);
    this._monsterTip();
  }

  /** From the game-over screen back to the level picker. */
  _toTitle() {
    if (this.state !== 'over') return;
    this.hud.show('over', false);
    this.dust.clear();
    this.sparks.clear();
    this.footprints.clear();
    this._resetRun();
    this.pace = 0;
    this.speed = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.timeScale = 1;
    this.lastRun = null;
    this.state = 'title';
    this.hud.setMenu(true);
    this.hud.show('title', true);
    if (this.pendingPreset) this._autoPreset(this.pendingPreset);
    this._applyModels();
    this._onBoard();
  }

  _die() {
    this.state = 'dying';
    this.dieT = 0;
    this.flash = 0.55;
    this.flashColor.setRGB(1, 0.18, 0.08);
    this.rig.shake(1.0);
    this.audio.hit(this.monster.voice ?? 1, this.monster.sound?.roar);
    this._dustBurst(1.4, 40, 3);
    const s = Math.floor(this.score);
    this.isBest = s > this.hi;
    if (this.isBest) {
      this.hi = s;
      this.localBests[this.levelIndex] = Math.max(this.localBests[this.levelIndex], s);
      if (!this.sim) store.set(this.level.id === 1 ? 'dragon.hi' : `dragon.hi.${this.level.id}`, String(this.localBests[this.levelIndex]));
      this.hud.setHi(s);
    }
    const run = (this.lastRun = { score: s, posted: false, seed: this.seed });
    this.progress.add('runs');
    this.progress.max('bestScore', s);
    const unlocked = this.progress.check(MONSTERS);
    if (!this.sim) {
      this.progress.save();
      this.board.syncProgress(this.progress.toJSON());
    }
    if (unlocked.length) {
      const m = unlocked[0];
      this.hud.banner('NEW MONSTER UNLOCKED', m.name.toUpperCase(), 'clear');
      this.hud.toast(m.name + ' unlocked! Pick it in Monsters (B).', 4200);
      this.audio.music?.stinger('unlock');
    }
    if (this.board.enabled && !this.sim) {
      this.board.submit(this.level.field, s, { view: this.rig.mode, stage: this.stages.number }).then((ok) => {
        run.posted = ok;
        if (this.board.saveError === 'readonly') this.hud.toast("Score not saved: you have view-only access. Ask the game's owner for Contributor access.", 4500);
        else if (this.board.saveError === 'network') this.hud.toast("Couldn't save your score. Check your connection.", 3500);
        if (this.lastRun === run) this._onBoard();
      });
    }
  }

  togglePause(force) {
    const want = force ?? this.state !== 'paused';
    if (want && this.state === 'running') {
      this.state = 'paused';
      this.hud.setPaused(true);
      this.audio.setRotor(0);
      this.audio.setPaused(true);
    } else if (!want && this.state === 'paused') {
      this.state = 'running';
      this.hud.setPaused(false);
      this.audio.setPaused(false);
      this.last = performance.now();
    }
  }

  toggleBoard(force) {
    if (!this.board.enabled) return;
    const want = force ?? !this.hud.isBoardOpen();
    if (want && this.state === 'running') this.togglePause(true);
    if (want !== this.hud.isBoardOpen()) this.audio.ui(want ? 'open' : 'close');
    this.hud.showBoard(want);
    if (want) this._onBoard();
  }

  toggleView() {
    const mode = this.rig.toggle();
    this.hud.setView(mode);
    this.hud.toast(mode === '3d' ? '3D view · faster run' : '2D view · classic pace');
    store.set('dragon.view', mode);
    if (!this.tips.viewTried) { this.tips.viewTried = true; store.set('dragon.tips', JSON.stringify(this.tips)); }
  }

  /**
   * A few seconds into a run in 2D, a hint at the bottom offers the 3D view: in the first three runs, and
   * never again once the player has switched views.
   */
  _viewHint(dt) {
    if (this.tips.viewTried || (this.tips.viewHints || 0) >= 3 || this.rig.mode !== '2d' || this.sim || !(this.viewHintT > 0)) return;
    this.viewHintT -= dt;
    if (this.viewHintT > 0) return;
    if (this.hud.bannerBusy()) { this.viewHintT = 0.5; return; } // a banner is up: try again in a moment
    this.viewHintT = 0; // once per run
    this.tips.viewHints = (this.tips.viewHints || 0) + 1;
    store.set('dragon.tips', JSON.stringify(this.tips));
    this.hud.toast(this.coarseMQ.matches ? 'Tap 3D at the top to see the run in 3D' : 'Press V to switch to the 3D view', 3600);
  }

  toggleMute() {
    this.audio.init();
    this.audio.setMuted(!this.audio.muted);
    this.hud.setMuted(this.audio.muted);
  }

  _cycleQuality() {
    const order = ['auto', 'veryhigh', 'high', 'medium', 'low', 'verylow'];
    const next = order[(order.indexOf(this.settings.quality) + 1) % order.length];
    this._setQuality(next, true);
  }

  _setQuality(mode, announce) {
    this.settings.quality = mode;
    store.set('dragon.quality', mode);
    const name = mode === 'auto' ? AUTO_START : mode;
    this.renderer.scale = mode === 'auto' ? this.renderer.scale : 1;
    this.renderer.setQuality(name);
    this._applyQualityContent(name);
    const label = mode === 'auto' ? `AUTO · ${qualityLabel(name)}` : qualityLabel(mode);
    this.hud.setQuality(label);
    if (announce) this.hud.toast(`Graphics: ${label}`);
  }

  _autoPreset(name) {
    this.pendingPreset = null;
    if (this.settings.quality !== 'auto' || name === this.renderer.qualityName) return;
    this.renderer.applyPreset(name);
    this._applyQualityContent(name);
    this.hud.setQuality(`AUTO · ${qualityLabel(name)}`);
  }

  _applyQualityContent(name) {
    const q = QUALITY[name];
    this.scenery.setDensity(q.density);
    if (Math.round(800 / this.terrain.cell) !== q.terrain) this.terrain.setResolution(q.terrain);
    this.env.shadowReach = q.reach || 1;
    // texture filtering: the textures made at 8x get the preset's level (16x on Very High), others keep theirs
    const aniso = Math.min(q.aniso || 8, this.renderer.renderer.capabilities.getMaxAnisotropy());
    for (const v of Object.values(this.tex)) {
      for (const t of v?.isTexture ? [v] : Object.values(v || {})) {
        if (!t?.isTexture) continue;
        t.userData.aniso0 ??= t.anisotropy;
        const want = t.userData.aniso0 >= 8 ? Math.max(aniso, 1) : t.userData.aniso0;
        if (t.anisotropy !== want) { t.anisotropy = want; t.needsUpdate = true; }
      }
    }
    this.wantModels = q.models || 'std';
    this._applyModels();
  }

  /**
   * Swaps the monster models to the preset's detail level (the detailed Kaiju on Very High). Only on menus:
   * a change during a run waits for it to end. The new model's shaders compile in the background.
   */
  _applyModels() {
    const want = this.wantModels || 'std';
    if ((this.modelDetail || 'std') === want || !this.dragons) return;
    if (this.state === 'running' || this.state === 'intro' || this.state === 'dying' || this.state === 'paused') return;
    this.modelDetail = want;
    for (const id of Object.keys(this.dragons)) {
      const old = this.dragons[id];
      if (!(old instanceof Dragon) || old.variant !== 'kaiju') continue; // only the Kaiju has a detailed model so far
      const d = this._buildMonster(MONSTERS.find((x) => x.id === id));
      d.group.position.copy(old.group.position);
      d.group.visible = old.group.visible;
      this.scene.remove(old.group);
      // a background compile may still be waiting on the old materials: free them once it has finished
      Promise.allSettled([...(this.compiles || [])]).then(() => old.dispose());
      if (this.dragon === old) { this.dragon = d; this._applyLook(); }
    }
    if (this.state !== 'loading') this._compileScene(); // (while loading, the loader's prewarm compiles it)
  }

  /** Compiles the scene's shaders in the background, for the target the scene draws into. */
  _compileScene() {
    const gl = this.renderer.renderer;
    gl.setRenderTarget(this.renderer.scenePass.target);
    const p = gl.compileAsync(this.scene, this.camera).catch(() => {});
    gl.setRenderTarget(null);
    (this.compiles ||= new Set()).add(p);
    p.then(() => this.compiles.delete(p));
    return p;
  }

  // ------------------------------------------------------------------ leaderboard
  _onBoard() {
    const b = this.board;
    if (b.remoteProgress && !this._mergedRemote) {
      this._mergedRemote = true;
      this.progress.merge(b.remoteProgress);
      this.progress.check(MONSTERS);
      this.progress.save();
      this.hud.renderMonsters(this.progress, this.monster.id, b.isOwner);
    }
    // your best on each level is the higher of this browser's and the board's
    const bests = LEVELS.map((lv, i) => Math.max(this.localBests[i], b.myBest(lv.field)));
    if (bests[this.levelIndex] > this.hi && this.state !== 'running') {
      this.hi = bests[this.levelIndex];
      this.hud.setHi(this.hi);
    }
    this.hud.setLevel(this.levelIndex, bests);
    this.hud.renderBoards(b, this.level, this.state === 'over' || this.state === 'dying' ? this.lastRun : null);
  }

  /** Live rival chip during a run, and a cheer when a colleague is overtaken. */
  _updateRival(realDt) {
    const b = this.board;
    const f = this.level.field;
    this.passToastT -= realDt;
    if (b.status !== 'ready' || !b.rows(f).some((r) => r.id !== b.me)) return this.hud.setRival(b, null, false);
    const rv = b.rival(f, this.score);
    const prev = this.rivalRow;
    if (prev && rv?.id !== prev.id && this.score > prev.best && this.passToastT <= 0) {
      this.passToastT = 1.4;
      this.hud.toast(`You passed ${b.name(prev.id)} · now #${b.rankOf(f, this.score)}`, 1800);
      this.audio.passed();
    }
    this.rivalRow = rv;
    this.hud.setRival(b, rv, !rv);
  }

  /** Soft contact patches under the monster (smaller as it leaves the ground) and what stands on the track. */
  _contactShadows() {
    const cs = this.contact;
    cs.begin();
    cs.add(-0.1, 0, 2.8 * this.skin.hitX, 1.7, 1 - Math.min(1, Math.max(0, this.y) / 3.5));
    for (const o of this.obstacles.active) {
      if (o.dead || o.y > 0.3 || !o.group || o.type === 'lava' || o.type === 'meteor') continue;
      const p = o.group.position;
      if (p.x < -20 || p.x > 120) continue;
      cs.add(p.x, p.z, o.width * 1.3, Math.min(3, Math.max(1.1, o.width * 0.8)));
    }
    cs.end();
  }

  // ------------------------------------------------------------------ gameplay helpers
  _breath() {
    if (this.state !== 'running' || this.breathT > 0) return;
    this.breathKills = 0;
    if (this.charge < 1) {
      // tell the player why nothing happened instead of silently ignoring the key
      this.audio.denied();
      this.hud.chargeDenied();
      this.hud.toast(`${this.monster.attack === 'teeth' ? 'Tooth quake' : 'Atomic breath'} charging · ${Math.floor(this.charge * 100)}%`, 1100);
      return;
    }
    this.charge = 0;
    this.breathT = CFG.breathTime;
    this.bossHitThisBreath = false;
    this.audio.breath(CFG.breathTime, this.monster.sound?.breath);
    this._roar(1.1, 0.85);
    this.rig.shake(0.5);
    this.flash = 0.1;
    this.flashColor.setRGB(0.25, 0.6, 1.0);
    if (this.monster.attack === 'teeth') {
      // where the next row of teeth comes up: just ahead of the jaws (ground x, scrolls with the world)
      this.toothX = this.dragon.getMouthWorld(this._mouth).x + 1.4;
      this.flashColor.setRGB(0.9, 0.75, 0.5);
      this.rig.shake(0.8);
    }
  }

  _smash() {
    if (this.state !== 'running' || this.smashT > 0 || this.smashCool > 0) return;
    this.smashT = CFG.smashTime;
    this.smashHit = false;
    this.audio.swing();
    // how close each target is right now: pressed at the last instant, the bite is PERFECT
    const mx = this.dragon.getMouthWorld(this._mouth).x;
    for (const o of this.obstacles.active) {
      const lead = o.x - o.width / 2 - mx;
      o.smashLead = lead > -2 && lead < 6 ? lead : null;
    }
  }

  /** A short vibration on phones (skipped when motion is reduced). */
  _haptic(ms) {
    if (this.reducedMotion || !this.coarseMQ.matches) return;
    try { navigator.vibrate?.(ms); } catch { /* not allowed */ }
  }

  /** Ducking just started: threats about to pass overhead make it a late (honest) close call. */
  _markLateDucks() {
    const v = Math.max(1, this.speed);
    for (const o of this.obstacles.active) {
      if (o.dead || this.obstacles.respond(o) !== 'duck') continue;
      const t = (o.x - o.width / 2 - 2.6) / (v + o.vx);
      if (t < CFG.lateDuck) o.lateDuck = true;
    }
  }

  /** The jaws met something: break it, bat it back, or clang off it. */
  _smashHit(o) {
    if (o.smash === 'reflect') {
      this.obstacles.reflect(o, this.speed);
      this.smashHit = true;
      this.hitStopT = CFG.hitStop;
      this.audio.reflect();
      this.rig.shake(0.2);
      this._popup('REFLECT!', o.x, o.y + 1.2, 'close');
      this._setChain(this.chain + 2);
      return;
    }
    if (!o.smash) {
      if (o.clanged || SILENT[o.type]) return;
      o.clanged = true;
      this.audio.clang();
      for (let i = 0; i < 10; i++) this.sparks.emit(o.x - o.width / 2, 0.6 + Math.random(), 0, -3 - Math.random() * 4, Math.random() * 4, (Math.random() - 0.5) * 3, 0.25, 0.2, 0.03, 1.6, 1.3, 0.9, 1, 1, 9, 1);
      this._tip('solid', 'Too solid to smash. Jump it!');
      return;
    }
    o.dead = true;
    this.smashHit = true;
    this.smashes++;
    this.progress.add('smashes');
    this.crystals.release(o.uid); // crystals over it fly to you instead of breaking the chain
    // mastery: last-instant timing, smashes in quick succession, biting a flyer out of the air
    const perfect = o.smashLead != null && o.smashLead < CFG.perfectLead;
    this.streak = this.time - this.streakT < CFG.smashStreak ? this.streak + 1 : 1;
    this.streakT = this.time;
    const sky = !this.grounded && this.obstacles.flies(o);
    const bonus = Math.min(2, (perfect ? 2 : 1) * (this.streak >= 3 ? 1.5 : this.streak === 2 ? 1.25 : 1) * (sky ? 1.5 : 1));
    const pts = this._pts(o.smash * bonus);
    this.score += pts;
    this._setChain(this.chain + (perfect ? 2 : 1));
    this._addRage(CFG.smashRage / this.level.rageCrystals);
    const label = o.jam > 1 ? `TRAFFIC JAM ×${o.jam}` : perfect ? 'PERFECT' : sky ? 'SKY BITE' : this.streak >= 3 ? 'TRIPLE SMASH' : this.streak === 2 ? 'DOUBLE SMASH' : 'SMASH';
    this._popup(`${label} +${pts}`, o.x, o.y + (o.tall ? 4.2 : 2.2), perfect || sky || this.streak >= 2 ? 'close' : 'kill');
    if (perfect) this.perfects++;
    this.hitStopT = perfect ? CFG.hitStop * 1.8 : CFG.hitStop;
    this.rig.punch(perfect ? 1 : 0.5);
    this._haptic(perfect ? 25 : 14);
    this._debris(o);
    if (o.type === 'fuel' || o.type === 'tank' || o.type === 'jeep') this._blast(o.x, o.y + 1, o.type === 'fuel' ? 1.8 : 1);
    else {
      this.audio.crunch(o.tall ? 1.6 : 0.8);
      if (o.type === 'building') this.audio.glass();
      this.rig.shake(o.tall ? 0.4 : 0.15);
      for (let i = 0; i < (o.tall ? 26 : 10); i++) {
        const a = Math.random() * Math.PI * 2;
        this.dust.emit(o.x + (Math.random() - 0.5) * o.width, Math.random() * (o.tall ? 3 : 1), (Math.random() - 0.5),
          Math.cos(a) * 3, 1 + Math.random() * 2, Math.sin(a) * 2, 1 + Math.random(), 0.8, o.tall ? 4 : 2.5, 0.55, 0.5, 0.45, 0.5, 2, -0.2, 1);
      }
    }
  }

  /** Chunks flying off a broken obstacle, in its own colours. */
  _debris(o) {
    const DEB = {
      cactusS: [0x4f7a3a, 8, 0.22], cactusL: [0x4f7a3a, 12, 0.26], tank: [0x6f6448, 16, 0.32], heli: [0x56603f, 12, 0.26],
      ptero: [0x6b4a36, 8, 0.2], tower: [0x7a5a3c, 18, 0.3], fuel: [0xd0cbbd, 16, 0.34], building: [0xc9bba4, 28, 0.45],
      car: [0x8a8f96, 12, 0.26], rock: [0x8a5f45, 12, 0.3], hedgehog: [0x55595e, 6, 0.2], shell: [0x553322, 3, 0.1], missile: [0xbbbbbb, 4, 0.12],
      boulder: [0x8a5f45, 14, 0.32], jeep: [0x5b6236, 14, 0.28],
    };
    const [c, n, s] = DEB[o.type] || [0x888888, 8, 0.25];
    const h = o.tall ? (o.type === 'building' ? 4.2 : 3.5) : 1.2;
    this.debris.burst(o.x, o.y, o.width, h, n, c, s, o.tall ? 1.25 : 1);
    if (o.type === 'building') this.debris.burst(o.x, o.y, o.width, h, 8, 0x1a242e, 0.22);
  }

  _tip(key, text) {
    if (this.tips[key]) return;
    this.tips[key] = true;
    store.set('dragon.tips', JSON.stringify(this.tips));
    this.hud.toast(text, 2800);
  }

  /** One-time hints the first time each kind of threat shows up. */
  _checkTips() {
    if (this.tips.tall && this.tips.smash && this.tips.reflect) return;
    const touch = this.coarseMQ.matches;
    for (const o of this.obstacles.active) {
      if (o.dead || o.reflected || o.x < 2) continue;
      if (o.tall && o.x < 30) this._tip('tall', touch ? 'Too tall to jump! Tap the claw to SMASH it.' : 'Too tall to jump! SMASH it (→) or burn it (F).');
      else if (typeof o.smash === 'number' && o.smash > 0 && !o.tall && o.x < 24 && !this.smashes) {
        this._tip('smash', touch ? 'Tap the claw to SMASH it!' : 'Press → or D to SMASH it!');
      } else if (o.type === 'missile' && this.boss.active) this._tip('reflect', 'Smash a missile just before it hits to bat it back at the gunship!');
    }
  }

  _toScreen(x, y, z = 0) {
    const v = this._v.set(x, y, z).project(this.camera);
    const p = this._scr;
    p.x = ((v.x + 1) / 2) * window.innerWidth;
    p.y = ((1 - v.y) / 2) * window.innerHeight;
    p.behind = v.z > 1;
    return p;
  }

  _popup(text, x, y, kind) {
    const p = this._toScreen(x, y);
    if (!p.behind) this.hud.popup(text, p.x, p.y, kind);
  }

  _setChain(c) {
    this.chain = c;
    const tiers = CFG.multTiers;
    let m = 1;
    while (m <= tiers.length && c >= tiers[m - 1]) m++;
    if (m > this.mult) {
      this.audio.multUp(m);
      this.hud.toast(`×${m} combo`, 900);
    }
    this.mult = m;
    this.bestMult = Math.max(this.bestMult, m);
    const lo = m > 1 ? tiers[m - 2] : 0;
    const hi = tiers[m - 1];
    this.hud.setCombo(m, hi ? (c - lo) / (hi - lo) : 1);
  }

  /** The rage meter fills; when full it waits for the player (R / G, or the rage button on touch). */
  _addRage(v) {
    if (this.rageT > 0 || this.rageReady) return;
    this.rage = Math.min(1, this.rage + v);
    if (this.rage >= 1 && this.state === 'running') {
      this.rageReady = true;
      this.audio.charged();
      this._tip('rage', this.coarseMQ.matches ? 'KAIJU RAGE ready: tap the rage button when you need it!' : 'KAIJU RAGE ready: press R when you need it!');
    }
  }

  /** Unleashes a full rage meter. */
  _triggerRage() {
    if (!this.rageReady || this.state !== 'running') return;
    this.rageReady = false;
    this._startRage();
  }

  _startRage() {
    this.progress.add('rages');
    this.rageT = CFG.rageTime;
    this.hud.banner('', 'KAIJU RAGE!', 'rage');
    this._roar(1.5, 0.75);
    this.rig.shake(0.7);
    this.flash = 0.3;
    this.flashColor.setRGB(1, 0.35, 0.08);
  }

  _pickCrystal(c) {
    this.crystalsRun++;
    this.progress.add('crystals');
    this._setChain(this.chain + 1);
    this._addRage(1 / this.level.rageCrystals); // harder levels need more crystals
    const pts = this._pts(CFG.crystalPoints);
    this.score += pts;
    this.audio.crystal(this.chain);
    this._popup(`+${pts}`, c.x, c.y + 0.4, 'pick');
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
      this.sparks.emit(c.x, c.y, 0, Math.cos(a) * v, Math.sin(a) * v, (Math.random() - 0.5) * 3, 0.3 + Math.random() * 0.3, 0.25, 0.04, 0.3, 1.6, 1.0, 1, 2, 0, 1);
    }
  }

  _missCrystal() {
    if (this.rageT > 0 || this.graceT > 0) return; // Kaiju Rage forgives
    if (this.chain >= 3) {
      this.audio.chainBreak();
      this.hud.comboBroken();
    }
    this._setChain(0);
  }

  _passObstacle(o, clearance) {
    let c = this.chain + 1;
    // ducking under a mid flyer always clears it closely; only a last-moment duck earns the CLOSE!
    if (this.obstacles.respond(o) === 'duck' && !o.lateDuck) clearance = Infinity;
    if (clearance < CFG.closeCall) {
      c++;
      const pts = this._pts(CFG.closePoints);
      this.score += pts;
      this._addRage(CFG.rageCrystals / (15 * this.level.rageCrystals));
      this.audio.closeCall();
      this._popup(`CLOSE! +${pts}`, 1, 3.4, 'close');
    }
    if (clearance < CFG.closeCall) this.progress.add('closeCalls');
    this._setChain(c);
  }

  /** A meteor hits the track ahead: fireball, shake, and it leaves a burning crater to jump. */
  _meteorImpact(o) {
    this._blast(o.x, 0.4, 0.9);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI;
      this.sparks.emit(o.x, 0.3, (Math.random() - 0.5), Math.cos(a) * 6, 3 + Math.random() * 6, (Math.random() - 0.5) * 4,
        0.5 + Math.random() * 0.5, 0.35, 0.06, 1.8, 0.7, 0.15, 1, 1.2, 14, 1);
    }
  }

  /** Volcano air: embers drifting up from the lava, ash drifting down. */
  _volcanoAir(dt) {
    this._emberAcc = (this._emberAcc || 0) + dt * 30;
    while (this._emberAcc > 1) {
      this._emberAcc--;
      const x = -12 + Math.random() * 50, z = (Math.random() - 0.5) * 24;
      this.sparks.emit(x, 0.2, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5,
        1.5 + Math.random() * 1.5, 0.12, 0.03, 1.6, 0.55, 0.12, 0.9, 0.6, -0.4, 1);
      if (Math.random() < 0.5) {
        this.dust.emit(x, 8 + Math.random() * 6, z, (Math.random() - 0.5), -1 - Math.random(), (Math.random() - 0.5),
          4, 0.12, 0.18, 0.22, 0.2, 0.19, 0.5, 0.4, 0.1, 1);
      }
    }
  }

  /** A supply crate opens: a burst in its colour, the power-up's name, and its effect. */
  _takeDrop(d) {
    const P = POWERUPS[d.kind];
    const c = this._dropC || (this._dropC = new THREE.Color());
    c.set(P.color);
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7;
      this.sparks.emit(d.x, d.y + 0.7, 0, Math.cos(a) * v, 2 + Math.random() * 7, Math.sin(a) * v * 0.6,
        0.5 + Math.random() * 0.5, 0.4, 0.05, c.r * 2.2, c.g * 2.2, c.b * 2.2, 1, 1.2, 6, 1);
    }
    this._popup(P.label, d.x, d.y + 2.8, 'close');
    this.hud.toast(`${P.label}: ${P.sub}`, 2400);
    this.audio.charged();
    this._haptic?.(25);
    if (d.kind === 'magnet') this.magnetT = 10;
    else if (d.kind === 'core') this.charge = 1;
    else this._addRage(0.5);
    this.supply.clear();
  }

  /** A volcano on the horizon erupts: lava bombs arc out of the crater, a boom rolls in, the ground shakes. */
  _erupt(x, y, z, s) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 20) * s;
      this.sparks.emit(
        x + (Math.random() - 0.5) * 6, y + 3 * s, z, Math.cos(a) * v * 0.6, (28 + Math.random() * 26) * s, Math.sin(a) * v * 0.4,
        2.6 + Math.random() * 1.6, 7 * s, 3 * s, 2.6, 0.75, 0.16, 1, 0.12, 24 * s, 1
      );
    }
    if (this.state === 'running') {
      this.audio.explosion(1.6);
      this.rig.shake(0.3);
    }
  }

  /** The dragon's forward glow: on after dark, tinted by its plates (blue, or red in Kaiju Rage). */
  _updateDragonLight(night) {
    const m = this.dragon.getMouthWorld(this._mouth);
    const L = this.dragonLight;
    L.position.set(m.x - 0.4, m.y + 1.0, m.z);
    L.target.position.set(m.x + 16, 0.4, 0);
    // after dark everywhere, and at the volcano's smoky dusk too
    const dark = Math.max(night, this.env.biome.volc * 0.6);
    L.intensity = dark * (24 + 16 * this.rageK);
    L.color.copy(this.dragon.glowColor).lerp(this._v3c.setRGB(1, 1, 1), 0.65).lerp(this._dustDay.setRGB(1.0, 0.55, 0.3), this.rageK);
  }

  _tankFired(o) {
    this.audio.cannon();
    const x = o.x - 2.3, y = o.shellY;
    for (let i = 0; i < 12; i++) {
      this.dust.emit(x, y, 0, -2 - Math.random() * 4, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 2,
        0.8 + Math.random() * 0.6, 0.4, 2 + Math.random(), 0.42, 0.4, 0.38, 0.4, 2, 0.4, 1);
    }
  }

  /** The score follows the game: theme by screen and biome, intensity by stage, boss and Rage. */
  _scoreMusic(realDt) {
    const m = this.audio.music;
    if (!m) return;
    const st = this.state;
    let theme, k;
    if (st === 'title' || st === 'loading') { theme = 'title'; k = 0; }
    else if (st === 'over' || st === 'dying') { theme = 'over'; k = 0; }
    else {
      theme = this.level.biome === 'city' ? 'city' : this.level.biome === 'volcano' ? 'volcano' : 'desert';
      const combat = ['army', 'siege', 'inferno'].includes(this.stages.key);
      k = this.rageT > 0 ? 4 : this.boss.active || this.bossPending ? 3 : combat ? 2 : 1;
      if (st === 'intro') k = 1;
    }
    m.set(theme, k);
    m.update(realDt);
  }

  /**
   * Colour grade per world and hour: warm, crisp sunlight in the desert, a teal-and-orange blue hour in
   * the city, red-amber in the volcano, cooler and deeper at night. Blended by the sky's biome weights.
   */
  _grade(night) {
    const b = this.env.biome, noon = this.env.noonK || 0;
    const des = Math.max(0, 1 - b.volc - b.city);
    const g = (this._gradeGain ||= new THREE.Vector3());
    const l = (this._gradeLift ||= new THREE.Vector3());
    g.set(1.02, 1.0, 0.98).multiplyScalar(des)
      .addScaledVector(this._v.set(1.04, 0.98, 0.93), b.city)
      .addScaledVector(this._v.set(1.07, 0.95, 0.86), b.volc);
    l.set(0.0, 0.004, 0.012).multiplyScalar(des).addScaledVector(this._v.set(-0.006, 0.01, 0.03), b.city).addScaledVector(this._v.set(0.02, 0.0, -0.01), b.volc);
    // night: cooler highlights, bluer shadows
    g.lerp(this._v.set(0.96, 0.99, 1.06), night * des * 0.8);
    l.lerp(this._v.set(0.0, 0.006, 0.03), night * des * 0.8);
    const sat = 1.06 + 0.1 * noon * des + 0.05 * b.city;
    const contrast = 1.0 + 0.08 * noon * des + 0.06 * b.city + 0.1 * b.volc;
    this.renderer.setGrade(sat, contrast, g, l);
  }

  _footstep(leg, fx) {
    const x = fx * this.dragon.group.scale.x;
    const z = (leg === 0 ? 0.62 : -0.62) * this.dragon.group.scale.z;
    if (this.y > 0.05) return;
    this.footprints.add(x + 0.15, z);
    const k = Math.min(1, this.speed / CFG.maxSpeed);
    for (let i = 0; i < 6 + k * 6 + this.rageK * 8; i++) {
      this.dust.emit(
        x + (Math.random() - 0.5) * 0.5, 0.08, z + (Math.random() - 0.5) * 0.4,
        -2 - Math.random() * 3, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.5,
        0.7 + Math.random() * 0.7, 0.35, 1.6 + Math.random() * 1.2,
        0.62, 0.5, 0.36, 0.2, 2.2, 0.6, 1
      );
    }
    this.audio.footstep(0.55 + 0.45 * k + 0.5 * this.rageK);
    if (this.rageK > 0.5) this.rig.shake(0.12);
    else if (this.rig.blend > 0.5) this.rig.shake(0.04);
  }

  /** the Moth Queen's downstroke: a soft whoosh, and near the ground the air it pushes down stirs up dust. */
  _wingbeat(k) {
    if (this.state !== 'running' && this.state !== 'intro' && this.state !== 'title') return;
    this.audio.flutter(0.35 + 0.4 * k + 0.3 * this.rageK);
    if (this.y > 2.5) return;
    const near = 1 - this.y / 2.5;
    const n = Math.round((6 + 6 * this.rageK) * k * near);
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.dust.emit(
        0.4 + Math.random() * 1.6, 0.1, side * (0.8 + Math.random() * 2.2),
        -1.5 - Math.random() * 2, 0.4 + Math.random() * 0.8, side * (1.5 + Math.random() * 2.5),
        0.8 + Math.random() * 0.6, 0.5, 2 + Math.random() * 1.2, 0.6, 0.5, 0.37, 0.18 * near, 2.2, 0.3, 1
      );
    }
  }

  /** Glittering scale dust off the Moth Queen's wings: a faint trail in flight, a storm while the beam fires. */
  _wingGlitter(dt, breathAmt) {
    if (this.state !== 'running' && this.state !== 'intro') return;
    this._glitterAcc = (this._glitterAcc || 0) + dt * (2.5 + 55 * breathAmt + 20 * this.rageK);
    const [r, g, b] = this.skin.spark;
    while (this._glitterAcc > 1) {
      this._glitterAcc--;
      const p = this.dragon.wingDust(this._v);
      const blow = breathAmt > 0.05 ? 6 + Math.random() * 8 : 0; // the beam's wind carries it forward
      this.sparks.emit(p.x, p.y, p.z, blow + (Math.random() - 0.5) * 1.5, (Math.random() - 0.6) * 1.2, (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.7, 0.09, 0.02, r, g, b, 0.9, 1.2, 0.4, 1);
    }
  }

  _dustBurst(strength, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1 + Math.random() * 3) * strength;
      this.dust.emit(
        (Math.random() - 0.3) * spread, 0.1, (Math.random() - 0.5) * spread * 0.6,
        Math.cos(a) * v, 0.5 + Math.random() * 1.5 * strength, Math.sin(a) * v * 0.6,
        0.8 + Math.random() * 0.9, 0.5, 2.2 + Math.random() * 1.5 * strength,
        0.6, 0.49, 0.36, 0.26, 2.5, 0.5, 1
      );
    }
  }

  _blast(x, y, size = 1, scroll = 0.6) {
    this.blasts.burst(x, y, size, y < 2.5, scroll);
    this.blastLight.position.set(x, y + 1.4, 1.2);
    this.blastLight.color.setHex(0xff8a3a);
    this.blastPeak = Math.max(this.blastLightT > 0 ? this.blastPeak : 0, 70 * Math.min(1.8, size));
    this.blastLightT = 0.4;
    for (let i = 0; i < 46 * size; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * Math.PI * 0.6;
      const v = (4 + Math.random() * 9) * Math.sqrt(size);
      this.sparks.emit(
        x, y, (Math.random() - 0.5) * 0.6,
        Math.cos(a) * Math.cos(e) * v, Math.abs(Math.sin(e)) * v + 2, Math.sin(a) * v * 0.6,
        0.4 + Math.random() * 0.6, 0.35, 0.05, 0.6, 1.4, 3.2, 1, 1.5, 14, 0.5
      );
    }
    for (let i = 0; i < 22 * size; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.emit(
        x + (Math.random() - 0.5) * size, y - 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8,
        Math.cos(a) * 3 * size, 1 + Math.random() * 3, Math.sin(a) * 2,
        1 + Math.random(), 0.8, 3.5 * size, 0.32, 0.27, 0.22, 0.55, 2, -0.3, 1
      );
    }
    this.audio.explosion(Math.min(1.6, size));
    this.rig.shake(0.3 * size);
  }

  _explode(o, points = CFG.killPoints) {
    this.crystals.release(o.uid);
    // structures stay standing while they collapse: the fireball bursts on the face toward the monster
    const front = o.type === 'building' || o.type === 'tower' ? o.width * 0.5 : 0;
    this._blast(o.x - front, o.y + 0.8 + front * 0.3, o.type === 'tank' || o.type === 'fuel' || o.type === 'jeep' ? 1.4 : 1, front ? 1 : 0.6);
    if (o.type === 'building') this.audio.glass();
    this._debris(o);
    // structures collapse into the ground (Obstacles wrecks): a cloud of dust rolls out from the base
    if (o.type === 'building' || o.type === 'tower') {
      const w = o.width * 0.5 + 0.5;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
        this.dust.emit(
          o.x + Math.cos(a) * w, 0.3 + Math.random() * 1.6, Math.sin(a) * w * 0.6,
          Math.cos(a) * v, 0.6 + Math.random() * 1.6, Math.sin(a) * v * 0.6,
          1.3 + Math.random() * 1.0, 1.4, 4.6, 0.78, 0.72, 0.64, 0.7, 1.6, -0.25, 1
        );
      }
    }
    const pts = this._pts(points);
    this.score += pts;
    this._popup(`+${pts}`, o.x, o.y + 2.2, 'kill');
  }

  // ------------------------------------------------------------------ stages and the boss
  _enterStage(st, delay = 0) {
    // the city stays built for the whole Night City level (siege and gunship included)
    this.city.setActive(this.level.biome === 'city');
    if (st.boss) {
      this.obstacles.spawning = false;
      this.obstacles.pendingShooter = false;
      this.bossPending = true;
      this.hud.banner('WARNING', st.title, 'warn');
      this.audio.alarm();
      return;
    }
    this.obstacles.stage = st.key;
    const loop = this.stages.cycle;
    const banner = { t: delay, sub: loop && this.stages.index === 0 ? `LOOP ${loop + 1} · STAGE ${this.stages.number}` : `STAGE ${this.stages.number}`, title: st.title, kind: '' };
    if (delay) this.pendingBanner = banner;
    else this.hud.banner(banner.sub, banner.title);
  }

  _bossHome() {
    return this.renderer.aspect < 1 ? this._homes.tall : this._homes.wide;
  }

  _updateBoss(dt) {
    const boss = this.boss;
    if (this.bossPending && this.state === 'running') {
      // wait for the last stragglers to pass, then the gunship swoops in
      if (!this.obstacles.active.some((o) => !o.projectile && o.x > -3)) {
        this.bossPending = false;
        // each gunship downed makes the next one tougher; harder levels add one more hit point
        boss.start(this.bossesDowned + (this.level.tight ? 1 : 0), this._bossHome(), mulberry32(hash32(this.seed, 1000 + this.bossesSeen)));
        this.bossesSeen++;
      }
    }
    const ctx = this._bossCtx;
    ctx.home = this._bossHome();
    ctx.yaw = 0.85 * this.rig.blend;
    boss.update(dt, this.time, ctx);
    if (boss.active && boss.state === 'fight') this.hud.setBoss(`${['GUNSHIP', 'CITY GUNSHIP', 'INFERNO GUNSHIP'][this.level.id - 1]} MK-${this.bossesDowned + 1}`, boss.hp, boss.maxHp);
    else if (boss.state !== 'dying') this.hud.setBoss('', -1, 0);
  }

  /** source: 'breath' or 'reflect' (its own missile, batted back). */
  _bossHit(source) {
    const boss = this.boss;
    if (source === 'breath') this.bossHitThisBreath = true;
    const dead = boss.hit();
    this._blast(boss.x - 1, boss.y, 0.8);
    if (!dead) {
      this.hud.toast(source === 'reflect' ? `Its own missile! · ${boss.hp} to go` : `Direct hit · ${boss.hp} to go`, 1100);
      return;
    }
    this.bossesDowned++;
    this.progress.add('gunships');
    const pts = this._pts(CFG.bossPoints);
    this.score += pts;
    this._popup(`+${pts}`, boss.x, boss.y + 1.6, 'big');
    this.hud.setBoss('', 0, boss.maxHp);
    this.hud.banner('STAGE CLEAR', 'GUNSHIP DOWN', 'clear');
    this.audio.music?.stinger('clear');
    this.nextBossScore = Math.ceil((this.score + CFG.bossEvery) / 100) * 100;
    this.toastAfter = { t: 2.6, text: `Next gunship at ${this.nextBossScore.toLocaleString('en-US')} points` };
    this.slowT = 1.1;
    this.flash = 0.35;
    this.flashColor.setRGB(1, 0.75, 0.35);
    this._roar(1.6, 0.9);
  }

  /** Batted-back shells and missiles: they hit the gunship, or the tank that fired them. */
  _updateReflected() {
    const boss = this.boss;
    for (const o of this.obstacles.active) {
      if (!o.reflected || o.dead) continue;
      if (boss.state === 'fight' && o.x >= boss.x - 2.5) {
        o.dead = true;
        this._bossHit('reflect');
        continue;
      }
      for (const t of this.obstacles.active) {
        if (t.type === 'tank' && !t.dead && Math.abs(t.x - o.x) < 1.5) {
          o.dead = t.dead = true;
          this._explode(t, SMASH.tank * 2);
          this._popup('RETURN TO SENDER!', t.x, 3.2, 'close');
          break;
        }
      }
      if (o.x > 70) o.dead = true;
    }
  }

  _afterBoss() {
    this.hud.setBoss('', -1, 0);
    const st = this.stages.afterBoss(this.dist);
    const o = this.obstacles;
    o.cycle = this.stages.cycle;
    o.spawning = true;
    o.nextGap = 30;
    // a victory lap: a river of crystals and nothing to dodge, then the next stage
    o.startRush(CFG.rushTime, this.speed);
    this.hud.banner(`${CFG.rushTime} SECONDS`, 'CRYSTAL RUSH', 'clear');
    this._enterStage(st, CFG.rushTime + 0.4);
  }

  /** A set piece starts spawning: name it, unless a banner is already up. */
  _onPiece(p) {
    if (p.id === 'jam') this._tip('jam', this.coarseMQ.matches ? 'Traffic jam! Too long to jump: tap the claw to SMASH the lot.' : 'Traffic jam! Too long to jump: SMASH (→) the lot in one bite.');
    if (this.hud.bannerBusy() || this.pendingBanner) return;
    this.hud.banner('SET PIECE', p.title, 'piece');
  }

  /** Seconds until the next gunship stage at the current pace (Infinity if none is due). */
  _secsToBoss() {
    const st = this.stages;
    if (st.current.boss) return Infinity;
    const rate = Math.max(1, this.speed * CFG.scoreRate);
    let s = Infinity;
    if (this.bossesSeen === 0 && st.list[st.index + 1]?.boss) s = (st.current.length[st.cycle ? 1 : 0] - (this.dist - st.start)) / rate;
    if (Number.isFinite(this.nextBossScore)) s = Math.min(s, (this.nextBossScore - this.score) / (rate * Math.max(1, this.mult) * this.scoreK));
    return s;
  }

  // ------------------------------------------------------------------ main loop
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const realDt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const perf = this.perf;
    perf?.frameStart(now);
    const u0 = perf ? performance.now() : 0;
    if (this.sim) {
      // fast fixed-step simulation for tests: N steps of 1/60 s, one render (quality stays put)
      for (let i = 0; i < this.sim && this.state !== 'paused'; i++) {
        this.stepHook?.(1 / 60);
        this._update(1 / 60);
      }
    } else {
      this.renderer.adapt(realDt * 1000, this.settings.quality === 'auto');
      if (this.state !== 'paused') {
        this.stepHook?.(realDt);
        this._update(realDt);
      }
    }
    if (perf) perf.update(performance.now() - u0);
    // Idle screens don't need the full frame rate: paused draws once, menus about 30 times a second.
    if (this.state === 'paused') {
      if (this._pausedDrawn) return;
      this._pausedDrawn = true;
    } else this._pausedDrawn = false;
    if ((this.state === 'title' || this.state === 'over') && !this.sim && now - (this._lastDraw || 0) < 30) return;
    this._lastDraw = now;
    perf?.renderBegin();
    this.renderer.render(this.time, this.reducedMotion ? this.flash * 0.25 : this.flash, this.flashColor);
    perf?.renderEnd();
  }

  _update(realDt) {
    this.time += realDt;
    const st = this.state;
    let dt = realDt;

    if (st === 'intro') {
      this.introT += realDt;
      const k = this.introT / 1.7;
      this.rig.intro = 1 - smooth(0, 1, k);
      this.pace = CFG.startSpeed * this.level.pace * smooth(0.55, 1, k);
      if (k >= 1) { this.state = 'running'; this.rig.intro = 0; }
    } else if (st === 'title') {
      this.rig.intro = Math.min(1, this.rig.intro + realDt);
    } else if (st === 'dying') {
      this.dieT += realDt;
      this.timeScale = Math.max(0, 1 - this.dieT * 3.2);
      dt = realDt * this.timeScale;
      if (this.dieT > 0.85) {
        this.state = 'over';
        this.overT = 0;
        const stats = `${this.level.short} · ${this.smashes} smashed · ${this.crystalsRun} crystals · best ×${this.bestMult}`
          + (this.bossesDowned ? ` · ${this.bossesDowned} gunship${this.bossesDowned > 1 ? 's' : ''} down` : '')
          + ` · stage ${this.stages.number}`
          + (this.seedFixed || this.debug || this.sim ? ` · seed ${this.seed}` : '');
        this.hud.gameOver(Math.floor(this.score), this.hi, this.isBest, stats);
        this.audio.music?.stinger(this.isBest ? 'best' : 'over');
        if (this.pendingPreset) this._autoPreset(this.pendingPreset); // a quality change waits for the run to end
        this._applyModels();
        this.hud.setMenu(true);
        this.hud.resetRival();
        this.hud.setBoss('', -1, 0);
        this.hud.setWarnings([]);
        this._onBoard();
      }
    } else if (st === 'over') {
      this.overT += realDt;
      dt = 0;
    }
    if (this.slowT > 0 && this.state === 'running') {
      this.slowT -= realDt;
      dt = realDt * 0.35; // slow motion as the gunship goes down
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= realDt;
      if (this.state === 'running') dt *= 0.08; // freeze-frame on a smash
    }

    const running = this.state === 'running';
    const playing = running || this.state === 'intro';
    // 3D difficulty follows the camera blend, so switching views mid-run eases in rather than jolting
    const hard = this.rig.blend;
    // the speed cap keeps rising with every completed stage loop, so long runs never plateau
    const cap = CFG.maxSpeed * this.level.pace * (1 + CFG.loopSpeed * Math.min(this.stages.cycle, 4));
    if (running) this.pace = Math.min(cap, this.pace + CFG.accel * (1 + (CFG.accel3d - 1) * hard) * dt);

    // Kaiju Rage
    if (this.rageT > 0 && running) {
      this.rageT -= dt;
      this.rage = Math.max(0, this.rageT / CFG.rageTime);
      if (this.rageT <= 0) {
        this.rageT = 0;
        this.rage = 0;
        this.graceT = 0.8; // a moment to land before obstacles can hurt again
      }
    }
    this.graceT = Math.max(0, this.graceT - dt);
    this.rageK += ((this.rageT > 0 ? 1 : 0) - this.rageK) * (1 - Math.exp(-realDt * 5));
    this.speed = this.pace * (1 + (CFG.pace3d - 1) * hard) * (1 + CFG.rageSpeed * this.rageK);

    if (running) {
      const step = this.speed * dt * CFG.scoreRate;
      const before = Math.floor(this.dist / 100);
      this.dist += step;
      this.score += step * this.mult * this.scoreK; // slimmer builds (and gliding) are easier, so they score a little less
      if (Math.floor(this.dist / 100) > before) {
        this.audio.milestone();
        this.hud.milestone();
      }
      if (this.hi > 0 && this.score > this.hi && !this.toldPB) {
        this.toldPB = true;
        this.hud.toast('New personal best!', 1400);
      }
      if (this.charge < 1) {
        // charges by base pace, so the breath refills just as quickly in either view (faster against the boss)
        // harder levels charge slower, and give less of a boost against the gunship
        const boost = this.level.breath * (this.boss.active ? this.level.bossCharge : 1);
        this.charge = Math.min(1, this.charge + (this.pace * dt * CFG.scoreRate * boost) / CFG.breathFill);
        if (this.charge >= 1) {
          this.audio.charged();
          if (!this.toldReady) this.hud.toast(this.boss.active ? 'Breath ready — fire at the gunship! (F)' : 'Atomic breath ready — press F');
          this.toldReady = true;
        }
      }
      // the first gunship ends the first loop; after that one comes every CFG.bossEvery points
      const next = this.stages.update(this.dist, { bossDue: this.score >= this.nextBossScore, loopBoss: this.bossesSeen === 0 });
      if (this.toastAfter && (this.toastAfter.t -= realDt) <= 0) {
        this.hud.toast(this.toastAfter.text, 2600);
        this.toastAfter = null;
      }
      if (next) {
        this.obstacles.cycle = Math.max(this.obstacles.cycle, this.stages.cycle); // every loop is tighter and busier
        this._enterStage(next);
      }
      this.obstacles.director.crescendo = this._secsToBoss() < CRESCENDO; // the run into a gunship is a peak
      this.obstacles.update(dt, this.speed, this.dist, hard);
      this._updateReflected();
      this._checkTips();
      this._viewHint(dt);
    } else if (this.state === 'dying') {
      this.obstacles.update(dt, this.speed, this.dist, hard);
    }
    if (running || this.state === 'dying') this._updateBoss(dt);
    if (this.pendingBanner && running) {
      this.pendingBanner.t -= realDt;
      if (this.pendingBanner.t <= 0) {
        const b = this.pendingBanner;
        this.hud.banner(b.sub, b.title, b.kind);
        this.pendingBanner = null;
      }
    }

    // vertical physics
    if (playing || this.state === 'dying') {
      // gliding monsters (the Moth Queen) fall slowly while jump is held on the way down
      this.gliding = !!this.monster.glide && playing && !this.grounded && this.vy < 0 && this.input.jump && !this.input.duck;
      if (!this.grounded) {
        let g = CFG.gravity * (this.input.duck ? CFG.fastFall : 1);
        if (this.gliding) g *= CFG.glideGravity;
        if (this.cutPending && this.y >= CFG.minCutHeight && this.vy > CFG.jumpCut) {
          this.vy = CFG.jumpCut;
          this.cutPending = false;
        }
        this.vy -= g * dt;
        if (this.gliding) this.vy = Math.max(this.vy, -CFG.glideFall);
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.grounded = true;
          this.cutPending = false;
          if (this.state !== 'dying') this._haptic(8);
          if (this.state !== 'dying') {
            if (this.dragon.flyer) {
              // a flyer settles back onto her legs: a puff of air, no thud
              this.audio.flutter(0.8);
              this._dustBurst(0.5 + this.rageK, 10, 2.4);
            } else {
              this.audio.land();
              this._dustBurst(0.8 + this.rageK, 18, 1.8);
              this.rig.shake(this.rig.blend > 0.5 ? 0.22 : 0.08);
            }
          }
        }
      }
      const wasDucking = this.ducking;
      this.ducking = this.grounded && this.input.duck && playing;
      if (this.ducking && !wasDucking) this._markLateDucks();
      // a buffered jump fires the moment the monster lands
      if (this.jumpBuf > 0) {
        this.jumpBuf -= dt;
        if (this.grounded && this.state === 'running' && this.jumpBuf > 0) this._doJump();
      }
    }

    // atomic breath
    let breathAmt = 0;
    this.breathGlow = 0;
    if (this.breathT > 0) {
      this.breathT -= dt;
      const el = CFG.breathTime - this.breathT;
      breathAmt = smooth(0, 0.12, el) * smooth(0, 0.25, this.breathT);
      const mouth = this.dragon.getMouthWorld(this._mouth);
      const len = Math.min(CFG.breathRange, el * 75);
      // the Rex: teeth erupt from the ground up to where the beam would reach (the hits below are the beam's)
      const teeth = this.monster.attack === 'teeth';
      if (teeth) {
        this.toothX -= this.speed * dt;
        const front = mouth.x + len;
        while (this.toothX < front && breathAmt > 0.05) {
          const x = this.toothX, d = Math.max(0, x - mouth.x);
          const h = 1.3 + Math.min(1.8, d * 0.07) + Math.random() * 0.9;
          this.teeth.erupt(x, (Math.random() - 0.5) * 0.7, h, { hold: 0.5 + Math.random() * 0.25, lean: 0.15 });
          for (const side of [-1, 1]) {
            if (Math.random() < 0.75) this.teeth.erupt(x + Math.random() * 0.6, side * (1.0 + Math.random() * 1.4), h * (0.5 + Math.random() * 0.3), { hold: 0.45 + Math.random() * 0.2, lean: 0.1 });
          }
          this.dust.emit(x, 0.3, (Math.random() - 0.5) * 1.2, -2 + Math.random() * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2,
            0.6 + Math.random() * 0.4, 0.6, 2.4, 0.5, 0.46, 0.42, 0.5, 2, 0.3, 1);
          this.toothX += 1.25;
        }
      }
      // against the gunship the beam tilts up to meet it
      const boss = this.boss;
      const aim = boss.active ? Math.min(0.4, Math.max(-0.06, Math.atan2(boss.y - mouth.y, boss.x - mouth.x))) : -0.06;
      this.beam.set(mouth, teeth ? 0 : len, 0.55 + 0.15 * Math.sin(this.time * 40), teeth ? 0 : breathAmt, this.time, aim);
      const nSide = this.dragon.getSideMouths(this._sideMouths);
      this.sideBeams.forEach((b, i) => b.set(this._sideMouths[i], i < nSide ? len * 0.85 : 0, 0.4 + 0.1 * Math.sin(this.time * 33 + i),
        i < nSide ? breathAmt : 0, this.time, aim + (i ? 0.05 : -0.05)));
      let burned = 0;
      for (const o of this.obstacles.active) {
        if (!o.dead && o.x - o.width / 2 < mouth.x + len && o.x > mouth.x - 2) {
          o.dead = true;
          if (teeth) {
            // a big tooth skewers it: up to a flyer, through a building
            const top = o.y > 0.5 ? o.y + 0.9 : o.type === 'building' || o.type === 'tower' ? 5.5 : 3.2;
            this.teeth.erupt(o.x, o.group?.position.z ?? 0, top, { hold: 0.75 });
          }
          this._explode(o);
          burned++;
        }
      }
      if (burned) {
        // burning keeps the combo going, and a big sweep says so
        this._setChain(this.chain + burned);
        const before = this.breathKills;
        this.breathKills += burned;
        if (before < 3 && this.breathKills >= 3) this._popup(`MULTI-BURN ×${this.breathKills}`, mouth.x + 6, mouth.y + 2.4, 'close');
      }
      if (boss.state === 'fight' && !this.bossHitThisBreath && breathAmt > 0.5) {
        const b = boss.box(this._bossBox);
        if (Math.hypot(b[0] - mouth.x, boss.y - mouth.y) < len) {
          this._bossHit('breath');
          if (teeth) this.teeth.erupt(b[0], 0, boss.y + 0.6, { hold: 0.9 });
        }
      }
      for (let i = 0; i < (teeth ? 0 : 4); i++) {
        const d = Math.random() * len;
        this.sparks.emit(
          mouth.x + d * Math.cos(aim), mouth.y + d * Math.sin(aim) + (Math.random() - 0.5) * 0.6, mouth.z + (Math.random() - 0.5) * 0.6,
          8 + Math.random() * 10, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 3,
          0.25 + Math.random() * 0.3, 0.3, 0.05, ...this.skin.spark, 0.9, 1, 2, 0
        );
      }
      // where the beam ends: a splash of sparks, and on the ground dust and a glowing scorch trail
      if (breathAmt > 0.3 && len > 6 && !teeth) {
        const tx = mouth.x + len * Math.cos(aim), ty = mouth.y + len * Math.sin(aim);
        const ground = ty < 1.0;
        const sy = ground ? 0.1 : ty;
        for (let i = 0; i < 3; i++) {
          this.sparks.emit(
            tx, sy, mouth.z + (Math.random() - 0.5) * 0.8,
            -3 + Math.random() * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 5,
            0.3 + Math.random() * 0.3, 0.32, 0.05, ...this.skin.spark, 0.9, 1.2, 9, 1
          );
        }
        if (ground) {
          if (Math.random() < 0.5) {
            this.dust.emit(tx, 0.3, (Math.random() - 0.5) * 1.2, -2 + Math.random() * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
              0.7 + Math.random() * 0.5, 0.6, 2.2, 0.5, 0.46, 0.42, 0.5, 2, 0.3, 1);
          }
          this.scorchT = (this.scorchT || 0) - dt;
          if (this.scorchT <= 0) {
            this.scorchT = 0.06;
            this.blasts.mark(tx, mouth.z + (Math.random() - 0.5) * 0.3, 1.3 + Math.random() * 0.5, this.breathColor);
          }
        }
        this.breathGlow = breathAmt;
        if (this.blastLightT <= 0) {
          this.blastLight.position.set(tx - 1, sy + 1.2, mouth.z + 1.2);
          this.blastLight.color.copy(this.breathColor);
        }
      }
      if (this.breathT <= 0) {
        this.beam.set(mouth, 0, 0, 0, this.time);
        for (const b of this.sideBeams) b.set(b.mesh.position, 0, 0, 0, this.time);
      }
    } else if (this.beam.mesh.visible) {
      this.beam.set(this.beam.mesh.position, 0, 0, 0, this.time);
      for (const b of this.sideBeams) b.set(b.mesh.position, 0, 0, 0, this.time);
    }

    this.scroll += this.speed * dt;

    // dragon animation (keeps breathing at reduced rate when the run has ended)
    const animDt = this.state === 'over' ? realDt * 0.5 : this.state === 'dying' ? realDt * 0.6 : dt;
    this.dragon.group.position.set(0, this.y, 0);
    const bodyScale = DRAGON_SCALE * (1 + (CFG.rageScale - 1) * this.rageK);
    this.dragon.group.scale.set(bodyScale * this.skin.hitX, bodyScale, bodyScale); // the skin's build: x only
    this.dragon.setRage(this.rageK);
    const ds = this._dst;
    ds.speed = this.speed;
    ds.grounded = this.grounded;
    ds.vy = this.vy;
    ds.ducking = this.ducking;
    ds.running = playing && this.speed > 0.5;
    ds.dead = this.state === 'dying' || this.state === 'over';
    ds.roar = this.state === 'intro' ? smooth(0, 0.25, this.introT) * smooth(1.6, 0.9, this.introT) : 0;
    ds.breath = breathAmt;
    ds.bite = this.smashT > 0 ? 1 : 0;
    ds.glide = this.gliding;
    this.dragon.update(animDt, ds);
    if (this.dragon.wingDust) this._wingGlitter(dt, breathAmt);

    // Plate glow: idles softly, charges up, flares when firing, burns during rage
    const night = this.env.nightness;
    const ready = this.charge >= 1;
    const wave = (this.time * (ready ? 0.9 : 0.5)) % 1.6 - 0.2;
    if (breathAmt > 0.01) this.dragon.setGlow(1.5 + 5 * breathAmt, 6 * breathAmt, (this.time * 3) % 1.4 - 0.2);
    else if (this.state === 'intro') this.dragon.setGlow(0.5 + 2.5 * this.dragon.roar, 3 * this.dragon.roar, (this.introT * 0.9) % 1.4 - 0.2);
    else if (this.rageK > 0.05) {
      const flicker = this.rageT > 0 && this.rageT < 1 && Math.floor(this.time * 12) % 2 === 0 ? 0.3 : 1;
      this.dragon.setGlow((1.6 + 0.5 * Math.sin(this.time * 9)) * this.rageK * flicker, 2.5, (this.time * 1.6) % 1.4 - 0.2);
    } else this.dragon.setGlow(0.18 + 0.35 * night + 0.7 * this.charge * this.charge + (ready ? 0.4 * Math.sin(this.time * 5) + 0.6 : 0), ready ? 3.2 : 0.6 * this.charge, wave);

    this._updateDragonLight(night);

    // collisions, close calls and crystals
    let n = 0;
    if (running) {
      n = this.dragon.getHitboxes(this.boxes);
      // the smash is checked first, so anything meeting the jaws breaks before it can hurt
      if (this.smashT > 0) {
        this.smashT -= dt;
        const m = this.dragon.getMouthWorld(this._mouth);
        const sx = this.dragon.group.scale.x / DRAGON_SCALE, sy = this.dragon.group.scale.y / DRAGON_SCALE;
        this.obstacles.inZone(m.x - 1.4 * sx, Math.max(0, m.y - 2.6 * sy), m.x + CFG.smashReach * sx, m.y + 0.9 * sy, (o) => this._smashHit(o));
        if (this.smashT <= 0) this.smashCool = this.smashHit ? CFG.smashRecover : CFG.smashMiss;
      } else this.smashCool = Math.max(0, this.smashCool - dt);
      const hit = this.debug ? null : this.obstacles.collide(this.boxes, n);
      if (hit) {
        if (this.rageT > 0 && hit.smash === 'reflect') {
          // in Kaiju Rage, shells and missiles that touch you are batted straight back
          this.obstacles.reflect(hit, this.speed);
          this.audio.reflect();
          this._popup('RAGE REFLECT!', hit.x, hit.y + 1.2, 'close');
        } else if (this.rageT > 0 || this.graceT > 0) {
          hit.dead = true; // Kaiju Rage smashes straight through
          this._explode(hit);
        } else this._die();
      }
      if (this.state === 'running') {
        let rear = Infinity;
        for (let i = 0; i < n; i++) rear = Math.min(rear, this.boxes[i][0]);
        this.obstacles.passed(rear, (o, clearance) => this._passObstacle(o, clearance));
      }
    }
    this._crystalOpts.magnet = this.rageK;
    this.crystals.update(dt, this.speed, this.boxes, this.state === 'running' ? n : 0, this._crystalOpts);

    // projectile trails and incoming-fire warnings
    let rotor = this.boss.active || this.boss.state === 'dying' ? 1 : 0;
    let treads = 0;
    for (const o of this.obstacles.active) {
      if (o.type === 'shell' || o.type === 'missile') {
        this.sparks.emit(o.x + 0.4, o.y, 0, 2 + Math.random() * 2, (Math.random() - 0.5), (Math.random() - 0.5), 0.12, 0.25, 0.05, 1.6, 0.8, 0.3, 0.9, 1, 0, 0);
        if (o.type === 'missile') this.dust.emit(o.x + 0.5, o.y, 0, 1, 0.3, 0, 0.6, 0.25, 0.9, 0.55, 0.55, 0.55, 0.35, 1.5, 0.2, 1);
      } else if (o.type === 'heli' && o.x > -10 && o.x < 50) rotor = Math.max(rotor, 0.55);
      else if (o.type === 'tank' && !o.dead && o.x > -8 && o.x < 34) treads = Math.max(treads, 1 - Math.abs(o.x - 4) / 30);
      else if (o.type === 'ptero' && !o.cried && o.x < 40 && running) { o.cried = true; this.audio.screech(o.x); }
      else if (o.type === 'meteor' && o.fallT >= 0 && !o.landed) {
        if (!o.cried && running) { o.cried = true; this.audio.meteorWhistle(o.x, 1); }
        const b = o.model.userData.ball.position;
        this.sparks.emit(o.x + b.x, b.y, 0, 3 + Math.random() * 3, 4 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.3, 0.6, 0.1, 1.8, 0.6, 0.15, 1, 1, 0, 1);
        this.dust.emit(o.x + b.x + 0.4, b.y + 0.4, 0, 2, 2.5, 0, 1.2, 0.5, 2.2, 0.16, 0.13, 0.12, 0.55, 1.2, -0.2, 1);
      }
    }
    const warns = this._warns;
    warns.length = 0;
    if (running) {
      const lists = [this.obstacles.warnings, this.boss.warnings];
      for (const list of lists) {
        for (const w of list) {
          if (warns.length >= this._warnList.length) break;
          const p = this._toScreen(w.x, w.y);
          const e = this._warnList[warns.length];
          e.x = Math.min(window.innerWidth - 30, Math.max(30, p.x));
          e.y = Math.min(window.innerHeight - 70, Math.max(60, p.y));
          e.kind = w.y < 1.5 ? 'low' : 'mid';
          warns.push(e);
        }
      }
      if (warns.length > this.warnCount) this.audio.warning();
    }
    this.warnCount = warns.length;
    this.hud.setWarnings(warns);
    this.obstacles.night = night;
    this.audio.setRotor(running ? rotor : 0);
    this.audio.setTreads(running ? treads : 0);
    this._scoreMusic(realDt);

    // world
    const near = this.rig.blend;
    this.terrain.update(this.scroll, near);
    this.scenery.update(this.scroll, near);
    const groundSpeed = this.speed * (this.state === 'over' ? 0 : 1);
    this.city.update(dt, groundSpeed, this.scroll, night, this.rig.blend);
    this.volcano.update(dt, groundSpeed, this.time);
    // the volcano's ash and lava veins ease in and out with the level
    const ashT = this.level.biome === 'volcano' ? 1 : 0;
    const tu = this.terrain.uniforms;
    tu.uAsh.value += (ashT - tu.uAsh.value) * (1 - Math.exp(-realDt * 2.5));
    tu.uLava.value = tu.uAsh.value;
    // Night City's flat street grid eases in and out the same way
    tu.uCity.value += ((this.level.biome === 'city' ? 1 : 0) - tu.uCity.value) * (1 - Math.exp(-realDt * 2.5));
    tu.uNight.value = night;
    tu.uTime.value = this.time;
    if (this.volcano.active && this.state !== 'over') this._volcanoAir(realDt);
    this.debris.update(dt, this.speed * (this.state === 'over' ? 0 : 1));
    this.blasts.update(dt, this.speed * (this.state === 'over' ? 0 : 1), this.time, this.env.hemi);
    // chargers kick up a trail of dust, so you can see them coming in fast
    if (this.state === 'running') {
      for (const o of this.obstacles.active) {
        if ((o.type !== 'boulder' && o.type !== 'jeep') || o.dead || o.x > 90 || Math.random() > dt * 22) continue;
        const ash = this.level.biome === 'volcano';
        this.dust.emit(o.x + o.width * 0.45, 0.25, o.group.position.z + (Math.random() - 0.5) * 1.2, 2 + Math.random() * 3, 0.6 + Math.random(), (Math.random() - 0.5),
          0.8 + Math.random() * 0.5, 0.5, 1.9, ash ? 0.3 : 0.62, ash ? 0.24 : 0.54, ash ? 0.22 : 0.42, 0.5, 2, 0.2, 1);
      }
    }
    // supply drops: run through a crate, smash it or burn it to open it
    this.supply.update(dt, this.speed * (this.state === 'over' ? 0 : 1), this.state === 'running', this.obstacles.active, this.time);
    const drop = this.supply.drop;
    if (drop && this.state === 'running') {
      const touch = drop.x > -1.6 && drop.x < 2.6 && this.y < drop.y + 1.0;
      const smashed = this.smashT > 0 && drop.x > -0.5 && drop.x < 4.5 && drop.y < 3.5;
      const burned = this.breathT > 0 && drop.x > 1 && drop.x < CFG.breathRange && drop.y < 6;
      if (touch || smashed || burned) this._takeDrop(drop);
    }
    if (this.magnetT > 0) {
      this.magnetT -= dt;
      for (const c of this.crystals.items) c.mag = 1; // every crystal ahead homes in
    }
    if (this.blastLightT > 0) {
      this.blastLightT -= dt;
      this.blastLight.position.x -= this.speed * dt;
      const k = Math.max(0, this.blastLightT / 0.4);
      this.blastLight.intensity = this.blastPeak * k * k;
    } else if (this.breathGlow > 0) this.blastLight.intensity = 26 * this.breathGlow; // the breath lights its impact
    else if (this.blastLight.intensity) this.blastLight.intensity = 0;
    this.env.scrollClouds(this.scroll);
    // the Desert has a day/night cycle; the City and the Volcano keep their own fixed hour
    if (running && this.level.time == null) this.dayT += (this.speed * dt * CFG.scoreRate) / CFG.dayLength;
    this.env.setTimeOfDay(this.dayT);
    const ground = this.speed * (this.state === 'over' ? 0 : 1);
    this.dust.update(dt, ground);
    this.sparks.update(dt, ground);
    this.footprints.update(dt, this.speed);
    this.teeth.update(dt, this.state === 'over' ? 0 : this.speed);
    if (this.state !== 'loading') runAOQueue(this.state === 'running' ? 2 : 6); // baked shading, a slice per frame
    this._contactShadows();
    const pxScale = this.renderer.pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.dust.uniforms.uScale.value = pxScale;
    this.sparks.uniforms.uScale.value = pxScale;
    // dust takes on scene light: warm sand by day, cool and dim by night
    const sunK = Math.min(1, this.env.light.intensity / 6) * (1 - night);
    this.dust.uniforms.uTint.value.setRGB(0.12, 0.14, 0.2).lerp(this._dustDay.copy(this.env.light.color).multiplyScalar(0.55).addScalar(0.5), sunK);

    const ro = this._rigOpts;
    ro.aspect = this.renderer.aspect;
    ro.dragonY = this.y;
    ro.speed = this.speed;
    ro.rage = this.rageK;
    ro.dead = this.state === 'dying' || this.state === 'over' ? 1 : 0;
    ro.boss = this.boss.active ? 1 : 0;
    this.rig.update(realDt, ro);
    this.env.update(realDt, this.camera, this.time, this.rig.blend);
    this.renderer.renderer.toneMappingExposure = this.env.exposure;
    this._grade(night);
    // heat haze sits on the horizon line, wherever the camera pitch puts it on screen
    const dir = this.camera.getWorldDirection(this._dir);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.renderer.setHaze((1 - night) * smooth(-2, 12, this.env.sunElev), 0.5 - (0.5 * dir.y) / Math.sqrt(1 - dir.y * dir.y) / tanHalf);
    this.audio.setWind(Math.min(1, this.speed / CFG.maxSpeed));

    this.flash *= Math.exp(-realDt * 4);
    this.hud.setScore(this.score, realDt);
    this.hud.setCharge(this.charge, ready && running);
    this.hud.setRage(this.rage, this.rageT > 0, this.rageT > 0 && this.rageT < 1.2, this.rageReady && running);
    if (running) this._updateRival(realDt);
  }
}
