// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// fighter in the air starts no move at a target that cannot be hit (#338), as a
// fighter on the ground already waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A seeded Math.random (mulberry32) keeps the run the same every time
function load(seed) {
  return loadMain({ random: mulberry32(seed) }).game;
}

// Puts the attacker in the air next to its target and steps updAir once; returns
// the move it started, or null
function airMove(seed, targetState) {
  const game = load(seed);
  const [a, e] = game.fighters;
  Object.assign(e, { x: 600, z: 40, alt: 0, va: 0, vx: 0, state: targetState, st: 0, downDur: 99, cool: 99 });
  Object.assign(a, { x: 400, z: 40, alt: 120, va: 0, vx: 0, state: 'air', st: 0, cool: 0, dashed: true, dj: true, dash: 0, move: null, md: null });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.updAir(1 / 60);
  return a.move;
}

test('an airborne fighter starts no move at a target lying down (#338)', () => {
  let started = 0;
  for (let seed = 1; seed <= 200; seed++) if (airMove(seed, 'down')) started++;
  assert.equal(started, 0, started + ' of 200 seeds started a move at a down target');
});

test('an airborne fighter still starts moves at a target it can hit (#338)', () => {
  let started = 0;
  for (let seed = 1; seed <= 200; seed++) if (airMove(seed, 'idle')) started++;
  assert.ok(started > 50, 'only ' + started + ' of 200 seeds started a move at an idle target');
});
