// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a boomerang
// throw warns only the opponents its flight can reach (issue #461): one on a ledge high above
// the throw, or on the floor past the point where the boomerang turns back, does not block,
// dodge, shield or vanish from it, while the target in its path still reacts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadMain } from './load-main.mjs';

function load(roll) {
  const { game, context } = loadMain({ search: '?count=3&mode=ffa' });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  // A fixed roll picks the reaction warn() gives: 0.1 blocks, 0.3 dodges, 0.5 vanishes in smoke
  vm.runInContext('Math.random = () => ' + roll + ';', context);
  return game;
}

const held = { z: 60, vx: 0, vz: 0, va: 0, cool: 99, retarget: 99, hp: 1000 };

// a on the floor at x 300 throws a boomerang at its idle target t on the floor at x 500; an
// idle enemy b stands at x bx, bAlt up. Returns t and b once the boomerang has been thrown.
function throwAt({ bx, bAlt = 0, roll = 0.1 }) {
  const game = load(roll);
  const [a, t, b] = game.fighters;
  Object.assign(a, held, { x: 300, alt: 0, facing: 1, state: 'idle', target: t, held: { kind: 'boomerang' } });
  Object.assign(t, held, { x: 500, alt: 0, facing: -1, state: 'idle', target: a });
  Object.assign(b, held, { x: bx, alt: bAlt, facing: -1, state: 'idle', target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.MOVE_BY.boomerang, true);
  for (let k = 0; k < 60 && !a.md.t0; k++) {
    for (const f of game.fighters) f.W = f.joints();
    a.update(1 / 60);
  }
  assert.ok(a.md.t0, 'the boomerang was thrown');
  return { t, b };
}
const reacted = f => f.state !== 'idle' || f.evade > 0 || !!f.subFrom;

for (const [roll, how] of [[0.1, 'block'], [0.3, 'dodge'], [0.4, 'shield'], [0.5, 'vanish in smoke']]) {
  test('an enemy 125 up over a boomerang throw does not ' + how + ' (#461)', () => {
    const { t, b } = throwAt({ bx: 450, bAlt: 125, roll });
    assert.ok(reacted(t), 'the target in the path of the boomerang did not react');
    assert.ok(!reacted(b), 'the enemy 125 up reacted (' + b.state + ') to a boomerang thrown along the floor');
  });
  test('an enemy on the floor 400 ahead, past where a boomerang turns back, does not ' + how + ' (#461)', () => {
    const { t, b } = throwAt({ bx: 700, roll });
    assert.ok(reacted(t), 'the target in the path of the boomerang did not react');
    assert.ok(!reacted(b), 'the enemy at x 700 reacted (' + b.state + ') to a boomerang that turns back near x 600');
  });
}
