// Runs main.js frame by frame and checks that the slow-motion finish shows the knocked-out
// body moving (issue #495): the hit stop of the round-ending blow is counted in game time, so
// under the quarter-speed slow motion it froze the fight for most of the slow motion, and for
// all of it at Speed 25%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext } from './load-main.mjs';

// Two fighters face to face; b has 1 hp left, and a throws a real cross that knocks it out.
// Math.random is fixed high, so b reacts to no warning. Runs 60 fps frames until the slow motion
// begins, then counts the frames of the slow motion and those in which b's body is drawn where it was the frame before.
function finish(speed) {
  let next = null;
  const { game, window } = loadMain({
    search: '?count=2&mode=ffa&reducemotion=0', ctx: stubContext(), random: 0.99,
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
    expose: 'window.__in = { slowmo: () => slowmoT };',
    properties: { slowmofinish: { value: true }, gamespeed: { value: speed * 100 } },
  });
  assert.equal(game.cfg.speed, speed);
  assert.equal(game.cfg.slowmo, true);
  const [a, b] = game.fighters;
  for (const f of [a, b]) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  Object.assign(a, { x: 400, facing: 1, target: b });
  Object.assign(b, { x: 448, facing: -1, target: a, hp: 1 });
  let t = 1000 / 60;
  next(t);
  a.startMove(game.MOVES.find(m => m.id === 'cross'));
  for (let i = 0; i < 600 && window.__in.slowmo() < 0; i++) next(t += 1000 / 60);
  assert.ok(window.__in.slowmo() >= 0, 'the cross did not end the round in slow motion');
  assert.ok(b.rag, 'b is a ragdoll');
  // Where the body is drawn: the joints the last frame drew it with
  const where = () => b.V.hip.x + ',' + b.V.hip.y;
  const still = [];
  let frames = 0, last = where();
  while (window.__in.slowmo() >= 0 && frames < 200) {
    next(t += 1000 / 60);
    frames++;
    const now = where();
    if (now === last) still.push(frames);
    last = now;
  }
  return { frames, still };
}

for (const speed of [0.25, 1, 3]) {
  test(`the knocked-out body moves on every frame of the slow-motion finish after the first few, at Speed ${speed * 100}% (#495)`, () => {
    const { frames, still } = finish(speed);
    assert.ok(frames > 60, 'the slow motion lasted ' + frames + ' frames');
    const late = still.filter(f => f > 3);
    assert.deepEqual(late, [], `frozen on ${still.length} of ${frames} frames`);
  });
}
