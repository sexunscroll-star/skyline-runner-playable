'use strict';

/* =========================================================================
 * Skyline Runner — endless homing-missile dodge game
 * Plain Canvas2D + vanilla JS. No build step, no external assets at runtime.
 * ========================================================================= */

/* ----------------------------- 1. CONFIG -------------------------------- */

// Gameplay is tuned for a 390x845 portrait view. The visible view (VIEW_W x
// VIEW_H) follows the window's shape but keeps about the same area, so no
// aspect ratio sees much more or less of the world than a phone does.
const BASE_W = 390;
const BASE_H = 845;
const BASE_DIAG = Math.hypot(BASE_W, BASE_H);
let VIEW_W = BASE_W;
let VIEW_H = BASE_H;

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
// Rocket motors burn for most of the flight, then the missile coasts and bleeds speed.
const MISSILE_COAST_TIME = 2.2;
const MISSILE_COAST_SPEED_MIN = 0.7;
// Radar-guided (AMRAAM-style): bigger and less agile, but leads its target and ignores flares.
const RADAR_SPEED_MULT = 1.06;
const RADAR_TURN_RATE = 1.55;
const RADAR_LEAD = 0.55;           // fraction of the jet's predicted travel it aims ahead
const RADAR_LEAD_MAX_T = 1.5;      // s, cap on time-to-go used for the lead point

const BULLET_RADIUS = 14;
const BULLET_COUNT_TARGET = 9;
const BULLET_SPAWN_RANGE = BASE_W * 1.2; // ~1.5 "screens" worth of radius
const BULLET_DESPAWN_DIST = BULLET_SPAWN_RANGE * 1.6;

const FUEL_MAX = 100;
const FUEL_DRAIN_RATE = 5.5;       // fuel units/s -- empties a full tank in ~18s
const FUEL_CAN_REFILL = 35;
const FUEL_CAN_RADIUS = 13;
const FUEL_CAN_COUNT_TARGET = 4;   // scarcer than bullets -- fuel is the precious resource
const FUEL_CAN_SPAWN_RANGE = BASE_W * 1.4;
const FUEL_CAN_DESPAWN_DIST = FUEL_CAN_SPAWN_RANGE * 1.6;
const FUEL_LOW_THRESHOLD = 0.25;

const CLOSE_CALL_DIST = 38;
const CLOSE_CALL_RESET_DIST = 90;

const FIRST_MISSILE_DELAY = 1.5;

// A new level every LEVEL_DURATION seconds; past the table, every 2 levels add a missile.
const LEVEL_DURATION = 15;
const LEVELS = [
  { cap: 1, radar: 0 },
  { cap: 2, radar: 0 },
  { cap: 3, radar: 0 },
  { cap: 3, radar: 0.3, msg: "Radar missiles! Flares can't fool them" },
  { cap: 4, radar: 0.3 },
  { cap: 5, radar: 0.35 },
  { cap: 5, radar: 0.4 },
  { cap: 6, radar: 0.45 },
];
const MISSILE_CAP_MAX = 8;
const SCORE_LEVEL_UP = 10;          // x level number

function levelConfig(level) {
  const base = LEVELS[Math.min(level, LEVELS.length) - 1];
  if (level <= LEVELS.length) return base;
  const extra = Math.floor((level - LEVELS.length) / 2);
  return { cap: Math.min(MISSILE_CAP_MAX, base.cap + extra), radar: 0.5 };
}

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
// IR decoy flares: ejected in pairs from both sides, they out-burn the jet's
// exhaust, so a heat-seeker that sees one in its seeker cone may switch to it.
const FLARE_PAIRS = 3;
const FLARE_PAIR_INTERVAL = 0.14;   // s between pairs, like a dispenser program
const FLARE_BURN_TIME = 3.2;        // s
const FLARE_DRAG = 2.4;             // velocity decay per second
const FLARE_PROXIMITY = 14;         // missile proximity fuse vs a flare
const SEEKER_HALF_ANGLE = 40 * Math.PI / 180;
const SEEKER_RANGE = 300;
const DECOY_CHANCE_START = 0.9;     // early missiles are easily fooled
const DECOY_CHANCE_END = 0.6;       // later seekers have better flare rejection
const DECOY_BREAK_BONUS = 0.12;     // turning hard while dropping flares helps
const MISSILE_LOST_LOCK_TIME = 0.9; // s a decoyed missile flies blind after its flare dies

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
  // The real Playables SDK script defines window.ytgame unconditionally,
  // even when this page is opened standalone (not inside YouTube's iframe).
  // Only trust it when we're actually embedded, so local/LAN/iPhone test
  // links reliably use our own localStorage-backed save + full-volume audio
  // instead of routing through SDK calls that don't do anything useful
  // outside the real Playables frame.
  const hasYt = typeof window.ytgame !== 'undefined' && window.self !== window.top;
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
// Everything is synthesized with Web Audio (no audio files). Signal flow:
// voices -> [per-sound pan/distance] -> sfx or music bus -> master -> compressor
// -> speakers. The compressor keeps stacked explosions from clipping.

const MUSIC_VOL = 0.3; // sits ~8 dB under the effects so warnings always cut through
const SFX_VOL = 0.85;
const WARN_RANGE = 320; // missile-approach warning starts beeping inside this distance

