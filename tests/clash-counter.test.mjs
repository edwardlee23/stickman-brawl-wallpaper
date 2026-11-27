// Pins clashes and counters: two strikes that meet knock both fighters back with no damage, a
// block made in time parries a strike and lets the blocker hit straight back, and an enemy
// warned of a strike may meet it with one of its own thrown with the same kind of limb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

// Loads two fighters face to face, d apart. R() is Math.random: a seeded generator unless the
// test sets fixed, which then takes its place
function duel(d, { styles } = {}) {
  const rnd = lcg(3);
  const state = { fixed: null };
  const { game } = loadMain({ search: '?count=2&mode=ffa', ctx: stubContext(), random: () => (state.fixed ?? rnd()) });
  if (styles) for (const k in game.cfg.styles) game.cfg.styles[k] = styles.includes(k);
  const [a, b] = game.fighters;
  for (const f of [a, b]) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  Object.assign(a, { x: 400, facing: 1, target: b });
  Object.assign(b, { x: 400 + d, facing: -1, target: a });
  game.update(1 / 120);
  return { game, a, b, state };
}
const move = (game, id) => game.MOVES.find(m => m.id === id);
const step = (game, n, dt = 1 / 120) => { for (let i = 0; i < n; i++) game.update(dt); };

test('two jabs thrown at each other at once meet: both fighters reel back, neither is hurt', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.99;   // No reactions to the warnings
  const jab = move(game, 'jab');
  a.startMove(jab, true); b.startMove(jab, true);
  for (let i = 0; i < 60 && !game.stats.clashes; i++) step(game, 1);
  assert.equal(game.stats.clashes, 1);
  assert.equal(a.state, 'hit'); assert.equal(b.state, 'hit');
  assert.equal(a.hp, 100); assert.equal(b.hp, 100);
  assert.ok(a.vx < 0 && b.vx > 0, 'pushed apart: ' + a.vx + ', ' + b.vx);
  assert.equal(game.stats.hits.jab, undefined);
});

test('a strike that lands on an enemy kicking back is a hit, not a clash: the limbs differ', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.99;
  a.startMove(move(game, 'jab'), true);
  b.startMove(move(game, 'axekick'), true);
  for (let i = 0; i < 40 && a.state === 'attack' && !a.hitDone; i++) step(game, 1);
  assert.equal(game.stats.clashes, 0);
  assert.ok(b.hp < 100, 'the jab did not land');
});

test('a block parries a strike when the roll is under the chance: no damage, and the blocker strikes back', () => {
  const { game, a, b, state } = duel(48, { styles: ['boxing'] });
  state.fixed = 0.1;   // Under the parry chance; under 0.25 the warning makes b block
  a.startMove(move(game, 'cross'));
  assert.equal(b.state, 'block');
  for (let i = 0; i < 60 && !game.stats.parries; i++) step(game, 1);
  assert.equal(game.stats.parries, 1);
  assert.equal(b.hp, 100);
  assert.equal(a.state, 'hit');
  assert.equal(a.move, null);
  assert.equal(b.state, 'attack');
  assert.equal(b.move.style, 'boxing');
  assert.equal(game.stats.counters, 1);
  // The counter warns nobody: the staggered attacker cannot block it
  assert.notEqual(a.state, 'block');
});

test('a block over the parry chance takes the hit as before: a little damage, pushed back', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.1;
  a.startMove(move(game, 'cross'));
  assert.equal(b.state, 'block');
  state.fixed = 0.9;
  for (let i = 0; i < 60 && !game.stats.blocked; i++) step(game, 1);
  assert.equal(game.stats.blocked, 1);
  assert.equal(game.stats.parries, 0);
  assert.ok(b.hp < 100 && b.hp > 98, 'hp ' + b.hp);
});

test('a warned enemy may meet a strike with one of the same limb, out no later than it', () => {
  const { game, a, b, state } = duel(48, { styles: ['boxing', 'muaythai', 'taekwondo'] });
  state.fixed = 0.7;   // In the meeting band, past the other reactions
  const m = move(game, 'roundhouse');
  a.startMove(m);
  assert.equal(b.state, 'attack');
  assert.equal(b.move.hit[0], m.hit[0]);
  assert.ok(b.move.wind <= m.wind + 0.02);
  assert.equal(b.facing, -1);
  assert.equal(b.target, a);
});

test('a warned enemy does not meet a throw', () => {
  const { game, a, b, state } = duel(20);
  state.fixed = 0.7;
  a.startMove(move(game, 'osotogari'));
  assert.equal(b.state, 'idle');
});

test('clashes and counters happen in a fight', () => {
  let clashes = 0, counters = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const { game } = loadMain({ search: '?count=6&mode=ffa', ctx: stubContext(), random: lcg(seed) });
    step(game, 60 * 120, 1 / 60);
    clashes += game.stats.clashes; counters += game.stats.counters;
  }
  assert.ok(clashes >= 3, clashes + ' clashes');
  assert.ok(counters >= 3, counters + ' counters');
});
