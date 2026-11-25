// Runs main.js in a sandbox with a canvas that records its ellipses, then checks that a
// fighter's shadow falls on the surface it stands on (issue #173): on a floating platform it
// is drawn on the platform's top, like an item's, and on the floor everywhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ellipses = [];
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'ellipse' ? (...a) => ellipses.push(a) : () => ({ addColorStop() {} }),
    set: () => true,
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run draws the same frame (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  return { game: window.__stickmanBrawl, ellipses };
}

// Places f at x, depth 60, with its feet at the screen height feet, in a flinch that runs no AI
function place(game, f, x, feet) {
  const z = 60;
  Object.assign(f, { x, z, alt: game.groundY(z) - feet, vx: 0, va: 0, vz: 0, state: 'hit', st: 0, dur: 99, cool: 99 });
  f.W = f.joints();
}
// The screen height of the shadow drawn under x (the fighter shadow is 14 wide at most)
function shadowY(game, ellipses, x) {
  ellipses.length = 0;
  game.render();
  const s = ellipses.filter(a => Math.abs(a[0] - x) < 1e-6 && a[2] > 4 && a[2] <= 14);
  assert.equal(s.length, 1, 'one shadow under x ' + x);
  return s[0][1];
}

test('a fighter standing on a platform casts its shadow on the platform top', () => {
  const { game, ellipses } = load();
  const p = game.platforms[0], [a, e] = game.fighters;
  const x = (p.x0 + p.x1) / 2;
  place(game, a, x, p.y);
  place(game, e, 900, game.groundY(60));
  assert.ok(Math.abs(shadowY(game, ellipses, x) - p.y) < 1e-6, 'shadow on the platform at y ' + p.y);
});

test('a fighter jumping above a platform casts its shadow on the platform top', () => {
  const { game, ellipses } = load();
  const p = game.platforms[0], [a, e] = game.fighters;
  const x = (p.x0 + p.x1) / 2;
  place(game, a, x, p.y - 60);
  place(game, e, 900, game.groundY(60));
  assert.ok(Math.abs(shadowY(game, ellipses, x) - p.y) < 1e-6, 'shadow on the platform at y ' + p.y);
});

test('a fighter on the floor, under a platform or not, casts its shadow on the floor', () => {
  const { game, ellipses } = load();
  const p = game.platforms[0], [a, e] = game.fighters;
  const x = (p.x0 + p.x1) / 2, floor = game.groundY(60);
  place(game, a, x, floor);
  place(game, e, 900, floor);
  assert.ok(Math.abs(shadowY(game, ellipses, x) - floor) < 1e-6, 'under the platform');
  assert.ok(Math.abs(shadowY(game, ellipses, 900) - floor) < 1e-6, 'in the open');
});
