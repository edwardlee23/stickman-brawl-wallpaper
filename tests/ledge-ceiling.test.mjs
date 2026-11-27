// Runs main.js in a sandbox with a stubbed canvas and window, then checks that at large
// figure sizes, where the side ledges sit at the height of the jump ceiling, a fighter that
// reaches the ceiling over a ledge lands on it at once instead of gliding along it in the
// jump pose, unable to attack (issue #245).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load(scale, count = 2) {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  const { game, context } = loadMain({
    search: '?count=' + count + '&mode=ffa', seed: 1,
    // Sparks live inside main.js; a hook on push, run before it, notes where each grey dust spark starts
    prelude: 'globalThis.__dust = []; { const push = Array.prototype.push; Array.prototype.push = function (...v) { for (const o of v) if (o && o.col === "rgba(200,200,200,0.6)") push.call(__dust, { y: o.y }); return push.apply(this, v); }; }',
    properties: { platforms: { value: true }, figurescale: { value: scale } },
  });
  return { game, dust: () => context.__dust };
}

for (const scale of [174, 180, 200]) {
  test('at figure size ' + scale + '% a jump that tops out over a side ledge lands on it', () => {
    const { game, dust } = load(scale);
    const [a, e] = game.fighters;
    const p = game.platforms[0], z = 60, x = (p.x0 + p.x1) / 2, feet = game.groundY(z);
    assert.equal(p.y, 110, 'the ledge is at the jump ceiling, FIG_TOP');
    // The other fighter flinches on the floor under the other side ledge, out of the way
    const q = game.platforms[1];
    Object.assign(e, { x: (q.x0 + q.x1) / 2, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999, target: a });
    // The jump chaseSurface makes to get up onto a higher ledge
    Object.assign(a, { x, z, alt: 1, va: Math.sqrt(2 * 1400 * (feet - p.y + 30)), vx: 0, vz: 0, state: 'air', st: 0, cool: 99, dash: 0, target: e, dashed: true, dj: true });
    let landed = -1, n0 = 0;
    for (let i = 0; i < 90; i++) {
      n0 = dust().length;
      game.update(1 / 60);
      if (!a.aloft()) { landed = i; break; }
    }
    assert.ok(landed >= 0, 'came down');
    assert.ok(Math.abs(game.groundY(a.z) - a.alt - p.y) < 1, 'feet on the ledge, at y ' + (game.groundY(a.z) - a.alt));
    // The step that brings it onto the ledge ends the jump, or the next one when its feet came
    // within the half unit aloft() allows while still rising
    if (a.state === 'air') { n0 = dust().length; game.update(1 / 60); }
    assert.equal(a.state, 'idle', 'stands on the ledge');
    assert.ok(Math.abs(game.groundY(a.z) - a.alt - p.y) < 1, 'still on the ledge');
    const d = dust().slice(n0);
    assert.ok(d.length > 0, 'raised landing dust');
    for (const s of d) assert.ok(Math.abs(s.y - p.y) < 1, 'dust at y ' + s.y + ', ledge top at ' + p.y);
  });
}

test('in a fight at figure size 200% no fighter stays in the jump pose on a surface for more than a step', () => {
  const { game } = load(200, 6);
  const run = new Map();
  let longest = 0;
  for (let i = 0; i < 60 * 60; i++) {
    game.update(1 / 60);
    for (const f of game.fighters) {
      const n = f.state === 'air' && !f.aloft() ? (run.get(f) || 0) + 1 : 0;
      run.set(f, n);
      longest = Math.max(longest, n);
    }
  }
  assert.ok(longest <= 1, 'in the air pose on a surface for ' + longest + ' steps in a row');
});
