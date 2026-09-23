'use strict';

/* =========================================================================
 * Skyline Runner — endless homing-missile dodge game
 * Plain Canvas2D + vanilla JS. No build step, no external assets at runtime.
 * ========================================================================= */

/* ----------------------------- 1. CONFIG -------------------------------- */

const LOGICAL_W = 390;
const LOGICAL_H = 845;

const JET_SPEED = 260;              // px/s, forward speed
const JET_TURN_RATE = 3.5;          // rad/s
const JET_RADIUS = 12;
const JET_BOOST_MULT = 1.6;
const JET_BOOST_DURATION = 2.5;

const MISSILE_SPEED_START_MULT = 1.15;
const MISSILE_SPEED_CAP_MULT = 1.4;
const MISSILE_SPEED_RAMP_TIME = 120;  // seconds to go from start mult to cap
const MISSILE_TURN_RATE = 1.9;        // rad/s
const MISSILE_RADIUS = 6;
const MISSILE_LIFETIME_MIN = 9;
const MISSILE_LIFETIME_MAX = 11;
const MISSILE_SPAWN_FRONT_EXCLUDE = 30 * Math.PI / 180;

const BULLET_RADIUS = 14;
const BULLET_COUNT_TARGET = 9;
const BULLET_SPAWN_RANGE = LOGICAL_W * 1.2; // ~1.5 "screens" worth of radius
const BULLET_DESPAWN_DIST = BULLET_SPAWN_RANGE * 1.6;

const FUEL_MAX = 100;
const FUEL_DRAIN_RATE = 5.5;       // fuel units/s -- empties a full tank in ~18s
const FUEL_CAN_REFILL = 35;
const FUEL_CAN_RADIUS = 13;
const FUEL_CAN_COUNT_TARGET = 4;   // scarcer than bullets -- fuel is the precious resource
const FUEL_CAN_SPAWN_RANGE = LOGICAL_W * 1.4;
const FUEL_CAN_DESPAWN_DIST = FUEL_CAN_SPAWN_RANGE * 1.6;
const FUEL_LOW_THRESHOLD = 0.25;

const CLOSE_CALL_DIST = 38;
const CLOSE_CALL_RESET_DIST = 90;

const MAX_MISSILES_START = 1;
const MISSILE_CAP_INCREASE_INTERVAL = 12; // seconds
const MISSILE_CAP_MAX = 6;
const FIRST_MISSILE_DELAY = 1.5;

const SCORE_PER_SECOND = 1;
const SCORE_BULLET = 10;
const SCORE_CLOSE_CALL = 5;
const SCORE_MISSILE_DOWN = 15;

const POWERUPS = {
  boost:  { cost: 2, label: 'Boost' },
  flares: { cost: 3, label: 'Flares' },
  shield: { cost: 4, label: 'Shield' },
  slowmo: { cost: 5, label: 'Slow-mo' },
  emp:    { cost: 7, label: 'EMP' },
};
const SHIELD_DURATION = 5;
const SLOWMO_DURATION = 3;
const SLOWMO_FACTOR = 0.4;
const FLARE_FLASH_DURATION = 0.2;
const FLARE_INTERCEPTOR_COUNT = 2;
const INTERCEPTOR_SPEED = 620;      // px/s -- faster than any missile so it can catch up
const INTERCEPTOR_TURN_RATE = 4.5;  // rad/s -- sharper than a missile's turn so it can correct
const INTERCEPTOR_RADIUS = 5;
const INTERCEPTOR_LIFETIME = 3.5;   // fizzles out if it never catches its target

const COLORS = {
  skyTop: '#050B1F',
  skyBottom: '#101E42',
  navyText: '#12303A',
  orange: '#F28C28',
  grey: '#9AA7AE',
  white: '#FFFFFF',
  jetBody: '#7B838C',
  jetCamoDark: '#3E434A',
  jetCamoMid: '#585F68',
  jetCockpit: '#15181C',
  jetRim: 'rgba(225,230,235,0.6)',
  jetShadow: 'rgba(20,25,32,0.4)',
  missileBody: '#FF7A52',
  starTwinkle: 'rgba(255,255,255,0.9)',
  orangeLight: '#FFB35C',
  orangeShadow: '#C96A16',
  gemCrown: '#5BC8F2',
  gemTable: '#8FE0FA',
  gemPavilion: '#1E8FDB',
  fuelFull: '#6FE3E8',
  fuelFullDeep: '#1F86A8',
  fuelLow: '#FF8A65',
  fuelLowDeep: '#E4453A',
  fuelCanBody: '#FF4A42',
  fuelCanShade: '#C6332D',
  fuelCanCap: '#F7C948',
  woodLight: '#E3A24D',
  woodMid: '#C9812F',
  woodDark: '#7A4A20',
  woodGrain: 'rgba(90,55,20,0.35)',
  woodIcon: '#F7E9CB',
};

// Planet palettes for the parallax background layers (far/near), each an
// [body, ring-or-null] pair -- rings are drawn as a flattened ellipse behind
// and in front of the body for a cheap Saturn-like look.
const PLANET_PALETTES = [
  ['#C97A4A', null],          // rusty Mars-like
  ['#8FB3D9', null],          // pale blue gas giant
  ['#E0C08A', '#B98F55'],     // tan Saturn-like, with ring
  ['#9C8FD9', null],          // lavender ice giant
  ['#D9D2C4', null],          // grey moon
];

const SAVE_VERSION = 2; // bumped: currency renamed stars -> bullets

/* --------------------------- 2. UTILITIES ------------------------------- */

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function rand(a, b) { return a + Math.random() * (b - a); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

/* --------------------------- 3. PLATFORM / SDK --------------------------- */

const Platform = (function () {
  const hasYt = typeof window.ytgame !== 'undefined';
  let audioEnabled = true;
  let pauseCb = null, resumeCb = null, audioChangeCb = null;

  if (hasYt) {
    try {
      if (window.ytgame.system && typeof window.ytgame.system.isAudioEnabled === 'function') {
        audioEnabled = !!window.ytgame.system.isAudioEnabled();
      }
      if (window.ytgame.system && typeof window.ytgame.system.onAudioEnabledChange === 'function') {
        window.ytgame.system.onAudioEnabledChange((enabled) => {
          audioEnabled = !!enabled;
          if (audioChangeCb) audioChangeCb(audioEnabled);
        });
      }
      if (window.ytgame.system && typeof window.ytgame.system.onPause === 'function') {
        window.ytgame.system.onPause(() => { if (pauseCb) pauseCb(); });
      }
      if (window.ytgame.system && typeof window.ytgame.system.onResume === 'function') {
        window.ytgame.system.onResume(() => { if (resumeCb) resumeCb(); });
      }
    } catch (e) { /* ignore — treat as not available */ }
  }

  return {
    isYt: hasYt,
    isAudioEnabled: () => audioEnabled,
    onAudioEnabledChange: (cb) => { audioChangeCb = cb; },
    onSystemPause: (cb) => { pauseCb = cb; },
    onSystemResume: (cb) => { resumeCb = cb; },
    firstFrameReady: () => {
      if (hasYt) try { window.ytgame.game.firstFrameReady(); } catch (e) {}
    },
    gameReady: () => {
      if (hasYt) try { window.ytgame.game.gameReady(); } catch (e) {}
    },
    sendScore: (value) => {
      if (hasYt) try { window.ytgame.engagement.sendScore({ value }); } catch (e) {}
    },
    loadData: async () => {
      if (hasYt) {
        try {
          const raw = await Promise.race([
            window.ytgame.game.loadData(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
          ]);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      }
      try {
        const raw = localStorage.getItem('skylineRunnerSave');
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    saveData: (obj) => {
      const raw = JSON.stringify(obj);
      if (hasYt) {
        try { window.ytgame.game.saveData(raw); return; } catch (e) { /* fall through */ }
      }
      try { localStorage.setItem('skylineRunnerSave', raw); } catch (e) {}
    },
  };
})();

function defaultSave() {
  return { v: SAVE_VERSION, bestScore: 0, bullets: 0, musicOn: true, soundOn: true };
}
function migrateSave(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return defaultSave();
  const d = defaultSave();
  return {
    v: SAVE_VERSION,
    bestScore: typeof raw.bestScore === 'number' ? raw.bestScore : d.bestScore,
    bullets: typeof raw.bullets === 'number' ? raw.bullets : d.bullets,
    musicOn: typeof raw.musicOn === 'boolean' ? raw.musicOn : d.musicOn,
    soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : d.soundOn,
  };
}

let save = defaultSave();

/* ------------------------------ 4. AUDIO --------------------------------- */

const Audio_ = (function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let unlocked = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = save.musicOn ? 0.22 : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = save.soundOn ? 0.6 : 0;
    sfxGain.connect(master);
    applyMasterGate();
  }

  function applyMasterGate() {
    if (!master) return;
    master.gain.value = Platform.isAudioEnabled() ? 1 : 0;
  }

  Platform.onAudioEnabledChange(() => applyMasterGate());

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    startMusicLoop();
  }

  function tone(freq, dur, type, gainVal, when, glideTo) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gainVal, when, filterFreq) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function startMusicLoop() {
    if (!ctx || musicTimer) return;
    const notes = [261.6, 293.7, 329.6, 392.0, 440.0, 392.0, 329.6, 293.7];
    musicTimer = setInterval(() => {
      if (!ctx) return;
      const f = notes[musicStep % notes.length];
      musicStep++;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f / 2;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(t0);
      osc.stop(t0 + 1);
    }, 700);
  }

  return {
    unlock,
    setMusicOn(on) { save.musicOn = on; if (musicGain) musicGain.gain.value = on ? 0.22 : 0; },
    setSoundOn(on) { save.soundOn = on; if (sfxGain) sfxGain.gain.value = on ? 0.6 : 0; },
    bulletPickup() { ensureCtx(); tone(1200, 0.12, 'sine', 0.5, 0, 1800); },
    closeCall() { ensureCtx(); noiseBurst(0.25, 0.25, 0, 3000); },
    launch() { ensureCtx(); tone(180, 0.15, 'square', 0.3, 0, 340); },
    boom() { ensureCtx(); noiseBurst(0.4, 0.6, 0, 900); tone(90, 0.4, 'sine', 0.4, 0, 40); },
    click() { ensureCtx(); tone(700, 0.05, 'square', 0.25); },
    powerup() { ensureCtx(); tone(500, 0.2, 'triangle', 0.35, 0, 1200); },
    denied() { ensureCtx(); tone(160, 0.1, 'square', 0.2, 0, 90); },
    refuel() { ensureCtx(); tone(300, 0.18, 'sine', 0.4, 0, 700); tone(450, 0.14, 'sine', 0.3, 0.08, 900); },
    lowFuel() { ensureCtx(); tone(220, 0.15, 'square', 0.25, 0); tone(220, 0.15, 'square', 0.25, 0.2); },
    flareBurst() { ensureCtx(); noiseBurst(0.5, 0.7, 0, 1600); tone(140, 0.35, 'sawtooth', 0.4, 0, 45); },
  };
})();

/* ------------------------------ 5. CANVAS -------------------------------- */

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
let dpr = 1;
let scale = 1;

// The canvas element itself is centered in the viewport by CSS flexbox
// (#game-root), so no internal letterbox offset is needed here -- the
// canvas's own pixel buffer always exactly covers LOGICAL_W x LOGICAL_H.
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  scale = Math.max(0.001, Math.min(vw / LOGICAL_W, vh / LOGICAL_H));
  const cssW = LOGICAL_W * scale;
  const cssH = LOGICAL_H * scale;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------ 6. INPUT --------------------------------- */

const Input = {
  steerLeftPointers: new Set(),
  steerRightPointers: new Set(),
  keyLeft: false,
  keyRight: false,
};

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * LOGICAL_W;
  const y = (e.clientY - rect.top) / rect.height * LOGICAL_H;
  return { x, y };
}

