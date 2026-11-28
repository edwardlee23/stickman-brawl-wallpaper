// Runs main.js in a sandbox with floating platforms on and checks wall runs and dives at a
// fighter standing on the same side ledge at large figure sizes, where that ledge sits at or
// near the jump ceiling (issue #498). The wall run's climb stopped at the ceiling and its leap,
// steering up at the target's body, counted as a miss one step in; now it flies level along the
// ceiling into the target. A dive from a ledge at the ceiling has no room to jump and lands at
// once, so it is not picked there. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed, scale) {
  return loadMain({
    seed, expose: 'window.__in = { specialFits };',
    properties: { platforms: { value: true }, figurescale: { value: scale } },
  });
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a and e stand on the left side ledge at depth 60, a at frac a of its width and e at frac e;
// a starts the move id at e, held standing. Returns whether it hit and whether it fit.
function sameLedge(seed, scale, id, fa, fe) {
  const { game, window } = load(seed, scale);
  const p = game.platforms.reduce((q, r) => (r.x0 < q.x0 ? r : q));
  const [a, e] = game.fighters;
  const z = 60, alt = game.groundY(z) - p.y, w = p.x1 - p.x0;
  Object.assign(a, { x: p.x0 + w * fa, z, alt, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  const hold = () => Object.assign(e, { x: p.x0 + w * fe, z, alt, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', st: 0, hp: 1000, cool: 99, retarget: 99, target: a });
  hold();
  for (const f of game.fighters) f.W = f.joints();
  const m = byId(game, id), fits = window.__in.specialFits(a, m, e);
  a.startMove(m);
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (game.stats.hits[id]) break;
    hold(); e.W = e.joints();
  }
  return { hit: (game.stats.hits[id] || 0) > 0, fits, ledge: p.y };
}

for (const scale of [165, 175, 200]) {
  test('at figure size ' + scale + '% a wall run at a fighter on the same ceiling-height side ledge hits (#498)', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = sameLedge(seed, scale, 'wallrun', 0.6, 0.3);
      assert.ok(r.ledge < 125, 'the side ledge is near the jump ceiling, at y ' + r.ledge);
      if (r.hit) hits++;
    }
    assert.ok(hits >= 36, hits + ' of 40 wall runs hit');
  });
}

test('at figure size 165% a dive at a fighter on the same side ledge, below the ceiling, still fits and hits (#498)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = sameLedge(seed, 165, 'dive', 0.25, 0.75);
    assert.ok(r.fits, 'seed ' + seed + ': fits');
    assert.ok(r.hit, 'seed ' + seed + ': hits');
  }
});

for (const scale of [175, 200]) {
  test('at figure size ' + scale + '% a dive is not picked from a side ledge at the jump ceiling (#498)', () => {
    const r = sameLedge(1, scale, 'dive', 0.25, 0.75);
    assert.equal(r.ledge, 110, 'the side ledge is at the jump ceiling');
    assert.equal(r.fits, false, 'a dive from there lands at once, so it does not fit');
  });
}
