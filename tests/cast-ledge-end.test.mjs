// Runs main.js in a sandbox with floating platforms on and checks that a fireball, ice shard,
// shuriken fan or energy blast cast near a ledge end does not carry its caster past that end
// (issue #383, the same fault as the beam's #344). Each move hovered its caster whenever
// alt > 0, which includes standing on a ledge, so leftover walking speed carried a caster near
// a ledge end past it, where the hover held it in mid-air. Math.random is seeded, so each run
// is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  return loadMain({ seed, properties: { platforms: { value: true } } }).game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands on a side ledge 3 in from its outer end, at depth 40, moving toward that end at
// speed vx, and casts move id at e, which flinches on the floor 280 px away, beyond the
// ledge's outer end (out) or its inner end (in). Steps a alone through the whole move; returns
// each step where a was off the ledge's span while held in the air at or above its height.
function castAtEnd(seed, id, side, vx, out) {
  const game = load(seed);
  const ps = [...game.platforms].sort((p, q) => p.x0 - q.x0);
  const p = side < 0 ? ps[0] : ps.at(-1);
  const z = 40, [a, e] = game.fighters;
  const ledge = game.groundY(z) - p.y;
  const x = side < 0 ? p.x0 + 3 : p.x1 - 3;
  const ex = x + (out ? side : -side) * 280;
  Object.assign(a, { x, z, alt: ledge, va: 0, vx: side * Math.abs(vx), vz: 0, facing: side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: ex, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(byId(game, id));
  const bad = [];
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if ((a.x < p.x0 || a.x > p.x1) && a.alt >= ledge - 1) bad.push(`t ${t.toFixed(2)} x ${a.x.toFixed(1)} alt ${a.alt.toFixed(1)}`);
  }
  return { bad, ended: a.state !== 'attack' };
}

for (const id of ['fireball', 'ice', 'shuriken', 'blast']) {
  for (const [side, name] of [[-1, 'left'], [1, 'right']]) {
    test(`a ${id} cast at the outer end of the ${name} ledge, walking toward it, does not carry its caster past the end (#383)`, () => {
      for (const vx of [0, 110]) for (const out of [true, false]) for (let seed = 1; seed <= 5; seed++) {
        const r = castAtEnd(seed, id, side, vx, out);
        const tag = `seed ${seed}, vx ${vx}, target ${out ? 'outside' : 'inside'}`;
        assert.ok(r.ended, `${tag}: the move did not end`);
        assert.deepEqual(r.bad, [], `${tag}: hovered past the ledge end`);
      }
    });
  }
}
