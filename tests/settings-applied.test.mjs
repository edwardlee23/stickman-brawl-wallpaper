// Checks that each setting below changes what the wallpaper does, not only cfg
// (issue #130): every test here fails under one of the mutations listed in that
// issue, so a setting cannot silently stop working while CI stays green.
// Math.random is a seeded generator and the clock is set by hand, so every run
// is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
// A copy of main.js that adds up, in window.__sim, the game time each frame simulates
const SIM_ANCHOR = 'const n = clamp(Math.ceil(sim / SUBSTEP';
assert.ok(source.includes(SIM_ANCHOR), 'the frame loop changed; update SIM_ANCHOR');
const counted = source.replace(SIM_ANCHOR, 'window.__sim += sim; ' + SIM_ANCHOR);

// Loads the wallpaper. The screen context records fillRect (with fill style and alpha),
// stroke (with stroke style) and setTransform; offscreen canvases can be made; the clock
// is clock.now; audio listeners and window listeners are kept.
function load(query = '?count=2') {
  const calls = [];
  const state = { fillStyle: '', strokeStyle: '', globalAlpha: 1 };
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'fillRect' ? (...a) => calls.push({ op: 'fillRect', a, fill: state.fillStyle, alpha: state.globalAlpha })
      : k === 'stroke' ? () => calls.push({ op: 'stroke', stroke: state.strokeStyle })
      : k === 'setTransform' ? (...a) => calls.push({ op: 'setTransform', a })
      : k in state ? state[k] : stub,
    set: (_, k, v) => { if (k in state) state[k] = v; return true; },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  const offscreen = () => ({ getContext: () => stub, style: {}, width: 0, height: 0 });
  const listeners = {}, audio = [], clock = { now: 0 };
  let seed = 12345;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let next = null;
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    wallpaperRegisterAudioListener: cb => audio.push(cb),
  };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, createElement: offscreen, body: { style: {} } },
    location: { search: query },
    URLSearchParams,
    performance: { now: () => clock.now },
    requestAnimationFrame: cb => { next = cb; },
    Math: math, __sim: 0, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN, Float32Array, Promise,
  });
  vm.runInNewContext(counted, window);
  const game = window.__stickmanBrawl;
  const set = p => window.wallpaperPropertyListener.applyUserProperties(
    Object.fromEntries(Object.entries(p).map(([k, value]) => [k, { value }])));
  // Runs one animation frame at clock.now + ms and returns the game time it simulated
  const frame = (ms = 1000 / 60) => { const s0 = window.__sim; clock.now += ms; next(clock.now); return window.__sim - s0; };
  return { game, set, window, calls, listeners, audio, clock, frame };
}

// Holds every standing fighter in a long flinch, so nobody moves, attacks or causes a hit stop
function hold(game) {
  for (const f of game.fighters) if (f.alive) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0, vx: 0 });
}
// Renders one picture and returns the canvas calls it made
function draw(w) {
  w.calls.length = 0;
  w.game.render();
  return w.calls.slice();
}

// ---------- Figure size, health bars, colors ----------

test('Figure size moves the floor at once, without a resize event', () => {
  const w = load();
  const before = w.game.groundY(0);
  w.set({ figurescale: 150 });
  assert.notEqual(w.game.groundY(0), before);
  // A larger figure means fewer world units on screen, so the floor is higher in world units
  assert.ok(w.game.groundY(0) < before, `floor at ${w.game.groundY(0)}, was ${before}`);
});

const isBar = c => c.op === 'fillRect' && c.a[2] === 26 && c.a[3] === 2.5;

test('Health bars off draws no bar; on draws one per fighter', () => {
  const w = load();
  w.frame();
  w.set({ showhealth: false });
  assert.equal(draw(w).filter(isBar).length, 0);
  w.set({ showhealth: true });
  assert.ok(draw(w).filter(isBar).length >= 2, 'no bars drawn with the setting on');
});

test('Unique colors off strokes no fighter in a hue of its own; on does', () => {
  const w = load('?count=4');
  w.frame();
  const hues = () => draw(w).filter(c => c.op === 'stroke' && String(c.stroke).startsWith('hsl(')).length;
  w.set({ colorful: false });
  assert.equal(hues(), 0);
  w.set({ colorful: true });
  assert.ok(hues() > 0, 'no hue drawn with the setting on');
});

