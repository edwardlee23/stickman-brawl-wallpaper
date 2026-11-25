// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// dive special (issue #60) and the wall-run leap (issue #114) when the target is
// knocked out mid-flight.
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
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

test('a dive whose target is knocked out falls instead of sticking to the ceiling and dropping in one frame', () => {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 200, z: 20, facing: 1, cool: 99 });
  Object.assign(e, { x: 600, z: 20, facing: -1, cool: 99 });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'dive'));
  // Already in the dive and heading up, then the target is knocked out by someone else
  Object.assign(a.md, { ph: 'dive', a: 0, jumped: true });
  Object.assign(a, { hover: true, alt: 150, vx: 600, va: 600 });
  e.ko(0, -40);
  assert.equal(e.alive, false);
  let left = -1, worst = 0;
  for (let i = 0; i < 300; i++) {
    const before = a.alt;
    game.update(1 / 60);
    worst = Math.max(worst, before - a.alt);
    if (left < 0 && !(a.move && a.move.id === 'dive' && a.md && a.md.ph === 'dive')) left = (i + 1) / 60;
    if (left >= 0 && a.alt <= 0) break;
  }
  assert.ok(left >= 0 && left <= 1, `still diving after 1 s (left at ${left})`);
  assert.ok(worst <= 40, `dropped ${worst.toFixed(0)} px in one step`);
});

test('a wall-run leap whose target is knocked out falls instead of flying across the top (#114)', () => {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 60, z: 20, facing: -1, cool: 99 });
  Object.assign(e, { x: 600, z: 20, facing: -1, cool: 99 });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'wallrun'));
  for (let i = 0; i < 300 && !(a.md && a.md.ph === 'leap'); i++) game.update(1 / 60);
  assert.equal(a.md && a.md.ph, 'leap', 'the leap began');
  e.ko(0, -40);
  assert.equal(e.alive, false);
  let alt = a.alt;
  for (let i = 0; i < 18; i++) game.update(1 / 60);
  assert.ok(!a.move || a.alt < alt, 'still flying level after 0.3 s: alt ' + a.alt + ' from ' + alt);
  alt = a.alt;
  game.update(1 / 60);
  assert.ok(a.alt < alt, 'falling: alt ' + a.alt + ' from ' + alt);
});
