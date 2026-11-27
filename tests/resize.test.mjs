// A window that is 0 in either dimension when the wallpaper loads (a page
// opened hidden, a 0-size preview frame) must not leave the fighters at a
// non-finite x once the window gets a real size (issue #62).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper in a window of the given size and returns its debug
// hook, the window, its resize listener and a function that runs one
// animation frame at the given time in ms.
function load(width, height) {
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const listeners = {};
  let next = null;
  const { window } = loadMain({
    width, height, search: '?count=4', ctx: stub,
    window: { addEventListener: (type, cb) => { listeners[type] = cb; } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  return { game: window.__stickmanBrawl, window, resize: () => listeners.resize(), frame: now => next(now) };
}

// At 1280 x 720 and figure size 100 %, the world is 1280 / (720 / 540) = 960 wide.
const WORLD_W = 960;

for (const [w, h] of [[0, 0], [1280, 0], [0, 720]]) {
  test(`fighters placed in a ${w} x ${h} window stand inside the walls after a resize to 1280 x 720 (issue #62)`, () => {
    const { game, window, resize, frame } = load(w, h);
    window.innerWidth = 1280; window.innerHeight = 720;
    resize();
    // They start spread across the floor, not piled up against one wall. Measured before
    // any frame runs, since within a second of fighting they close in on each other.
    const start = game.fighters.map(f => f.x);
    assert.ok(Math.max(...start) - Math.min(...start) > WORLD_W / 4, `fighters bunched at ${start.map(x => x.toFixed(1))}`);
    for (let i = 1; i <= 60; i++) frame(i * 1000 / 60);
    const xs = game.fighters.map(f => f.x);
    for (const x of xs) {
      assert.ok(Number.isFinite(x), `a fighter is at x = ${x}`);
      assert.ok(x >= 14 && x <= WORLD_W - 14, `a fighter is at x = ${x}, outside [14, ${WORLD_W - 14}]`);
    }
  });
}

test('a resize to 0 x 0 in the middle of a fight leaves the fighters where they are', () => {
  const { game, window, resize, frame } = load(1280, 720);
  frame(1000 / 60);
  const before = game.fighters.map(f => f.x);
  window.innerWidth = 0; window.innerHeight = 0;
  resize();
  assert.deepEqual(game.fighters.map(f => f.x), before);
});
