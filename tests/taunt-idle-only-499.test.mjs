// A taunt is drawn over the idle pose only (#499): a strike, block or flinch started while the
// taunt still shows is drawn as the fight sees it, so a striking limb is drawn where it hits.
// Also pins the taunt rules #506 lists: the get-up half of taunting(), no taunt while the round
// is over or the fighter is in the air, and the easing in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

const DT = 1 / 60;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function load() {
  const { game, window } = loadMain({ random: lcg(1), expose: 'window.__peek = code => eval(code);' });
  return { game, peek: window.__peek };
}
// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o = {}) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, x: 600, z: 60, ...o });
  f.resetLook();
}
// a stands idle, facing b, which lies on the floor 300 away
function pair() {
  const w = load();
  const [a, b] = w.game.fighters;
  hold(a, { state: 'idle', facing: 1, retarget: 99 });
  hold(b, { state: 'down', x: 900, z: a.z, downDur: 99, facing: -1 });
  a.target = b;
  return { ...w, a, b };
}

test('a strike started with the taunt fully on draws its limb within 2 px of the hit (#499)', () => {
  const far = [];
  const kinds = loadMain().game.TAUNTS.length;
  for (const m of loadMain().game.MOVES.filter(m => m.hit && m.range)) {
    for (let k = 0; k < kinds; k++) {
      const { game } = load();
      const [a, e] = game.fighters;
      hold(e, { x: 600 + (m.range[0] + m.range[1]) / 2, facing: -1 });
      hold(a, { state: 'idle', facing: 1 });
      a.flair = { w: 1, k, n: 1 };
      a.target = e;
      for (const f of game.fighters) f.W = f.joints();
      a.startMove(m);
      let t = 0;
      while (!a.hitDone && a.state === 'attack' && t < 2) { game.update(DT); t += DT; }
      assert.ok(a.hitDone, m.id + ': never landed');
      const d = dist(a.V[m.hit], a.W[m.hit]);
      if (d > 2) far.push(m.id + ' taunt ' + k + ': ' + d.toFixed(2) + ' px');
    }
  }
  assert.deepEqual(far, [], 'drawn this far from the hit as it lands');
});

test('the taunt changes only the idle pose: blocks, flinches and strikes are drawn without it (#499)', () => {
  const { game, a } = pair();
  const kinds = game.TAUNTS.length;
  for (let k = 0; k < kinds; k++) {
    for (const state of ['attack', 'block', 'hit', 'wait', 'dodge']) {
      a.state = state;
      a.flair = { w: 1, k, n: 1 };
      a.time = 0.4;
      const plain = a.lookPose();
      a.flair = { w: 0, k, n: 1 };
      assert.deepEqual(a.lookPose(), plain, state + ' drawn with taunt ' + k);
    }
    a.state = 'idle';
    a.flair = { w: 1, k, n: 1 };
    const on = a.lookPose();
    a.flair = { w: 0, k, n: 1 };
    assert.notDeepEqual(a.lookPose(), on, 'taunt ' + k + ' does not show on the idle pose');
  }
});

test('the taunt weight drops at once when the fighter leaves idle (#499)', () => {
  const { a } = pair();
  for (let i = 0; i < 30; i++) a.stepLook(DT);
  assert.equal(a.flair.w, 1);
  a.state = 'block';
  a.stepLook(DT);
  assert.equal(a.flair.w, 0);
});

test('a fighter taunts while its target gets up, not only while it lies down (#506)', () => {
  const { a, b } = pair();
  b.state = 'getup';
  assert.equal(a.taunting(), true);
});

test('no taunt once the round is over (#506)', () => {
  const { a, peek } = pair();
  assert.equal(a.taunting(), true);
  peek('roundOver = true');
  assert.equal(a.taunting(), false);
});

test('no taunt in the air (#506)', () => {
  const { a } = pair();
  assert.equal(a.taunting(), true);
  a.alt = 40;
  assert.equal(a.taunting(), false);
});

test('a taunt eases in over a quarter second, not at once (#506)', () => {
  const { a } = pair();
  a.stepLook(DT);
  assert.ok(Math.abs(a.flair.w - 4 * DT) < 1e-9, 'weight ' + a.flair.w + ' after one frame');
  for (let i = 0; i < 13; i++) a.stepLook(DT);
  assert.ok(a.flair.w > 0.9 && a.flair.w < 1, 'weight ' + a.flair.w + ' after 14 frames');
  for (let i = 0; i < 2; i++) a.stepLook(DT);
  assert.equal(a.flair.w, 1);
  // And out over a quarter second while it still stands idle
  a.target.state = 'idle';
  a.stepLook(DT);
  assert.ok(Math.abs(a.flair.w - (1 - 4 * DT)) < 1e-9, 'weight ' + a.flair.w + ' one frame after the target got up');
});