function hitTestButtons(x, y) {
  // Returns a button id if (x,y) in logical space hits a HUD/power-up button.
  for (const b of hudButtons) {
    if (dist(x, y, b.x, b.y) <= b.r) return b.id;
  }
  for (const b of powerupButtons) {
    if (dist(x, y, b.x, b.y) <= b.r) return b.id;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  Audio_.unlock();
  const p = canvasPointFromEvent(e);
  const btn = hitTestButtons(p.x, p.y);
  if (btn) {
    handleButtonPress(btn);
    return;
  }
  if (Game.state !== 'playing') {
    handleNonPlayingTap();
    return;
  }
  if (p.x < LOGICAL_W / 2) Input.steerLeftPointers.add(e.pointerId);
  else Input.steerRightPointers.add(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  Input.steerLeftPointers.delete(e.pointerId);
  Input.steerRightPointers.delete(e.pointerId);
});
canvas.addEventListener('pointercancel', (e) => {
  Input.steerLeftPointers.delete(e.pointerId);
  Input.steerRightPointers.delete(e.pointerId);
});
canvas.addEventListener('pointerleave', (e) => {
  Input.steerLeftPointers.delete(e.pointerId);
  Input.steerRightPointers.delete(e.pointerId);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') Input.keyLeft = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') Input.keyRight = true;
  if (e.key === 'p' || e.key === 'P') togglePause();
  // 'd' already steers right (A/D scheme), so debug uses backtick instead.
  if (e.key === '`') Game.debug = !Game.debug;
  // Testing aid: while debug mode is on, grant bullets + full fuel so every
  // power-up can be tried immediately instead of earning them normally.
  if (Game.debug && (e.key === 'g' || e.key === 'G')) {
    save.bullets += 20;
    jet.fuel = FUEL_MAX;
    Platform.saveData(save);
  }
  Audio_.unlock();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') Input.keyLeft = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') Input.keyRight = false;
});

function steerDirection() {
  const left = Input.steerLeftPointers.size > 0 || Input.keyLeft;
  const right = Input.steerRightPointers.size > 0 || Input.keyRight;
  if (left && !right) return -1;
  if (right && !left) return 1;
  return 0;
}

/* ------------------------------ 7. OBJECT POOLS --------------------------- */

function makePool(factory, resetFn) {
  const free = [];
  const active = [];
  return {
    active,
    spawn(...args) {
      const obj = free.pop() || factory();
      resetFn(obj, ...args);
      active.push(obj);
      return obj;
    },
    release(obj) {
      const idx = active.indexOf(obj);
      if (idx >= 0) active.splice(idx, 1);
      free.push(obj);
    },
    releaseAll() {
      while (active.length) free.push(active.pop());
    },
  };
}

/* ------------------------------ 8. WORLD / JET ---------------------------- */

const jet = {
  x: 0, y: 0, heading: -Math.PI / 2, // facing "up" in world initially
  bank: 0,
  boostTimer: 0,
  shieldTimer: 0,
  slowmoTimer: 0,
  flareFlash: 0,
  fuel: FUEL_MAX,
  fuelWarned: false,
};

const camera = { x: 0, y: 0 };

function jetCurrentSpeed() {
  return jet.boostTimer > 0 ? JET_SPEED * JET_BOOST_MULT : JET_SPEED;
}

/* ------------------------------ 9. MISSILES -------------------------------- */

let missileIdCounter = 1;

const missilePool = makePool(
  () => ({
    id: 0, x: 0, y: 0, heading: 0, age: 0, lifetime: 0, alive: false,
    closeCallArmed: true, trail: [],
  }),
  (m, x, y, heading) => {
    m.id = missileIdCounter++;
    m.x = x; m.y = y; m.heading = heading; m.age = 0;
    m.lifetime = rand(MISSILE_LIFETIME_MIN, MISSILE_LIFETIME_MAX);
    m.alive = true;
    m.closeCallArmed = true;
    m.trail.length = 0;
  }
);

let missileSpawnTimer = FIRST_MISSILE_DELAY;
let missileCap = MAX_MISSILES_START;
let missileCapTimer = 0;

function missileSpeedMult(elapsed) {
  const t = clamp(elapsed / MISSILE_SPEED_RAMP_TIME, 0, 1);
  return lerp(MISSILE_SPEED_START_MULT, MISSILE_SPEED_CAP_MULT, t);
}

function trySpawnMissile(elapsed) {
  if (missilePool.active.length >= missileCap) return;
  const spawnDist = Math.hypot(LOGICAL_W, LOGICAL_H) / 2 + 60;
  let angle;
  do {
    angle = rand(0, Math.PI * 2);
  } while (Math.abs(angleDiff(jet.heading, angle)) < MISSILE_SPAWN_FRONT_EXCLUDE);
  const x = jet.x + Math.cos(angle) * spawnDist;
  const y = jet.y + Math.sin(angle) * spawnDist;
  const headingToJet = Math.atan2(jet.y - y, jet.x - x);
  missilePool.spawn(x, y, headingToJet);
  Audio_.launch();
}

/* ------------------------------ 9b. INTERCEPTORS (Flares power-up) --------- */
// Fast, fire-trailed counter-missiles the jet launches when Flares is used;
// each one locks onto one enemy missile and chases it down.

const interceptorPool = makePool(
  () => ({ x: 0, y: 0, heading: 0, age: 0, targetId: null, alive: false }),
  (p, x, y, heading, targetId) => {
    p.x = x; p.y = y; p.heading = heading; p.age = 0; p.targetId = targetId;
    p.alive = true;
  }
);

/* ------------------------------ 10. BULLETS (currency pickups) ------------- */

const bulletPool = makePool(
  () => ({ x: 0, y: 0, alive: false, bob: 0 }),
  (s, x, y) => { s.x = x; s.y = y; s.alive = true; s.bob = Math.random() * Math.PI * 2; }
);

function randomBulletPos() {
  const angle = rand(0, Math.PI * 2);
  const d = rand(120, BULLET_SPAWN_RANGE);
  return { x: jet.x + Math.cos(angle) * d, y: jet.y + Math.sin(angle) * d };
}

function ensureBullets() {
  while (bulletPool.active.length < BULLET_COUNT_TARGET) {
    const p = randomBulletPos();
    bulletPool.spawn(p.x, p.y);
  }
}

/* ------------------------------ 10b. FUEL CANS ------------------------------ */

const fuelCanPool = makePool(
  () => ({ x: 0, y: 0, alive: false, bob: 0 }),
  (c, x, y) => { c.x = x; c.y = y; c.alive = true; c.bob = Math.random() * Math.PI * 2; }
);

function randomFuelCanPos() {
  const angle = rand(0, Math.PI * 2);
  const d = rand(150, FUEL_CAN_SPAWN_RANGE);
  return { x: jet.x + Math.cos(angle) * d, y: jet.y + Math.sin(angle) * d };
}

function ensureFuelCans() {
  while (fuelCanPool.active.length < FUEL_CAN_COUNT_TARGET) {
    const p = randomFuelCanPos();
    fuelCanPool.spawn(p.x, p.y);
  }
}

/* ------------------------------ 11. PARTICLES ------------------------------ */

const particlePool = makePool(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, color: '#fff', kind: 'dot', alive: false }),
  (p, x, y, vx, vy, life, size, color, kind) => {
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.kind = kind || 'dot'; p.alive = true;
  }
);

function spawnBurst(x, y, color, count, speedMin, speedMax, life) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(speedMin, speedMax);
    particlePool.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(life * 0.6, life), rand(2, 5), color, 'dot');
  }
}
function spawnSmokePuff(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(20, 70);
    particlePool.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.8), rand(10, 20), 'rgba(180,190,205,0.45)', 'smoke');
  }
}
function spawnFloatingText(x, y, text, color) {
  particlePool.spawn(x, y, 0, -30, 0.8, 0, color, 'text');
  particlePool.active[particlePool.active.length - 1].text = text;
}
function spawnShockwave(x, y) {
  particlePool.spawn(x, y, 0, 0, 0.5, 4, 'rgba(255,255,255,0.8)', 'ring');
}

// A big, layered flame burst -- yellow-hot core, orange mid-flames, red
// outer tongues, plus smoke and a shockwave ring for a satisfying explosion.
function spawnFireBurst(x, y) {
  spawnBurst(x, y, '#FFE47A', 18, 100, 260, 0.45);
  spawnBurst(x, y, '#FFB84D', 26, 80, 220, 0.6);
  spawnBurst(x, y, '#FF6A2E', 26, 55, 170, 0.75);
  spawnBurst(x, y, '#E4453A', 18, 35, 120, 0.9);
  spawnSmokePuff(x, y);
  spawnSmokePuff(x, y);
  spawnShockwave(x, y);
}

/* ------------------------------ 12. FLARES ---------------------------------- */

// Flares launches two fast, fire-trailed interceptor missiles from the jet;
// each locks onto one of the nearest chasing missiles and blows it up on
// impact -- a dramatic "fire back" rather than a passive decoy.
function activateFlareStrike() {
  const launchX = jet.x - Math.cos(jet.heading) * 14;
  const launchY = jet.y - Math.sin(jet.heading) * 14;
  spawnFireBurst(launchX, launchY);
  jet.flareFlash = 0.6;
  Audio_.flareBurst();

  const targets = missilePool.active
    .slice()
    .sort((a, b) => dist2(a.x, a.y, jet.x, jet.y) - dist2(b.x, b.y, jet.x, jet.y))
    .slice(0, FLARE_INTERCEPTOR_COUNT);

  for (let i = 0; i < FLARE_INTERCEPTOR_COUNT; i++) {
    const sideSign = i === 0 ? -1 : 1;
    const perp = jet.heading + Math.PI / 2;
    const sx = jet.x + Math.cos(perp) * sideSign * 8 - Math.cos(jet.heading) * 10;
    const sy = jet.y + Math.sin(perp) * sideSign * 8 - Math.sin(jet.heading) * 10;
    const target = targets[i];
    const heading = target ? Math.atan2(target.y - sy, target.x - sx) : jet.heading;
    interceptorPool.spawn(sx, sy, heading, target ? target.id : null);
  }
}

