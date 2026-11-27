// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// teleporter whose target goes down while it is unseen reappears with the ring a
// teleport ends with (issue #260), instead of popping back into view with no effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A seeded Math.random (mulberry32) keeps the run the same every time
function load(seed) {
  return loadMain({ search: '?count=3&mode=ffa', random: mulberry32(seed) }).game;
}

// Starts a teleport at x 300 toward a target at x 700 and steps until the teleporter is
// unseen (or, with early set, only until it has begun to fade out); then, if down is set,
// the target is knocked out. Returns the rings added on the step the teleporter is fully
// back in view, and whether the target is still up.
function teleport(down, early) {
  const game = load(260);
  const [a, e, c] = game.fighters;
  Object.assign(a, { x: 300, z: 40, alt: 0, facing: 1, cool: 99 });
  Object.assign(e, { x: 700, z: 40, alt: 0, facing: -1, cool: 99 });
  Object.assign(c, { x: 1100, z: 40, alt: 0, facing: -1, cool: 99 });
  a.target = e; e.target = c; c.target = e;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'teleport'));
  const hidden = () => early ? a.alpha < 1 : a.invis;
  for (let i = 0; i < 60 && !hidden(); i++) { e.cool = c.cool = 99; game.update(1 / 60); }
  assert.ok(hidden(), early ? 'the teleporter began to fade' : 'the teleporter vanished');
  if (down) e.takeHit(c, game.MOVES.find(m => m.id === 'jab'), 'head', e.bodyPoint(), { dmg: 9999 });
  for (let i = 0; i < 60; i++) {
    const before = game.fx.filter(f => f.type === 'ring').length;
    e.cool = c.cool = 99;
    game.update(1 / 60);
    if (!a.invis && a.alpha === 1) return { rings: game.fx.filter(f => f.type === 'ring').length - before, alive: e.alive };
  }
  assert.fail('the teleporter never came back into view');
}

test('a teleport reappears with a ring (reference)', () => {
  const r = teleport(false);
  assert.equal(r.rings, 1);
});

test('a teleporter whose target is knocked out while it is unseen reappears with a ring (#260)', () => {
  const r = teleport(true);
  assert.equal(r.alive, false, 'the target was knocked out');
  assert.equal(r.rings, 1, 'rings added as the teleporter came back into view');
});

test('a teleporter whose target is knocked out as it fades out comes back with a ring (#260)', () => {
  const r = teleport(true, true);
  assert.equal(r.alive, false, 'the target was knocked out');
  assert.equal(r.rings, 1, 'rings added as the teleporter came back into view');
});
