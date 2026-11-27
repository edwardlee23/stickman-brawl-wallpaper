// Runs main.js in a sandbox with floating platforms on and checks that a wall run started on
// the middle ledge reaches the wall and climbs (issue #346). The run goes off the middle ledge
// and lands on a side ledge or the floor on the way; that landing must not end the move, only a
// landing after the climb and leap does. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed, w, h, scale) {
  return loadMain({ seed, width: w, height: h, properties: { platforms: { value: true }, figurescale: { value: scale } } }).game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands on the middle ledge at fraction f of its span; e flinches on the floor under the ledge.
// Steps a alone through its wall run and returns the phases it went through.
function wallrunOnLedge(seed, w, h, scale, f) {
  const game = load(seed, w, h, scale);
  const p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge is the highest
  assert.equal(game.platforms.length, 3, 'the middle ledge is there');
  const worldW = p.x0 / 0.4;
  const [a, e] = game.fighters;
  const z = 60, ledge = game.groundY(z) - p.y;
  Object.assign(a, { x: p.x0 + (p.x1 - p.x0) * f, z, alt: ledge, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: worldW / 2, z: 20, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const g of game.fighters) g.W = g.joints();
  a.startMove(byId(game, 'wallrun'));
  const phases = [a.md.ph];
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (a.md && a.md.ph !== phases.at(-1)) phases.push(a.md.ph);
  }
  return phases.join('>');
}

for (const [w, h, scale] of [[1024, 768, 100], [1280, 720, 130]]) {
  test(`a wall run started on the middle ledge at ${w}x${h}, size ${scale}%, climbs the wall (#346)`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const f of [0.1, 0.9]) {
        const r = wallrunOnLedge(seed, w, h, scale, f);
        assert.ok(r.startsWith('run>climb'), `seed ${seed}, at ${f} of the ledge: phases ${r}`);
      }
    }
  });
}
