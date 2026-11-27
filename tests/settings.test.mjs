// Drives window.wallpaperPropertyListener, the animation frame and the click
// listener of main.js in a node:vm sandbox, and checks that every setting is
// applied, not only read: speed, colors, health bars, Reduce motion, count,
// mode, teams, pause, the frame-rate limit and click-to-start sound (issue #65).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));

// An audio node whose unknown properties are AudioParams.
const param = v => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; } });
function node(extra = {}) {
  const base = { connect: n => n, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}
// A browser starts a context made before any click suspended.
class SuspendedAudioContext {
  static instances = [];
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 48000; this.destination = node(); SuspendedAudioContext.instances.push(this); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createDynamicsCompressor() { return node(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node(); }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node(); }
  createStereoPanner() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

// Loads the wallpaper. The canvas context records each fillRect with its fill
// style and alpha, and each setTransform; the window records its listeners.
function load(query = '?count=2') {
  const calls = [];
  const state = { fillStyle: '', globalAlpha: 1 };
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'fillRect' ? (...a) => calls.push({ op: 'fillRect', a, fill: state.fillStyle, alpha: state.globalAlpha })
      : k === 'setTransform' ? (...a) => calls.push({ op: 'setTransform', a })
      : k in state ? state[k] : stub,
    set: (_, k, v) => { if (k in state) state[k] = v; return true; },
  });
  const listeners = {};
  let next = null;
  const body = { style: {} };
  const { window } = loadMain({
    search: query, ctx, document: { body }, random: null,
    window: { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; },
      Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN, Float32Array, Promise },
  });
  return {
    game: window.__stickmanBrawl, we: window.wallpaperPropertyListener, window, body, calls, listeners,
    frame: now => next(now),
  };
}
const send = (we, key, value) => we.applyUserProperties({ [key]: { value } });

// For each setting: a value other than the default, and the cfg it must give.
const weColor = v => 'rgb(' + v.split(' ').map(c => Math.round(+c * 255)).join(',') + ')';
const STYLES = ['boxing', 'muaythai', 'taekwondo', 'judo', 'wrestling', 'super', 'magic', 'ninjutsu'];
const EXPECT = {
  fightercount: [9, (g, v) => assert.equal(g.cfg.count, v)],
  gamemode: ['teams', (g, v) => assert.equal(g.cfg.mode, v)],
  gamespeed: [250, (g, v) => assert.equal(g.cfg.speed, v / 100)],
  figurescale: [150, (g, v) => assert.equal(g.cfg.scale, v / 100)],
  showhealth: [false, (g, v) => assert.equal(g.cfg.showHP, v)],
  showscore: [true, (g, v) => assert.equal(g.cfg.showScore, v)],
  // cfg.names comes from the sandbox's realm, so compare it as JSON
  fighternames: ['Ann, Bo', (g, v) => assert.equal(JSON.stringify(g.cfg.names), JSON.stringify(v.split(',').map(s => s.trim())))],
  headgear: [true, (g, v) => assert.equal(g.cfg.headgear, v)],
  colorful: [false, (g, v) => assert.equal(g.cfg.colorful, v)],
  reducemotion: [false, (g, v) => assert.equal(g.cfg.reduceMotion, v)],
  soundeffects: [true, (g, v) => assert.equal(g.cfg.sound, v)],
  soundvolume: [0, (g, v) => assert.equal(g.cfg.volume, v / 100)],
  backgroundcolor: ['1 0 0.5', (g, v, l) => { assert.equal(g.cfg.bg, weColor(v)); assert.equal(l.body.style.background, weColor(v)); }],
  linecolor: ['0.2 0.4 0.6', (g, v) => assert.equal(g.cfg.line, weColor(v))],
  platforms: [true, (g, v) => assert.equal(g.cfg.platforms, v)],
  items: [true, (g, v) => assert.equal(g.cfg.items, v)],
  roundrules: ['king', (g, v) => assert.equal(g.cfg.rules, v)],
  clickblast: [true, (g, v) => assert.equal(g.cfg.clickBlast, v)],
  audioreactive: [true, (g, v) => assert.equal(g.cfg.audio, v)],
  audiostrength: [20, (g, v) => assert.equal(g.cfg.audioStrength, v / 100)],
  slowmofinish: [true, (g, v) => assert.equal(g.cfg.slowmo, v)],
  backgroundtheme: ['dojo', (g, v) => assert.equal(g.cfg.bgTheme, v)],
  ...Object.fromEntries(STYLES.map(s => ['style' + s, [false, (g, v) => assert.equal(g.cfg.styles[s], v)]])),
};

