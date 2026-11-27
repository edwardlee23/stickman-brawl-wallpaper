// Runs main.js in a sandbox with floating platforms on and only one style on, and checks that
// pickMove does not fall back to the martial-arts moves of styles that are off when every special
// of the style that is on is ruled out for the target (issue #459): here a fighter on the left
// ledge over a target on the floor below it, where every shot would burst on the ledge and a bolt
// would stop on it. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function setup(style) {
  const { game } = loadMain({ seed: 7, properties: { platforms: { value: true } } });
  for (const k of Object.keys(game.cfg.styles)) game.cfg.styles[k] = k === style;
  const p = game.platforms.reduce((q, r) => (r.x0 < q.x0 ? r : q));   // The left ledge
  const [a, e] = game.fighters, z = 40;
  const hold = () => {
    Object.assign(a, { x: 287, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e, nextMove: null });
    Object.assign(e, { x: 247, z, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: a });
  };
  // A few frames so that both have their joints placed, which the ledge checks aim at
  for (let i = 0; i < 5; i++) { hold(); game.update(DT); }
  hold();
  return { game, a, e, p };
}

for (const style of ['magic', 'ninjutsu']) {
  test(`with only ${style} on, a fighter on a ledge over its target uses no move of a style that is off (#459)`, () => {
    const { game, a, e, p } = setup(style);
    assert.ok(a.x >= p.x0 && a.x <= p.x1 && a.alt > 0, 'the fighter is not on the ledge');
    const off = {};
    for (let i = 0; i < 1000; i++) {
      const m = game.pickMove(a, e);
      if (m.style !== style) off[m.id] = (off[m.id] || 0) + 1;
    }
    assert.deepEqual(off, {});
  });
}
