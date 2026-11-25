// Runs main.js in a node:vm sandbox and drives its animation frames at the
// refresh times of a given display, to check Wallpaper Engine's frame-rate
// limit: the wallpaper must draw at the chosen rate (issue #44), and game time
// must keep up with real time even below 20 fps (issues #43 and #61) and with
// Speed while hit stops come often (issue #61).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// A copy of main.js that adds up, in window.__sim, the game time handed to update()
const SIM_ANCHOR = 'freezeGap -= dt;';
const counted = source.replace(SIM_ANCHOR, SIM_ANCHOR + ' window.__sim += dt;');

// A seeded Math.random (mulberry32), so a fight plays out the same on every run
function seeded(seed) {
  const M = Object.create(Math);
  let s = seed >>> 0;
  M.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return M;
}

// Loads the wallpaper and returns its debug hook, its settings listener, a
// function that runs one animation frame at the given time in ms, and a count
// of frames drawn (each draw clears the whole 1280 x 720 screen once).
function load({ search = '?count=2', code = source, math = Math } = {}) {
  const noop = () => {};
  let draws = 0;
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'fillRect'
      ? (x, y, w, h) => { if (x === 0 && y === 0 && w === 1280 && h === 720) draws++; }
      : stub,
    set: () => true,
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  let next = null;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: noop };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: math, __sim: 0, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(code, window);
  return {
    game: window.__stickmanBrawl,
    we: window.wallpaperPropertyListener,
    frame: now => next(now),
    draws: () => draws,
    sim: () => window.__sim,
  };
}

// Holds every fighter in a long flinch, so nobody attacks, no hit stop eats
// game time and the round never ends.
function hold(game) {
  for (const f of game.fighters) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0 });
}

// Runs `seconds` of refreshes at `hz` and returns the frames drawn per second.
// `jitter(i)` moves refresh i off its exact time, in ms.
function drawRate(hz, fps, seconds = 10, jitter = () => 0) {
  const { game, we, frame, draws } = load();
  we.applyGeneralProperties({ fps });
  for (let i = 1; i <= hz * seconds; i++) { hold(game); frame(i * 1000 / hz + jitter(i)); }
  return draws() / seconds;
}

for (const [hz, fps] of [[60, 25], [60, 50], [144, 60], [144, 100], [144, 120], [165, 60]]) {
  test(`a ${fps} fps limit on a ${hz} Hz display draws about ${fps} frames a second (issue #44)`, () => {
    const rate = drawRate(hz, fps);
    assert.ok(Math.abs(rate - fps) <= 1, `drew ${rate} frames a second`);
  });
}

test('a limit at or above the display rate draws every refresh', () => {
  assert.equal(drawRate(60, 60), 60);
  assert.equal(drawRate(60, 144), 60);
  // Refreshes that come up to 1.5 ms early are still drawn
  assert.equal(drawRate(60, 60, 10, i => (i % 3 ? -1.5 : 0)), 60);
});

// [fps limit, refreshes delivered per second]: below 20 a second the machine,
// not the limit, may be what holds the frame rate down (issue #61)
for (const [fps, hz] of [[10, 10], [15, 15], [30, 30], [0, 60], [0, 15], [0, 10], [60, 15], [30, 12]]) {
  test(`game time keeps up with real time at a ${fps || 'no'} fps limit and ${hz} frames a second (issues #43, #61)`, () => {
    const { game, we, frame } = load();
    we.applyGeneralProperties({ fps });
    const f = game.fighters[0];
    hold(game);
    const t0 = f.time;
    for (let i = 1; i <= hz * 10; i++) { hold(game); frame(i * 1000 / hz); }
    const ran = f.time - t0;
    assert.ok(Math.abs(ran - 10) < 0.2, `10 s of real time ran ${ran.toFixed(2)} s of game time`);
  });
}

test('after a stall the frame-rate limit holds at once, with no burst of frames to catch up', () => {
  const { game, we, frame, draws } = load();
  we.applyGeneralProperties({ fps: 30 });
  for (let i = 1; i <= 60; i++) { hold(game); frame(i * 1000 / 60); }
  const before = draws();
  // 5 s with no refresh, then one second of a 60 Hz display
  for (let i = 0; i < 60; i++) { hold(game); frame(6000 + i * 1000 / 60); }
  const drawn = draws() - before;
  assert.ok(Math.abs(drawn - 30) <= 1, `drew ${drawn} frames in the second after the stall`);
});

test('a long stall still does not jump the fight ahead', () => {
  const { game, we, frame } = load();
  we.applyGeneralProperties({ fps: 10 });
  frame(100);
  hold(game);
  const f = game.fighters[0], t0 = f.time;
  frame(60100);   // A minute later, as when a hidden page comes back
  assert.ok(f.time - t0 <= 0.2 + 1e-9, `ran ${f.time - t0} s`);
});

test('16 fighters at 300% speed simulate about three times real time despite hit stops (issue #61)', () => {
  assert.ok(source.includes(SIM_ANCHOR), 'the game time counter has nothing to hook onto');
  const { frame, sim } = load({ search: '?count=16&speed=3', code: counted, math: seeded(1) });
  for (let i = 1; i <= 60 * 120; i++) frame(i * 1000 / 60);
  const ran = sim();
  assert.ok(ran >= 360 * 0.9 && ran <= 360 * 1.1, `120 s at 300% simulated ${ran.toFixed(1)} s, expected about 360`);
});
