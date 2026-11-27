// Ladder rules and items (issue #221): a fighter waiting at the side cannot fight, so it does
// not stop a bout fighter from walking to an item next to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A fixed Math.random of 0.99 turns off the random jumps and dashes, so every run is the same
  const { game, window } = loadMain({ random: 0.99 });
  return { game, we: window.wallpaperPropertyListener };
}

test('under Ladder rules a waiting fighter next to a heart does not stop a hurt bout fighter from taking it (#221)', () => {
  const { game, we } = load();
  we.applyUserProperties({ fightercount: { value: 4 }, roundrules: { value: 'ladder' }, items: { value: true } });
  const bout = game.fighters.filter(f => f.state !== 'wait');
  const wait = game.fighters.filter(f => f.state === 'wait');
  assert.equal(bout.length, 2);
  assert.ok(wait.length >= 1);
  const [a, e] = bout, w = wait[0];
  // a is hurt and idle; its opponent is far away, held in a hit it does not recover from
  Object.assign(a, { x: 300, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'idle', cool: 99, retarget: 99, target: e, hp: 40 });
  Object.assign(e, { x: 1000, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  // A waiting fighter stands beside the heart on the same depth line
  Object.assign(w, { x: 200, z: 50, alt: 0, vx: 0, vz: 0 });
  for (const f of game.fighters) f.W = f.joints();
  const heart = game.spawnItem('heart', 240, 50, 0);
  for (let t = 0; t < 4 && game.items.includes(heart); t += 1 / 60) game.update(1 / 60);
  assert.ok(!game.items.includes(heart), 'the heart is still there: bout fighter at x ' + a.x.toFixed(1));
  assert.ok(a.hp > 40, 'hp did not rise: ' + a.hp);
});
