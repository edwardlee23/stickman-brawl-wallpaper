// Runs main.js in a sandbox with a stubbed canvas and window, then counts how an idle enemy
// reacts to a warned attack across many seeds (issue #385): every attack is dodged at the
// rate a strike is, including the ones that cannot be blocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  const { game, context } = loadMain({ seed: 385, properties: {} });
  const [a, e] = game.fighters;
  a.target = e; e.target = a;
  return { game, a, e, context };
}
function place(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, st: 0, dur: 0, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, subFrom: null, subT: 0, move: null, md: null, ...o });
  f.W = f.joints();
}
const move = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
// Over 1000 seeds, the enemy idle 40 px in front of the attacker, counts each reaction to
// the warning `start` gives
function reactions(id, start) {
  const { game, a, e, context } = load();
  const m = move(game, id);
  const n = { block: 0, dodge: 0, other: 0, none: 0 };
  for (let s = 1; s <= 1000; s++) {
    place(a, { x: 400, z: 60, state: 'idle', facing: 1 });
    place(e, { x: 440, z: 60, state: 'idle', facing: -1 });
    context.__seed = s * 7919;
    start(a, m);
    if (e.state === 'block') n.block++;
    else if (e.evade > 0) n.dodge++;
    else if (e.state !== 'idle' || e.subFrom) n.other++;
    else n.none++;
  }
  return n;
}

test('a throw is dodged as often as a jab and never blocked (#385)', () => {
  const jab = reactions('jab', (a, m) => a.startMove(m));
  const thr = reactions('seoinage', (a, m) => a.startMove(m));
  assert.ok(jab.block > 150, 'jab blocks ' + jab.block);
  assert.equal(thr.block, 0, 'a throw was blocked');
  assert.ok(Math.abs(thr.dodge - jab.dodge) <= 30, 'dodges: throw ' + thr.dodge + ', jab ' + jab.dodge);
  assert.ok(Math.abs(thr.dodge - 120) <= 30, 'throw dodges ' + thr.dodge);
});

test('an attack that comes round the guard is dodged as often as a jab and never blocked (#385)', () => {
  const jab = reactions('jab', (a, m) => a.startMove(m));
  const round = reactions('jab', (a, m) => { a.move = m; a.warn(55, false, true); });
  assert.equal(round.block, 0, 'an unguardable attack was blocked');
  assert.ok(Math.abs(round.dodge - jab.dodge) <= 30, 'dodges: unguardable ' + round.dodge + ', jab ' + jab.dodge);
});
