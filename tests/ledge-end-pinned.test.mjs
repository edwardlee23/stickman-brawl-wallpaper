// Runs main.js in a sandbox with floating platforms on and checks that a fighter standing near
// a ledge's end, with its queued move needing more room than it has, re-picks its move instead of
// backing off the end into a fall (issue #418): a ledge end pins it as a wall does.
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  return loadMain({ seed, properties: { platforms: { value: true } } }).game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

for (const side of [1, -1]) test(`a fighter 10 px from a ledge's ${side > 0 ? 'left' : 'right'} end, too close for its queued sidekick, re-picks its move and stays on the ledge`, () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = load(seed);
    const p = game.platforms.find(q => q.x1 < 480);   // The left ledge
    const [a, e] = game.fighters;
    const z = 50, ledge = game.groundY(z) - p.y;
    const kick = byId(game, 'sidekick');
    assert.ok(kick.range[0] > 12, 'the sidekick needs more room than 12: ' + kick.range[0]);
    // a's back is to the ledge's end; e flinches 12 in front of it, so it neither moves nor blocks
    const end = side > 0 ? p.x0 : p.x1;
    Object.assign(a, { x: end + side * 10, z, alt: ledge, va: 0, vx: 0, vz: 0, facing: side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e, nextMove: kick });
    Object.assign(e, { x: end + side * 22, z, alt: ledge, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
    for (const f of game.fighters) f.W = f.joints();
    let lowest = a.alt, repicked = false;
    for (let t = 0; t < 1; t += DT) {
      a.update(DT);
      if (!a.rag) a.W = a.joints();
      lowest = Math.min(lowest, a.alt);
      if (a.nextMove !== kick) repicked = true;
    }
    assert.ok(lowest > ledge - 1, `seed ${seed}: fell to ${lowest.toFixed(1)} from the ledge at ${ledge.toFixed(1)}`);
    assert.ok(repicked, `seed ${seed}: still waiting for room for the sidekick`);
  }
});
