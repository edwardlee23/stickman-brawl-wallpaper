// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// fighter that raises a magic shield, escapes in smoke or starts any move in the
// middle of a dash stops dashing (issue #342): no afterimage trail and no glide.
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
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, context };
}

// a stands still and attacks; e is 55 px away in the middle of a ground dash toward a
function dashing() {
  const { game, context } = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 600, z: 50, alt: 0, state: 'idle', facing: -1, cool: 99, hp: 1000, vx: 0, target: e });
  Object.assign(e, { x: 545, z: 50, alt: 0, state: 'idle', facing: 1, cool: 99, hp: 1000, vx: 520, dash: 0.22, trailOn: true, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, context, a, e };
}

// The attacker's jab warns e with Math.random fixed at r, which picks e's reaction
function warned(r) {
  const s = dashing();
  vm.runInContext('globalThis.__R = Math.random; Math.random = () => ' + r + ';', s.context);
  s.a.startMove(s.game.MOVES.find(m => m.id === 'jab'));
  vm.runInContext('Math.random = globalThis.__R;', s.context);
  return s;
}

// Steps the fight while e is in move id, counting the steps with its trail on
function run(game, e, id) {
  const x0 = e.x;
  let steps = 0, trail = 0;
  while (e.state === 'attack' && e.move.id === id && steps < 200) { game.update(1 / 60); steps++; if (e.trailOn) trail++; }
  return { moved: e.x - x0, steps, trail };
}

function endsDash(e) {
  assert.ok(e.dash <= 0, 'the dash is still running: ' + e.dash);
  assert.equal(e.trailOn, false, 'the afterimage trail is still on');
}

test('a fighter that raises a shield mid-dash stops dashing and holds its ground (#342)', () => {
  const { game, e } = warned(0.4);
  assert.equal(e.move && e.move.id, 'shield');
  endsDash(e);
  const { moved, steps, trail } = run(game, e, 'shield');
  assert.ok(Math.abs(moved) < 20, 'the shield glided ' + moved.toFixed(0) + ' px');
  assert.equal(trail, 0, 'the trail was on for ' + trail + ' of ' + steps + ' steps');
});

test('a fighter that escapes in smoke mid-dash stops dashing (#342)', () => {
  const { game, e } = warned(0.5);
  assert.equal(e.move && e.move.id, 'smoke');
  endsDash(e);
  const { steps, trail } = run(game, e, 'smoke');
  assert.equal(trail, 0, 'the trail was on for ' + trail + ' of ' + steps + ' steps');
});

test('a fighter that starts shadow clones mid-dash stops dashing and holds its ground (#342)', () => {
  const { game, e } = dashing();
  e.startMove(game.NINJA.find(m => m.id === 'clones'));
  endsDash(e);
  const x0 = e.x;
  let steps = 0, trail = 0;
  // The seal pose, before the clones run out
  while (e.state === 'attack' && e.st < 0.25 && steps < 60) { game.update(1 / 60); steps++; if (e.trailOn) trail++; }
  assert.ok(Math.abs(e.x - x0) < 20, 'the seal pose glided ' + (e.x - x0).toFixed(0) + ' px');
  assert.equal(trail, 0, 'the trail was on for ' + trail + ' of ' + steps + ' steps');
});