const Audio_ = (function () {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuf = null;
  let unlocked = false;
  const lastPlayed = {};

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.connect(comp);
    musicGain = ctx.createGain();
    musicGain.gain.value = save.musicOn ? MUSIC_VOL : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = save.soundOn ? SFX_VOL : 0;
    sfxGain.connect(master);
    // One shared noise buffer; each voice starts at a random offset so no two sound alike.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyMasterGate();
  }

  function ready() { ensureCtx(); return !!ctx; }

  function applyMasterGate() {
    if (master) master.gain.value = Platform.isAudioEnabled() ? 1 : 0;
  }
  Platform.onAudioEnabledChange(() => applyMasterGate());

  // Voice limiting: the same sound can't retrigger faster than minGap seconds.
  function allow(key, minGap) {
    const t = ctx.currentTime;
    if (lastPlayed[key] !== undefined && t - lastPlayed[key] < minGap) return false;
    lastPlayed[key] = t;
    return true;
  }

  // Destination for a sound at world (x, y): panned by screen side, quieter with distance.
  function at(x, y) {
    if (x === undefined) return sfxGain;
    const g = ctx.createGain();
    g.gain.value = clamp(1.15 - Math.hypot(x - camera.x, y - camera.y) / 800, 0.12, 1);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp((x - camera.x) / (VIEW_W * 0.6), -0.8, 0.8);
      g.connect(p);
      p.connect(sfxGain);
    } else {
      g.connect(sfxGain);
    }
    return g;
  }

  function osc(type, freq, t0, dur, peak, dest, opt = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opt.detune) o.detune.value = opt.detune;
    if (opt.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.glide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail = o;
    if (opt.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opt.lowpass;
      o.connect(f);
      tail = f;
    }
    tail.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, peak, dest, opt = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opt.type || 'lowpass';
    f.frequency.setValueAtTime(opt.freq || 2000, t0);
    f.Q.value = opt.q || 0.7;
    if (opt.sweepTo) f.frequency.exponentialRampToValueAtTime(opt.sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opt.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t0, Math.random() * Math.max(0, noiseBuf.duration - dur - 0.1), dur + 0.05);
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---- Engine: turbine whine (two detuned saws, low-passed, with a slow wobble) + air rush ---- */
  let engine = null;
  function startEngine() {
    if (!ctx || engine) return;
    const rush = ctx.createBufferSource();
    rush.buffer = noiseBuf;
    rush.loop = true;
    const rushFilter = ctx.createBiquadFilter();
    rushFilter.type = 'bandpass';
    rushFilter.frequency.value = 500;
    rushFilter.Q.value = 0.9;
    const rushGain = ctx.createGain();
    rushGain.gain.value = 0;
    rush.connect(rushFilter);
    rushFilter.connect(rushGain);
    rushGain.connect(sfxGain);
    rush.start();

    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = 'lowpass';
    whineFilter.frequency.value = 650;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    const saws = [0, 9].map((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 78;
      o.detune.value = cents;
      o.connect(whineFilter);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(whineFilter.frequency);
    lfo.start();
    whineFilter.connect(whineGain);
    whineGain.connect(sfxGain);
    engine = { rushGain, rushFilter, whineGain, whineFilter, saws };
  }

  function setEngine(flying, boosting) {
    if (!ctx || !unlocked) return;
    startEngine();
    const t = ctx.currentTime;
    engine.rushGain.gain.setTargetAtTime(!flying ? 0 : boosting ? 0.26 : 0.1, t, 0.15);
    engine.whineGain.gain.setTargetAtTime(!flying ? 0 : boosting ? 0.13 : 0.06, t, 0.15);
    engine.rushFilter.frequency.setTargetAtTime(boosting ? 1100 : 480, t, 0.25);
    engine.whineFilter.frequency.setTargetAtTime(boosting ? 1300 : 650, t, 0.25);
    for (const o of engine.saws) o.frequency.setTargetAtTime(boosting ? 140 : 78, t, 0.2);
  }

  /* ---- Adaptive music: Am-F-C-G at 104 BPM; layers join as the level rises ---- */
  const STEP = 60 / 104 / 4; // one 16th note
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  let musicTimer = null, nextStepTime = 0, step = 0;

  function musicLayers() {
    return Game.state === 'playing' ? Math.min(4, Game.level) : 0;
  }

  function pad(chord, t, dur) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    g.gain.setValueAtTime(0.05, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    f.connect(g);
    g.connect(musicGain);
    for (const n of chord) {
      for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = cents;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
  }

  function scheduleStep(s, t) {
    const pos = s % 16;
    const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
    const layers = musicLayers();
    if (pos === 0) pad(chord, t, STEP * 16);
    if (pos % 4 === 0 || (layers >= 2 && pos % 4 === 2)) {
      osc('triangle', mtof(chord[0] - 12), t, STEP * (layers >= 2 ? 1.8 : 3.5), 0.2, musicGain, { attack: 0.01, lowpass: 600 });
    }
    if (layers >= 1 && pos % 8 === 0) osc('sine', 150, t, 0.25, 0.45, musicGain, { glide: 45 });
    if (layers >= 2 && pos % 2 === 0) osc('triangle', mtof(chord[(pos / 2) % 3] + 12), t, 0.12, 0.06, musicGain);
    if (layers >= 3 && pos % 4 === 2) noise(t, 0.04, 0.07, musicGain, { type: 'highpass', freq: 7000 });
    if (layers >= 4 && (pos === 4 || pos === 12)) {
      noise(t, 0.15, 0.16, musicGain, { type: 'bandpass', freq: 1800, q: 0.8 });
      osc('triangle', 190, t, 0.08, 0.1, musicGain);
    }
  }

  // Look-ahead scheduler: a coarse timer queues notes on the audio clock, so timing
  // stays tight, and nothing piles up while the context is suspended.
  function startMusicLoop() {
    if (!ctx || musicTimer) return;
    nextStepTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running' || !save.musicOn) return;
      if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
      while (nextStepTime < ctx.currentTime + 0.12) {
        scheduleStep(step, nextStepTime);
        step++;
        nextStepTime += STEP;
      }
    }, 25);
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    startMusicLoop();
  }

  let warnTimer = 0, combo = 0, lastPickup = -10;

  const api = {
    unlock,
    setEngine,
    // Stops every sound (including music) while the game is paused or hidden.
    setSuspended(s) {
      if (!ctx || !unlocked) return;
      if (s && ctx.state === 'running') ctx.suspend();
      else if (!s && ctx.state !== 'running') ctx.resume();
    },
    setMusicOn(on) {
      save.musicOn = on;
      if (musicGain) musicGain.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
    },
    setSoundOn(on) {
      save.soundOn = on;
      if (sfxGain) sfxGain.gain.setTargetAtTime(on ? SFX_VOL : 0, ctx.currentTime, 0.05);
    },

    // Missile Approach Warning: beeps speed up as the closest chasing missile closes in.
    warning(nearest, radar, dt) {
      if (!ctx || !unlocked || nearest === null || nearest > WARN_RANGE) { warnTimer = 0; return; }
      warnTimer -= dt;
      if (warnTimer > 0) return;
      const k = clamp(nearest / WARN_RANGE, 0, 1);
      warnTimer = lerp(0.09, 0.5, k);
      osc('sine', radar ? 1250 : 950, ctx.currentTime, 0.05, lerp(0.16, 0.06, k), sfxGain, { attack: 0.003 });
    },

    bulletPickup() {
      if (!ready()) return;
      const t = ctx.currentTime;
      // Quick pickups climb a major scale, a classic "combo" reward.
      combo = t - lastPickup < 1.3 ? Math.min(combo + 1, 8) : 0;
      lastPickup = t;
      const f = 1046.5 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14][combo] / 12);
      osc('triangle', f, t, 0.18, 0.26, sfxGain);
      osc('sine', f * 1.5, t + 0.04, 0.22, 0.14, sfxGain);
      osc('sine', f * 3, t + 0.02, 0.12, 0.04, sfxGain);
    },
    closeCall(x, y) {
      if (!ready() || !allow('flyby', 0.15)) return;
      const t = ctx.currentTime, d = at(x, y);
      noise(t, 0.45, 0.6, d, { type: 'bandpass', freq: 3200, q: 1.5, sweepTo: 600, attack: 0.05 });
      osc('triangle', 520, t, 0.35, 0.11, d, { glide: 260, attack: 0.04 });
    },
    // Ignition thump, then the rising whoosh and hiss of a rocket motor.
    launch(x, y) {
      if (!ready() || !allow('launch', 0.05)) return;
      const t = ctx.currentTime, d = at(x, y);
      osc('sine', 140, t, 0.18, 0.32, d, { glide: 55 });
      noise(t, 0.7, 0.3, d, { type: 'bandpass', freq: 500, q: 1.2, sweepTo: 2600, attack: 0.06 });
      noise(t + 0.05, 0.9, 0.1, d, { type: 'highpass', freq: 4000 });
    },
    // Cockpit radar-warning receiver calling a radar lock, plus the launch itself.
    radarLock(x, y) {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 5; i++) osc('triangle', 1150, t + i * 0.085, 0.06, 0.15, sfxGain, { attack: 0.004 });
      api.launch(x, y);
    },
    // Layered explosion: crack, filtered body, sub thump, debris crackle (+ rumble for the jet).
    boom(x, y, big) {
      if (!ready() || !allow(big ? 'bigboom' : 'boom', 0.07)) return;
      const t = ctx.currentTime, d = at(x, y), j = rand(0.9, 1.1), s = big ? 1.5 : 1, v = big ? 1.3 : 1;
      noise(t, 0.06, 0.5 * v, d, { type: 'highpass', freq: 2500 });
      noise(t, 0.5 * s, 0.7 * v, d, { freq: 1600 * j, sweepTo: 220, attack: 0.004 });
      osc('sine', (big ? 85 : 110) * j, t, 0.45 * s, 0.6 * v, d, { glide: 30 });
      for (let i = 0; i < (big ? 9 : 5); i++) {
        noise(t + 0.08 + Math.random() * 0.35 * s, 0.03, 0.12, d, { type: 'bandpass', freq: rand(1500, 4000), q: 2 });
      }
      if (big) noise(t + 0.1, 1.6, 0.6, d, { freq: 450, sweepTo: 80, attack: 0.08 });
    },
    gameOver(newRecord) {
      if (!ready()) return;
      const t = ctx.currentTime + 0.6;
      const notes = newRecord ? [72, 76, 79, 84, 88] : [69, 65, 62, 57];
      notes.forEach((n, i) => osc('triangle', mtof(n), t + i * 0.13, 0.4, 0.18, sfxGain, { attack: 0.01 }));
    },
    click() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 1400, t, 0.035, 0.16, sfxGain, { attack: 0.002 });
      noise(t, 0.015, 0.08, sfxGain, { type: 'highpass', freq: 5000 });
    },
    denied() {
      if (!ready() || !allow('denied', 0.12)) return;
      const t = ctx.currentTime;
      osc('triangle', 240, t, 0.12, 0.22, sfxGain, { glide: 170 });
      osc('triangle', 200, t + 0.08, 0.14, 0.18, sfxGain, { glide: 140 });
    },
    // Fuel glugging into the tank: three rising bubbles.
    refuel() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [300, 420, 560].forEach((f, i) => osc('sine', f, t + i * 0.07, 0.09, 0.25, sfxGain, { glide: f * 1.6 }));
      noise(t, 0.25, 0.06, sfxGain, { freq: 900 });
    },
    // Two-tone "bingo fuel" caution, repeated by the game while fuel is low.
    lowFuel() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('triangle', 740, t, 0.13, 0.2, sfxGain);
      osc('triangle', 587, t + 0.15, 0.16, 0.2, sfxGain);
    },
    // Burning-magnesium hiss and crackle after a salvo.
    flareBurst() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 1.4, 0.09, sfxGain, { type: 'highpass', freq: 2500, attack: 0.08 });
      for (let i = 0; i < 8; i++) noise(t + Math.random() * 1.2, 0.02, 0.07, sfxGain, { type: 'bandpass', freq: rand(2000, 5000), q: 3 });
    },
    // Dispenser cartridge firing: a dull thump with a click.
    flarePop() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 200, t, 0.07, 0.24, sfxGain, { glide: 70 });
      noise(t, 0.025, 0.2, sfxGain, { type: 'highpass', freq: 3500 });
    },
    decoyed() {
      if (!ready() || !allow('decoy', 0.1)) return;
      const t = ctx.currentTime;
      osc('triangle', 880, t, 0.12, 0.2, sfxGain);
      osc('triangle', 1320, t + 0.07, 0.16, 0.17, sfxGain);
    },
    levelUp() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [72, 76, 79, 84].forEach((n, i) => {
        osc('triangle', mtof(n), t + i * 0.09, 0.28, 0.2, sfxGain, { attack: 0.01 });
        osc('sine', mtof(n + 12), t + i * 0.09, 0.2, 0.05, sfxGain);
      });
    },
    // Afterburner light-off: a low thump into a rising roar.
    boostActivate() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 90, t, 0.3, 0.35, sfxGain, { glide: 55 });
      noise(t, 0.7, 0.45, sfxGain, { freq: 300, sweepTo: 2400, attack: 0.03 });
    },
    shieldActivate() {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (const c of [-12, 0, 12]) osc('sine', 420, t, 0.45, 0.1, sfxGain, { glide: 1260, detune: c, attack: 0.02 });
      osc('triangle', 2500, t + 0.25, 0.3, 0.04, sfxGain);
    },
    // A missile hitting the shield: inharmonic metallic partials.
    shieldHit() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [[523, 0.2], [1180, 0.12], [1870, 0.08], [2650, 0.05]].forEach(([f, g]) => osc('sine', f, t, 0.6, g, sfxGain, { attack: 0.002 }));
      noise(t, 0.05, 0.25, sfxGain, { type: 'highpass', freq: 4000 });
    },
    // Tape slowing down.
    slowmoActivate() {
      if (!ready()) return;
      const t = ctx.currentTime;
      osc('sine', 900, t, 0.7, 0.22, sfxGain, { glide: 140 });
      osc('triangle', 450, t, 0.7, 0.12, sfxGain, { glide: 70 });
      noise(t, 0.6, 0.08, sfxGain, { freq: 2000, sweepTo: 200 });
    },
    // Electric zap falling into a heavy sub drop.
    empActivate() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 0.5, 0.35, sfxGain, { type: 'bandpass', freq: 6000, q: 3, sweepTo: 300 });
      osc('sine', 160, t, 0.6, 0.5, sfxGain, { glide: 30 });
      for (let i = 0; i < 4; i++) osc('triangle', rand(1500, 3000), t + i * 0.05, 0.04, 0.08, sfxGain);
    },
  };
  return api;
})();

