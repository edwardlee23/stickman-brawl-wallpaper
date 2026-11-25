// Runs main.js in a sandbox with a canvas that records each ellipse and the alpha it was drawn
// with, then checks three shadow rules (issue #218): a falling item's shadow is on the surface
// under it the whole fall, a ragdoll's shadow follows its current height, and a fighter's
// shadow fades with the fighter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(platforms) {
  const ellipses = [];
  let alpha = 1;
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'ellipse' ? (...a) => ellipses.push({ a, alpha })
      : k === 'globalAlpha' ? alpha : () => ({ addColorStop() {} }),
    set: (_, k, v) => { if (k === 'globalAlpha') alpha = v; return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run draws the same frame
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: platforms } });
  return { game: window.__stickmanBrawl, ellipses };
}

// Places f at x, depth 60, with its feet at altitude alt, in a flinch that runs no AI
function place(game, f, x, alt) {
  Object.assign(f, { x, z: 60, alt, vx: 0, va: 0, vz: 0, state: 'hit', st: 0, dur: 99, cool: 99 });
  f.W = f.joints();
}
// The ellipses drawn centred on x
function at(game, ellipses, x) {
  ellipses.length = 0;
  game.render();
  return ellipses.filter(e => Math.abs(e.a[0] - x) < 1e-6);
}

test('a falling item over a ledge casts its shadow on the ledge top the whole fall', () => {
  const { game, ellipses } = load(true);
  const p = game.platforms[0], [a, e] = game.fighters;
  place(game, a, 900, 0); place(game, e, 1000, 0);
  game.items.length = 0;
  const x = (p.x0 + p.x1) / 2, z = 60;
  for (const alt of [260, 157, game.groundY(z) - p.y + 10]) {
    const it = game.spawnItem('heart', x, z, alt);
    const s = at(game, ellipses, x).filter(e => e.a[2] === 8);
    assert.equal(s.length, 1, 'one item shadow at alt ' + alt);
    assert.ok(Math.abs(s[0].a[1] - p.y) < 1e-6, 'item at alt ' + alt + ': shadow at y ' + s[0].a[1] + ', ledge top ' + p.y);
    game.items.splice(game.items.indexOf(it), 1);
  }
});

test('a body knocked out in the air and lying on the floor casts a full-size shadow', () => {
  const { game, ellipses } = load(false);
  const [a, e] = game.fighters;
  place(game, e, 1000, 0);
  place(game, a, 400, 220);
  a.ko(0, 0);
  // Drop the body 220 down, so it lies as one knocked out on the floor would
  for (const o of Object.values(a.rag.pts)) { o.y += 220; o.py = o.y; }
  a.W = a.rag.pts;
  const x = a.rag.pts.hip.x;
  const s = at(game, ellipses, x).filter(e => e.a[3] > 0 && e.a[2] > 1 && e.a[2] <= 14);
  assert.equal(s.length, 1, 'one shadow under the body');
  assert.ok(s[0].a[2] > 13.5, 'shadow width ' + s[0].a[2] + ' should be about 14');
  assert.ok(s[0].alpha > 0.11, 'shadow alpha ' + s[0].alpha + ' should be about 0.12');
});

test('a body flying high casts a smaller shadow than one on the floor', () => {
  const { game, ellipses } = load(false);
  const [a, e] = game.fighters;
  place(game, e, 1000, 0);
  place(game, a, 400, 0);
  a.ko(0, 0);
  for (const o of Object.values(a.rag.pts)) { o.y -= 200; o.py = o.y; }
  a.W = a.rag.pts;
  const s = at(game, ellipses, a.rag.pts.hip.x).filter(e => e.a[2] > 1 && e.a[2] <= 14);
  assert.equal(s.length, 1, 'one shadow under the body');
  assert.ok(s[0].a[2] < 6, 'shadow width ' + s[0].a[2] + ' should shrink with height');
});

test('a fighter shadow fades with the fighter alpha', () => {
  const { game, ellipses } = load(false);
  const [a, e] = game.fighters;
  place(game, e, 1000, 0);
  for (const al of [1, 0.2, 0]) {
    place(game, a, 400, 0);
    a.alpha = al;
    const s = at(game, ellipses, 400).filter(e => e.a[2] === 14);
    assert.equal(s.length, 1, 'one shadow at alpha ' + al);
    assert.ok(Math.abs(s[0].alpha - 0.12 * al) < 1e-9, 'alpha ' + al + ': shadow alpha ' + s[0].alpha);
  }
});
