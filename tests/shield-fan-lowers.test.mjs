// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// shield broken by a shuriken fan or an energy blast is lowered once the rest of
// the fan or volley has come (issue #380): the shield holder itself carries the
// fan that broke it, and must not count as a fighter still firing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function shieldAgainst(id) {
  const { game } = loadMain({ seed: 7 });
  const [a, e] = game.fighters;
  const all = [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA];
  // Attacker on the left facing right, the shield holder 300 to its right facing it.
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', target: e });
  Object.assign(e, { x: 600, z: 50, alt: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  e.startMove(all.find(m => m.id === 'shield'), true);
  e.md.from = a; e.md.hold = 1.2;
  a.startMove(all.find(m => m.id === id));
  let t = 0, broke = null, lastShot = null, lowered = null, fan = null;
  for (; t < 6; t += 1 / 60) {
    game.update(1 / 60);
    a.cool = 99; e.cool = 99;
    const up = e.state === 'attack' && e.move && e.move.type === 'shield';
    if (broke === null && up && e.md.ph === 'rec' && e.md.fan) { broke = lastShot = t; fan = e.md.fan; }
    // The last step a shot of the fan that broke the shield was still on its way to it or still to be fired
    if (fan && (game.shots.some(s => s.fan === fan && Math.sign(e.x - s.x) === Math.sign(s.vx)) || (a.state === 'attack' && a.md.fan === fan))) lastShot = t;
    if (broke !== null && lowered === null && !up) lowered = t;
  }
  return { broke, lastShot, lowered, e };
}

for (const id of ['shuriken', 'blast']) {
  test(`a shield broken by a ${id} is lowered once the rest of it has come (#380)`, () => {
    const { broke, lastShot, lowered, e } = shieldAgainst(id);
    assert.notEqual(broke, null, 'the shield was not broken by the ' + id);
    assert.notEqual(lowered, null, 'the broken shield was never lowered');
    assert.ok(lowered >= lastShot, `lowered at ${lowered.toFixed(2)} s, before the last shot at ${lastShot.toFixed(2)} s`);
    assert.ok(lowered - Math.max(broke, lastShot) <= 0.5, `lowered ${(lowered - Math.max(broke, lastShot)).toFixed(2)} s late`);
    assert.equal(e.hp, 1000, 'a shot hit through the broken shield');
  });
}
