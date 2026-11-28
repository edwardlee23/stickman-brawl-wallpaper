// Runs main.js in a sandbox and checks that a fighter splatted on a wall near the
// floor, tumbling after a launch or getting up is not drawn sunk into the floor,
// and that a knockout during a low splat does not make the body jump (issue #496).
// Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;
const SINK = 2;

function load() {
  const { game } = loadMain({ search: '?count=2&mode=ffa', random: 0.99 });
  const W = 1280 / (720 / 540);
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i % 2 ? 1 : -1) * 20, z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  return { game, W, f: game.fighters[0] };
}

// How far the lowest joint of the game joints and of the drawn joints is below f's floor line
function sunk(game, f) {
  const fy = game.groundY(f.z) - f.surfaceAlt();
  let worst = -Infinity, at = '';
  for (const J of [f.joints(), f.viewJoints()]) {
    for (const k in J) if (J[k].y - fy > worst) { worst = J[k].y - fy; at = k; }
  }
  return { worst, at };
}

// Launches f at altitude 3 into the wall on side at speed 700, as the issue does, and steps
// it alone until it splats
function lowSplat(f, W, side, facing) {
  Object.assign(f, { x: side < 0 ? 60 : W - 60, alt: 3, facing });
  f.launch(side * 700, 0);
  for (let i = 0; i < 60 && f.state === 'launched'; i++) { f.update(DT); f.W = f.joints(); }
  assert.equal(f.state, 'splat');
}

for (const side of [-1, 1]) {
  for (const facing of [-1, 1]) {
    const wall = side < 0 ? 'left' : 'right';
    test(`#496: a fighter facing ${facing} splatted low on the ${wall} wall is not drawn below the floor`, () => {
      const { game, W, f } = load();
      lowSplat(f, W, side, facing);
      for (let i = 0; i < 60 && f.state === 'splat'; i++) {
        const { worst, at } = sunk(game, f);
        assert.ok(worst <= SINK, `step ${i}: ${at} ${worst.toFixed(1)} below the floor`);
        f.update(DT); f.W = f.joints();
      }
    });

    test(`#496: a fighter facing ${facing} knocked out in a low splat on the ${wall} wall does not jump`, () => {
      const { game, W, f } = load();
      lowSplat(f, W, side, facing);
      f.update(DT); f.W = f.joints();
      f.hp = 0; f.koPending = true;
      game.update(DT);
      assert.equal(f.state, 'ko');
      const max = 12;
      for (let i = 0; i < 6; i++) {
        const before = Object.fromEntries(Object.entries(f.rag.pts).map(([k, p]) => [k, { x: p.x, y: p.y }]));
        game.update(DT);
        for (const k in before) {
          const d = Math.hypot(f.rag.pts[k].x - before[k].x, f.rag.pts[k].y - before[k].y);
          assert.ok(d < max, `step ${i}: ${k} moved ${d.toFixed(1)}, more than ${max}`);
        }
      }
    });
  }
}

for (const spin of [-14, -6, 6, 14]) {
  test(`#496: a fighter tumbling near the floor at spin ${spin} keeps its limbs above the floor`, () => {
    const { game, W, f } = load();
    Object.assign(f, { x: W / 2, alt: 2 });
    f.launch(80, 120);
    f.rotV = spin;
    for (let i = 0; i < 120 && f.state === 'launched'; i++) {
      const { worst, at } = sunk(game, f);
      assert.ok(worst <= SINK, `step ${i}: ${at} ${worst.toFixed(1)} below the floor`);
      f.update(DT); f.W = f.joints();
    }
  });
}

for (const fallSign of [-1, 1]) {
  test(`#496: a fighter getting up on side ${fallSign} keeps its limbs above the floor`, () => {
    const { game, W, f } = load();
    Object.assign(f, { x: W / 2, alt: 0, state: 'down', st: 0, downDur: 0, fallSign, rot: fallSign * Math.PI / 2 });
    f.update(DT);
    assert.equal(f.state, 'getup');
    for (let i = 0; i < 60 && f.state === 'getup'; i++) {
      f.update(DT); f.W = f.joints();
      const { worst, at } = sunk(game, f);
      assert.ok(worst <= SINK, `step ${i}: ${at} ${worst.toFixed(1)} below the floor`);
    }
  });
}
