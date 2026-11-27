// Getting up resets the juggle count at once (issue #433). updIdle() resets it too, but only
// on the fighter's next step: a fighter updated later in the same step can launch it before
// then, and that launch must count as the first of a new juggle, not the fourth of the old one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;
function load() {
  return loadMain({ seed: 433 }).game;
}

test('a fighter launched in the step it gets up can still be juggled (#433)', () => {
  const game = load();
  const [a, e] = game.fighters;
  a.target = e; e.target = a;
  // Three launches into the old juggle, at the last step of its kip-up
  Object.assign(e, { x: 400, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'getup', st: 0.44, fallSign: 1,
    hp: 1000, cool: 99, hover: false, juggle: 3 });
  e.W = e.joints();
  e.update(DT);
  assert.equal(e.state, 'idle', 'the kip-up did not end');
  // A hit from a fighter updated later in this step launches it before its next updIdle()
  e.launch(100, 300);
  assert.equal(e.juggle, 1, 'the launch counted as juggle ' + e.juggle);
  assert.equal(e.hittable, true, 'the first launch after getting up cannot be followed up');
});
