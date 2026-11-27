// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// fighter that blocks or is hit in the middle of a dash stops dashing (issue #169):
// no afterimage trail and no glide into the attacker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  const { game, context } = loadMain();
  return { game, context };
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

test('a fighter that blocks mid-dash stops dashing and holds its ground (#169)', () => {
  const { game, context, a, e } = dashing();
  // The warn roll picks a block (Math.random < 0.25) for the attacker's jab
  vm.runInContext('globalThis.__R = Math.random; Math.random = () => 0.1;', context);
  a.startMove(game.MOVES.find(m => m.id === 'jab'));
  vm.runInContext('Math.random = globalThis.__R;', context);
  assert.equal(e.state, 'block');
  assert.ok(e.dash <= 0, 'the dash is still running: ' + e.dash);
  assert.equal(e.trailOn, false, 'the afterimage trail is still on');
  const x0 = e.x;
  let steps = 0, trail = 0;
  while (e.state === 'block' && steps < 200) { game.update(1 / 60); steps++; if (e.trailOn) trail++; }
  assert.ok(Math.abs(e.x - x0) < 20, 'the blocker slid ' + (e.x - x0).toFixed(0) + ' px');
  assert.equal(trail, 0, 'the trail was on for ' + trail + ' of ' + steps + ' steps');
});

test('a fighter hit mid-dash stops dashing (#169)', () => {
  const { game, a, e } = dashing();
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint());
  assert.equal(e.state, 'hit');
  assert.ok(e.dash <= 0, 'the dash is still running: ' + e.dash);
  assert.equal(e.trailOn, false, 'the afterimage trail is still on');
});