/* ------------------------------ 13. GAME STATE ------------------------------ */

const Game = {
  state: 'boot', // boot | hint | playing | paused | gameover
  score: 0,
  displayScore: 0,
  scoreScale: 1,
  elapsed: 0,
  missilesDown: 0,
  closeCalls: 0,
  bulletsCollected: 0,
  debug: false,
  fps: 60,
  pauseSource: null, // 'user' | 'system'
  startHintAlpha: 1,
  hudAlpha: 1,
  deathFlash: 0,
  newRecord: false,
  radarSweep: 0,
  finalScore: 0,
  deathReason: 'missile', // 'missile' | 'fuel'
};

function resetRun() {
  missilePool.releaseAll();
  interceptorPool.releaseAll();
  bulletPool.releaseAll();
  fuelCanPool.releaseAll();
  particlePool.releaseAll();
  jet.x = 0; jet.y = 0; jet.heading = -Math.PI / 2; jet.bank = 0;
  jet.boostTimer = 0; jet.shieldTimer = 0; jet.slowmoTimer = 0; jet.flareFlash = 0;
  jet.fuel = FUEL_MAX; jet.fuelWarned = false;
  camera.x = 0; camera.y = 0;
  missileSpawnTimer = FIRST_MISSILE_DELAY;
  missileCap = MAX_MISSILES_START;
  missileCapTimer = 0;
  Game.score = 0;
  Game.displayScore = 0;
  Game.elapsed = 0;
  Game.missilesDown = 0;
  Game.closeCalls = 0;
  Game.bulletsCollected = 0;
  Game.deathFlash = 0;
  Game.hudAlpha = 1;
  Game.newRecord = false;
  ensureBullets();
  ensureFuelCans();
}

function addScore(amount, floatingLabel, x, y, color) {
  Game.score += amount;
  Game.scoreScale = 1.2;
  if (floatingLabel) spawnFloatingText(x, y, floatingLabel, color || COLORS.white);
}

function startRun() {
  resetRun();
  Game.state = 'playing';
}

function endRun(reason) {
  Game.state = 'gameover';
  Game.deathReason = reason || 'missile';
  Audio_.boom();
  Game.deathFlash = 1;
  spawnSmokePuff(jet.x, jet.y);
  spawnSmokePuff(jet.x, jet.y);
  spawnBurst(jet.x, jet.y, COLORS.orange, 24, 60, 220, 0.8);
  spawnShockwave(jet.x, jet.y);
  const finalScore = Math.floor(Game.score);
  Game.finalScore = finalScore;
  if (finalScore > save.bestScore) {
    save.bestScore = finalScore;
    Game.newRecord = true;
  }
  Platform.saveData(save);
  Platform.sendScore(save.bestScore);
}

/* ------------------------------ 14. POWER-UPS -------------------------------- */

function canAfford(id) { return save.bullets >= POWERUPS[id].cost; }

const deniedFlash = { boost: 0, flares: 0, shield: 0, slowmo: 0, emp: 0 };

function activatePowerup(id) {
  if (Game.state !== 'playing') return;
  if (!canAfford(id)) {
    // Button is unaffordable, not broken -- give a clear "denied" cue
    // instead of silently doing nothing.
    Audio_.denied();
    deniedFlash[id] = 0.35;
    return;
  }
  save.bullets -= POWERUPS[id].cost;
  Audio_.powerup();
  switch (id) {
    case 'boost':
      jet.boostTimer = JET_BOOST_DURATION;
      break;
    case 'flares':
      activateFlareStrike();
      break;
    case 'shield':
      jet.shieldTimer = SHIELD_DURATION;
      break;
    case 'slowmo':
      jet.slowmoTimer = SLOWMO_DURATION;
      break;
    case 'emp': {
      const list = missilePool.active.slice();
      for (const m of list) destroyMissile(m, true);
      spawnShockwave(jet.x, jet.y);
      break;
    }
  }
}

function destroyMissile(m, awardScore = true) {
  spawnSmokePuff(m.x, m.y);
  spawnBurst(m.x, m.y, COLORS.orange, 10, 40, 140, 0.5);
  missilePool.release(m);
  Audio_.boom();
  if (awardScore) {
    Game.missilesDown++;
    addScore(SCORE_MISSILE_DOWN, 'Missile down +15', m.x, m.y - 20, COLORS.white);
  }
}

/* ------------------------------ 15. UPDATE ----------------------------------- */

let lastTime = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;

function update(dtRaw) {
  const dt = Math.min(dtRaw, 1 / 20);

  fpsAccum += dt; fpsFrames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) { Game.fps = Math.round(fpsFrames / fpsAccum); fpsAccum = 0; fpsFrames = 0; fpsTimer = 0; }

  Game.scoreScale = lerp(Game.scoreScale, 1, Math.min(1, dt * 10));
  Game.displayScore = lerp(Game.displayScore, Game.score, Math.min(1, dt * 8));
  Game.radarSweep = (Game.radarSweep + dt / 2.5 * Math.PI * 2) % (Math.PI * 2);
  Game.deathFlash = Math.max(0, Game.deathFlash - dt / 0.08);
  for (const k in deniedFlash) deniedFlash[k] = Math.max(0, deniedFlash[k] - dt);

  if (Game.state === 'hint') {
    Game.startHintAlpha = Math.max(0, Game.startHintAlpha - dt / 2.5);
  }

  // Missiles (and their trails/collisions) keep simulating for a moment after
  // death -- only the jet itself and scoring freeze immediately.
  if (Game.state !== 'playing' && Game.state !== 'gameover') {
    updateParticlesOnly(dt);
    return;
  }

  const playing = Game.state === 'playing';

  if (playing) {
    Game.elapsed += dt;
    addScore(SCORE_PER_SECOND * dt);

    // Timers
    if (jet.boostTimer > 0) jet.boostTimer = Math.max(0, jet.boostTimer - dt);
    if (jet.shieldTimer > 0) jet.shieldTimer = Math.max(0, jet.shieldTimer - dt);
    if (jet.slowmoTimer > 0) jet.slowmoTimer = Math.max(0, jet.slowmoTimer - dt);
    if (jet.flareFlash > 0) jet.flareFlash = Math.max(0, jet.flareFlash - dt / FLARE_FLASH_DURATION);

    // Fuel drains steadily; running dry crashes the jet just like a missile hit.
    jet.fuel = Math.max(0, jet.fuel - FUEL_DRAIN_RATE * dt);
    const fuelPct = jet.fuel / FUEL_MAX;
    if (fuelPct < FUEL_LOW_THRESHOLD && !jet.fuelWarned) {
      jet.fuelWarned = true;
      Audio_.lowFuel();
    } else if (fuelPct >= FUEL_LOW_THRESHOLD) {
      jet.fuelWarned = false;
    }
    if (jet.fuel <= 0) {
      endRun('fuel');
      updateParticlesOnly(dt);
      return;
    }

    // Steering
    const dir = steerDirection();
    jet.heading += dir * JET_TURN_RATE * dt;
    jet.bank = lerp(jet.bank, dir, Math.min(1, dt * 8));

    const speed = jetCurrentSpeed();
    jet.x += Math.cos(jet.heading) * speed * dt;
    jet.y += Math.sin(jet.heading) * speed * dt;
    camera.x = jet.x; camera.y = jet.y;

    if (jet.boostTimer > 0) {
      spawnBurst(jet.x - Math.cos(jet.heading) * 16, jet.y - Math.sin(jet.heading) * 16, COLORS.orange, 1, 10, 40, 0.4);
    }

    // Missile spawn pacing
    missileCapTimer += dt;
    if (missileCapTimer >= MISSILE_CAP_INCREASE_INTERVAL) {
      missileCapTimer = 0;
      missileCap = Math.min(MISSILE_CAP_MAX, missileCap + 1);
    }
    missileSpawnTimer -= dt;
    if (missileSpawnTimer <= 0) {
      trySpawnMissile(Game.elapsed);
      missileSpawnTimer = rand(1.2, 2.4);
    }
  }

  const missileTimeScale = jet.slowmoTimer > 0 ? SLOWMO_FACTOR : 1;
  const spdMult = missileSpeedMult(Game.elapsed);

  for (const m of missilePool.active.slice()) {
    m.age += dt;
    if (m.age >= m.lifetime) {
      spawnSmokePuff(m.x, m.y);
      missilePool.release(m);
      continue;
    }
    const desired = Math.atan2(jet.y - m.y, jet.x - m.x);
    const diff = angleDiff(m.heading, desired);
    const maxTurn = MISSILE_TURN_RATE * dt * missileTimeScale;
    m.heading += clamp(diff, -maxTurn, maxTurn);
    const mSpeed = JET_SPEED * spdMult * missileTimeScale;
    m.x += Math.cos(m.heading) * mSpeed * dt;
    m.y += Math.sin(m.heading) * mSpeed * dt;

    m.trail.push({ x: m.x, y: m.y, t: 0 });
    if (m.trail.length > 80) m.trail.shift();
  }
  for (const m of missilePool.active) {
    for (const pt of m.trail) pt.t += dt;
    while (m.trail.length && m.trail[0].t > 2.5) m.trail.shift();
  }

  // Missile vs jet
  if (playing) {
    if (jet.shieldTimer <= 0) {
      for (const m of missilePool.active) {
        if (dist(m.x, m.y, jet.x, jet.y) < JET_RADIUS + MISSILE_RADIUS) {
          endRun('missile');
          break;
        }
      }
    } else {
      for (const m of missilePool.active.slice()) {
        if (dist(m.x, m.y, jet.x, jet.y) < JET_RADIUS + MISSILE_RADIUS) {
          jet.shieldTimer = 0;
          destroyMissile(m, true);
          spawnShockwave(jet.x, jet.y);
          break;
        }
      }
    }
  }

  // Close calls
  if (playing) {
    for (const m of missilePool.active) {
      const d = dist(m.x, m.y, jet.x, jet.y);
      if (d < CLOSE_CALL_DIST && m.closeCallArmed) {
        m.closeCallArmed = false;
        Game.closeCalls++;
        addScore(SCORE_CLOSE_CALL, 'Close call +5', jet.x, jet.y - 30, COLORS.white);
        Audio_.closeCall();
      } else if (d > CLOSE_CALL_RESET_DIST) {
        m.closeCallArmed = true;
      }
    }
  }

  // Missile vs missile -- snapshot the list so releasing (splicing the real
  // pool array) mid-scan can't shift indices out from under this loop.
  const snapshot = missilePool.active.slice();
  for (let i = 0; i < snapshot.length; i++) {
    const a = snapshot[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < snapshot.length; j++) {
      const b = snapshot[j];
      if (!b.alive) continue;
      if (dist(a.x, a.y, b.x, b.y) < MISSILE_RADIUS * 2) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        a.alive = false; b.alive = false;
        spawnSmokePuff(mx, my);
        spawnBurst(mx, my, COLORS.orange, 14, 50, 160, 0.5);
        missilePool.release(a);
        missilePool.release(b);
        Audio_.boom();
        if (playing) {
          Game.missilesDown += 2;
          addScore(SCORE_MISSILE_DOWN * 2, 'Missile down +15', mx, my - 20, COLORS.white);
        }
        break;
      }
    }
  }

  // Interceptors (Flares power-up) -- home in on their assigned missile,
  // trailing fire, and blow it up on contact; fizzle if they never catch it
  // or their target was already destroyed some other way. Like enemy
  // missiles, they keep flying for a moment after death; only scoring stops.
  for (const p of interceptorPool.active.slice()) {
    p.age += dt;
    particlePool.spawn(
      p.x, p.y, rand(-15, 15), rand(-15, 15), 0.25, rand(2, 4),
      Math.random() < 0.5 ? '#FFE47A' : COLORS.orange, 'dot'
    );
    const target = p.targetId != null ? missilePool.active.find((m) => m.id === p.targetId) : null;
    if (target) {
      const desired = Math.atan2(target.y - p.y, target.x - p.x);
      const diff = angleDiff(p.heading, desired);
      p.heading += clamp(diff, -INTERCEPTOR_TURN_RATE * dt, INTERCEPTOR_TURN_RATE * dt);
    }
    p.x += Math.cos(p.heading) * INTERCEPTOR_SPEED * dt;
    p.y += Math.sin(p.heading) * INTERCEPTOR_SPEED * dt;

    if (target && dist(p.x, p.y, target.x, target.y) < INTERCEPTOR_RADIUS + MISSILE_RADIUS) {
      interceptorPool.release(p);
      destroyMissile(target, playing);
    } else if (p.age >= INTERCEPTOR_LIFETIME) {
      spawnSmokePuff(p.x, p.y);
      interceptorPool.release(p);
    }
  }

  // Bullets (currency)
  if (playing) {
    for (const s of bulletPool.active.slice()) {
      if (dist(s.x, s.y, jet.x, jet.y) < JET_RADIUS + BULLET_RADIUS) {
        bulletPool.release(s);
        Game.bulletsCollected++;
        save.bullets++;
        addScore(SCORE_BULLET, '+10', s.x, s.y - 20, COLORS.white);
        spawnBurst(s.x, s.y, COLORS.gemCrown, 12, 40, 120, 0.5);
        Audio_.bulletPickup();
      } else if (dist(s.x, s.y, jet.x, jet.y) > BULLET_DESPAWN_DIST) {
        bulletPool.release(s);
      }
    }
    ensureBullets();
  }

  // Fuel cans
  if (playing) {
    for (const c of fuelCanPool.active.slice()) {
      if (dist(c.x, c.y, jet.x, jet.y) < JET_RADIUS + FUEL_CAN_RADIUS) {
        fuelCanPool.release(c);
        jet.fuel = Math.min(FUEL_MAX, jet.fuel + FUEL_CAN_REFILL);
        jet.fuelWarned = jet.fuel / FUEL_MAX < FUEL_LOW_THRESHOLD;
        spawnFloatingText(c.x, c.y - 20, '+Fuel', COLORS.fuelFull);
        spawnBurst(c.x, c.y, COLORS.fuelFull, 12, 40, 120, 0.5);
        Audio_.refuel();
      } else if (dist(c.x, c.y, jet.x, jet.y) > FUEL_CAN_DESPAWN_DIST) {
        fuelCanPool.release(c);
      }
    }
    ensureFuelCans();
  }

  updateParticlesOnly(dt);
}

