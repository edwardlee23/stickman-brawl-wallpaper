// Runs main.js in a sandbox with floating platforms on and checks that lightning is not picked
// at a target standing on the floor under a ledge (issue #421). The bolt stops at the first
// ledge top over the spot it falls on (#174), so there it can never reach the target. Math.random
// is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  return loadMain({ seed, properties: { platforms: { value: true } } }).game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands on the floor 250 px to the right of e, which flinches on the floor at x, both at depth
// 40. Returns how often pickMove chose lightning in 100 picks, and whether a bolt cast at e hit it.
function cast(seed, x) {
  const game = load(seed);
  const z = 40, [a, e] = game.fighters;
  const hold = () => Object.assign(e, { x, z, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'hit', st: 0, dur: 99, cool: 99, retarget: 99, target: a });
  Object.assign(a, { x: x + 250, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  hold(); e.hp = 1000;
  for (const f of game.fighters) f.W = f.joints();
  let picks = 0;
  for (let i = 0; i < 100; i++) if (game.pickMove(a, e).id === 'lightning') picks++;
  a.startMove(byId(game, 'lightning'));
  for (let t = 0; t < 2 && a.state === 'attack' && e.hp === 1000; t += DT) {
    hold(); a.cool = 99; a.retarget = 99;
    game.update(DT);
  }
  return { picks, hit: e.hp < 1000 };
}

test('lightning is not picked at a target on the floor under the middle ledge (#421)', () => {
  const game = load(1), p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q));
  const x = (p.x0 + p.x1) / 2;   // 480, under the middle of the middle ledge
  let picks = 0, hits = 0;
  for (let seed = 1; seed <= 20; seed++) { const r = cast(seed, x); picks += r.picks; if (r.hit) hits++; }
  assert.equal(hits, 0, 'a bolt reached a target under the ledge');
  assert.equal(picks, 0, `lightning picked ${picks} times in 2000 picks at a target under the ledge`);
});

test('lightning is still picked, and hits, at a target on open floor (#421)', () => {
  const game = load(1);
  const x = 340;
  assert.ok(game.platforms.every(p => x < p.x0 || x > p.x1), 'x 340 is under a ledge');
  let picks = 0, hits = 0;
  for (let seed = 1; seed <= 20; seed++) { const r = cast(seed, x); picks += r.picks; if (r.hit) hits++; }
  assert.equal(hits, 20);
  assert.ok(picks > 0, 'lightning is never picked on open floor');
});
