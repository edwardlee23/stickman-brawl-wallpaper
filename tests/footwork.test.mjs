// Runs main.js in a sandbox with a stubbed canvas and window, then checks that
// a fighter does not hold on to a queued move it cannot reach (issue #35).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// A fixed Math.random of 0.99 turns off the random jumps and dashes, so the
// fighter's footwork, and with it the time until a move is swapped, is the same
// every run.
function load() {
  const { game } = loadMain({ random: 0.99 });
  const [a, e] = game.fighters;
  // The target stays in a long flinch, so it neither attacks nor moves on its own.
  Object.assign(e, { z: 50, alt: 0, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, target: a });
  Object.assign(a, { z: 50, alt: 0, state: 'idle', cool: 0, target: e, retarget: 99 });
  return { game, a, e };
}
const move = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const inRange = (m, d) => d >= m.range[0] && d <= m.range[1];

test('a fighter backed against a wall drops a queued move that needs more room', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 14, facing: 1, nextMove: move(game, 'fireball') });
  e.x = 64;
  a.W = a.joints(); e.W = e.joints();
  game.update(1 / 60);
  // Either it already started a move, or the move it now has queued reaches 50 px
  if (a.state !== 'attack') {
    assert.ok(a.nextMove, 'a move is queued');
    assert.ok(inRange(a.nextMove, Math.abs(e.x - a.x)), `${a.nextMove.id} reaches the target`);
  }
});

test('a queued move kept out of reach by a retreating target is replaced', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 300, facing: 1, nextMove: move(game, 'osotogari') });
  e.x = 370;
  a.W = a.joints(); e.W = e.joints();
  // The target backs away at the same pace, 70 px ahead, out of the throw's reach
  const step = 1 / 60, queued = a.nextMove;
  let t = 0;
  for (; t < 6 && a.state === 'idle' && a.nextMove === queued; t += step) {
    e.x = Math.min(a.x + 70, 940); e.z = a.z;
    game.update(step);
  }
  assert.notEqual(a.nextMove, queued, `kept ${queued.id} out of reach for ${t.toFixed(2)} s`);
  // The move is swapped once it has been out of reach for 1.5 s, on the next step
  assert.ok(t <= 1.5 + 2 * step, `swapped after ${t.toFixed(2)} s`);
});
