// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a smoke
// escape from the shadow clones stays hidden until their strike has passed (issue #414):
// a target with no room on the far side reappears on the caster's side, so ending the
// escape before the strike let the clones hit it anyway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadMain } from './load-main.mjs';

test('a smoke escape from the shadow clones 40 px from the right wall takes no damage', () => {
  const { game, context } = loadMain();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  const [a, e] = game.fighters;
  // A fighter pushed past the right wall is put back at its edge, which tells where that edge is
  Object.assign(a, { x: 1e6, z: 50, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, cool: 99 });
  a.update(1 / 60);
  const wall = a.x + 14;
  const held = { z: 50, alt: 0, va: 0, vx: 0, vz: 0, cool: 99, retarget: 99 };
  Object.assign(a, held, { x: wall - 200, facing: 1, state: 'idle', st: 0, target: e });
  Object.assign(e, held, { x: wall - 40, facing: -1, state: 'idle', st: 0, hp: 1000, target: a });
  a.W = a.joints(); e.W = e.joints();
  // 0.5 makes the warned target vanish in smoke (warn() picks smoke from 0.47 to 0.55)
  vm.runInContext('Math.random = () => 0.5;', context);
  a.startMove(game.NINJA.find(m => m.id === 'clones'));
  let smoked = false;
  for (let i = 0; i < 120 && a.move && a.move.id === 'clones'; i++) {
    game.update(1 / 60);
    if (e.move && e.move.type === 'smoke') smoked = true;
    a.cool = 99; e.cool = 99;
  }
  assert.ok(smoked, 'the target did not vanish in smoke');
  assert.equal(game.stats.hits.clones || 0, 0, 'the clones hit the fighter after it reappeared');
  assert.equal(e.hp, 1000);
});
