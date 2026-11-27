// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the specials
// which warn of their attack warn only the opponents they can reach in height (issue #382):
// an energy beam or a shot aimed high passes over an enemy on the floor, and shadow clones
// cast on the floor cannot reach an enemy up on a ledge, so neither reacts to them.
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

const held = { z: 50, vx: 0, vz: 0, va: 0, cool: 99, retarget: 99, hp: 1000 };

// a on the floor at x 400 uses move id at its target at x 700, tAlt up; an idle enemy b
// stands at x bx, bAlt up, facing a. With aimAtB, b is a's target instead: the shadow clones
// warn only their target (#415). Returns b once a's move has run its course.
function attack(id, { tAlt, bx, bAlt = 0, roll = 0.1, aimAtB = false }) {
  const game = load(roll);
  const [a, t, b] = game.fighters;
  Object.assign(a, held, { x: 400, alt: 0, facing: 1, state: 'idle', target: t });
  Object.assign(t, held, { x: 700, alt: tAlt, facing: -1, state: 'hit', st: 0, dur: 99, target: a });
  Object.assign(b, held, { x: bx, alt: bAlt, facing: -1, state: 'idle', target: a });
  if (aimAtB) a.target = b;
  for (const f of game.fighters) f.W = f.joints();
  const m = [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(x => x.id === id);
  a.startMove(m);
  for (let k = 0; k < 90 && a.move === m && b.state === 'idle' && !b.evade; k++) {
    for (const f of game.fighters) f.W = f.joints();
    a.update(1 / 60);
  }
  return b;
}
const reacted = b => b.state !== 'idle' || b.evade > 0 || !!b.subFrom;

for (const id of ['beam', 'fireball', 'ice', 'blast', 'shuriken']) {
  const an = id === 'ice' ? 'an ' : 'a ';
  test('an enemy on the floor does not react to ' + an + id + ' aimed high over it (#382)', () => {
    const b = attack(id, { tAlt: 260, bx: 560 });
    assert.ok(!reacted(b), 'the enemy on the floor reacted (' + b.state + ') to a ' + id + ' aimed high');
  });
  test('an enemy on the floor still reacts to ' + an + id + ' aimed along the floor (#382)', () => {
    const b = attack(id, { tAlt: 0, bx: 560 });
    assert.ok(reacted(b), 'the enemy in the path of a ' + id + ' did not react');
  });
}

for (const [roll, how] of [[0.3, 'dodge'], [0.5, 'vanish in smoke']]) {
  test('an enemy on a ledge 185 up does not ' + how + ' from shadow clones cast on the floor (#382)', () => {
    const b = attack('clones', { tAlt: 0, bx: 450, bAlt: 185, roll, aimAtB: true });
    assert.ok(!reacted(b), 'the enemy on the ledge reacted (' + b.state + ', evade ' + b.evade + ')');
  });
  test('an enemy on the floor still ' + (roll === 0.3 ? 'dodges' : 'vanishes in smoke') + ' from shadow clones cast on the floor (#382)', () => {
    const b = attack('clones', { tAlt: 0, bx: 450, roll, aimAtB: true });
    assert.ok(reacted(b), 'the enemy on the floor did not react');
  });
}