/* ------------------------------ 5. CANVAS -------------------------------- */

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
let dpr = 1;
let viewScale = 1; // CSS px per view unit

// Fills the whole window: the backing store matches the window in device
// pixels (so nothing is resampled or blurred) and the view adapts to the shape.
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const bufW = Math.max(1, Math.floor((window.innerWidth || 1) * dpr));
  const bufH = Math.max(1, Math.floor((window.innerHeight || 1) * dpr));
  const cssW = bufW / dpr, cssH = bufH / dpr;
  // Same world area as the base view, but never fewer than BASE_W units on the short side.
  viewScale = Math.max(0.001, Math.min(Math.sqrt((cssW * cssH) / (BASE_W * BASE_H)), Math.min(cssW, cssH) / BASE_W));
  VIEW_W = cssW / viewScale;
  VIEW_H = cssH / viewScale;
  canvas.width = bufW;
  canvas.height = bufH;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  layoutHud();
}
window.addEventListener('resize', resize);

// How much farther the view reaches than the base view (1 on most screens).
function viewReach() {
  return Math.max(1, Math.hypot(VIEW_W, VIEW_H) / BASE_DIAG);
}

/* ------------------------------ 6. INPUT --------------------------------- */

const Input = {
  steerLeftPointers: new Set(),
  steerRightPointers: new Set(),
  keyLeft: false,
  keyRight: false,
  usedKeyboard: false, // once true, power-up buttons show their 1-5 key hints
};

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * VIEW_W;
  const y = (e.clientY - rect.top) / rect.height * VIEW_H;
  return { x, y };
}

function hitTestButtons(x, y) {
  // Hit area is at least 48 CSS px across (touch-target guideline); when hit areas
  // overlap, the nearest button wins.
  const minR = 24 / viewScale;
  let best = null, bestD = Infinity;
  for (const b of hudButtons.concat(powerupButtons)) {
    const d = dist(x, y, b.x, b.y);
    if (d <= Math.max(b.r + 4, minR) && d < bestD) { best = b.id; bestD = d; }
  }
  return best;
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
  if (p.x < VIEW_W / 2) Input.steerLeftPointers.add(e.pointerId);
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

// Testing aids (debug overlay, free bullets) only exist when the page is opened with ?debug=1.
const DEBUG_ALLOWED = /[?&]debug=1\b/.test(location.search);
const POWERUP_KEYS = { '1': 'boost', '2': 'flares', '3': 'shield', '4': 'slowmo', '5': 'emp' };

// Enter/Space: start from the title hint, replay after game over, resume from pause.
function confirmAction() {
  if (Game.state === 'hint' || Game.state === 'boot') startRun();
  else if (Game.state === 'gameover' && Game.overT > 0.8) { Audio_.click(); startRun(); }
  else if (Game.state === 'paused') { Audio_.click(); Game.state = 'playing'; Game.pauseSource = null; }
}

window.addEventListener('keydown', (e) => {
  const steerKey = ['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key);
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') Input.keyLeft = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') Input.keyRight = true;
  if (steerKey && Game.state === 'hint') startRun();
  if (POWERUP_KEYS[e.key]) { Input.usedKeyboard = true; activatePowerup(POWERUP_KEYS[e.key]); }
  if (e.key === 'Enter' || e.key === ' ') {
    if (e.key === ' ') e.preventDefault(); // keep Space from scrolling the host page
    if (!e.repeat) confirmAction();
  }
  // Esc is allowed to pause, but its default is never prevented (Playables rule).
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  // 'd' already steers right (A/D scheme), so debug uses backtick instead.
  if (DEBUG_ALLOWED && e.key === '`') Game.debug = !Game.debug;
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
  flarePairsLeft: 0,
  flarePairTimer: 0,
  fuel: FUEL_MAX,
  fuelWarnTimer: 0,
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
    closeCallArmed: true, trail: [], decoyId: null, rolledSalvo: 0, lostLock: 0,
    kind: 'ir', burnTime: 0,
  }),
  (m, x, y, heading, kind) => {
    m.id = missileIdCounter++;
    m.x = x; m.y = y; m.heading = heading; m.age = 0;
    m.kind = kind || 'ir';
    m.lifetime = rand(MISSILE_LIFETIME_MIN, MISSILE_LIFETIME_MAX);
    m.burnTime = m.lifetime - MISSILE_COAST_TIME;
    m.alive = true;
    m.closeCallArmed = true;
    m.trail.length = 0;
    m.decoyId = null;
    m.rolledSalvo = flareSalvoCounter; // only flares dropped after launch can fool it
    m.lostLock = 0;
  }
);

let missileSpawnTimer = FIRST_MISSILE_DELAY;
let missileCap = LEVELS[0].cap;

function missileSpeedMult(elapsed) {
  const t = clamp(elapsed / MISSILE_SPEED_RAMP_TIME, 0, 1);
  return lerp(MISSILE_SPEED_START_MULT, MISSILE_SPEED_CAP_MULT, t);
}

function trySpawnMissile(elapsed) {
  if (missilePool.active.length >= missileCap) return;
  let angle;
  do {
    angle = rand(0, Math.PI * 2);
  } while (Math.abs(angleDiff(jet.heading, angle)) < MISSILE_SPAWN_FRONT_EXCLUDE);
  // Base-view distance, pushed out on very wide/tall screens so it still spawns off-screen.
  const toEdge = Math.min(
    VIEW_W / 2 / Math.max(1e-6, Math.abs(Math.cos(angle))),
    VIEW_H / 2 / Math.max(1e-6, Math.abs(Math.sin(angle))),
  );
  const spawnDist = Math.max(BASE_DIAG / 2, toEdge) + 60;
  const x = jet.x + Math.cos(angle) * spawnDist;
  const y = jet.y + Math.sin(angle) * spawnDist;
  const headingToJet = Math.atan2(jet.y - y, jet.x - x);
  const kind = Math.random() < levelConfig(Game.level).radar ? 'radar' : 'ir';
  missilePool.spawn(x, y, headingToJet, kind);
  if (kind === 'radar') Audio_.radarLock(x, y); else Audio_.launch(x, y);
}

