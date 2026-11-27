// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// knocked-out body falling past the end of a floating ledge is not flung upward by the
// corner correction in ragCorners (issue #306).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), set before main.js runs, so every run is the same
  const { game } = loadMain({ search: '?count=4&mode=ffa', properties: { platforms: { value: true } } });
  // Everyone but the fighter under test stays out of the way, flinching on the floor at the far right
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0] };
}

test('a knocked-out body falling past a ledge end is not flung upward', () => {
  const bad = [];
  for (let x = 200; x <= 600; x += 10) for (const vx of [-400, -300, -200, -100, 100, 200, 300, 400]) {
    const { game, a } = load();
    const p = game.platforms.reduce((l, q) => (q.x0 < l.x0 ? q : l));   // The left ledge
    const z = 60;
    Object.assign(a, { x, z, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999 });
    a.alt = game.groundY(z) - p.y + 80;
    a.W = a.joints(); a.hp = 0; a.ko(vx, 0);
    const y0 = a.rag.pts.hip.y;
    let prev = y0, fast = 0, high = Infinity;
    for (let t = 1 / 60; t < 3; t += 1 / 60) {
      game.update(1 / 60);
      const y = a.rag.pts.hip.y;
      if (t > 0.3) { fast = Math.max(fast, (prev - y) * 60); high = Math.min(high, y); }
      prev = y;
    }
    if (fast > 400 || high < y0) bad.push(`x ${x} vx ${vx}: hip rose at ${fast.toFixed(0)}/s, to ${high.toFixed(0)} from ${y0.toFixed(0)}`);
  }
  assert.deepEqual(bad, []);
});
