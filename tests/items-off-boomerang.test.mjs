// Runs main.js in a sandbox with a stubbed canvas and window, and checks that turning the
// Items setting off stops a boomerang (issue #349): one still being wound up is not thrown,
// and one already in flight is gone without hitting anyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A fixed Math.random of 0.99 turns off the random jumps, dashes and blocks
  const { game, window } = loadMain({ random: 0.99 });
  game.cfg.items = true;
  return { game, window };
}

// a holds a boomerang and e stands 250 px away on the same line, unable to move or dodge
function setup() {
  const { game, window } = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 0, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: 650, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'boomerang' };
  return { game, window, a, e };
}

// Steps for t seconds, keeping e in place and stunned and a from starting another attack, so
// only the boomerang could hit. Returns whether a boomerang was in flight at any step.
function run(game, a, e, t) {
  let seen = false;
  for (let i = 0; i < t * 60; i++) {
    Object.assign(e, { x: 650, z: 50, state: e.alive ? 'hit' : e.state, st: 0, dur: 99 });
    a.cool = 99; a.x = 400;
    game.update(1 / 60);
    if (game.shots.some(s => s.kind === 'boomerang')) seen = true;
  }
  return seen;
}

test('a boomerang being wound up is not thrown once Items is turned off (#349)', () => {
  const { game, window, a, e } = setup();
  game.update(1 / 60);
  assert.equal(a.state, 'attack');
  assert.equal(a.move && a.move.id, 'boomerang');
  window.wallpaperPropertyListener.applyUserProperties({ items: { value: false } });
  assert.ok(!run(game, a, e, 2), 'a boomerang was thrown with Items off');
  assert.equal(e.hp, 100, 'the target was hit with Items off');
});

test('a boomerang in flight is gone without hitting once Items is turned off (#349)', () => {
  const { game, window, a, e } = setup();
  let s = null;
  for (let i = 0; i < 60 && !s; i++) { game.update(1 / 60); s = game.shots.find(q => q.kind === 'boomerang'); }
  assert.ok(s, 'no boomerang thrown');
  assert.equal(e.hp, 100, 'hit before the setting changed');
  window.wallpaperPropertyListener.applyUserProperties({ items: { value: false } });
  assert.ok(!game.shots.includes(s), 'the boomerang in flight is still there with Items off');
  assert.ok(!run(game, a, e, 3), 'a boomerang was in flight with Items off');
  assert.equal(e.hp, 100, 'the target was hit with Items off');
});
