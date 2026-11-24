// Runs main.js in a node:vm sandbox and drives its animation frames at the
// refresh times of a given display, to check Wallpaper Engine's frame-rate
// limit: the wallpaper must draw at the chosen rate (issue #44), and game time
// must keep up with real time even below 20 fps (issue #43).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper and returns its debug hook, its settings listener, a
// function that runs one animation frame at the given time in ms, and a count
// of frames drawn (each draw clears the whole 1280 x 720 screen once).
function load() {
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
    location: { search: '?count=2' },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return {
    game: window.__stickmanBrawl,
    we: window.wallpaperPropertyListener,
    frame: now => next(now),
    draws: () => draws,
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

for (const fps of [10, 15, 30, 0]) {
  test(`game time keeps up with real time at a ${fps || 'no'} fps limit (issue #43)`, () => {
    const { game, we, frame } = load();
    we.applyGeneralProperties({ fps });
    const f = game.fighters[0];
    hold(game);
    const t0 = f.time;
    const hz = fps || 60;
    for (let i = 1; i <= hz * 10; i++) { hold(game); frame(i * 1000 / hz); }
    const ran = f.time - t0;
    assert.ok(Math.abs(ran - 10) < 0.2, `10 s of real time ran ${ran.toFixed(2)} s of game time`);
  });
}

test('a long stall still does not jump the fight ahead', () => {
  const { game, we, frame } = load();
  we.applyGeneralProperties({ fps: 10 });
  frame(100);
  hold(game);
  const f = game.fighters[0], t0 = f.time;
  frame(60100);   // A minute later, as when a hidden page comes back
  assert.ok(f.time - t0 <= 0.2 + 1e-9, `ran ${f.time - t0} s`);
});