test('every project.json setting has an expected value in this test', () => {
  assert.deepEqual(Object.keys(project.general.properties).sort(), Object.keys(EXPECT).sort());
});

for (const [key, prop] of Object.entries(project.general.properties)) {
  test(key + ', sent with a changed value and then its default, sets cfg to match', () => {
    const l = load();
    const [changed, check] = EXPECT[key];
    assert.notDeepEqual(changed, prop.value);
    for (const v of [changed, prop.value]) {
      send(l.we, key, v);
      check(l.game, v, l);
    }
  });
}

test('the panel colors convert from Wallpaper Engine format', () => {
  const l = load();
  send(l.we, 'backgroundcolor', '0.067 0.075 0.094');
  assert.equal(l.game.cfg.bg, 'rgb(17,19,24)');
  send(l.we, 'linecolor', '0.925 0.925 0.925');
  assert.equal(l.game.cfg.line, 'rgb(236,236,236)');
});

test('the frame-rate limit can be set and set back to 0', () => {
  const { game, we } = load();
  we.applyGeneralProperties({ fps: 30 });
  assert.equal(game.cfg.fps, 30);
  we.applyGeneralProperties({ fps: 0 });
  assert.equal(game.cfg.fps, 0);
});

test('Reduce motion follows the query string too', () => {
  assert.equal(load('?reducemotion=0').game.cfg.reduceMotion, false);
  assert.equal(load('?reducemotion=off').game.cfg.reduceMotion, false);
  assert.equal(load('?reducemotion=1').game.cfg.reduceMotion, true);
});

test('a count change starts a new round with that many fighters at once', () => {
  const { game, we } = load();
  for (const n of [9, 2, 16]) {
    const before = game.fighters;
    send(we, 'fightercount', n);
    assert.notEqual(game.fighters, before);
    assert.equal(game.fighters.length, n);
  }
});

test('a mode change starts a new round in that mode at once', () => {
  const { game, we } = load('?count=6');
  let before = game.fighters;
  send(we, 'gamemode', 'teams');
  assert.notEqual(game.fighters, before);
  assert.equal(game.fighters.map(f => f.team).join(), '0,1,0,1,0,1');
  before = game.fighters;
  send(we, 'gamemode', 'ffa');
  assert.notEqual(game.fighters, before);
  assert.equal(game.fighters.map(f => f.team).join(), '0,0,0,0,0,0');
});

test('in teams mode nobody targets a teammate', () => {
  const { game, we } = load('?count=8');
  send(we, 'gamemode', 'teams');
  // Spread everyone at random each time, so a teammate is often the nearest fighter
  for (let i = 0; i < 400; i++) {
    for (const f of game.fighters) { f.x = 30 + Math.random() * 900; f.z = Math.random() * 120; }
    for (const f of game.fighters) {
      const t = game.pickTarget(f);
      assert.ok(t, 'no target');
      assert.notEqual(t.team, f.team, 'fighter ' + f.id + ' targets teammate ' + t.id);
    }
  }
});

// Holds every fighter in a long flinch, so nobody moves or attacks.
function hold(game) {
  for (const f of game.fighters) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0, vx: 0 });
}
// Fires a slow blast from owner at the middle of target's body and runs one step.
function shoot(game, owner, target) {
  hold(game);
  target.W = target.joints();
  const c = { x: (target.W.hip.x + target.W.sh.x) / 2, y: (target.W.hip.y + target.W.sh.y) / 2 };
  game.shots.push({ x: c.x - 3, y: c.y, vx: 60, vy: 0, z: target.z, owner, m: game.MOVES[0], life: 3, col: '#fff', dmg: 10 });
  const hp = target.hp;
  game.update(1 / 60);
  return hp - target.hp;
}

