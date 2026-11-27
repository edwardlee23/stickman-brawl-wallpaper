// Runs main.js in a sandbox with floating platforms on and only one style on, and checks that
// pickMove does not fall back to the martial-arts moves of styles that are off when every special
// of the style that is on is ruled out for the target (issue #459): here a fighter on the left
// ledge over a target on the floor below it, where every shot would burst on the ledge and a bolt
// would stop on it. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function setup(style, ax = 287) {
  const { game } = loadMain({ seed: 7, properties: { platforms: { value: true } } });
  for (const k of Object.keys(game.cfg.styles)) game.cfg.styles[k] = k === style;
  const p = game.platforms.reduce((q, r) => (r.x0 < q.x0 ? r : q));   // The left ledge
  const [a, e] = game.fighters, z = 40;
  const hold = () => {
    Object.assign(a, { x: ax, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, facing: Math.sign(247 - ax), state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e, nextMove: null });
    Object.assign(e, { x: 247, z, alt: 0, va: 0, vx: 0, vz: 0, facing: Math.sign(ax - 247), state: 'idle', hp: 1000, cool: 99, retarget: 99, target: a });
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

// Only Magic or only Ninjutsu on, the fighter on the left ledge at x 110, in range of its target on
// the floor under that ledge at x 247, 5 s of the
// fight: the special it falls back on waits until it has moved to where it would land, so no shot
// or bolt that would burst or stop on that ledge (#420, #421) starts from it, and no move of a
// style that is off starts at all (#459)
for (const style of ['magic', 'ninjutsu']) {
  test(`with only ${style} on, a fighter on a ledge starts no shot or bolt that would burst on it, and no off-style move (#459)`, () => {
    const { game, a, e, p } = setup(style, 110);
    const started = [], start = a.startMove;
    a.startMove = function (m, ...rest) {
      started.push({ id: m.id, style: m.style, ledge: this.alt > 0 && !this.aloft() && this.x >= p.x0 && this.x <= p.x1 });
      return start.call(this, m, ...rest);
    };
    e.update = () => {};
    a.cool = 0; a.retarget = 99;
    for (let t = 0; t < 5; t += DT) {
      Object.assign(e, { x: 247, z: 40, alt: 0, va: 0, vx: 0, vz: 0, hp: 1000, target: a });
      a.retarget = 99; a.target = e;
      game.update(DT);
    }
    const bad = started.filter(s => s.style !== style || (s.ledge && ['fireball', 'ice', 'lightning', 'shuriken'].includes(s.id)));
    assert.deepEqual(bad, []);
  });
}

// Every style on, in the air, with the dive the only air special left (the others are made
// ground-only here) and the target too high above for it (#339): the dive is not started, as
// before #459, when the fighter fell back on a martial-arts move that updAir never starts
test('in the air, an air special ruled out for the target is not started as a fallback (#459)', () => {
  const { game } = loadMain({ seed: 7, properties: { platforms: { value: true } } });
  for (const k of Object.keys(game.cfg.styles)) game.cfg.styles[k] = true;
  for (const m of [...game.SUPER, ...game.MAGIC, ...game.NINJA]) if (m.id !== 'dive') m.air = false;
  const p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge, the highest
  const [a, e] = game.fighters, z = 40;
  for (let i = 0; i < 5; i++) game.update(DT);
  const dive = game.SUPER.find(m => m.id === 'dive');
  let dives = 0;
  for (let i = 0; i < 500; i++) {
    Object.assign(e, { x: (p.x0 + p.x1) / 2, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, state: 'idle', hp: 1000 });
    Object.assign(a, { x: (p.x0 + p.x1) / 2 - 200, z, alt: 10, va: 0, vx: 0, vz: 0, state: 'air', cool: 0, dash: 0, dashed: true, dj: true, hp: 1000, target: e, move: null });
    a.updAir(DT);
    if (a.state === 'attack' && a.move === dive) dives++;
  }
  assert.equal(dives, 0);
});