function updateParticlesOnly(dt) {
  for (const p of particlePool.active.slice()) {
    p.life -= dt;
    if (p.life <= 0) { particlePool.release(p); continue; }
    if (p.kind === 'dot' || p.kind === 'smoke') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - Math.min(1, dt * 2));
      p.vy *= (1 - Math.min(1, dt * 2));
    } else if (p.kind === 'text') {
      p.y += p.vy * dt;
    } else if (p.kind === 'ring') {
      p.size += dt * 240;
    }
  }
  if (Game.state === 'gameover') {
    Game.hudAlpha = Math.max(0, Game.hudAlpha - dt / 0.6);
  }
}

/* ------------------------------ 16. RENDER ------------------------------------ */

function worldToScreen(x, y) {
  return { sx: (x - camera.x) + LOGICAL_W / 2, sy: (y - camera.y) + LOGICAL_H / 2 };
}

// Night background: a deterministic pseudo-random field generated on demand
// per cell, reused for both the twinkling starfield and the planet layers.
function bgHash(cx, cy, seed) {
  let h = cx * 374761393 + cy * 668265263 + seed * 69069;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}

function drawSkyGradient() {
  const g = ctx2d.createLinearGradient(0, 0, 0, LOGICAL_H);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(1, COLORS.skyBottom);
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

function drawStarfieldLayer(parallax, cellSize, density, seedOffset) {
  const px = camera.x * parallax;
  const py = camera.y * parallax;
  const startCol = Math.floor((px - LOGICAL_W) / cellSize);
  const endCol = Math.floor((px + LOGICAL_W) / cellSize);
  const startRow = Math.floor((py - LOGICAL_H) / cellSize);
  const endRow = Math.floor((py + LOGICAL_H) / cellSize);
  const now = performance.now();
  for (let cx = startCol; cx <= endCol; cx++) {
    for (let cy = startRow; cy <= endRow; cy++) {
      if (bgHash(cx, cy, seedOffset) > density) continue;
      const jx = bgHash(cx, cy, seedOffset + 1) * cellSize;
      const jy = bgHash(cx, cy, seedOffset + 2) * cellSize;
      const sx = cx * cellSize + jx - px + LOGICAL_W / 2;
      const sy = cy * cellSize + jy - py + LOGICAL_H / 2;
      const size = 0.8 + bgHash(cx, cy, seedOffset + 3) * 1.4;
      const phase = bgHash(cx, cy, seedOffset + 4) * Math.PI * 2;
      const twinkle = 0.5 + 0.5 * Math.sin(now / 900 + phase);
      ctx2d.globalAlpha = 0.35 + twinkle * 0.65;
      ctx2d.fillStyle = COLORS.starTwinkle;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, size, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }
  ctx2d.globalAlpha = 1;
}

function drawPlanetLayer(parallax, cellSize, baseSize, density, seedOffset) {
  const px = camera.x * parallax;
  const py = camera.y * parallax;
  const startCol = Math.floor((px - LOGICAL_W) / cellSize);
  const endCol = Math.floor((px + LOGICAL_W) / cellSize);
  const startRow = Math.floor((py - LOGICAL_H) / cellSize);
  const endRow = Math.floor((py + LOGICAL_H) / cellSize);
  for (let cx = startCol; cx <= endCol; cx++) {
    for (let cy = startRow; cy <= endRow; cy++) {
      if (bgHash(cx, cy, seedOffset) > density) continue;
      const jx = bgHash(cx, cy, seedOffset + 1) * cellSize;
      const jy = bgHash(cx, cy, seedOffset + 2) * cellSize;
      const sx = cx * cellSize + jx - px + LOGICAL_W / 2;
      const sy = cy * cellSize + jy - py + LOGICAL_H / 2;
      const size = baseSize * (0.6 + bgHash(cx, cy, seedOffset + 3) * 0.8);
      const paletteIdx = Math.floor(bgHash(cx, cy, seedOffset + 4) * PLANET_PALETTES.length);
      drawPlanet(sx, sy, size, PLANET_PALETTES[paletteIdx % PLANET_PALETTES.length]);
    }
  }
}
function drawPlanet(x, y, size, palette) {
  const [body, ring] = palette;
  ctx2d.save();
  ctx2d.translate(x, y);
  if (ring) {
    ctx2d.save();
    ctx2d.rotate(-0.35);
    ctx2d.strokeStyle = ring;
    ctx2d.lineWidth = size * 0.16;
    ctx2d.globalAlpha = 0.8;
    ctx2d.beginPath();
    ctx2d.ellipse(0, 0, size * 1.7, size * 0.55, 0, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.restore();
  }
  ctx2d.beginPath();
  ctx2d.arc(0, 0, size, 0, Math.PI * 2);
  ctx2d.fillStyle = body;
  ctx2d.fill();
  ctx2d.save();
  ctx2d.clip();
  // subtle terminator shading for a bit of depth, clipped to the disc
  ctx2d.fillStyle = 'rgba(0,0,0,0.18)';
  ctx2d.beginPath();
  ctx2d.arc(size * 0.35, size * 0.3, size * 0.9, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
  ctx2d.restore();
}

function drawJet() {
  const { sx, sy } = worldToScreen(jet.x, jet.y);
  const squash = 1 - Math.abs(jet.bank) * 0.18;

  ctx2d.save();
  ctx2d.translate(sx + 10, sy + 14);
  ctx2d.rotate(jet.heading + Math.PI / 2);
  ctx2d.scale(squash, 1);
  drawJetShape(COLORS.jetShadow);
  ctx2d.restore();

  if (jet.shieldTimer > 0) {
    ctx2d.save();
    ctx2d.globalAlpha = 0.5 + 0.2 * Math.sin(performance.now() / 120);
    ctx2d.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx2d.fillStyle = 'rgba(255,255,255,0.15)';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, JET_RADIUS + 10, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.restore();
  }

  ctx2d.save();
  ctx2d.translate(sx, sy);
  ctx2d.rotate(jet.heading + Math.PI / 2);
  ctx2d.scale(squash, 1);
  // engine glow
  ctx2d.fillStyle = jet.boostTimer > 0 ? '#FFB84D' : '#F2A93B';
  ctx2d.beginPath();
  ctx2d.arc(0, 18, jet.boostTimer > 0 ? 6 : 4, 0, Math.PI * 2);
  ctx2d.fill();

  drawJetShape(COLORS.jetBody);

  // camo blotches + canopy + a light rim, clipped to the jet's own silhouette
  ctx2d.save();
  jetShapePath();
  ctx2d.clip();
  ctx2d.fillStyle = COLORS.jetCamoDark;
  ctx2d.beginPath(); ctx2d.ellipse(-5, -6, 5, 4, 0.4, 0, Math.PI * 2); ctx2d.fill();
  ctx2d.beginPath(); ctx2d.ellipse(6, 4, 6, 4.5, -0.3, 0, Math.PI * 2); ctx2d.fill();
  ctx2d.beginPath(); ctx2d.ellipse(-4, 14, 4.5, 6, 0.2, 0, Math.PI * 2); ctx2d.fill();
  ctx2d.fillStyle = COLORS.jetCamoMid;
  ctx2d.beginPath(); ctx2d.ellipse(3, -12, 4, 5, -0.2, 0, Math.PI * 2); ctx2d.fill();
  ctx2d.beginPath(); ctx2d.ellipse(-8, 6, 4, 3, 0.5, 0, Math.PI * 2); ctx2d.fill();

  // canopy: dark segmented cockpit glass
  ctx2d.fillStyle = COLORS.jetCockpit;
  roundRect(-2.4, -16, 4.8, 11, 2.2);
  ctx2d.fill();
  ctx2d.strokeStyle = 'rgba(180,195,205,0.5)';
  ctx2d.lineWidth = 0.6;
  ctx2d.beginPath();
  ctx2d.moveTo(-2.4, -13); ctx2d.lineTo(2.4, -13);
  ctx2d.moveTo(-2.4, -10); ctx2d.lineTo(2.4, -10);
  ctx2d.moveTo(-2.4, -7); ctx2d.lineTo(2.4, -7);
  ctx2d.stroke();
  ctx2d.restore();

  // thin rim light around the silhouette so it still reads against a dark sky
  ctx2d.save();
  jetShapePath();
  ctx2d.strokeStyle = COLORS.jetRim;
  ctx2d.lineWidth = 1;
  ctx2d.stroke();
  ctx2d.restore();

  ctx2d.restore();

  if (Game.debug) {
    ctx2d.strokeStyle = 'lime';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, JET_RADIUS, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// The jet's silhouette path -- a sleeker, longer-nosed body with swept
// wings and a forked twin tail. Shared by the fill, the camo/rim clip, and
// the boost power-up icon (which just calls drawJetShape at a small scale).
function jetShapePath() {
  ctx2d.beginPath();
  ctx2d.moveTo(0, -19);
  ctx2d.lineTo(3, -9);
  ctx2d.lineTo(5, -2);
  ctx2d.lineTo(17, 5);
  ctx2d.lineTo(17, 9);
  ctx2d.lineTo(5, 5);
  ctx2d.lineTo(4, 11);
  ctx2d.lineTo(9, 20);
  ctx2d.lineTo(2, 15);
  ctx2d.lineTo(0, 13);
  ctx2d.lineTo(-2, 15);
  ctx2d.lineTo(-9, 20);
  ctx2d.lineTo(-4, 11);
  ctx2d.lineTo(-5, 5);
  ctx2d.lineTo(-17, 9);
  ctx2d.lineTo(-17, 5);
  ctx2d.lineTo(-5, -2);
  ctx2d.closePath();
}
function drawJetShape(color) {
  ctx2d.fillStyle = color;
  jetShapePath();
  ctx2d.fill();
}

function drawMissile(m) {
  if (m.trail.length > 1) {
    ctx2d.save();
    ctx2d.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([8, 7]);
    ctx2d.beginPath();
    for (let i = 0; i < m.trail.length; i++) {
      const pt = m.trail[i];
      const alpha = 1 - pt.t / 2.5;
      const { sx, sy } = worldToScreen(pt.x, pt.y);
      if (i === 0) ctx2d.moveTo(sx, sy); else ctx2d.lineTo(sx, sy);
    }
    ctx2d.globalAlpha = 0.7;
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.restore();
  }
  const { sx, sy } = worldToScreen(m.x, m.y);
  ctx2d.save();
  ctx2d.translate(sx, sy);
  ctx2d.rotate(m.heading + Math.PI / 2);
  ctx2d.fillStyle = COLORS.missileBody;
  ctx2d.beginPath();
  ctx2d.moveTo(0, -7);
  ctx2d.lineTo(2.5, 3);
  ctx2d.lineTo(4, 6);
  ctx2d.lineTo(-4, 6);
  ctx2d.lineTo(-2.5, 3);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'red';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, MISSILE_RADIUS, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// A small fiery interceptor missile -- its flame trail is drawn via the
// particles it emits each frame, not a separate line here.
function drawInterceptor(p) {
  const { sx, sy } = worldToScreen(p.x, p.y);
  ctx2d.save();
  ctx2d.translate(sx, sy);
  ctx2d.rotate(p.heading + Math.PI / 2);
  ctx2d.fillStyle = '#FFD54A';
  ctx2d.beginPath();
  ctx2d.moveTo(0, -8);
  ctx2d.lineTo(3, 4);
  ctx2d.lineTo(0, 2);
  ctx2d.lineTo(-3, 4);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.fillStyle = COLORS.orange;
  ctx2d.beginPath();
  ctx2d.arc(0, 5, 2.5, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'yellow';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, INTERCEPTOR_RADIUS, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// A faceted blue diamond/gem icon, used both for the world pickup and
// shrunk down for HUD badges/wallet.
function drawBulletIcon(cx, cy, size) {
  const w = size * 1.05;      // half-width at the widest point (the girdle)
  const crownH = size * 0.5;  // height of the top (crown)
  const pavilionH = size * 1.15; // height of the bottom point
  const topW = w * 0.55;      // half-width of the flat top table facet

  ctx2d.save();
  ctx2d.translate(cx, cy);

  const top = -crownH, girdle = 0, tip = pavilionH;
  const tlx = -topW, trx = topW, glx = -w, grx = w;

  // crown (upper faceted band)
  ctx2d.fillStyle = COLORS.gemCrown;
  ctx2d.beginPath();
  ctx2d.moveTo(tlx, top);
  ctx2d.lineTo(trx, top);
  ctx2d.lineTo(grx, girdle);
  ctx2d.lineTo(glx, girdle);
  ctx2d.closePath();
  ctx2d.fill();

  // pavilion (lower point)
  ctx2d.fillStyle = COLORS.gemPavilion;
  ctx2d.beginPath();
  ctx2d.moveTo(glx, girdle);
  ctx2d.lineTo(grx, girdle);
  ctx2d.lineTo(0, tip);
  ctx2d.closePath();
  ctx2d.fill();

  // flat table facet on top, brighter
  ctx2d.fillStyle = COLORS.gemTable;
  ctx2d.beginPath();
  ctx2d.moveTo(tlx, top);
  ctx2d.lineTo(trx, top);
  ctx2d.lineTo(trx * 0.55, top + crownH * 0.4);
  ctx2d.lineTo(tlx * 0.55, top + crownH * 0.4);
  ctx2d.closePath();
  ctx2d.fill();

  // glossy highlight facet, upper-right
  ctx2d.fillStyle = 'rgba(255,255,255,0.8)';
  ctx2d.beginPath();
  ctx2d.moveTo(trx, top);
  ctx2d.lineTo(grx, girdle);
  ctx2d.lineTo(trx * 0.55, top + crownH * 0.4);
  ctx2d.closePath();
  ctx2d.fill();

  // faint center facet line down the pavilion
  ctx2d.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx2d.lineWidth = Math.max(1, size * 0.05);
  ctx2d.beginPath();
  ctx2d.moveTo(0, girdle);
  ctx2d.lineTo(0, tip);
  ctx2d.stroke();

  ctx2d.restore();
}

function drawBullet(s) {
  const { sx, sy } = worldToScreen(s.x, s.y);
  const bob = Math.sin(performance.now() / 300 + s.bob) * 2;
  const pulse = 1 + Math.sin(performance.now() / 260 + s.bob) * 0.06;
  ctx2d.save();
  ctx2d.translate(sx, sy + bob);
  ctx2d.scale(pulse, pulse);
  ctx2d.fillStyle = 'rgba(255,255,255,0.18)';
  ctx2d.beginPath();
  ctx2d.arc(0, 0, BULLET_RADIUS, 0, Math.PI * 2);
  ctx2d.fill();
  drawBulletIcon(0, 0, BULLET_RADIUS * 0.85);
  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'cyan';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy + bob, BULLET_RADIUS, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// A red jerry-can shape (like a gas-can icon) for the fuel pickups
// scattered in the world: body + a darker side-shading panel with an
// embossed cross, a handle notch, and an angled yellow spout.
function drawFuelCan(c) {
  const { sx, sy } = worldToScreen(c.x, c.y);
  const bob = Math.sin(performance.now() / 320 + c.bob) * 2;
  const pulse = 1 + Math.sin(performance.now() / 260 + c.bob) * 0.05;
  const size = FUEL_CAN_RADIUS;
  ctx2d.save();
  ctx2d.translate(sx, sy + bob);
  ctx2d.scale(pulse, pulse);

  ctx2d.fillStyle = 'rgba(255,255,255,0.16)';
  ctx2d.beginPath();
  ctx2d.arc(0, 0, size, 0, Math.PI * 2);
  ctx2d.fill();

  const bw = size * 1.2, bh = size * 1.5;
  const bx = -bw / 2, by = -bh / 2 + size * 0.12;

  // body
  ctx2d.fillStyle = COLORS.fuelCanBody;
  roundRect(bx, by, bw, bh, bw * 0.16);
  ctx2d.fill();

  // darker side panel (right edge) for a hint of 3D
  ctx2d.save();
  roundRect(bx, by, bw, bh, bw * 0.16);
  ctx2d.clip();
  ctx2d.fillStyle = COLORS.fuelCanShade;
  ctx2d.beginPath();
  ctx2d.moveTo(bx + bw * 0.7, by);
  ctx2d.lineTo(bx + bw, by);
  ctx2d.lineTo(bx + bw, by + bh);
  ctx2d.lineTo(bx + bw * 0.7, by + bh);
  ctx2d.closePath();
  ctx2d.fill();
  // embossed cross lines on the front panel
  ctx2d.strokeStyle = COLORS.fuelCanShade;
  ctx2d.lineWidth = Math.max(1, size * 0.07);
  ctx2d.beginPath();
  ctx2d.moveTo(bx + bw * 0.35, by + bh * 0.2);
  ctx2d.lineTo(bx + bw * 0.35, by + bh * 0.85);
  ctx2d.moveTo(bx + bw * 0.12, by + bh * 0.52);
  ctx2d.lineTo(bx + bw * 0.6, by + bh * 0.52);
  ctx2d.stroke();
  ctx2d.restore();

  // handle notch (top-right corner cutout)
  ctx2d.fillStyle = 'rgba(255,255,255,0.5)';
  ctx2d.beginPath();
  ctx2d.moveTo(bx + bw * 0.42, by);
  ctx2d.lineTo(bx + bw * 0.8, by);
  ctx2d.lineTo(bx + bw * 0.62, by + bh * 0.16);
  ctx2d.closePath();
  ctx2d.fill();

  // angled yellow spout, top-left
  ctx2d.save();
  ctx2d.translate(bx + bw * 0.16, by + size * 0.02);
  ctx2d.rotate(-0.6);
  ctx2d.fillStyle = COLORS.fuelCanCap;
  roundRect(-size * 0.11, -size * 0.55, size * 0.22, size * 0.5, size * 0.08);
  ctx2d.fill();
  ctx2d.restore();
  ctx2d.fillStyle = COLORS.fuelCanCap;
  roundRect(bx + bw * 0.02, by - size * 0.28, size * 0.24, size * 0.24, size * 0.06);
  ctx2d.fill();

  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'orange';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy + bob, size, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

function drawParticles() {
  for (const p of particlePool.active) {
    const { sx, sy } = worldToScreen(p.x, p.y);
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx2d.save();
    ctx2d.globalAlpha = alpha;
    if (p.kind === 'dot') {
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx2d.fill();
    } else if (p.kind === 'smoke') {
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, p.size * (1 + (1 - alpha) * 1.5), 0, Math.PI * 2);
      ctx2d.fill();
    } else if (p.kind === 'ring') {
      ctx2d.strokeStyle = p.color;
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx2d.stroke();
    } else if (p.kind === 'text') {
      ctx2d.globalAlpha = alpha;
      ctx2d.fillStyle = p.color;
      ctx2d.font = 'bold 16px "Skyline Rounded", sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.shadowColor = 'rgba(18,48,58,0.5)';
      ctx2d.shadowBlur = 4;
      ctx2d.fillText(p.text, sx, sy);
    }
    ctx2d.restore();
  }
}

/* ---- HUD / Radar / Buttons ---- */

const hudButtons = [
  { id: 'pause', x: LOGICAL_W - 30 - 76, y: 40, r: 20 },
  { id: 'music', x: LOGICAL_W - 30 - 38, y: 40, r: 20 },
  { id: 'sound', x: LOGICAL_W - 30, y: 40, r: 20 },
];

const powerupButtons = (() => {
  const ids = ['boost', 'flares', 'shield', 'slowmo', 'emp'];
  const spacing = 68;
  const totalW = spacing * (ids.length - 1);
  const startX = LOGICAL_W / 2 - totalW / 2;
  const y = LOGICAL_H - 66;
  return ids.map((id, i) => ({ id, x: startX + i * spacing, y, r: 26 }));
})();

function handleButtonPress(id) {
  Audio_.unlock();
  if (id === 'pause') { Audio_.click(); togglePause(); return; }
  if (id === 'music') { Audio_.click(); Audio_.setMusicOn(!save.musicOn); Platform.saveData(save); return; }
  if (id === 'sound') { Audio_.click(); Audio_.setSoundOn(!save.soundOn); Platform.saveData(save); return; }
  if (POWERUPS[id]) { activatePowerup(id); return; }
}

function handleNonPlayingTap() {
  if (Game.state === 'boot' || Game.state === 'hint') {
    startRun();
    Game.state = 'playing';
  } else if (Game.state === 'gameover') {
    // handled by explicit "Play again" button hit test below
  } else if (Game.state === 'paused') {
    // resume button handled separately
  }
}

function togglePause() {
  if (Game.state === 'playing') {
    Game.state = 'paused';
    Game.pauseSource = 'user';
  } else if (Game.state === 'paused' && Game.pauseSource === 'user') {
    Game.state = 'playing';
    Game.pauseSource = null;
  }
}

Platform.onSystemPause(() => {
  if (Game.state === 'playing') {
    Game.state = 'paused';
    Game.pauseSource = 'system';
  }
});
Platform.onSystemResume(() => {
  // Wait for explicit tap-to-continue; system pause does not auto-resume.
});

function drawUprightText(text, x, y, size, color, align, bold) {
  ctx2d.save();
  ctx2d.font = `${bold ? 'bold ' : ''}${size}px "Skyline Rounded", "Arial Rounded MT Bold", sans-serif`;
  ctx2d.fillStyle = color;
  ctx2d.textAlign = align || 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(text, x, y);
  ctx2d.restore();
}

function drawShadowedText(text, x, y, size, color, shadowColor, shadowOffset, align) {
  ctx2d.save();
  ctx2d.font = `bold ${size}px "Skyline Rounded", "Arial Rounded MT Bold", sans-serif`;
  ctx2d.textAlign = align || 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillStyle = shadowColor;
  ctx2d.fillText(text, x + shadowOffset, y + shadowOffset);
  ctx2d.fillStyle = color;
  ctx2d.fillText(text, x, y);
  ctx2d.restore();
}

function drawCircleButton(x, y, r, affordableOrOn, iconDraw) {
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(x, y + 3, r, 0, Math.PI * 2);
  ctx2d.fillStyle = 'rgba(18,48,58,0.25)';
  ctx2d.fill();
  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.fillStyle = affordableOrOn === false ? 'rgba(226,240,241,0.55)' : COLORS.white;
  ctx2d.fill();
  ctx2d.restore();
  iconDraw(x, y, affordableOrOn);
}

// Round wooden button (carved-disc look: radial shading + faint grain
// streaks) used for the top-right Pause/Music/Sound controls.
function drawWoodButton(x, y, r, iconDraw) {
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(x, y + 3, r, 0, Math.PI * 2);
  ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
  ctx2d.fill();

  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  const grad = ctx2d.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.15, x, y, r * 1.05);
  grad.addColorStop(0, COLORS.woodLight);
  grad.addColorStop(0.55, COLORS.woodMid);
  grad.addColorStop(1, COLORS.woodDark);
  ctx2d.fillStyle = grad;
  ctx2d.fill();

  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.clip();
  ctx2d.strokeStyle = COLORS.woodGrain;
  ctx2d.lineWidth = 1.2;
  for (let i = -3; i <= 3; i++) {
    const gx = x + i * (r * 0.32);
    ctx2d.beginPath();
    ctx2d.moveTo(gx, y - r);
    ctx2d.quadraticCurveTo(gx + (i % 2 === 0 ? 3 : -3), y, gx, y + r);
    ctx2d.stroke();
  }
  ctx2d.restore();

  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx2d.lineWidth = 1.5;
  ctx2d.stroke();
  ctx2d.restore();

  iconDraw(x, y);
}

function drawRadar() {
  const cx = 20 + 47.5, cy = 20 + 47.5, r = 47.5;
  const left = cx - r, top = cy - r, size = r * 2, cornerR = 10;
  ctx2d.save();
  roundRect(left, top, size, size, cornerR);
  ctx2d.fillStyle = 'rgba(28,122,64,0.85)';
  ctx2d.fill();
  ctx2d.lineWidth = 2;
  ctx2d.strokeStyle = COLORS.white;
  ctx2d.stroke();

  ctx2d.save();
  roundRect(left, top, size, size, cornerR);
  ctx2d.clip();

  // sweep
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(Game.radarSweep);
  const grad = ctx2d.createLinearGradient(0, 0, r, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.moveTo(0, 0);
  ctx2d.arc(0, 0, r, -0.35, 0.35);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();

  // crosshair + ring
  ctx2d.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(cx - r, cy); ctx2d.lineTo(cx + r, cy);
  ctx2d.moveTo(cx, cy - r); ctx2d.lineTo(cx, cy + r);
  ctx2d.stroke();
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx2d.stroke();

  const RADAR_RANGE = 620;
  const scaleR = r / RADAR_RANGE;
  for (const s of bulletPool.active) {
    const dx = s.x - jet.x, dy = s.y - jet.y;
    if (Math.hypot(dx, dy) > RADAR_RANGE) continue;
    ctx2d.fillStyle = COLORS.gemCrown;
    ctx2d.beginPath();
    ctx2d.arc(cx + dx * scaleR, cy + dy * scaleR, 2.2, 0, Math.PI * 2);
    ctx2d.fill();
  }
  for (const c of fuelCanPool.active) {
    const dx = c.x - jet.x, dy = c.y - jet.y;
    if (Math.hypot(dx, dy) > RADAR_RANGE) continue;
    ctx2d.fillStyle = COLORS.fuelFull;
    ctx2d.beginPath();
    ctx2d.arc(cx + dx * scaleR, cy + dy * scaleR, 2.2, 0, Math.PI * 2);
    ctx2d.fill();
  }
  for (const m of missilePool.active) {
    const dx = m.x - jet.x, dy = m.y - jet.y;
    if (Math.hypot(dx, dy) > RADAR_RANGE) continue;
    ctx2d.fillStyle = '#E4453A';
    ctx2d.beginPath();
    ctx2d.arc(cx + dx * scaleR, cy + dy * scaleR, 2.6, 0, Math.PI * 2);
    ctx2d.fill();
  }

  // jet arrow (world-oriented, north up)
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(jet.heading + Math.PI / 2);
  ctx2d.fillStyle = COLORS.white;
  ctx2d.beginPath();
  ctx2d.moveTo(0, -7);
  ctx2d.lineTo(4, 5);
  ctx2d.lineTo(0, 2);
  ctx2d.lineTo(-4, 5);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();

  ctx2d.restore(); // clip
  ctx2d.restore();

  if (missilePool.active.length > 0) {
    const bx = cx + r * 0.72, by = cy + r * 0.72;
    ctx2d.fillStyle = '#E4453A';
    ctx2d.beginPath();
    ctx2d.arc(bx, by, 10, 0, Math.PI * 2);
    ctx2d.fill();
    drawUprightText(String(missilePool.active.length), bx, by + 1, 12, COLORS.white, 'center', true);
  }
}

// Horizontal fuel gauge -- a "liquid" bar so the remaining fuel reads at a
// glance, turning red and pulsing once it runs low.
function drawFuelGauge(cx, cy, w, h) {
  const pct = clamp(jet.fuel / FUEL_MAX, 0, 1);
  const low = pct < FUEL_LOW_THRESHOLD;
  const x = cx - w / 2, y = cy - h / 2;
  ctx2d.save();
  if (low) ctx2d.globalAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 150);

  ctx2d.fillStyle = 'rgba(5,11,31,0.55)';
  roundRect(x, y, w, h, h / 2);
  ctx2d.fill();
  ctx2d.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx2d.lineWidth = 1.5;
  roundRect(x, y, w, h, h / 2);
  ctx2d.stroke();

  const inset = 2.5;
  const innerW = w - inset * 2, innerH = h - inset * 2;
  ctx2d.save();
  roundRect(x + inset, y + inset, innerW, innerH, innerH / 2);
  ctx2d.clip();
  const fillW = Math.max(innerH, innerW * pct);
  const grad = ctx2d.createLinearGradient(x, y, x, y + h);
  if (low) {
    grad.addColorStop(0, COLORS.fuelLow);
    grad.addColorStop(1, COLORS.fuelLowDeep);
  } else {
    grad.addColorStop(0, COLORS.fuelFull);
    grad.addColorStop(1, COLORS.fuelFullDeep);
  }
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(x + inset, y + inset, pct <= 0.001 ? 0 : fillW, innerH);
  if (pct > 0.001) {
    ctx2d.fillStyle = 'rgba(255,255,255,0.28)';
    ctx2d.fillRect(x + inset, y + inset, fillW, innerH * 0.4);
  }
  ctx2d.restore();
  ctx2d.restore();

  // "FUEL" is drawn straight onto the liquid, so when the tank is bright
  // and full (light cyan) plain white text loses contrast -- give it a
  // dark shadow the same way other HUD text gets one.
  drawShadowedText('FUEL', cx, cy + 1, Math.round(h * 0.5), COLORS.white, 'rgba(5,11,31,0.6)', 1);
}

function drawHudButtons() {
  drawWoodButton(hudButtons[0].x, hudButtons[0].y, hudButtons[0].r, (x, y) => {
    ctx2d.fillStyle = COLORS.woodIcon;
    if (Game.state === 'playing') {
      // pause: two rounded bars
      roundRect(x - 6.5, y - 8, 4.5, 16, 2);
      ctx2d.fill();
      roundRect(x + 2, y - 8, 4.5, 16, 2);
      ctx2d.fill();
    } else {
      // play: a rounded triangle
      ctx2d.beginPath();
      ctx2d.moveTo(x - 5, y - 8);
      ctx2d.lineTo(x - 5, y + 8);
      ctx2d.lineTo(x + 7, y);
      ctx2d.closePath();
      ctx2d.fill();
    }
  });
  drawWoodButton(hudButtons[1].x, hudButtons[1].y, hudButtons[1].r, (x, y) => {
    ctx2d.fillStyle = save.musicOn ? COLORS.woodIcon : 'rgba(247,233,203,0.4)';
    drawUprightText('♪', x, y + 1, 18, ctx2d.fillStyle, 'center', true);
  });
  drawWoodButton(hudButtons[2].x, hudButtons[2].y, hudButtons[2].r, (x, y) => {
    // speaker: a rounded pennant-like silhouette
    ctx2d.fillStyle = save.soundOn ? COLORS.woodIcon : 'rgba(247,233,203,0.4)';
    ctx2d.beginPath();
    ctx2d.moveTo(x - 7, y - 3); ctx2d.lineTo(x - 3, y - 3); ctx2d.lineTo(x + 3, y - 8);
    ctx2d.lineTo(x + 3, y + 8); ctx2d.lineTo(x - 3, y + 3); ctx2d.lineTo(x - 7, y + 3);
    ctx2d.closePath(); ctx2d.fill();
    if (save.soundOn) {
      ctx2d.strokeStyle = COLORS.woodIcon;
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.arc(x + 6, y, 5, -0.6, 0.6);
      ctx2d.stroke();
    }
  });

  // wallet pill (below the three buttons, right aligned)
  const pillW = 64, pillH = 26;
  const px = LOGICAL_W - 30 - pillW / 2, py = 40 + 34;
  draw3DPill(px, py, pillW, pillH);
  drawBulletIcon(px - pillW / 2 + 16, py, 15);
  drawUprightText(String(save.bullets), px + 8, py + 1, 14, COLORS.white, 'center', true);
}

function roundRect(x, y, w, h, r) {
  ctx2d.beginPath();
  ctx2d.moveTo(x + r, y);
  ctx2d.arcTo(x + w, y, x + w, y + h, r);
  ctx2d.arcTo(x + w, y + h, x, y + h, r);
  ctx2d.arcTo(x, y + h, x, y, r);
  ctx2d.arcTo(x, y, x + w, y, r);
  ctx2d.closePath();
}

// A raised, glossy orange pill: dark bottom shadow + a light-to-base
// vertical gradient fill, so orange UI elements read as pressable 3D
// buttons rather than flat rectangles.
function draw3DPill(cx, cy, w, h) {
  ctx2d.save();
  ctx2d.fillStyle = COLORS.orangeShadow;
  roundRect(cx - w / 2, cy - h / 2 + 4, w, h, h / 2);
  ctx2d.fill();
  const grad = ctx2d.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  grad.addColorStop(0, COLORS.orangeLight);
  grad.addColorStop(1, COLORS.orange);
  ctx2d.fillStyle = grad;
  roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx2d.fill();
  ctx2d.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy - h / 2 + h * 0.32, w / 2 - 3, Math.PI * 1.15, Math.PI * 1.85);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawPowerupIcon(id, x, y, affordable) {
  if (id === 'boost') {
    // A tiny red-and-yellow jet streaking diagonally with a flame trail.
    ctx2d.save();
    ctx2d.translate(x - 2, y + 2);
    ctx2d.rotate(-Math.PI / 4);
    ctx2d.scale(0.46, 0.46);
    const flameColor = affordable ? '#FFD54A' : COLORS.grey;
    ctx2d.fillStyle = flameColor;
    ctx2d.beginPath();
    ctx2d.moveTo(-4, 16);
    ctx2d.lineTo(4, 16);
    ctx2d.lineTo(1.5, 30);
    ctx2d.lineTo(-1.5, 26);
    ctx2d.closePath();
    ctx2d.fill();
    drawJetShape(affordable ? '#E8362B' : COLORS.grey);
    ctx2d.fillStyle = flameColor;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -17);
    ctx2d.lineTo(2, -3);
    ctx2d.lineTo(-2, -3);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  } else if (id === 'flares') {
    // A small missile: grey body, green center band, red nose + fins.
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.rotate(-Math.PI / 4);
    const bodyC = affordable ? '#D9D9D9' : COLORS.grey;
    const bandC = affordable ? '#4C7A3D' : COLORS.grey;
    const finC = affordable ? '#E8362B' : COLORS.grey;
    ctx2d.fillStyle = bodyC;
    roundRect(-3, -9, 6, 18, 2.5);
    ctx2d.fill();
    ctx2d.fillStyle = bandC;
    ctx2d.fillRect(-3, -1.5, 6, 3.5);
    ctx2d.fillStyle = finC;
    ctx2d.beginPath();
    ctx2d.moveTo(-3, -9); ctx2d.lineTo(3, -9); ctx2d.lineTo(0, -13);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.moveTo(-3, 4); ctx2d.lineTo(-8, 9); ctx2d.lineTo(-3, 9);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.moveTo(3, 4); ctx2d.lineTo(8, 9); ctx2d.lineTo(3, 9);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.restore();
  } else if (id === 'shield') {
    // Two-tone blue shield with a small white top-down plane silhouette.
    const darkBlue = affordable ? '#1450C4' : COLORS.grey;
    const lightBlue = affordable ? '#2F72E0' : COLORS.grey;
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.moveTo(x, y - 10);
    ctx2d.quadraticCurveTo(x + 9, y - 7, x + 9, y - 1);
    ctx2d.quadraticCurveTo(x + 9, y + 8, x, y + 11);
    ctx2d.quadraticCurveTo(x - 9, y + 8, x - 9, y - 1);
    ctx2d.quadraticCurveTo(x - 9, y - 7, x, y - 10);
    ctx2d.closePath();
    ctx2d.save();
    ctx2d.clip();
    ctx2d.fillStyle = darkBlue;
    ctx2d.fillRect(x - 10, y - 12, 10, 24);
    ctx2d.fillStyle = lightBlue;
    ctx2d.fillRect(x, y - 12, 10, 24);
    ctx2d.restore();

    ctx2d.fillStyle = affordable ? COLORS.white : 'rgba(255,255,255,0.6)';
    ctx2d.beginPath();
    ctx2d.moveTo(x, y - 8);
    ctx2d.lineTo(x + 1.2, y - 2);
    ctx2d.lineTo(x + 7, y + 1);
    ctx2d.lineTo(x + 7, y + 2.3);
    ctx2d.lineTo(x + 1.3, y + 0.7);
    ctx2d.lineTo(x + 1, y + 5);
    ctx2d.lineTo(x + 3, y + 7.5);
    ctx2d.lineTo(x, y + 6.3);
    ctx2d.lineTo(x - 3, y + 7.5);
    ctx2d.lineTo(x - 1, y + 5);
    ctx2d.lineTo(x - 1.3, y + 0.7);
    ctx2d.lineTo(x - 7, y + 2.3);
    ctx2d.lineTo(x - 7, y + 1);
    ctx2d.lineTo(x - 1.2, y - 2);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  } else if (id === 'slowmo') {
    // A little snail: tan body + antennae, brown spiral shell.
    const bodyC = affordable ? '#B7A369' : COLORS.grey;
    const shellC = affordable ? '#B5651D' : COLORS.grey;
    ctx2d.save();
    ctx2d.fillStyle = bodyC;
    ctx2d.beginPath();
    ctx2d.ellipse(x - 1, y + 4, 9, 4, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = bodyC;
    ctx2d.lineWidth = 1.3;
    ctx2d.lineCap = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(x - 8, y + 1); ctx2d.lineTo(x - 11, y - 4);
    ctx2d.moveTo(x - 6, y + 1); ctx2d.lineTo(x - 8, y - 5);
    ctx2d.stroke();
    ctx2d.fillStyle = shellC;
    ctx2d.beginPath();
    ctx2d.arc(x + 3, y - 2, 7, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.arc(x + 3, y - 2, 3.3, 0, Math.PI * 1.5);
    ctx2d.stroke();
    ctx2d.restore();
  } else if (id === 'emp') {
    // A radio tower with a red beacon and blue signal waves.
    const towerC = affordable ? '#1F6FE0' : COLORS.grey;
    const beaconC = affordable ? '#E8362B' : COLORS.grey;
    ctx2d.save();
    ctx2d.strokeStyle = towerC;
    ctx2d.lineWidth = 1.4;
    ctx2d.beginPath();
    ctx2d.moveTo(x - 4, y + 9); ctx2d.lineTo(x - 1, y - 3);
    ctx2d.moveTo(x + 4, y + 9); ctx2d.lineTo(x + 1, y - 3);
    ctx2d.moveTo(x - 3, y + 5); ctx2d.lineTo(x + 3, y + 5);
    ctx2d.moveTo(x - 2, y + 9); ctx2d.lineTo(x + 2, y + 9);
    ctx2d.stroke();
    ctx2d.fillStyle = beaconC;
    ctx2d.beginPath();
    ctx2d.arc(x, y - 5, 2.2, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = towerC;
    ctx2d.lineWidth = 1.3;
    ctx2d.beginPath();
    ctx2d.arc(x, y - 5, 6, Math.PI * 1.18, Math.PI * 1.82);
    ctx2d.stroke();
    ctx2d.beginPath();
    ctx2d.arc(x, y - 5, 9, Math.PI * 1.22, Math.PI * 1.78);
    ctx2d.stroke();
    ctx2d.restore();
  }
}

function drawPowerupBar() {
  for (const b of powerupButtons) {
    const affordable = canAfford(b.id);
    drawCircleButton(b.x, b.y, b.r, affordable, () => drawPowerupIcon(b.id, b.x, b.y, affordable));
    if (deniedFlash[b.id] > 0) {
      ctx2d.save();
      ctx2d.globalAlpha = Math.min(1, deniedFlash[b.id] / 0.35) * 0.55;
      ctx2d.strokeStyle = '#E4453A';
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();
    }
    const badgeX = b.x + b.r * 0.68, badgeY = b.y - b.r * 0.68;
    ctx2d.fillStyle = affordable ? COLORS.orange : COLORS.grey;
    roundRect(badgeX - 15, badgeY - 8, 30, 16, 8);
    ctx2d.fill();
    drawBulletIcon(badgeX - 7, badgeY, 10);
    drawUprightText(String(POWERUPS[b.id].cost), badgeX + 5, badgeY + 1, 10, COLORS.white, 'center', true);
    drawUprightText(POWERUPS[b.id].label, b.x, b.y + b.r + 12, 10, COLORS.white, 'center', true);
  }
}

function drawChevrons() {
  if (Game.state !== 'playing') return;
  const y = LOGICAL_H * 0.6;
  const leftOn = Input.steerLeftPointers.size > 0 || Input.keyLeft;
  const rightOn = Input.steerRightPointers.size > 0 || Input.keyRight;
  ctx2d.save();
  ctx2d.strokeStyle = `rgba(255,255,255,${leftOn ? 0.75 : 0.4})`;
  ctx2d.lineWidth = 4;
  ctx2d.lineCap = 'round';
  ctx2d.beginPath();
  ctx2d.moveTo(26, y - 14); ctx2d.lineTo(14, y); ctx2d.lineTo(26, y + 14);
  ctx2d.stroke();
  ctx2d.strokeStyle = `rgba(255,255,255,${rightOn ? 0.75 : 0.4})`;
  ctx2d.beginPath();
  ctx2d.moveTo(LOGICAL_W - 26, y - 14); ctx2d.lineTo(LOGICAL_W - 14, y); ctx2d.lineTo(LOGICAL_W - 26, y + 14);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawStartHint() {
  if (Game.startHintAlpha <= 0) return;
  ctx2d.save();
  ctx2d.globalAlpha = Game.startHintAlpha;
  drawShadowedText('Tap left / right to steer', LOGICAL_W / 2, LOGICAL_H * 0.4, 18, COLORS.white, 'rgba(18,48,58,0.4)', 2);
  ctx2d.restore();
}

const PILL_FONT = 'bold 13px "Skyline Rounded", sans-serif';
const PILL_PAD = 14;
const PILL_ICON_W = 26; // wide enough for the diamond icon (~2x its size) without touching the text
const PILL_H = 30;

function pillWidth(text, hasIcon) {
  ctx2d.font = PILL_FONT;
  return ctx2d.measureText(text).width + PILL_PAD * 2 + (hasIcon ? PILL_ICON_W : 0);
}

function pillChip(text, x, y, iconDraw, w) {
  const h = PILL_H;
  draw3DPill(x, y, w, h);
  ctx2d.font = PILL_FONT;
  const textW = ctx2d.measureText(text).width;
  // Lay out left-to-right from the pill's own edge (using w directly) so
  // this always matches pillWidth()'s formula, even after a row-wide shrink.
  const contentLeft = x - w / 2 + PILL_PAD;
  const textLeft = iconDraw ? contentLeft + PILL_ICON_W : contentLeft;
  if (iconDraw) iconDraw(contentLeft + PILL_ICON_W / 2, y);
  const tx = textLeft + textW / 2;
  drawUprightText(text, tx, y + 1, 13, COLORS.white, 'center', true);
}

// Lays out a row of pill chips centered on cx, shrinking the gap (and, if
// still too wide, the font) so a row never runs past the screen edges.
function drawChipRow(chips, cx, y) {
  const gap = 10;
  let widths = chips.map((c) => pillWidth(c.text, !!c.icon));
  let totalW = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  const maxW = LOGICAL_W - 24;
  if (totalW > maxW) {
    const shrink = maxW / totalW;
    widths = widths.map((w) => w * shrink);
    totalW = maxW;
  }
  let cxStart = cx - totalW / 2;
  for (let i = 0; i < chips.length; i++) {
    const w = widths[i];
    pillChip(chips[i].text, cxStart + w / 2, y, chips[i].icon, w);
    cxStart += w + gap;
  }
}

function drawGameOverScreen() {
  const cx = LOGICAL_W / 2;
  let y = LOGICAL_H * 0.28;
  const title = Game.deathReason === 'fuel' ? 'Out of fuel' : 'Shot down';
  drawShadowedText(title, cx, y, 24, COLORS.white, 'rgba(5,11,31,0.6)', 1.5);
  y += 70;
  drawShadowedText(String(Game.finalScore), cx, y, 72, COLORS.white, 'rgba(18,48,58,0.35)', 4);
  y += 60;
  const bulletIcon = (x, yy) => drawBulletIcon(x, yy, 10);
  drawChipRow(
    [
      { text: `${save.bullets} bullets`, icon: bulletIcon },
      { text: `${Game.missilesDown} missiles down`, icon: null },
    ],
    cx, y
  );
  y += 38;
  drawChipRow(
    [
      { text: `${Game.closeCalls} close calls`, icon: null },
      { text: `${Math.floor(Game.elapsed)} s airborne`, icon: null },
    ],
    cx, y
  );
  y += 46;
  if (Game.newRecord) {
    drawUprightText('New best score', cx, y, 15, COLORS.orange, 'center', true);
  } else {
    drawUprightText(`Best ${save.bestScore}`, cx, y, 15, COLORS.white, 'center', true);
  }
  y += 56;
  const btnW = 200, btnH = 52;
  gameOverButtonRect = { x: cx - btnW / 2, y: y - btnH / 2, w: btnW, h: btnH };
  draw3DPill(cx, y, btnW, btnH);
  drawUprightText('Play again', cx, y + 1, 18, COLORS.white, 'center', true);
}
let gameOverButtonRect = null;

let pauseButtonRect = null;
function drawPauseScreen() {
  const cx = LOGICAL_W / 2, cy = LOGICAL_H / 2;
  ctx2d.save();
  ctx2d.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(cx - 110, cy - 90, 220, 180, 22);
  ctx2d.fill();
  const label = Game.pauseSource === 'system' ? 'Tap to continue' : 'Paused';
  drawUprightText(label, cx, cy - 45, 20, COLORS.navyText, 'center', true);
  const btnW = 160, btnH = 48;
  pauseButtonRect = { x: cx - btnW / 2, y: cy + 10 - btnH / 2, w: btnW, h: btnH };
  draw3DPill(cx, cy + 10, btnW, btnH);
  drawUprightText('Resume', cx, cy + 11, 16, COLORS.white, 'center', true);
  ctx2d.restore();
}

function drawDebug() {
  ctx2d.save();
  ctx2d.fillStyle = 'lime';
  ctx2d.font = '12px monospace';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`FPS ${Game.fps}`, 6, LOGICAL_H - 8);
  ctx2d.fillText(`missiles ${missilePool.active.length}/${missileCap}`, 6, LOGICAL_H - 22);
  ctx2d.fillText(`particles ${particlePool.active.length}`, 6, LOGICAL_H - 36);
  ctx2d.fillText(`bullets ${save.bullets} | fuel ${Math.round(jet.fuel)} (press G for +20/full)`, 6, LOGICAL_H - 50);
  ctx2d.restore();
}

function render() {
  ctx2d.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx2d.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

  drawSkyGradient();
  drawStarfieldLayer(0.3, 90, 0.5, 1);
  drawStarfieldLayer(0.55, 130, 0.35, 300);
  drawPlanetLayer(0.6, 320, 30, 0.28, 700);
  drawPlanetLayer(1.0, 260, 22, 0.22, 900);

  // Bullets/fuel cans are just pickups -- hide them once the round is over
  // so they don't clutter the Game Over panel; missiles keep flying either way.
  if (Game.state !== 'gameover') {
    for (const c of fuelCanPool.active) drawFuelCan(c);
    for (const s of bulletPool.active) drawBullet(s);
  }
  for (const m of missilePool.active) drawMissile(m);
  for (const p of interceptorPool.active) drawInterceptor(p);
  drawJet();
  drawParticles();

  if (jet.flareFlash > 0) {
    ctx2d.fillStyle = `rgba(255,138,45,${jet.flareFlash * 0.45})`;
    ctx2d.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }
  if (jet.slowmoTimer > 0) {
    ctx2d.fillStyle = 'rgba(62,143,208,0.15)';
    ctx2d.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }
  if (Game.deathFlash > 0) {
    ctx2d.fillStyle = `rgba(255,255,255,${Game.deathFlash * 0.35})`;
    ctx2d.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  // Upright HUD pass
  ctx2d.save();
  ctx2d.globalAlpha = Game.hudAlpha;
  if (Game.state === 'playing' || Game.state === 'paused') {
    drawRadar();
    drawShadowedText(String(Math.floor(Game.displayScore)), LOGICAL_W / 2, 46, 30 * Game.scoreScale, COLORS.white, 'rgba(18,48,58,0.35)', 2);
    drawFuelGauge(LOGICAL_W / 2, 70, 140, 16);
    drawHudButtons();
    drawPowerupBar();
    drawChevrons();
  }
  ctx2d.restore();

  if (Game.state === 'hint') {
    drawRadar();
    drawShadowedText('0', LOGICAL_W / 2, 46, 30, COLORS.white, 'rgba(18,48,58,0.35)', 2);
    drawFuelGauge(LOGICAL_W / 2, 70, 140, 16);
    drawHudButtons();
    drawPowerupBar();
    drawStartHint();
  }

  if (Game.state === 'gameover') {
    drawGameOverScreen();
  }
  if (Game.state === 'paused') {
    drawPauseScreen();
  }

  if (Game.debug) drawDebug();
}

/* ------------------------------ 17. GAME-OVER / PAUSE TAPS -------------------- */

canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPointFromEvent(e);
  if (Game.state === 'gameover' && gameOverButtonRect) {
    const r = gameOverButtonRect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
      Audio_.click();
      startRun();
    }
  } else if (Game.state === 'paused' && Game.pauseSource !== null && pauseButtonRect) {
    const r = pauseButtonRect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
      Audio_.click();
      Game.state = 'playing';
      Game.pauseSource = null;
    }
  }
});

/* ------------------------------ 18. MAIN LOOP ---------------------------------- */

function frame(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

async function boot() {
  const raw = await Platform.loadData();
  save = migrateSave(raw);
  Audio_.setMusicOn(save.musicOn);
  Audio_.setSoundOn(save.soundOn);
  ensureBullets();
  ensureFuelCans();
  camera.x = jet.x; camera.y = jet.y;
  Game.state = 'hint';
  requestAnimationFrame((t0) => {
    lastTime = t0;
    render();
    Platform.firstFrameReady();
    Platform.gameReady();
    requestAnimationFrame(frame);
  });
}

boot();