/* ------------------------------ 9b. DECOY FLARES ----------------------------- */

let flareIdCounter = 1;
let flareSalvoCounter = 0;

const flarePool = makePool(
  () => ({ id: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, salvo: 0, chance: 0, alive: false }),
  (f, x, y, vx, vy, salvo, chance) => {
    f.id = flareIdCounter++;
    f.x = x; f.y = y; f.vx = vx; f.vy = vy; f.age = 0;
    f.salvo = salvo; f.chance = chance; f.alive = true;
  }
);

/* ------------------------------ 10. BULLETS (currency pickups) ------------- */

const bulletPool = makePool(
  () => ({ x: 0, y: 0, alive: false, bob: 0 }),
  (s, x, y) => { s.x = x; s.y = y; s.alive = true; s.bob = Math.random() * Math.PI * 2; }
);

function randomBulletPos() {
  const angle = rand(0, Math.PI * 2);
  const d = rand(120, BULLET_SPAWN_RANGE * viewReach());
  return { x: jet.x + Math.cos(angle) * d, y: jet.y + Math.sin(angle) * d };
}

// Pickup counts grow with the spawn disc's area so on-screen density stays the same.
function ensureBullets() {
  const target = Math.round(BULLET_COUNT_TARGET * viewReach() ** 2);
  while (bulletPool.active.length < target) {
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
  const d = rand(150, FUEL_CAN_SPAWN_RANGE * viewReach());
  return { x: jet.x + Math.cos(angle) * d, y: jet.y + Math.sin(angle) * d };
}

function ensureFuelCans() {
  const target = Math.round(FUEL_CAN_COUNT_TARGET * viewReach() ** 2);
  while (fuelCanPool.active.length < target) {
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

/* ------------------------------ 12. FLARES ---------------------------------- */

// Starts a dispenser program: FLARE_PAIRS pairs released a beat apart, so the
// burning flares fan out behind the jet in an "angel wings" pattern.
function activateFlareSalvo() {
  flareSalvoCounter++;
  jet.flarePairsLeft = FLARE_PAIRS;
  jet.flarePairTimer = 0;
  jet.flareFlash = 0.35;
  Audio_.flareBurst();
}

function decoyChance(elapsed) {
  const t = clamp(elapsed / MISSILE_SPEED_RAMP_TIME, 0, 1);
  return lerp(DECOY_CHANCE_START, DECOY_CHANCE_END, t);
}

function releaseFlarePair() {
  const fx = Math.cos(jet.heading), fy = Math.sin(jet.heading);
  const px = -fy, py = fx;
  const speed = jetCurrentSpeed();
  const breaking = Math.abs(jet.bank) > 0.6;
  const chance = Math.min(0.95, decoyChance(Game.elapsed) + (breaking ? DECOY_BREAK_BONUS : 0));
  const bx = jet.x - fx * 12, by = jet.y - fy * 12;
  for (const side of [-1, 1]) {
    const out = rand(110, 170);
    const back = rand(20, 60);
    // Flares leave with the jet's momentum, then drag pulls them behind it.
    const vx = fx * speed * 0.55 + px * side * out - fx * back;
    const vy = fy * speed * 0.55 + py * side * out - fy * back;
    flarePool.spawn(bx + px * side * 6, by + py * side * 6, vx, vy, flareSalvoCounter, chance);
    spawnBurst(bx + px * side * 6, by + py * side * 6, '#FFF3B0', 4, 30, 90, 0.25);
  }
  Audio_.flarePop();
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
  overT: 0, // seconds since game over, drives the result-screen animations
  level: 1,
  levelBanner: 0, // seconds left on the "Level N" banner
  levelMsg: '',
  shake: 0,  // 0..1 camera shake
  danger: 0, // 0..1 how close the nearest chasing missile is (red edge glow)
};

function resetRun() {
  missilePool.releaseAll();
  flarePool.releaseAll();
  bulletPool.releaseAll();
  fuelCanPool.releaseAll();
  particlePool.releaseAll();
  jet.x = 0; jet.y = 0; jet.heading = -Math.PI / 2; jet.bank = 0;
  jet.boostTimer = 0; jet.shieldTimer = 0; jet.slowmoTimer = 0; jet.flareFlash = 0;
  jet.flarePairsLeft = 0; jet.flarePairTimer = 0;
  jet.fuel = FUEL_MAX; jet.fuelWarnTimer = 0;
  Game.shake = 0;
  Game.danger = 0;
  camera.x = 0; camera.y = 0;
  missileSpawnTimer = FIRST_MISSILE_DELAY;
  missileCap = LEVELS[0].cap;
  Game.level = 1;
  Game.levelBanner = 0;
  Game.levelMsg = '';
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
  Game.overT = 0;
  Audio_.boom(jet.x, jet.y, true);
  addShake(jet.x, jet.y, 1);
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
  Audio_.gameOver(Game.newRecord);
  Platform.saveData(save);
  Platform.sendScore(save.bestScore);
}

const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Camera shake scaled by how close the blast is to the jet (off for reduced-motion users).
function addShake(x, y, strength) {
  if (reducedMotion) return;
  const near = clamp(1 - dist(x, y, jet.x, jet.y) / 500, 0, 1);
  Game.shake = Math.min(1, Game.shake + strength * near);
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
  switch (id) {
    case 'boost':
      jet.boostTimer = JET_BOOST_DURATION;
      Audio_.boostActivate();
      break;
    case 'flares':
      activateFlareSalvo(); // plays its own flareBurst() sound
      break;
    case 'shield':
      jet.shieldTimer = SHIELD_DURATION;
      Audio_.shieldActivate();
      break;
    case 'slowmo':
      jet.slowmoTimer = SLOWMO_DURATION;
      Audio_.slowmoActivate();
      break;
    case 'emp': {
      Audio_.empActivate();
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
  Audio_.boom(m.x, m.y);
  addShake(m.x, m.y, 0.35);
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
  Game.shake = Math.max(0, Game.shake - dt * 2.5);
  for (const k in deniedFlash) deniedFlash[k] = Math.max(0, deniedFlash[k] - dt);

  // The title hint stays up (gently pulsing) until the player actually starts.
  if (Game.state === 'hint') {
    Game.startHintAlpha = 0.75 + 0.25 * Math.sin(performance.now() / 400);
  }

  // Continuous engine hum -- runs (or fades out) every frame regardless of
  // state, since it's a smooth gain ramp, not a one-shot trigger.
  Audio_.setEngine(Game.state === 'playing', Game.state === 'playing' && jet.boostTimer > 0);

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
    if (jet.flarePairsLeft > 0) {
      jet.flarePairTimer -= dt;
      if (jet.flarePairTimer <= 0) {
        releaseFlarePair();
        jet.flarePairsLeft--;
        jet.flarePairTimer = FLARE_PAIR_INTERVAL;
      }
    }

    // Fuel drains steadily; running dry crashes the jet just like a missile hit.
    jet.fuel = Math.max(0, jet.fuel - FUEL_DRAIN_RATE * dt);
    const fuelPct = jet.fuel / FUEL_MAX;
    if (fuelPct < FUEL_LOW_THRESHOLD) {
      jet.fuelWarnTimer -= dt;
      if (jet.fuelWarnTimer <= 0) {
        Audio_.lowFuel();
        jet.fuelWarnTimer = 1.6;
      }
    } else {
      jet.fuelWarnTimer = 0;
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

    // Levels: more missiles (and later radar-guided ones) as the run goes on.
    const level = 1 + Math.floor(Game.elapsed / LEVEL_DURATION);
    if (level > Game.level) {
      Game.level = level;
      missileCap = levelConfig(level).cap;
      Game.levelBanner = 2.4;
      Game.levelMsg = levelConfig(level).msg || `${missileCap} missiles at once`;
      addScore(SCORE_LEVEL_UP * level, `Level ${level} +${SCORE_LEVEL_UP * level}`, jet.x, jet.y - 46, '#FFE47A');
      Audio_.levelUp();
      Platform.saveData(save); // keep bullets earned so far if the player leaves mid-run
    }
    if (Game.levelBanner > 0) Game.levelBanner = Math.max(0, Game.levelBanner - dt);
    missileSpawnTimer -= dt;
    if (missileSpawnTimer <= 0) {
      trySpawnMissile(Game.elapsed);
      missileSpawnTimer = rand(1.2, 2.4) * Math.max(0.6, 1 - 0.05 * (Game.level - 1));
    }
  }

  const missileTimeScale = jet.slowmoTimer > 0 ? SLOWMO_FACTOR : 1;
  const spdMult = missileSpeedMult(Game.elapsed);

  // Flares: drag slows them so they fall behind the jet while they burn.
  for (const f of flarePool.active.slice()) {
    f.age += dt;
    if (f.age >= FLARE_BURN_TIME) { flarePool.release(f); continue; }
    const decay = Math.exp(-FLARE_DRAG * dt);
    f.vx *= decay; f.vy *= decay;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (Math.random() < 0.7) {
      particlePool.spawn(f.x, f.y, rand(-8, 8), rand(-8, 8), rand(0.6, 1.0), rand(4, 7), 'rgba(225,228,235,0.28)', 'smoke');
    }
    if (Math.random() < 0.25) {
      particlePool.spawn(f.x, f.y, rand(-40, 40), rand(-40, 40), 0.25, rand(1, 2), '#FFF3B0', 'dot');
    }
  }

  for (const m of missilePool.active.slice()) {
    m.age += dt;
    if (m.age >= m.lifetime) {
      spawnSmokePuff(m.x, m.y);
      missilePool.release(m);
      continue;
    }

    // Seeker: a newer salvo burning inside the seeker cone gets one roll per
    // missile -- either the missile switches to the hotter flare or ignores it.
    if (!m.decoyId && m.lostLock <= 0) {
      let best = null, bestD = Infinity;
      if (m.kind === 'radar') {
        // Radar seekers don't see heat, so flares can't fool them -- say so once per salvo.
        const seen = flarePool.active.find((f) => f.salvo > m.rolledSalvo && dist(m.x, m.y, f.x, f.y) < SEEKER_RANGE);
        if (seen) {
          m.rolledSalvo = seen.salvo;
          if (playing) spawnFloatingText(m.x, m.y - 18, 'Radar lock - flares useless!', COLORS.fuelLow);
        }
      } else {
        for (const f of flarePool.active) {
          if (f.salvo <= m.rolledSalvo) continue;
          const d = dist(m.x, m.y, f.x, f.y);
          if (d > SEEKER_RANGE || d >= bestD) continue;
          if (Math.abs(angleDiff(m.heading, Math.atan2(f.y - m.y, f.x - m.x))) > SEEKER_HALF_ANGLE) continue;
          best = f; bestD = d;
        }
      }
      if (best) {
        m.rolledSalvo = best.salvo;
        if (Math.random() < best.chance) {
          m.decoyId = best.id;
          if (playing) {
            spawnFloatingText(m.x, m.y - 18, 'Decoyed!', '#FFE47A');
            Audio_.decoyed();
          }
        } else if (playing) {
          spawnFloatingText(m.x, m.y - 18, 'Ignored flares!', COLORS.fuelLow);
        }
      }
    }

    const coasting = m.age > m.burnTime;
    const coastT = coasting ? (m.age - m.burnTime) / MISSILE_COAST_TIME : 0;
    const mSpeed = JET_SPEED * spdMult * missileTimeScale
      * (m.kind === 'radar' ? RADAR_SPEED_MULT : 1)
      * lerp(1, MISSILE_COAST_SPEED_MIN, coastT);

    let tx = jet.x, ty = jet.y, steer = true;
    if (m.kind === 'radar') {
      // Lead pursuit: aim where the jet will be, not where it is.
      const tgo = Math.min(RADAR_LEAD_MAX_T, dist(m.x, m.y, jet.x, jet.y) / Math.max(1, mSpeed));
      const js = jetCurrentSpeed() * tgo * RADAR_LEAD;
      tx += Math.cos(jet.heading) * js;
      ty += Math.sin(jet.heading) * js;
    }
    if (m.decoyId) {
      const f = flarePool.active.find((fl) => fl.id === m.decoyId);
      if (f) {
        tx = f.x; ty = f.y;
        if (dist(m.x, m.y, f.x, f.y) < FLARE_PROXIMITY) {
          destroyMissile(m, playing);
          continue;
        }
      } else {
        m.decoyId = null;
        m.lostLock = MISSILE_LOST_LOCK_TIME;
      }
    }
    if (m.lostLock > 0) {
      // Flare burned out: the seeker has nothing hot to follow and the missile self-destructs.
      steer = false;
      m.lostLock -= dt;
      if (m.lostLock <= 0) {
        destroyMissile(m, playing);
        continue;
      }
    }

    // After the jet is down, missiles coast straight instead of circling the wreck.
    if (steer && (playing || m.decoyId)) {
      const desired = Math.atan2(ty - m.y, tx - m.x);
      const diff = angleDiff(m.heading, desired);
      const maxTurn = (m.kind === 'radar' ? RADAR_TURN_RATE : MISSILE_TURN_RATE) * dt * missileTimeScale;
      m.heading += clamp(diff, -maxTurn, maxTurn);
    }
    m.x += Math.cos(m.heading) * mSpeed * dt;
    m.y += Math.sin(m.heading) * mSpeed * dt;

    // The smoke trail only comes from a burning motor.
    if (!coasting) {
      m.trail.push({ x: m.x, y: m.y, t: 0 });
      if (Math.random() < 0.35) {
        const back = m.kind === 'radar' ? 16 : 13;
        particlePool.spawn(
          m.x - Math.cos(m.heading) * back, m.y - Math.sin(m.heading) * back,
          rand(-20, 20), rand(-20, 20), 0.22, rand(1, 2),
          Math.random() < 0.5 ? '#FFE47A' : COLORS.orange, 'dot',
        );
      }
    }
    if (m.trail.length > 80) m.trail.shift();
  }
  for (const m of missilePool.active) {
    for (const pt of m.trail) pt.t += dt;
    while (m.trail.length && m.trail[0].t > 2.5) m.trail.shift();
  }

  // Missile approach warning: the closest missile still chasing the jet drives the
  // cockpit beeps and the red edge glow.
  let nearest = null, nearestRadar = false;
  if (playing) {
    for (const m of missilePool.active) {
      if (m.decoyId || m.lostLock > 0) continue;
      const d = dist(m.x, m.y, jet.x, jet.y);
      if (nearest === null || d < nearest) { nearest = d; nearestRadar = m.kind === 'radar'; }
    }
  }
  Audio_.warning(nearest, nearestRadar, dt);
  const dangerTarget = nearest === null ? 0 : clamp(1 - nearest / WARN_RANGE, 0, 1);
  Game.danger = lerp(Game.danger, dangerTarget, Math.min(1, dt * 6));

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
          Audio_.shieldHit();
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
        Audio_.closeCall(m.x, m.y);
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
        Audio_.boom(mx, my);
        addShake(mx, my, 0.45);
        if (playing) {
          Game.missilesDown += 2;
          addScore(SCORE_MISSILE_DOWN * 2, `2 missiles down +${SCORE_MISSILE_DOWN * 2}`, mx, my - 20, COLORS.white);
        }
        break;
      }
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
      } else if (dist(s.x, s.y, jet.x, jet.y) > BULLET_DESPAWN_DIST * viewReach()) {
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
        spawnFloatingText(c.x, c.y - 20, '+Fuel', COLORS.fuelFull);
        spawnBurst(c.x, c.y, COLORS.fuelFull, 12, 40, 120, 0.5);
        Audio_.refuel();
      } else if (dist(c.x, c.y, jet.x, jet.y) > FUEL_CAN_DESPAWN_DIST * viewReach()) {
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
    Game.overT += dt;
  }
}

/* ------------------------------ 16. RENDER ------------------------------------ */

function worldToScreen(x, y) {
  return { sx: (x - camera.x) + VIEW_W / 2, sy: (y - camera.y) + VIEW_H / 2 };
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
  const g = ctx2d.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(1, COLORS.skyBottom);
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawStarfieldLayer(parallax, cellSize, density, seedOffset) {
  const px = camera.x * parallax;
  const py = camera.y * parallax;
  const startCol = Math.floor((px - VIEW_W) / cellSize);
  const endCol = Math.floor((px + VIEW_W) / cellSize);
  const startRow = Math.floor((py - VIEW_H) / cellSize);
  const endRow = Math.floor((py + VIEW_H) / cellSize);
  const now = performance.now();
  for (let cx = startCol; cx <= endCol; cx++) {
    for (let cy = startRow; cy <= endRow; cy++) {
      if (bgHash(cx, cy, seedOffset) > density) continue;
      const jx = bgHash(cx, cy, seedOffset + 1) * cellSize;
      const jy = bgHash(cx, cy, seedOffset + 2) * cellSize;
      const sx = cx * cellSize + jx - px + VIEW_W / 2;
      const sy = cy * cellSize + jy - py + VIEW_H / 2;
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
  const startCol = Math.floor((px - VIEW_W) / cellSize);
  const endCol = Math.floor((px + VIEW_W) / cellSize);
  const startRow = Math.floor((py - VIEW_H) / cellSize);
  const endRow = Math.floor((py + VIEW_H) / cellSize);
  for (let cx = startCol; cx <= endCol; cx++) {
    for (let cy = startRow; cy <= endRow; cy++) {
      if (bgHash(cx, cy, seedOffset) > density) continue;
      const jx = bgHash(cx, cy, seedOffset + 1) * cellSize;
      const jy = bgHash(cx, cy, seedOffset + 2) * cellSize;
      const sx = cx * cellSize + jx - px + VIEW_W / 2;
      const sy = cy * cellSize + jy - py + VIEW_H / 2;
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

// Rocket-motor smoke: each segment fades and spreads as it ages.
function drawMissileTrail(m) {
  const tr = m.trail;
  if (tr.length < 2) return;
  ctx2d.save();
  ctx2d.lineCap = 'round';
  let prev = worldToScreen(tr[0].x, tr[0].y);
  for (let i = 1; i < tr.length; i++) {
    const cur = worldToScreen(tr[i].x, tr[i].y);
    const life = 1 - tr[i].t / 2.5;
    if (life > 0) {
      ctx2d.strokeStyle = `rgba(214,221,232,${0.4 * life})`;
      ctx2d.lineWidth = 2 + (1 - life) * 5;
      ctx2d.beginPath();
      ctx2d.moveTo(prev.sx, prev.sy);
      ctx2d.lineTo(cur.sx, cur.sy);
      ctx2d.stroke();
    }
    prev = cur;
  }
  ctx2d.restore();
}

// Flickering exhaust plume at the nozzle (local space, nose toward -y).
function drawExhaustFlame(y, w) {
  const f = 0.75 + Math.random() * 0.5;
  const len = 9 * f + 3;
  ctx2d.save();
  ctx2d.globalCompositeOperation = 'lighter';
  const glow = ctx2d.createRadialGradient(0, y + 2, 0, 0, y + 2, 9 * f);
  glow.addColorStop(0, 'rgba(255,170,60,0.55)');
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx2d.fillStyle = glow;
  ctx2d.beginPath();
  ctx2d.arc(0, y + 2, 9 * f, 0, Math.PI * 2);
  ctx2d.fill();
  const cone = ctx2d.createLinearGradient(0, y, 0, y + len);
  cone.addColorStop(0, 'rgba(255,205,95,0.95)');
  cone.addColorStop(0.5, 'rgba(255,110,30,0.75)');
  cone.addColorStop(1, 'rgba(255,60,20,0)');
  ctx2d.fillStyle = cone;
  ctx2d.beginPath();
  ctx2d.moveTo(-w, y);
  ctx2d.quadraticCurveTo(-w * 0.9, y + len * 0.5, 0, y + len);
  ctx2d.quadraticCurveTo(w * 0.9, y + len * 0.5, w, y);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.fillStyle = 'rgba(255,250,220,0.95)';
  ctx2d.beginPath();
  ctx2d.moveTo(-w * 0.45, y);
  ctx2d.lineTo(0, y + len * 0.5);
  ctx2d.lineTo(w * 0.45, y);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function finPair(x0, y0, x1, y1, x2, y2) {
  for (const s of [-1, 1]) {
    ctx2d.beginPath();
    ctx2d.moveTo(x0 * s, y0);
    ctx2d.lineTo(x1 * s, y1);
    ctx2d.lineTo(x2 * s, y2);
    ctx2d.closePath();
    ctx2d.fill();
  }
}

// Sidewinder-style heat seeker: slim grey body, glass seeker dome, nose canards, tail fins.
// Returns the nozzle's y in local space.
function drawIrMissileBody() {
  ctx2d.fillStyle = '#8E969F';
  finPair(1.6, 6, 5.5, 11, 1.6, 11);
  finPair(1.6, -7, 4, -4.8, 1.6, -4.4);
  ctx2d.fillStyle = '#C9CED6';
  roundRect(-1.7, -8, 3.4, 19, 1.2);
  ctx2d.fill();
  ctx2d.fillStyle = 'rgba(0,0,0,0.18)';
  ctx2d.fillRect(0.4, -8, 1.3, 19);
  ctx2d.fillStyle = '#E8B83A';
  ctx2d.fillRect(-1.7, -5.6, 3.4, 1.1);
  ctx2d.fillStyle = '#2E4A66';
  ctx2d.beginPath();
  ctx2d.arc(0, -8, 1.7, Math.PI, 0);
  ctx2d.fill();
  ctx2d.fillStyle = 'rgba(200,230,255,0.85)';
  ctx2d.beginPath();
  ctx2d.arc(-0.5, -8.7, 0.55, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.fillStyle = '#3A3F45';
  ctx2d.fillRect(-1.2, 11, 2.4, 1.2);
  return 12.2;
}

// AMRAAM-style radar missile: longer white body, pointed radome, mid-body wings, tail fins.
function drawRadarMissileBody() {
  ctx2d.fillStyle = '#9AA3AC';
  finPair(2, 8, 6.5, 13.5, 2, 13.5);
  finPair(2, -2, 5, 3, 2, 3.5);
  ctx2d.fillStyle = '#E9EDF1';
  roundRect(-2, -8, 4, 21.5, 1.4);
  ctx2d.fill();
  ctx2d.fillStyle = 'rgba(0,0,0,0.16)';
  ctx2d.fillRect(0.5, -8, 1.5, 21.5);
  ctx2d.fillStyle = '#7D8791';
  ctx2d.fillRect(-2, 4.5, 4, 1.2);
  ctx2d.fillStyle = '#F3EFE4';
  ctx2d.beginPath();
  ctx2d.moveTo(-2, -8);
  ctx2d.quadraticCurveTo(-1.8, -13, 0, -15.5);
  ctx2d.quadraticCurveTo(1.8, -13, 2, -8);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.fillStyle = '#3A3F45';
  ctx2d.fillRect(-1.4, 13.5, 2.8, 1.2);
  return 14.7;
}

function drawMissile(m) {
  drawMissileTrail(m);
  const { sx, sy } = worldToScreen(m.x, m.y);
  ctx2d.save();
  ctx2d.translate(sx, sy);
  ctx2d.rotate(m.heading + Math.PI / 2);
  const radar = m.kind === 'radar';
  const nozzleY = radar ? drawRadarMissileBody() : drawIrMissileBody();
  if (m.age <= m.burnTime) drawExhaustFlame(nozzleY, radar ? 2.2 : 1.9);
  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'red';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, MISSILE_RADIUS, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// A burning decoy flare: flickering white-hot core inside a warm glow that
// fades in its last half-second. Its smoke trail comes from particles.
function drawFlare(f) {
  const { sx, sy } = worldToScreen(f.x, f.y);
  const fade = clamp((FLARE_BURN_TIME - f.age) / 0.5, 0, 1);
  const flicker = 0.8 + Math.random() * 0.35;
  const r = 16 * flicker * fade + 2;
  ctx2d.save();
  ctx2d.globalCompositeOperation = 'lighter';
  const g = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, `rgba(255,255,240,${0.95 * fade})`);
  g.addColorStop(0.25, `rgba(255,214,110,${0.7 * fade})`);
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx2d.fillStyle = g;
  ctx2d.beginPath();
  ctx2d.arc(sx, sy, r, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
  if (Game.debug) {
    ctx2d.strokeStyle = 'yellow';
    ctx2d.beginPath();
    ctx2d.arc(sx, sy, FLARE_PROXIMITY, 0, Math.PI * 2);
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
  { id: 'pause', x: 0, y: 40, r: 21 },
  { id: 'music', x: 0, y: 40, r: 21 },
  { id: 'sound', x: 0, y: 40, r: 21 },
];

const powerupButtons = ['boost', 'flares', 'shield', 'slowmo', 'emp'].map((id) => ({ id, x: 0, y: 0, r: 26 }));

// Anchors the HUD to the current view's edges; called on every resize.
function layoutHud() {
  hudButtons[0].x = VIEW_W - 30 - 92;
  hudButtons[1].x = VIEW_W - 30 - 46;
  hudButtons[2].x = VIEW_W - 30;
  const spacing = 68;
  const startX = VIEW_W / 2 - spacing * (powerupButtons.length - 1) / 2;
  powerupButtons.forEach((b, i) => { b.x = startX + i * spacing; b.y = VIEW_H - 66; });
}

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
  Platform.saveData(save);
  Audio_.setSuspended(true);
});

// Leaving the tab mid-run pauses the game instead of letting the jet crash unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (Game.state === 'playing') {
      Game.state = 'paused';
      Game.pauseSource = 'user';
    }
    Platform.saveData(save);
  }
  Audio_.setSuspended(document.hidden || Game.state === 'paused');
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
    ctx2d.fillStyle = m.kind === 'radar' ? '#FFC23D' : '#E4453A';
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

// A clear red diagonal slash over a HUD icon so "muted" is unmistakable at
// a glance, not just a subtle dimming.
function drawMuteSlash(x, y, r) {
  ctx2d.save();
  ctx2d.strokeStyle = '#E4453A';
  ctx2d.lineWidth = 3;
  ctx2d.lineCap = 'round';
  ctx2d.beginPath();
  ctx2d.moveTo(x - r * 0.55, y - r * 0.55);
  ctx2d.lineTo(x + r * 0.55, y + r * 0.55);
  ctx2d.stroke();
  ctx2d.restore();
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
    if (!save.musicOn) drawMuteSlash(x, y, hudButtons[1].r);
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
    } else {
      drawMuteSlash(x, y, hudButtons[2].r);
    }
  });

  // wallet pill (below the three buttons, right aligned)
  const pillW = 64, pillH = 26;
  const px = VIEW_W - 30 - pillW / 2, py = 40 + 34;
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
    // "Angel wings": burning flares arcing out and down from a central drop point.
    ctx2d.save();
    ctx2d.translate(x, y - 6);
    const trailC = affordable ? 'rgba(235,238,245,0.75)' : COLORS.grey;
    const hotC = affordable ? '#FFE47A' : COLORS.grey;
    const coreC = affordable ? '#FFFFFF' : COLORS.grey;
    ctx2d.strokeStyle = trailC;
    ctx2d.lineWidth = 1.6;
    ctx2d.lineCap = 'round';
    const tips = [];
    for (const side of [-1, 1]) {
      for (const k of [0, 1, 2]) {
        const ex = side * (5 + k * 3.5), ey = 6 + k * 4;
        ctx2d.beginPath();
        ctx2d.moveTo(0, 0);
        ctx2d.quadraticCurveTo(side * (6 + k * 4), -2 + k, ex, ey);
        ctx2d.stroke();
        tips.push([ex, ey]);
      }
    }
    for (const [ex, ey] of tips) {
      ctx2d.fillStyle = hotC;
      ctx2d.beginPath(); ctx2d.arc(ex, ey, 2.6, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.fillStyle = coreC;
      ctx2d.beginPath(); ctx2d.arc(ex, ey, 1.2, 0, Math.PI * 2); ctx2d.fill();
    }
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
    // Time left on a running power-up, drawn as a draining ring.
    const left = { boost: jet.boostTimer / JET_BOOST_DURATION, shield: jet.shieldTimer / SHIELD_DURATION, slowmo: jet.slowmoTimer / SLOWMO_DURATION }[b.id];
    if (left > 0) {
      ctx2d.save();
      ctx2d.strokeStyle = COLORS.fuelFull;
      ctx2d.lineWidth = 3.5;
      ctx2d.lineCap = 'round';
      ctx2d.beginPath();
      ctx2d.arc(b.x, b.y, b.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx2d.stroke();
      ctx2d.restore();
    }
    const badgeX = b.x + b.r * 0.68, badgeY = b.y - b.r * 0.68;
    ctx2d.fillStyle = affordable ? COLORS.orange : COLORS.grey;
    roundRect(badgeX - 15, badgeY - 8, 30, 16, 8);
    ctx2d.fill();
    drawBulletIcon(badgeX - 7, badgeY, 10);
    drawUprightText(String(POWERUPS[b.id].cost), badgeX + 5, badgeY + 1, 11, COLORS.white, 'center', true);
    const label = Input.usedKeyboard ? `${powerupButtons.indexOf(b) + 1} · ${POWERUPS[b.id].label}` : POWERUPS[b.id].label;
    drawShadowedText(label, b.x, b.y + b.r + 12, 11, COLORS.white, 'rgba(5,11,31,0.6)', 1);
  }
}

// Edge arrows for missiles that are still off-screen, so threats never appear from nowhere.
function drawMissileIndicators() {
  const hw = VIEW_W / 2, hh = VIEW_H / 2, inset = 22;
  for (const m of missilePool.active) {
    const dx = m.x - camera.x, dy = m.y - camera.y;
    if (Math.abs(dx) < hw - 6 && Math.abs(dy) < hh - 6) continue;
    const d = Math.hypot(dx, dy);
    if (d > 1100) continue;
    const t = Math.min((hw - inset) / Math.max(1e-6, Math.abs(dx)), (hh - inset) / Math.max(1e-6, Math.abs(dy)));
    const x = hw + dx * t, y = hh + dy * t;
    const a = Math.atan2(dy, dx);
    ctx2d.save();
    ctx2d.globalAlpha *= clamp(1.25 - d / 900, 0.35, 1);
    ctx2d.translate(x, y);
    ctx2d.rotate(a);
    ctx2d.fillStyle = m.kind === 'radar' ? '#FFC23D' : '#FF5A4A';
    ctx2d.strokeStyle = 'rgba(5,11,31,0.6)';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(9, 0);
    ctx2d.lineTo(-6, -7);
    ctx2d.lineTo(-3, 0);
    ctx2d.lineTo(-6, 7);
    ctx2d.closePath();
    ctx2d.stroke();
    ctx2d.fill();
    ctx2d.restore();
  }
}

function drawChevrons() {
  if (Game.state !== 'playing') return;
  const y = VIEW_H * 0.6;
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
  ctx2d.moveTo(VIEW_W - 26, y - 14); ctx2d.lineTo(VIEW_W - 14, y); ctx2d.lineTo(VIEW_W - 26, y + 14);
  ctx2d.stroke();
  ctx2d.restore();
}

// "LEVEL N" pops in with a little overshoot, holds, then fades.
function drawLevelBanner() {
  if (Game.levelBanner <= 0 || Game.state !== 'playing') return;
  const shown = 2.4 - Game.levelBanner;
  const k = easeOutBack(clamp(shown / 0.35, 0, 1));
  const alpha = Math.min(1, Game.levelBanner / 0.5);
  const y = Math.max(140, VIEW_H * 0.3);
  ctx2d.save();
  ctx2d.globalAlpha *= alpha;
  ctx2d.translate(VIEW_W / 2, y);
  ctx2d.scale(k, k);
  drawShadowedText(`LEVEL ${Game.level}`, 0, 0, 34, '#FFD54A', 'rgba(5,11,31,0.7)', 2);
  drawShadowedText(Game.levelMsg, 0, 30, 14, COLORS.white, 'rgba(5,11,31,0.7)', 1.5);
  ctx2d.restore();
}

const hasFinePointer = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

function drawStartHint() {
  if (Game.startHintAlpha <= 0) return;
  ctx2d.save();
  ctx2d.globalAlpha = Game.startHintAlpha;
  drawShadowedText('Tap left / right to steer', VIEW_W / 2, VIEW_H * 0.4, 18, COLORS.white, 'rgba(18,48,58,0.4)', 2);
  if (hasFinePointer) {
    drawShadowedText('Keyboard: ← → to steer  ·  1-5 power-ups  ·  P pause', VIEW_W / 2, VIEW_H * 0.4 + 28, 13, 'rgba(255,255,255,0.85)', 'rgba(18,48,58,0.4)', 1);
  }
  ctx2d.restore();
}

const BUBBLE_R = 40;
const BUBBLE_TINTS = [
  [120, 200, 255], // sky blue
  [255, 150, 210], // pink
  [140, 240, 200], // mint
  [190, 165, 255], // lilac
];

function easeOutBack(t) {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// A see-through soap bubble: clear center, brighter Fresnel edge, a slowly
// turning thin-film rim, and highlights from a single top-left light.
function drawBubble(x, y, r, tint, spin) {
  const [tr, tg, tb] = tint;
  ctx2d.save();

  const glow = ctx2d.createRadialGradient(x, y, r * 0.85, x, y, r * 1.35);
  glow.addColorStop(0, `rgba(${tr},${tg},${tb},0.22)`);
  glow.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
  ctx2d.fillStyle = glow;
  ctx2d.beginPath();
  ctx2d.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx2d.fill();

  const body = ctx2d.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  body.addColorStop(0, 'rgba(255,255,255,0.16)');
  body.addColorStop(0.55, `rgba(${tr},${tg},${tb},0.07)`);
  body.addColorStop(0.85, `rgba(${tr},${tg},${tb},0.18)`);
  body.addColorStop(1, 'rgba(235,245,255,0.42)');
  ctx2d.fillStyle = body;
  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.fill();

  let rim;
  if (typeof ctx2d.createConicGradient === 'function') {
    rim = ctx2d.createConicGradient(spin, x, y);
    rim.addColorStop(0, 'rgba(255,156,230,0.85)');
    rim.addColorStop(0.25, 'rgba(143,243,255,0.85)');
    rim.addColorStop(0.5, 'rgba(255,243,160,0.8)');
    rim.addColorStop(0.75, 'rgba(184,166,255,0.85)');
    rim.addColorStop(1, 'rgba(255,156,230,0.85)');
  } else {
    rim = 'rgba(220,235,255,0.75)';
  }
  ctx2d.strokeStyle = rim;
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx2d.stroke();

  ctx2d.lineCap = 'round';
  ctx2d.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx2d.lineWidth = 3;
  ctx2d.beginPath();
  ctx2d.arc(x, y, r * 0.8, Math.PI * 1.08, Math.PI * 1.38);
  ctx2d.stroke();

  ctx2d.translate(x - r * 0.42, y - r * 0.45);
  ctx2d.rotate(-0.75);
  const spec = ctx2d.createRadialGradient(0, 0, 0, 0, 0, r * 0.22);
  spec.addColorStop(0, 'rgba(255,255,255,0.9)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx2d.fillStyle = spec;
  ctx2d.scale(1, 0.5);
  ctx2d.beginPath();
  ctx2d.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();

  ctx2d.fillStyle = 'rgba(255,255,255,0.7)';
  ctx2d.beginPath();
  ctx2d.arc(x + r * 0.32, y + r * 0.74, r * 0.055, 0, Math.PI * 2);
  ctx2d.fill();
}

function drawFittedText(text, x, y, size, maxW, color) {
  ctx2d.font = `bold ${size}px "Skyline Rounded", "Arial Rounded MT Bold", sans-serif`;
  const w = ctx2d.measureText(text).width;
  const fitted = w > maxW ? Math.max(7, size * maxW / w) : size;
  ctx2d.save();
  ctx2d.shadowColor = 'rgba(5,11,31,0.75)';
  ctx2d.shadowBlur = 4;
  ctx2d.shadowOffsetY = 1;
  drawUprightText(text, x, y, fitted, color, 'center', true);
  ctx2d.restore();
}

// Four stat bubbles that inflate one after another, then drift gently.
function drawStatBubbles(cx, y) {
  const stats = [
    { value: String(save.bullets), label: 'bullets', gem: true },
    { value: String(Game.missilesDown), label: 'missiles down' },
    { value: String(Game.closeCalls), label: 'close calls' },
    { value: `${Math.floor(Game.elapsed)}s`, label: 'airborne' },
  ];
  const spacing = Math.min(BUBBLE_R * 2 + 14, (VIEW_W - 24 - BUBBLE_R * 2) / (stats.length - 1));
  const startX = cx - spacing * (stats.length - 1) / 2;
  const now = performance.now() / 1000;
  stats.forEach((s, i) => {
    const t = clamp((Game.overT - 0.25 - i * 0.12) / 0.45, 0, 1);
    if (t <= 0) return;
    const k = easeOutBack(t);
    const bx = startX + i * spacing;
    const by = y + Math.sin(now * 1.6 + i * 1.3) * 3 * t;
    ctx2d.save();
    ctx2d.globalAlpha *= Math.min(1, t * 1.6);
    ctx2d.translate(bx, by);
    ctx2d.scale(k, k);
    drawBubble(0, 0, BUBBLE_R, BUBBLE_TINTS[i % BUBBLE_TINTS.length], now * 0.6 + i);
    if (s.gem) drawBulletIcon(0, -BUBBLE_R * 0.47, 8);
    drawFittedText(s.value, 0, s.gem ? 0 : -4, 22, BUBBLE_R * 1.4, COLORS.white);
    drawFittedText(s.label, 0, BUBBLE_R * 0.42, 10, BUBBLE_R * 1.5, 'rgba(235,243,255,0.95)');
    ctx2d.restore();
  });
}

function drawGameOverScreen() {
  const cx = VIEW_W / 2;
  // Dim the still-flying missiles so the see-through bubbles and text stay readable.
  const scrim = ctx2d.createRadialGradient(cx, VIEW_H / 2, 0, cx, VIEW_H / 2, Math.max(VIEW_W, VIEW_H) * 0.7);
  scrim.addColorStop(0, `rgba(5,11,31,${0.55 * Math.min(1, Game.overT / 0.4)})`);
  scrim.addColorStop(1, `rgba(5,11,31,${0.3 * Math.min(1, Game.overT / 0.4)})`);
  ctx2d.fillStyle = scrim;
  ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);

  // The block is ~310 units tall; center it when the view is short (landscape).
  let y = Math.min(VIEW_H * 0.28, VIEW_H / 2 - 150);
  const title = Game.deathReason === 'fuel' ? 'Out of fuel' : 'Shot down';
  drawShadowedText(title, cx, y, 24, COLORS.white, 'rgba(5,11,31,0.6)', 1.5);
  y += 70;
  drawShadowedText(String(Game.finalScore), cx, y, 72, COLORS.white, 'rgba(18,48,58,0.35)', 4);
  y += 88;
  drawStatBubbles(cx, y);
  y += 70;
  if (Game.newRecord) {
    drawUprightText(`New best score  ·  Level ${Game.level}`, cx, y, 15, COLORS.orange, 'center', true);
  } else {
    drawUprightText(`Best ${save.bestScore}  ·  Level ${Game.level}`, cx, y, 15, COLORS.white, 'center', true);
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
  const cx = VIEW_W / 2, cy = VIEW_H / 2;
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
  ctx2d.fillText(`FPS ${Game.fps}`, 6, VIEW_H - 8);
  ctx2d.fillText(`missiles ${missilePool.active.length}/${missileCap}`, 6, VIEW_H - 22);
  ctx2d.fillText(`particles ${particlePool.active.length}`, 6, VIEW_H - 36);
  ctx2d.fillText(`bullets ${save.bullets} | fuel ${Math.round(jet.fuel)} (press G for +20/full)`, 6, VIEW_H - 50);
  ctx2d.restore();
}

function render() {
  ctx2d.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
  ctx2d.clearRect(0, 0, VIEW_W, VIEW_H);

  drawSkyGradient();
  ctx2d.save();
  if (Game.shake > 0) {
    const s = Game.shake * Game.shake * 7;
    ctx2d.translate(rand(-s, s), rand(-s, s));
  }
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
  drawJet();
  drawParticles();
  for (const f of flarePool.active) drawFlare(f);
  ctx2d.restore();

  if (Game.danger > 0.02 && Game.state === 'playing') {
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 90);
    const g = ctx2d.createRadialGradient(VIEW_W / 2, VIEW_H / 2, Math.min(VIEW_W, VIEW_H) * 0.35, VIEW_W / 2, VIEW_H / 2, Math.hypot(VIEW_W, VIEW_H) / 2);
    g.addColorStop(0, 'rgba(228,69,58,0)');
    g.addColorStop(1, `rgba(228,69,58,${0.32 * Game.danger * pulse})`);
    ctx2d.fillStyle = g;
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (jet.flareFlash > 0) {
    ctx2d.fillStyle = `rgba(255,138,45,${jet.flareFlash * 0.45})`;
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (jet.slowmoTimer > 0) {
    ctx2d.fillStyle = 'rgba(62,143,208,0.15)';
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (Game.deathFlash > 0) {
    ctx2d.fillStyle = `rgba(255,255,255,${Game.deathFlash * 0.35})`;
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Upright HUD pass
  ctx2d.save();
  ctx2d.globalAlpha = Game.hudAlpha;
  if (Game.state === 'playing' || Game.state === 'paused') {
    drawMissileIndicators();
    drawRadar();
    drawShadowedText(String(Math.floor(Game.displayScore)), VIEW_W / 2, 46, 30 * Game.scoreScale, COLORS.white, 'rgba(18,48,58,0.35)', 2);
    drawFuelGauge(VIEW_W / 2, 70, 140, 16);
    drawShadowedText(`LEVEL ${Game.level}`, VIEW_W / 2, 94, 12, 'rgba(255,255,255,0.9)', 'rgba(5,11,31,0.6)', 1);
    drawHudButtons();
    drawPowerupBar();
    drawChevrons();
    drawLevelBanner();
  }
  ctx2d.restore();

  if (Game.state === 'hint') {
    drawRadar();
    drawShadowedText('0', VIEW_W / 2, 46, 30, COLORS.white, 'rgba(18,48,58,0.35)', 2);
    drawFuelGauge(VIEW_W / 2, 70, 140, 16);
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
  Audio_.setSuspended(document.hidden || Game.state === 'paused');
  update(dt);
  render();
  requestAnimationFrame(frame);
}

async function boot() {
  resize();
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