test('Line color is the color the stick figures are stroked in', () => {
  const w = load();
  w.frame();
  w.set({ colorful: false, linecolor: '0.2 0.4 0.6' });
  const strokes = draw(w).filter(c => c.op === 'stroke');
  assert.ok(strokes.filter(c => c.stroke === 'rgb(51,102,153)').length >= 10, 'the figures are not in the line color');
  assert.equal(strokes.filter(c => c.stroke === '#ececec').length, 0, 'something is still stroked in the default line color');
});

test('Background color is the color the screen is cleared with', () => {
  const w = load();
  w.frame();
  w.set({ backgroundcolor: '1 0 0.5' });
  const clear = draw(w).find(c => c.op === 'fillRect' && c.a[0] === 0 && c.a[1] === 0 && c.a[2] === 1280 && c.a[3] === 720);
  assert.ok(clear, 'the screen was not cleared');
  assert.equal(clear.fill, 'rgb(255,0,128)');
});

// ---------- React to music ----------

// One Wallpaper Engine audio frame: 64 left bins then 64 right, low to high frequency
const audioFrame = (bass, rest = 0) => Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? bass : rest));
const feed = (w, a, n) => { for (let i = 0; i < n; i++) for (const cb of w.audio) cb(a); };
// Quiet, then a loud bass hit: a beat
const beat = w => { feed(w, audioFrame(0), 30); feed(w, audioFrame(0.9, 0.3), 1); };
// The wait a fighter takes after a move before it may start the next one
function delay(game) {
  const f = game.fighters[0];
  f.move = null; f.endMove();
  return f.cool;
}
function musicOn(strength = 100) {
  const w = load();
  w.window.Math.random = () => 0.5;   // the same next-move delay every time it is drawn
  w.set({ audioreactive: true, audiostrength: strength });
  return w;
}

test('Music strength scales the effect: 20% shortens move delays less than 100%', () => {
  const delays = [20, 100].map(s => {
    const w = musicOn(s);
    const base = delay(w.game);
    beat(w);
    return delay(w.game) / base;
  });
  assert.ok(delays[0] < 1, `20% left the delay at ${delays[0]} of base`);
  assert.ok(delays[0] > delays[1] + 0.1, `delay at 20%: ${delays[0]} of base, at 100%: ${delays[1]}`);
});

test('a beat never changes game speed', () => {
  const w = musicOn();
  w.frame(); hold(w.game);
  const calm = w.frame();
  beat(w); hold(w.game);
  assert.ok(w.game.music.beat > 0.5, 'no beat');
  const loud = w.frame();
  assert.ok(Math.abs(loud - calm) < 1e-9, `${loud} of game time on a beat, ${calm} without`);
});

test('a beat makes a waiting fighter count its delay down faster', () => {
  const w = musicOn();
  const f = w.game.fighters[0];
  const tick = () => { Object.assign(f, { state: 'idle', cool: 1 }); f.updIdle(0.01); return 1 - f.cool; };
  const calm = tick();
  beat(w);
  const loud = tick();
  assert.ok(loud > calm * 1.5, `delay counted down ${loud} on a beat, ${calm} without`);
});

test('no audio frames for over 3 s bring the music effect back to nothing', () => {
  const w = musicOn();
  const base = delay(w.game);
  beat(w);
  assert.ok(delay(w.game) < base * 0.9, 'the beat did not shorten the delay');
  w.clock.now += 2000;
  assert.ok(delay(w.game) < base * 0.9, 'the effect ended before 3 s');
  w.clock.now += 1500;
  assert.equal(delay(w.game), base);
  assert.equal(w.game.music.beat, 0);
});

test('a beat holds for a few audio frames before another can start', () => {
  const w = musicOn();
  feed(w, audioFrame(0), 30);
  feed(w, audioFrame(0.9), 1);
  assert.equal(w.game.music.beat, 1);
  feed(w, audioFrame(0.9), 1);
  assert.ok(w.game.music.beat < 1, 'a second beat started on the very next frame');
});

