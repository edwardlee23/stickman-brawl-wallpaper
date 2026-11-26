// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// wall-run flying kick that cannot reach its target ends and falls (issue #261), as
// the dive does (#215), instead of climbing to the top of the screen and sticking there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A seeded Math.random keeps the run the same every time
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function load(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const math = Object.create(Math);
  math.random = seeded(seed);
  const context = vm.createContext({
    window, console, performance, URLSearchParams, Math: math,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

// Runs a wall run from x 60 at a target at x 640. onLeap(e) runs once as the leap
// begins and hold(a, e) every step after it. Returns how far the kicker climbed above
// where the leap began and how long it stayed at the top of the screen.
function leap(seed, onLeap, hold) {
  const game = load(seed);
  const [a, e] = game.fighters;
  Object.assign(a, { x: 60, z: 40, alt: 0, facing: -1, cool: 99 });
  Object.assign(e, { x: 640, z: 40, alt: 0, facing: -1, cool: 99 });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'wallrun'));
  let i = 0;
  for (; i < 300 && !(a.md && a.md.ph === 'leap'); i++) { e.cool = 99; game.update(1 / 60); }
  assert.equal(a.md && a.md.ph, 'leap', 'the leap began');
  const alt0 = a.alt;
  onLeap(e);
  let climb = 0, atTop = 0, steps = 0;
  for (; i < 600 && a.move && a.move.id === 'wallrun'; i++, steps++) {
    e.cool = 99;
    if (hold) hold(a, e, game);
    game.update(1 / 60);
    climb = Math.max(climb, a.alt - alt0);
    if (a.alt >= game.groundY(a.z) - 110 - 1) atTop += 1 / 60;   // maxAlt(z): the highest a fighter can be (FIG_TOP is 110)
  }
  return { climb, atTop, steps };
}

test('a wall-run leap at a target launched out of reach ends instead of climbing to the top (#261)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = leap(seed, e => Object.assign(e, { state: 'launched', st: 0, va: 600, vx: 0, juggle: 4 }));
    assert.ok(r.climb <= 5, 'seed ' + seed + ': climbed ' + r.climb.toFixed(0) + ' px after the leap began');
    assert.ok(r.atTop < 0.05, 'seed ' + seed + ': held at the top for ' + r.atTop.toFixed(2) + ' s');
  }
});

test('a wall-run leap at a target hovering unseen above it ends instead of climbing to the top (#261)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = leap(seed, () => {}, (a, e) => Object.assign(e, { alt: 200, va: 0, hover: true, invis: true, state: 'idle' }));
    assert.ok(r.climb <= 5, 'seed ' + seed + ': climbed ' + r.climb.toFixed(0) + ' px after the leap began');
    assert.ok(r.atTop < 0.05, 'seed ' + seed + ': held at the top for ' + r.atTop.toFixed(2) + ' s');
  }
});

test('a wall-run leap that has climbed to the top of the screen does not stay there (#261)', () => {
  // A target held at the top but too deep to be kicked keeps the leap steering upward
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = leap(seed, () => {}, (a, e, game) => Object.assign(e, { alt: game.groundY(a.z + 40) - 110, va: 0, hover: true, z: a.z + 40, x: 640 }));
    assert.ok(r.atTop < 0.05, 'seed ' + seed + ': held at the top for ' + r.atTop.toFixed(2) + ' s');
  }
});
