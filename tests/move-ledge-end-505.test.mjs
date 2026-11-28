// Runs main.js in a sandbox with floating platforms on and checks that a shield, lightning
// bolt, boomerang throw or barrage started near a ledge end keeps its fighter on the ledge
// (issue #505). #383 stopped leftover walking speed at a ledge's ends for the fireball, ice,
// shuriken and blast only; these four only slowed the fighter, so one walking toward the end
// slid off it after a step and fell mid-move, and a barrage's own forward push drifted it off.
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  return loadMain({
    seed, properties: { platforms: { value: true } },
    expose: 'window.__stickmanBrawl.BOOMERANG = BOOMERANG;',
  }).game;
}
const byId = (game, id) => id === 'boomerang' ? game.BOOMERANG
  : [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands on a side ledge 3 in from its outer end, at depth 40, moving toward that end at
// speed vx, and starts move id at e, which flinches on the floor 150 px beyond the ledge's
// outer end (out) or its inner end. Steps a alone through the whole move; returns each step
// where a was off the ledge's span or had dropped below its height.
function moveAtEnd(seed, id, side, vx, out) {
  const game = load(seed);
  const ps = [...game.platforms].sort((p, q) => p.x0 - q.x0);
  const p = side < 0 ? ps[0] : ps.at(-1);
  const z = 40, [a, e] = game.fighters;
  const ledge = game.groundY(z) - p.y;
  const x = side < 0 ? p.x0 + 3 : p.x1 - 3;
  const ex = x + (out ? side : -side) * 150;
  Object.assign(a, { x, z, alt: ledge, va: 0, vx: side * Math.abs(vx), vz: 0, facing: side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: ex, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  if (id === 'boomerang') a.held = { kind: 'boomerang' };
  a.startMove(byId(game, id), id === 'boomerang');
  const bad = [];
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (a.x < p.x0 || a.x > p.x1 || a.alt < ledge - 1) bad.push(`t ${t.toFixed(2)} x ${a.x.toFixed(1)} alt ${a.alt.toFixed(1)}`);
  }
  return { bad, ended: a.state !== 'attack' };
}

for (const id of ['shield', 'lightning', 'boomerang', 'barrage']) {
  for (const [side, name] of [[-1, 'left'], [1, 'right']]) {
    test(`a ${id} started at the outer end of the ${name} ledge keeps its fighter on the ledge (#505)`, () => {
      for (const vx of [0, 110, 130]) for (const out of [true, false]) for (let seed = 1; seed <= 3; seed++) {
        const r = moveAtEnd(seed, id, side, vx, out);
        const tag = `seed ${seed}, vx ${vx}, target ${out ? 'outside' : 'inside'}`;
        assert.ok(r.ended, `${tag}: the move did not end`);
        assert.deepEqual(r.bad, [], `${tag}: left the ledge`);
      }
    });
  }
}