test('steady loud bass is not a beat: beats need bass above its running average', () => {
  const w = musicOn();
  feed(w, audioFrame(0.5), 300);
  assert.equal(w.game.music.beat, 0);
});

test('turning React to music off clears the beat and level', () => {
  const w = musicOn();
  beat(w);
  assert.ok(w.game.music.beat > 0 && w.game.music.level > 0);
  w.set({ audioreactive: false });
  assert.equal(w.game.music.beat, 0);
  assert.equal(w.game.music.level, 0);
});

// ---------- Slow-motion finish ----------

// Knocks out the second of two fighters with the finish on, and runs the frame that ends the round
function knockout(speed = 100) {
  const w = load('?count=2&reducemotion=0');
  w.set({ slowmofinish: true, gamespeed: speed });
  hold(w.game); w.frame();
  const f = w.game.fighters[1];
  f.hp = 0; f.ko(0, -40);
  hold(w.game); w.frame();
  return { ...w, f };
}

test('turning the finish off mid-finish gives full speed on the next frame', () => {
  const w = knockout();
  hold(w.game);
  assert.ok(w.frame() * 60 < 0.3, 'the finish did not start');
  w.set({ slowmofinish: false });
  hold(w.game);
  const rate = w.frame() * 60;
  assert.ok(Math.abs(rate - 1) < 1e-9, `ran at ${rate} of real time`);
});

test('the finish lasts the same real time at any game speed', () => {
  const w = knockout(200);
  let rate = 0;
  for (let i = 0; i < 54; i++) { hold(w.game); rate = w.frame() * 60 / 2; }   // 0.9 s
  assert.ok(rate < 0.9, `full speed back after 0.9 s of real time at 200% (rate ${rate})`);
  for (let i = 0; i < 30; i++) { hold(w.game); rate = w.frame() * 60 / 2; }   // 1.4 s
  assert.ok(Math.abs(rate - 1) < 1e-9, `still slow after 1.4 s at 200% (rate ${rate})`);
});

test('the finish zooms about the knocked-out fighter, keeping its hip at the same screen point', () => {
  const w = knockout();
  let checked = 0;
  for (let i = 0; i < 30; i++) {
    hold(w.game); w.frame();
    const ts = w.calls.filter(c => c.op === 'setTransform').map(c => c.a);
    w.calls.length = 0;
    const zoomed = ts.reduce((m, t) => (t[0] > m[0] ? t : m));
    const plain = ts[ts.length - 1];   // the score and win text are drawn unzoomed
    if (zoomed[0] < plain[0] * 1.1) continue;
    const hip = w.f.rag.pts.hip;
    const at = t => [t[0] * hip.x + t[4], t[3] * hip.y + t[5]];
    const [zx, zy] = at(zoomed), [px, py] = at(plain);
    assert.ok(Math.abs(zx - px) < 1e-6 && Math.abs(zy - py) < 1e-6,
      `hip at (${zx.toFixed(1)}, ${zy.toFixed(1)}) zoomed, (${px.toFixed(1)}, ${py.toFixed(1)}) unzoomed`);
    checked++;
  }
  assert.ok(checked > 5, 'the view did not zoom');
});

// ---------- Background cache and score board ----------

test('a Figure size change rebuilds the background cache', () => {
  const w = load();
  w.set({ backgroundtheme: 'dojo' });
  w.frame();
  const builds = w.game.bg.builds;
  w.set({ figurescale: 150 });
  w.frame();
  assert.equal(w.game.bg.builds, builds + 1);
});

test('a pixel-ratio change rebuilds the background cache', () => {
  const w = load();
  w.set({ backgroundtheme: 'dojo' });
  w.frame();
  const builds = w.game.bg.builds;
  w.window.devicePixelRatio = 2;
  for (const fn of w.listeners.resize) fn();
  w.frame();
  assert.equal(w.game.bg.builds, builds + 1);
});

test('changing Round rules keeps the score tally', () => {
  const w = load('?count=4');
  w.game.score.wins[2] = 3;
  w.set({ roundrules: 'king' });
  assert.equal(w.game.score.wins[2], 3);
  w.set({ fightercount: 5 });
  assert.equal(w.game.score.wins[2], 0, 'a count change should still start the tally over');
});
