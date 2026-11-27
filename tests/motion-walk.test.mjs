// Pins the walk cycle (livelier motion, layer 2): the thighs swing, each knee bends as its leg
// swings forward under the body, the arms swing against the legs, and the lean grows smoothly
// with speed. walkPose(tp, phase, sp) adds the walk to a pose; sp is the forward speed in px/s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const { game } = loadMain();
const { walkPose, WALK, GUARD } = game;
const at = (phase, sp) => walkPose({ ...GUARD }, phase, sp);

test('walking bends each knee most as its leg swings forward under the body', () => {
  // Phase 0: the thighs are level with the guard, the front leg swinging forward
  const front = at(0, 120), back = at(Math.PI, 120);
  assert.ok(Math.abs(front.lF - GUARD.lF) < 1e-9);
  assert.ok(front.kF <= GUARD.kF - WALK.knee * 0.6, 'front knee only at ' + front.kF);
  assert.ok(Math.abs(front.kB - GUARD.kB) < 1e-9, 'back knee bent while its leg swings back');
  assert.ok(back.kB <= GUARD.kB - WALK.knee * 0.6, 'back knee only at ' + back.kB);
});

test('arms swing opposite their legs', () => {
  const a = [], l = [];
  for (let i = 0; i < 64; i++) {
    const p = at(i / 64 * 2 * Math.PI, 120);
    a.push(p.aF - GUARD.aF); l.push(p.lF - GUARD.lF);
  }
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  const r = dot(a, l) / Math.sqrt(dot(a, a) * dot(l, l));
  assert.ok(r < -0.8, 'correlation ' + r);
});

test('lean grows smoothly with speed', () => {
  const ts = [200, 250, 300, 350, 400].map(sp => at(0, sp).t);
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i] > ts[i - 1], 'lean not growing at ' + (200 + i * 50) + ' px/s');
    assert.ok(ts[i] - ts[i - 1] <= 0.15, 'lean jumps at ' + (200 + i * 50) + ' px/s');
  }
  assert.ok(Math.abs(at(0, 450).t - (GUARD.t + 0.4)) < 1e-9);
});

test('standing still is the guard', () => {
  const p = at(1.3, 0);
  for (const k of Object.keys(GUARD)) assert.ok(Math.abs(p[k] - GUARD[k]) < 1e-9, k + ' moved at rest');
});
