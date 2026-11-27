// Pins the follow-through keyframe (livelier motion, layer 3): every martial-arts move carries
// its impact on to a pose F in the first FOLLOW of its recovery, then returns to guard, with
// the wind-up, the strike and the move's length unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

const { game } = loadMain({ random: lcg(3) });
const { MOVES, STAFF_MOVE, GUARD, FOLLOW } = game;
const KEYS = Object.keys(GUARD).sort();
const ease = u => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = u => 1 - (1 - u) * (1 - u);
const lerp = (a, b, u) => Object.fromEntries(KEYS.map(k => [k, a[k] + (b[k] - a[k]) * u]));

// A fighter that has just started move m, its target far away
function begin(m) {
  const [a, e] = game.fighters;
  Object.assign(e, { x: 3000, state: 'hit', st: 0, dur: 999, hp: 1e3 });
  Object.assign(a, { x: 600, z: 60, alt: 0, va: 0, vx: 0, state: 'idle', facing: 1, cool: 99, rot: 0 });
  a.target = e; a.startMove(m);
  return a;
}
// The pose of a at time st into its move
function poseAt(a, st) { a.st = st; a.updAttack(0); return { ...a.pose }; }
const near = (p, q, what) => { for (const k of KEYS) assert.ok(Math.abs(p[k] - q[k]) < 1e-6, what + ': ' + k + ' ' + p[k] + ' vs ' + q[k]); };

test('every move has a follow-through pose', () => {
  for (const m of [...MOVES, ...Object.values(STAFF_MOVE)]) {
    assert.ok(m.F, m.id + ' has no F');
    assert.deepEqual(Object.keys(m.F).sort(), KEYS, m.id);
    assert.ok(KEYS.some(k => Math.abs(m.F[k] - m.A[k]) > 0.15), m.id + ': F is too close to A');
  }
});

test('the recovery passes through F', () => {
  for (const m of MOVES) {
    const a = begin(m);
    near(poseAt(a, m.wind + m.act + m.rec * FOLLOW), m.F, m.id);
  }
});

test('the move still ends on time', () => {
  for (const m of MOVES) {
    const a = begin(m), end = m.wind + m.act + m.rec;
    poseAt(a, end - 1e-6);
    assert.equal(a.state, 'attack', m.id + ' ended early');
    poseAt(a, end + 1e-6);
    assert.notEqual(a.state, 'attack', m.id + ' ran on');
  }
});

test('the strike window is unchanged', () => {
  for (const m of MOVES) {
    const a = begin(m), from = { ...a.from };
    for (let st = 0; st < m.wind + m.act; st += 0.01) {
      const want = st < m.wind ? lerp(from, m.W, ease(st / m.wind))
        : lerp(m.W, m.A, easeOut(Math.min(1, (st - m.wind) / (m.act * 0.5))));
      near(poseAt(a, st), want, m.id + ' at ' + st.toFixed(2));
    }
  }
});
