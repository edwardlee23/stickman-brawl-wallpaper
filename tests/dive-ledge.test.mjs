// Runs main.js in a sandbox with floating platforms on and checks that a dive started on the
// middle ledge jumps as high above that ledge as one started on the floor rises above the
// floor (issue #315). The dive turns downward 230 above the surface it started from, not 230
// above the floor, so from the back of the ledge it still jumps and reaches its target.
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  return loadMain({ seed, properties: { platforms: { value: true } } }).game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands at the middle ledge's left end at depth z; e flinches on the same ledge dx to its right.
// Steps a alone and returns how far it rose above the ledge, its phases and its dive hits.
function diveOnLedge(seed, z, dx) {
  const game = load(seed);
  const p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge is the highest
  const [a, e] = game.fighters;
  const ledge = game.groundY(z) - p.y;
  Object.assign(a, { x: p.x0 + 10, z, alt: ledge, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: p.x0 + 10 + dx, z, alt: ledge, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(byId(game, 'dive'));
  let top = a.alt;
  const phases = [a.md.ph];
  for (let t = 0; t < 3 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    top = Math.max(top, a.alt);
    if (a.md && a.md.ph !== phases.at(-1)) phases.push(a.md.ph);
  }
  return { rise: top - ledge, phases: phases.join('>'), hits: game.stats.hits.dive || 0 };
}

test('a dive started on the middle ledge at depth 110 jumps at least 100 above it and hits a target 80 away', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = diveOnLedge(seed, 110, 80);
    assert.ok(r.phases.startsWith('jump>dive'), `seed ${seed}: phases ${r.phases}`);
    assert.ok(r.rise >= 100, `seed ${seed}: rose ${r.rise.toFixed(1)} above the ledge`);
    assert.equal(r.hits, 1, `seed ${seed}: dive hits`);
  }
});
