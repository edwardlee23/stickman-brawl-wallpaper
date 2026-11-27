// Runs main.js in a sandbox with a stubbed canvas and window, then checks that
// nothing hurts the winner once a round is decided (issue #36).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  return loadMain().game;
}

for (const [kind, name] of [['star', 'shuriken'], ['ice', 'ice shard'], ['fire', 'fireball'], [undefined, 'blast']]) {
  test(`a ${name} thrown before its owner's knockout does not hurt the winner`, () => {
    const game = load();
    const [a, e] = game.fighters;
    Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle' });
    Object.assign(e, { x: 420, z: 50, alt: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1, cool: 99 });
    a.W = a.joints(); e.W = e.joints();
    const c = e.bodyPoint();
    // A shot from a, 40 px from e's body and flying at it; then a is knocked out
    game.shots.push({ x: c.x - 40, y: c.y, vx: 600, vy: 0, z: 50, owner: a, m: game.MOVES[0],
      life: 3, col: '#fff', kind, dmg: 5 });
    a.hp = 0; a.ko(0, 0);
    for (let t = 0; t < 1; t += 1 / 60) game.update(1 / 60);
    assert.ok(e.alive, 'the winner is still standing');
    assert.equal(e.hp, 1);
  });
}
