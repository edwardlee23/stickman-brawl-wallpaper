// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a slam landing
// on the floor does not hit a fighter standing on a floating platform (issue #262). At large
// figure sizes the side ledges are only about 25 above the floor, within the shockwave's reach
// in height; the ledge is between them, as the floor is for a slam landing on a ledge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  return loadMain({ properties: { platforms: { value: true }, figurescale: { value: 200 } } }).game;
}

// The victim stands near the right end of the left side ledge, at depth 0, at the altitude
// alt(game, p) returns; the slammer comes down on the floor 50 to its right, at depth 30, and lands its shockwave
function slamBeside(alt) {
  const game = load();
  const [a, e] = game.fighters;
  const p = game.platforms[0], x = p.x1 - 10;
  Object.assign(e, { x, z: 0, alt: alt(game, p), va: 0, vx: 0, vz: 0, state: 'idle', st: 0, cool: 999, hp: 1000, target: a, retarget: 999 });
  Object.assign(a, { x: x + 50, z: 30, alt: 0, va: 0, vx: 0, vz: 0, state: 'idle', st: 0, cool: 999, facing: -1, target: e, retarget: 999 });
  a.W = a.joints(); e.W = e.joints();
  a.startMove(game.SUPER.find(m => m.type === 'slam'));
  Object.assign(a.md, { ph: 'down', wasAir: true });
  Object.assign(a, { alt: 20, hover: true, va: -1300, vx: 0 });
  let landed = false;
  for (let i = 0; i < 30 && !landed; i++) {
    game.update(1 / 60);
    landed = a.md && a.md.ph === 'rec';
  }
  assert.ok(landed, 'the slam never landed');
  assert.equal(a.alt, 0, 'the slam landed on the floor');
  return { game, a, e, p };
}

test('a slam on the floor does not hit a fighter standing on a low side ledge', () => {
  const { game, e, p } = slamBeside((game, p) => game.groundY(0) - p.y);
  assert.ok(Math.abs(game.groundY(e.z) - e.alt - p.y) < 1e-6, 'the victim stands on the ledge');
  assert.ok(e.alt < 40, 'the ledge is within the shockwave\'s height, at altitude ' + e.alt);
  assert.equal(e.hp, 1000);
});

test('the same slam hits a fighter standing on the floor at that spot', () => {
  const { e } = slamBeside(() => 0);
  assert.ok(e.hp < 1000, 'the shockwave missed the fighter on the floor');
});
