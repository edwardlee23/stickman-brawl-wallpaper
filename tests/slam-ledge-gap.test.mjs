// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a slam landing
// on a floating platform hits only fighters on that platform (issue #308). The two side ledges
// share a height, and on a portrait screen the gap between them is under the shockwave's
// 150 reach, so a height test alone counts a fighter on the other ledge as on the slammed one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1080, innerHeight: 1920, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run is the same (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true }, figurescale: { value: 100 } });
  return window.__stickmanBrawl;
}

// The slammer comes down 20 above the right end of the left side ledge, at depth 0, and lands
// its shockwave there; place(game, left, right) returns the victim's x and altitude
function slamOnLedge(place) {
  const game = load();
  const [a, e] = game.fighters;
  const [left, right] = game.platforms;
  const sx = left.x1 - 5, ledgeAlt = game.groundY(0) - left.y;
  const { x, alt } = place(game, left, right);
  Object.assign(e, { x, z: 0, alt, va: 0, vx: 0, vz: 0, state: 'idle', st: 0, cool: 999, hp: 1000, target: a, retarget: 999 });
  Object.assign(a, { x: sx, z: 0, alt: ledgeAlt, va: 0, vx: 0, vz: 0, state: 'idle', st: 0, cool: 999, facing: 1, target: e, retarget: 999 });
  a.W = a.joints(); e.W = e.joints();
  a.startMove(game.SUPER.find(m => m.type === 'slam'));
  Object.assign(a.md, { ph: 'down', wasAir: true });
  Object.assign(a, { alt: ledgeAlt + 20, hover: true, va: -1300, vx: 0 });
  let landed = false;
  for (let i = 0; i < 30 && !landed; i++) {
    game.update(1 / 60);
    landed = a.md && a.md.ph === 'rec';
  }
  assert.ok(landed, 'the slam never landed');
  assert.ok(Math.abs(game.groundY(a.z) - a.alt - left.y) < 1e-6, 'the slam landed on the left ledge');
  return { game, a, e, left, right };
}

test('the side ledges share a height and their gap is within the shockwave\'s reach', () => {
  const game = load();
  const [left, right] = game.platforms;
  assert.equal(left.y, right.y);
  assert.ok(right.x0 - left.x1 < 150, 'gap ' + (right.x0 - left.x1));
});

test('a slam on one side ledge does not hit a fighter on the other side ledge', () => {
  const { e } = slamOnLedge((game, left, right) => ({ x: right.x0 + 5, alt: game.groundY(0) - right.y }));
  assert.equal(e.hp, 1000);
  assert.equal(e.state, 'idle');
});

test('a slam on a side ledge hits a fighter 50 away on the same ledge', () => {
  const { e } = slamOnLedge((game, left) => ({ x: left.x1 - 55, alt: game.groundY(0) - left.y }));
  assert.ok(e.hp < 1000, 'the shockwave missed the fighter on the slammed ledge');
});

test('a slam on a side ledge does not hit a fighter in the air just past the ledge\'s end', () => {
  const { e } = slamOnLedge((game, left) => ({ x: left.x1 + 10, alt: game.groundY(0) - left.y }));
  assert.equal(e.hp, 1000);
});
