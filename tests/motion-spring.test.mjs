// Pins the drawing-only spring offset (livelier motion, layer 1): what is drawn (f.V) is the
// game pose plus a damped offset that overshoots and settles, while hits keep reading the
// game pose (f.W). See docs/superpowers/specs/2026-11-27-livelier-motion-design.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

const DT = 1 / 60;
function load(search) {
  const { game } = loadMain({ random: lcg(7), search });
  return game;
}
// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o = {}) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, x: 600, z: 60, ...o });
  f.resetLook();
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('a step change in pose overshoots, then settles', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  const goal = f.pose.aF + 1;
  f.pose.aF = goal;
  let over = false;
  for (let t = 0; t < 0.5; t += DT) {
    f.stepLook(DT);
    if (f.pose.aF + f.look.d.aF > goal + 1e-3) over = true;
    if (t >= 0.25) assert.ok(Math.abs(f.look.d.aF) < 0.02, 'still off by ' + f.look.d.aF + ' at ' + t.toFixed(2) + ' s');
  }
  assert.ok(over, 'the drawn pose never went past the new pose');
});

test('the offset stays bounded at dt = 0.1', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  f.pose.aF += 1;
  for (let t = 0; t < 3; t += 0.1) {
    f.stepLook(0.1);
    for (const k in f.look.d) assert.ok(Math.abs(f.look.d[k]) < 1, k + ' offset ' + f.look.d[k]);
  }
  for (const k in f.look.d) assert.ok(Math.abs(f.look.d[k]) < 0.02, k + ' did not settle: ' + f.look.d[k]);
});

test('the spring changes nothing the fight sees', () => {
  // The same seeded fight with the spring switched off must give the same game joints
  const search = '?count=4&mode=ffa';
  const on = loadMain({ random: lcg(7), search }).game;
  const off = loadMain({ random: lcg(7), search, patch: s => s.replace('stepLook(dt) {', 'stepLook(dt) { return;') }).game;
  let drawnApart = false;
  for (let t = 0; t < 10; t += DT) {
    on.update(DT); off.update(DT);
    on.fighters.forEach((f, i) => {
      const g = off.fighters[i];
      assert.equal(f.state, g.state, 'fighter ' + i + ' state at ' + t.toFixed(2));
      for (const k in g.W) {
        assert.ok(dist(f.W[k], g.W[k]) < 1e-9, 'fighter ' + i + ' W.' + k + ' differs at ' + t.toFixed(2));
        if (dist(f.V[k], f.W[k]) > 0.5) drawnApart = true;
      }
    });
  }
  assert.ok(drawnApart, 'the drawn body never differed from the game body');
});

test('a strike\'s impact is drawn within 4 px', () => {
  const game = load();
  const [a, e] = game.fighters;
  for (const m of game.MOVES.filter(m => m.hit)) {
    hold(e, { x: 2000 });
    hold(a, { state: 'idle', facing: 1 });
    a.target = e;
    a.startMove(m);
    const impact = m.wind + m.act * 0.5;
    for (let t = 0; t + DT / 2 < impact; t += DT) game.update(DT);
    assert.ok(dist(a.V[m.hit], a.W[m.hit]) <= 4, m.id + ': drawn ' + dist(a.V[m.hit], a.W[m.hit]).toFixed(2) + ' px from the hit');
  }
});

test('a very short step does not blow the spring up', () => {
  // frame() can hand update() a sliver of a step when a hit stop ends; a pose that snaps in
  // that sliver must not kick the offset by the change over that sliver's length
  const game = load();
  const f = game.fighters[0];
  hold(f);
  for (let i = 0; i < 10; i++) f.stepLook(DT);
  f.pose.aF += 1;
  f.stepLook(1e-5);
  for (let i = 0; i < 30; i++) {
    f.stepLook(DT);
    for (const k in f.look.d) assert.ok(Math.abs(f.look.d[k]) < 1, k + ' offset ' + f.look.d[k]);
  }
});

test('a staff strike\'s tip is drawn within 4 px', () => {
  const game = load();
  const [a, e] = game.fighters;
  for (const id of game.STAFF_STRIKES) {
    const m = game.STAFF_MOVE[id];
    hold(e, { x: 2000 });
    hold(a, { state: 'idle', facing: 1 });
    a.target = e;
    a.startMove(m);
    for (let t = 0; t + DT / 2 < m.wind + m.act * 0.5; t += DT) game.update(DT);
    const d = dist(game.staffTip(a.V, m.hit), game.staffTip(a.W, m.hit));
    assert.ok(d <= 4, id + ': staff tip drawn ' + d.toFixed(2) + ' px from the hit');
  }
});

test('at rest the drawn body is the game body', () => {
  const game = load();
  const f = game.fighters[0];
  for (const [state, o] of [['hit'], ['frozen'], ['launched'], ['thrown', { th: { hx: 640, hy: 300 } }], ['hit', { spin: true }]]) {
    hold(f, { state, ...o });
    f.pose.aF += 0.8;
    for (let t = 0; t < 1.5; t += DT) { f.stepLook(DT); }
    f.W = f.joints(); f.V = f.viewJoints();
    for (const k in f.W) assert.ok(dist(f.V[k], f.W[k]) < 1e-3, state + ': ' + k + ' drawn apart at rest');
  }
});

test('frozen fighters keep a zero offset', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  f.pose.aF += 1;
  f.stepLook(DT);
  f.state = 'frozen';
  for (let t = 0; t < 0.5; t += DT) {
    f.pose.aF += 0.05;
    f.stepLook(DT);
    for (const k in f.look.d) assert.equal(f.look.d[k], 0, k + ' moved while frozen');
  }
});

test('the afterimage trail is drawn from V', () => {
  const game = load();
  const f = game.fighters[0];
  for (let t = 0; t < 1; t += DT) game.update(DT);
  f.trailOn = true; f.trailT = 0; f.trail.length = 0;
  game.update(DT);
  const snap = f.trail.at(-1).p;
  for (const k in snap) assert.ok(dist(snap[k], f.V[k]) < 1e-9, k + ' snapshot is not the drawn joint');
});
