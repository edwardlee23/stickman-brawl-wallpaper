// Pins the rush that ends a standoff (#494): it stops on the near side of the target, in the
// middle of the queued move's reach, closes the depth gap the circling left, and strikes at
// once. Also pins the rush rules #506 lists: its speed, its length from the gap, and no rush
// out of a dodge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

const DT = 1 / 60;
// The pair from spacing.test.mjs: b held still in 'hit', a with a cross queued. Math.random gives
// state.fixed while that is set
function pair(d) {
  const rnd = lcg(5), state = { fixed: null };
  const { game } = loadMain({ search: '?count=2&mode=ffa', ctx: stubContext(), random: () => state.fixed ?? rnd() });
  const [a, b] = game.fighters;
  const jab = game.MOVES.find(m => m.id === 'cross');
  Object.assign(a, { state: 'idle', x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, cool: 0.5, retarget: 99, target: b, nextMove: jab, dash: 0, evade: 0 });
  Object.assign(b, { state: 'hit', x: 400 + d, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, st: 0, dur: 99, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, b, jab, state };
}
const step = a => { a.update(DT); a.W = a.joints(); };

// A standoff about to end, a held at its standoff distance and dz off the target's depth
function rushFrom(dz) {
  const { game, a, b, jab, state } = pair(0);
  state.fixed = 0.5;   // No new standoff, no jump, no dash
  const hold = jab.range[1] + 50;
  Object.assign(a, { x: b.x - hold, z: b.z + dz, standoff: DT / 2, standoffD: hold, circle: dz >= 0 ? 1 : -1, vz: dz >= 0 ? 40 : -40 });
  a.W = a.joints();
  return { game, a, b, jab };
}

test('the rush after a standoff ends on the near side of the target and strikes within 0.3 s, whatever the depth gap (#494)', () => {
  for (const dz of [18, -18, 20.7, 18.4, 13.7, 9, 0]) {
    const { a, b } = rushFrom(dz);
    step(a);
    assert.ok(a.dash > 0, 'dz ' + dz + ': no rush');
    let frames = 0;
    while (a.state !== 'attack' && frames < 18) {
      step(a); frames++;
      assert.ok(a.x < b.x, 'dz ' + dz + ': ran past the target to ' + (a.x - b.x).toFixed(1) + ' px beyond it');
    }
    assert.equal(a.state, 'attack', 'dz ' + dz + ': no strike within 0.3 s');
    assert.ok(a.x < b.x, 'dz ' + dz + ': struck from the far side');
    assert.ok(Math.abs(a.z - b.z) < 9, 'dz ' + dz + ': struck ' + (a.z - b.z).toFixed(1) + ' off in depth');
  }
});

test('the rush runs at RUSH_SPEED for gap / RUSH_SPEED, at most 0.22 s (#494, #506)', () => {
  const { a, jab } = pair(200);
  const mid = (jab.range[0] + jab.range[1]) / 2;
  for (const gap of [10, 40, 80]) {
    Object.assign(a, { vx: 0, dash: 0, evade: 0, cool: 0.5 });
    a.rush(jab, mid + gap);
    assert.equal(a.vx, 520, 'rush speed');
    assert.ok(Math.abs(a.dash - gap / 520) < 1e-9, 'gap ' + gap + ': dash ' + a.dash);
    assert.equal(a.cool, 0);
  }
  Object.assign(a, { vx: 0, dash: 0 });
  a.rush(jab, mid + 500);
  assert.equal(a.dash, 0.22, 'a long gap still dashes at most 0.22 s');
  Object.assign(a, { vx: 0, dash: 0, cool: 0.5 });
  a.rush(jab, mid - 5);
  assert.equal(a.dash, 0, 'already in the middle of reach: no rush');
  assert.equal(a.cool, 0);
});

test('a standoff that ends during a dodge does not turn the dodge into a rush (#506)', () => {
  const { a, jab } = pair(200);
  Object.assign(a, { evade: 0.2, vx: -150, dash: 0, cool: 0.5 });
  a.rush(jab, jab.range[1] + 50);
  assert.equal(a.vx, -150);
  assert.equal(a.dash, 0);
  assert.equal(a.cool, 0);
});
