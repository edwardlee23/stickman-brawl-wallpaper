// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the
// effects of a fighter standing on a floating platform are drawn on the platform, not on
// the floor under it (issue #167): landing dust, the fall's quake and crack, and the
// smoke of shadow clones splitting and vanishing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run is the same (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  // Sparks live inside main.js; a hook on push notes where each grey dust spark starts
  vm.runInContext('globalThis.__dust = []; { const push = Array.prototype.push; Array.prototype.push = function (...v) { for (const o of v) if (o && o.col === "rgba(200,200,200,0.6)") push.call(__dust, { y: o.y }); return push.apply(this, v); }; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  // The other fighter flinches far to the right, out of the way
  Object.assign(e, { x: 1100, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999, target: a });
  e.W = e.joints();
  const p = game.platforms[0], z = 60, x = (p.x0 + p.x1) / 2;
  return { game, a, e, p, z, x, dust: () => context.__dust };
}
const feetY = (game, f) => game.groundY(f.z) - f.alt;

test('landing on a ledge raises its dust on the ledge', () => {
  const { game, a, e, p, z, x, dust: spawned } = load();
  Object.assign(a, { x, z, vx: 0, vz: 0, va: 0, state: 'air', st: 0, cool: 99, dash: 0, target: e, dashed: true, dj: true });
  a.alt = game.groundY(z) - p.y + 30;
  let dust = [];
  for (let i = 0; i < 60 && a.state === 'air'; i++) {
    const n0 = spawned().length;
    game.update(1 / 60);
    dust = spawned().slice(n0);
  }
  assert.equal(a.state, 'idle', 'landed');
  assert.ok(Math.abs(feetY(game, a) - p.y) < 1, 'stands on the ledge');
  assert.ok(dust.length > 0, 'raised dust');
  for (const s of dust) assert.ok(Math.abs(s.y - p.y) < 1, 'dust at y ' + s.y + ', ledge top at ' + p.y);
});

test('a fighter knocked down on a ledge cracks the ledge, not the floor under it', () => {
  const { game, a, p, z, x } = load();
  Object.assign(a, { x, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, state: 'idle', facing: 1, cool: 99 });
  a.W = a.joints();
  a.knockDown(-1, 0.3);
  for (let i = 0; i < 60 && a.state === 'fall'; i++) game.update(1 / 60);
  assert.equal(a.state, 'down');
  const crack = game.fx.filter(o => o.type === 'crack' && o.kind === 'ground').pop();
  const ring = game.fx.filter(o => o.type === 'ring' && o.flat).pop();
  assert.ok(crack && ring, 'the fall made a quake');
  assert.ok(Math.abs(crack.y - feetY(game, a)) < 1, 'crack at y ' + crack.y + ', feet at ' + feetY(game, a));
  assert.ok(Math.abs(ring.y - feetY(game, a)) < 1, 'ring at y ' + ring.y);
});

test('shadow clones split and vanish in smoke at the height of a fighter on a ledge', () => {
  const { game, a, e, p, z, x } = load();
  Object.assign(a, { x: p.x0 + 20, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, state: 'idle', facing: 1, cool: 99, target: e });
  // The target stands on the same ledge, close enough for the clones to reach it
  Object.assign(e, { x: p.x0 + 120, z, alt: a.alt, state: 'hit', st: 0, dur: 999 });
  a.W = a.joints(); e.W = e.joints();
  const clones = game.NINJA.find(m => m.id === 'clones');
  let n0 = game.fx.length;
  a.startMove(clones);
  a.update(1 / 60);
  const split = game.fx.slice(n0).filter(o => o.type === 'puff');
  assert.equal(split.length, 2, 'one puff per clone');
  for (const o of split) assert.ok(Math.abs(o.y - (feetY(game, a) - 40)) < 1, 'split puff at y ' + o.y + ', feet at ' + feetY(game, a));
  let vanish = [];
  for (let i = 0; i < 120 && a.move; i++) {
    n0 = game.fx.length;
    const cl = a.md.clones && a.md.clones.map(c => c.alt);
    const feet = feetY(game, a);
    a.W = a.joints(); e.W = e.joints(); a.update(1 / 60);
    const ps = game.fx.slice(n0).filter(o => o.type === 'puff');
    if (ps.length && cl) vanish = ps.map((o, k) => ({ y: o.y, want: feet - cl[k] - 40 }));
  }
  assert.equal(vanish.length, 2, 'the clones vanished in smoke');
  for (const o of vanish) assert.ok(Math.abs(o.y - o.want) < 2, 'vanish puff at y ' + o.y + ', expected about ' + o.want);
});