test('in teams mode a shot does not hurt a teammate, and does hurt an opponent', () => {
  for (let i = 0; i < 20; i++) {
    const { game, we } = load('?count=4');
    send(we, 'gamemode', 'teams');
    const [red, blue, red2] = game.fighters;
    assert.equal(red2.team, red.team);
    assert.equal(shoot(game, red, red2), 0, 'a red shot hurt a red fighter');
    assert.ok(shoot(game, blue, red2) > 0, 'a blue shot missed a red fighter');
  }
});

// Runs render with a full-screen flash and a screen shake waiting, and returns
// whether a white full-screen fillRect was drawn and whether the view was shaken.
// At 1280 x 720 and 100% figure size the world is 960 x 540 units.
const covers = ([x, y, w, h]) => x <= 0 && y <= 0 && x + w >= 960 && y + h >= 540;
function renderWithFlashAndShake(reduce) {
  const { game, we, calls } = load('?count=2');
  send(we, 'reducemotion', reduce);
  const [a, e] = game.fighters;
  e.W = e.joints(); e.state = 'idle'; e.hp = 1000;
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', { x: 100, y: 100 }, { dmg: 1, big: true });
  game.fx.push({ type: 'flash', dur: 0.15, t: 0 });
  calls.length = 0;
  game.render();
  const white = calls.some(c => c.op === 'fillRect' && c.fill === '#ffffff' && c.alpha > 0 && covers(c.a));
  const shaken = calls.some(c => c.op === 'setTransform' && (c.a[4] !== 0 || c.a[5] !== 0));
  return { white, shaken };
}

test('with Reduce motion on, render draws no white flash and does not shake', () => {
  for (let i = 0; i < 20; i++) assert.deepEqual(renderWithFlashAndShake(true), { white: false, shaken: false });
  // The same scene with Reduce motion off flashes and shakes, so the check above is not empty
  assert.deepEqual(renderWithFlashAndShake(false), { white: true, shaken: true });
});

test('while paused, frames do not move the fight on', () => {
  const { game, we, frame } = load('?count=2');
  frame(16);
  we.setPaused(true);
  const f = game.fighters[0], t0 = f.time;
  for (let i = 2; i < 120; i++) { hold(game); frame(i * 16); }
  assert.equal(f.time, t0);
  we.setPaused(false);
  for (let i = 120; i < 130; i++) { hold(game); frame(i * 16); }
  assert.ok(f.time > t0, 'unpausing did not resume the fight');
});

// Loads with sound on and a suspended context made by a first sound.
function suspendedSound() {
  const l = load('?count=2&sound=1');
  SuspendedAudioContext.instances = [];
  l.window.AudioContext = SuspendedAudioContext;
  l.game.sfx('hit', 100);
  const ac = SuspendedAudioContext.instances[0];
  assert.ok(ac, 'no context made');
  assert.equal(ac.state, 'suspended');
  const click = () => { assert.ok(l.listeners.pointerdown?.length, 'no pointerdown listener'); for (const fn of l.listeners.pointerdown) fn({}); };
  return { ...l, ac, click };
}

test('a click resumes a suspended sound context', () => {
  const { ac, click } = suspendedSound();
  click();
  assert.equal(ac.state, 'running');
});

test('a click does not resume sound that is off', () => {
  const { game, ac, click } = suspendedSound();
  game.cfg.sound = false;
  click();
  assert.equal(ac.state, 'suspended');
});

test('a click does not resume sound while the wallpaper is paused', () => {
  const { we, ac, click } = suspendedSound();
  we.setPaused(true);
  click();
  assert.equal(ac.state, 'suspended');
});
