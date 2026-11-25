// A window that is 0 in either dimension when the wallpaper loads (a page
// opened hidden, a 0-size preview frame) must not leave the fighters at a
// non-finite x once the window gets a real size (issue #62).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper in a window of the given size and returns its debug
// hook, the window, its resize listener and a function that runs one
// animation frame at the given time in ms.
function load(width, height) {
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const canvas = { getContext: () => stub, style: {}, width: 0, height: 0 };
  const listeners = {};
  let next = null;
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    addEventListener: (type, cb) => { listeners[type] = cb; },
  };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search: '?count=4' },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return { game: window.__stickmanBrawl, window, resize: () => listeners.resize(), frame: now => next(now) };
}

// At 1280 x 720 and figure size 100 %, the world is 1280 / (720 / 540) = 960 wide.
const WORLD_W = 960;

for (const [w, h] of [[0, 0], [1280, 0], [0, 720]]) {
  test(`fighters placed in a ${w} x ${h} window stand inside the walls after a resize to 1280 x 720 (issue #62)`, () => {
    const { game, window, resize, frame } = load(w, h);
    window.innerWidth = 1280; window.innerHeight = 720;
    resize();
    for (let i = 1; i <= 60; i++) frame(i * 1000 / 60);
    const xs = game.fighters.map(f => f.x);
    for (const x of xs) {
      assert.ok(Number.isFinite(x), `a fighter is at x = ${x}`);
      assert.ok(x >= 14 && x <= WORLD_W - 14, `a fighter is at x = ${x}, outside [14, ${WORLD_W - 14}]`);
    }
    // They start spread across the floor, not piled up against one wall
    assert.ok(Math.max(...xs) - Math.min(...xs) > WORLD_W / 4, `fighters bunched at ${xs.map(x => x.toFixed(1))}`);
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
