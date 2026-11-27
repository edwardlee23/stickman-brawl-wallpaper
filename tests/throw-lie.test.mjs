// Runs main.js in a sandbox with a stubbed canvas and window, then checks that an
// over-the-shoulder throw made on a floating platform lays the victim on that platform,
// or on the floor past its end, whatever the victim's hip height at the grab (issue #216):
// a crouched victim's hip is lower than in the lying pose the throw ends in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // Seeded, so the damage and lying time a throw rolls are the same every run
  const { game } = loadMain({ search: '?count=4&mode=ffa', seed: 216, properties: { platforms: { value: true } } });
  // Everyone else stays out of the way, flinching on the floor at the far right
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0], e: game.fighters[1] };
}

// Copies of main.js's GUARD, CROUCH and DOWN poses, which its closure keeps private
const GUARD = { t: 0.12, aB: 0.45, eB: 2.25, aF: 0.95, eF: 1.6, lB: -0.38, kB: -0.22, lF: 0.35, kF: -0.3 };
const poses = {
  GUARD,
  CROUCH: { ...GUARD, t: 0.6, aF: 0.6, eF: 0.8, aB: 0.2, eB: 0.6, lF: 1.2, kF: -2.2, lB: -0.2, kB: -1.6 },
  DOWN: { ...GUARD, t: 0, aF: 0.25, eF: 0.2, aB: -0.25, eB: 0.2, lF: 0.08, kF: -0.05, lB: -0.08, kB: -0.05 },
};

for (const name of ['CROUCH', 'GUARD', 'DOWN']) {
  test(`a throw on a platform lays a victim grabbed in the ${name} pose on it or on the floor, never in the air`, () => {
    const { game, a, e } = load();
    const z = 60, bad = [];
    for (const p of game.platforms) {
      for (const dir of [1, -1]) {
        for (let x = p.x0; x <= p.x1; x += 3) {
          const alt = game.groundY(z) - p.y;
          Object.assign(a, { x, z, alt, va: 0, vx: 0, vz: 0, facing: dir, state: 'attack', hp: 1000, rot: 0 });
          Object.assign(e, { x: x + dir * 22, z, alt, va: 0, vx: 0, vz: 0, facing: -dir, state: 'idle', hp: 1000, rot: 0, th: null });
          a.pose = { ...poses.GUARD }; e.pose = { ...poses[name] };
          a.W = a.joints(); e.W = e.joints();
          a.move = game.MOVES.find(m => m.id === 'seoinage');
          a.applyGrab(e);
          assert.equal(e.state, 'thrown');
          // Steps the way the game does, which recomputes the joints (and hip height) each frame
          for (let t = 0; t < 1.3 && e.state === 'thrown'; t += 1 / 60) { e.update(1 / 60); e.W = e.joints(); }
          assert.equal(e.state, 'down');
          const under = e.alt === 0 || game.platforms.some(q =>
            e.x >= q.x0 && e.x <= q.x1 && Math.abs(game.groundY(z) - q.y - e.alt) < 1e-6);
          if (!under) bad.push(`thrower at x ${x.toFixed(0)} facing ${dir}: victim lies at x ${e.x.toFixed(1)} alt ${e.alt.toFixed(1)}`);
        }
      }
    }
    assert.deepEqual(bad, [], 'every victim lies on a surface');
  });
}
