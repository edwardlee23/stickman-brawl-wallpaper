// Pins the lagging head and hands (livelier motion, layer 4): in the drawn body the head and the
// hands trail their parent joint's acceleration and the body's, measured in the fighter's own
// frame, clamped, and swung round the parent so no limb is drawn longer than it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

const DT = 1 / 60;
const load = search => loadMain({ random: lcg(11), search }).game;
function hold(f, o = {}) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, x: 600, z: 60, facing: 1, ...o });
  f.resetLook();
}
const len = o => Math.hypot(o.x, o.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('a sudden lunge makes the head trail and return', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  for (let i = 0; i < 10; i++) f.stepLook(DT);
  f.vx = 300;
  let most = 0;
  for (let t = 0; t < 0.6; t += DT) {
    f.stepLook(DT);
    const lag = f.viewJoints().head.x - f.joints().head.x;
    if (t < 0.1) most = Math.min(most, lag);
  }
  assert.ok(most < -0.5, 'the head trailed only ' + most + ' px');
  assert.ok(Math.abs(f.viewJoints().head.x - f.joints().head.x) < 0.1, 'the head did not come back');
});

test('while spinning, the head trails the way it is drawn', () => {
  // A spin move draws the fighter facing away: its lag must follow the drawn frame
  const game = load();
  const f = game.fighters[0];
  hold(f, { spin: true });
  for (let i = 0; i < 10; i++) f.stepLook(DT);
  f.vx = 300;
  let most = 0;
  for (let t = 0; t < 0.1; t += DT) { f.stepLook(DT); most = Math.min(most, f.viewJoints().head.x - f.joints().head.x); }
  assert.ok(most < -0.5, 'the head trailed only ' + most + ' px');
});

test('lag never stretches a limb', () => {
  const game = load('?count=4&mode=ffa');
  const { L } = game;
  for (let t = 0; t < 10; t += DT) {
    game.update(DT);
    for (const f of game.fighters) {
      if (f.rag || !f.V) continue;
      const V = f.V;
      assert.ok(Math.abs(dist(V.head, V.sh) - (L.neck + L.head)) < 1e-6, 'neck drawn ' + dist(V.head, V.sh));
      assert.ok(Math.abs(dist(V.hF, V.eF) - L.farm) < 1e-6, 'front forearm drawn ' + dist(V.hF, V.eF));
      assert.ok(Math.abs(dist(V.hB, V.eB) - L.farm) < 1e-6, 'back forearm drawn ' + dist(V.hB, V.eB));
    }
  }
});

test('lag is clamped', () => {
  const game = load('?count=4&mode=ffa');
  const { LAG } = game;
  for (let t = 0; t < 10; t += DT) {
    game.update(DT);
    for (const f of game.fighters) {
      const g = f.look.lag;
      assert.ok(len(g.head) <= LAG.max.head + 1e-9, 'head lag ' + len(g.head));
      assert.ok(len(g.hF) <= LAG.max.hand + 1e-9 && len(g.hB) <= LAG.max.hand + 1e-9, 'hand lag');
    }
  }
});

test('a teleport causes no lag', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  f.stepLook(DT);
  f.x += 400;
  for (let i = 0; i < 5; i++) {
    f.stepLook(DT);
    for (const k of ['head', 'hF', 'hB']) assert.equal(len(f.look.lag[k]), 0, k + ' lagged after a teleport');
  }
});

test('frozen means no lag', () => {
  const game = load();
  const f = game.fighters[0];
  hold(f);
  f.stepLook(DT); f.vx = 400; f.stepLook(DT);
  f.state = 'frozen';
  for (let i = 0; i < 10; i++) {
    f.vx = -f.vx; f.stepLook(DT);
    for (const k of ['head', 'hF', 'hB']) assert.equal(len(f.look.lag[k]), 0, k + ' lagged while frozen');
  }
});

test('lag stays bounded at dt = 0.1', () => {
  const game = load();
  const { LAG } = game;
  const f = game.fighters[0];
  hold(f);
  for (let i = 0; i < 30; i++) {
    f.vx = i % 2 ? 500 : -500; f.va = i % 3 ? 300 : -300;
    f.stepLook(0.1);
    for (const k of ['head', 'hF', 'hB']) assert.ok(Number.isFinite(len(f.look.lag[k])) && len(f.look.lag[k]) <= LAG.max.hand + 1e-9);
  }
});
