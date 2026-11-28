// Pins the style switches at the three rules that pick a martial-arts move outside pickMove: the
// next strike of a combo, the counter after a parry and the strike that meets a strike. With every
// style off they choose from all the martial-arts moves, as pickMove does (README); with a style
// on they choose only its moves, whatever the roll (#493).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

// Two fighters face to face, d apart, with only the styles listed on. Math.random takes the next
// of state.seq while it has any, then state.fixed when set, then a seeded generator
function duel(d, styles) {
  const rnd = lcg(3);
  const state = { seq: [], fixed: null };
  const { game } = loadMain({ search: '?count=2&mode=ffa', ctx: stubContext(),
    random: () => (state.seq.length ? state.seq.shift() : state.fixed ?? rnd()) });
  for (const k in game.cfg.styles) game.cfg.styles[k] = styles.includes(k);
  const [a, b] = game.fighters;
  for (const f of [a, b]) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  Object.assign(a, { x: 400, facing: 1, target: b });
  Object.assign(b, { x: 400 + d, facing: -1, target: a });
  game.update(1 / 120);
  return { game, a, b, state };
}
const move = (game, id) => game.MOVES.find(m => m.id === id);
const MARTIAL = ['boxing', 'muaythai', 'taekwondo', 'judo', 'wrestling'];
// Rolls from 0 to just under 1
const ROLLS = [...Array(100).keys()].map(i => i / 100).concat(0.999);

// b parries a's cross at roll r: what b strikes back with, if anything
function counter(styles, r) {
  const { game, a, b, state } = duel(48, styles);
  a.startMove(move(game, 'cross'), true);
  state.fixed = r;
  b.parry(a, { x: 420, y: 300 });
  return { game, b };
}

// a throws m at b, who is warned and rolls 0.7 (the meeting band), then r for the strike it meets it with
function meet(styles, id, r) {
  const { game, a, b, state } = duel(48, styles);
  const m = move(game, id);
  a.startMove(m, true);
  state.seq = [0.7, r];
  a.warn(m.range[1] + 15, false);
  state.seq = [];
  return { game, b, m };
}

test('every style off: the parry counter strikes back with a martial-arts move (#493)', () => {
  for (const r of [0, 0.3, 0.6, 0.999]) {
    const { game, b } = counter([], r);
    assert.equal(game.stats.counters, 1, 'roll ' + r);
    assert.equal(b.state, 'attack');
    assert.ok(MARTIAL.includes(b.move.style), b.move.style);
  }
});

test('only boxing on: every parry counter is a boxing strike, whatever the roll (#493)', () => {
  for (const r of ROLLS) {
    const { game, b } = counter(['boxing'], r);
    assert.equal(game.stats.counters, 1, 'roll ' + r);
    assert.equal(b.move.style, 'boxing', 'roll ' + r + ': ' + b.move.id);
  }
});

test('every style off: a warned enemy meets a strike with one of the same limb (#493)', () => {
  for (const r of [0, 0.5, 0.999]) {
    const { b, m } = meet([], 'roundhouse', r);
    assert.equal(b.state, 'attack', 'roll ' + r);
    assert.equal(b.move.hit[0], m.hit[0]);
  }
});

test('only boxing on: every strike that meets a strike is a boxing strike, whatever the roll (#493)', () => {
  let met = 0;
  for (const id of ['jab', 'cross', 'roundhouse', 'teep']) {
    for (const r of ROLLS) {
      const { b } = meet(['boxing'], id, r);
      if (b.state !== 'attack') continue;
      met++;
      assert.equal(b.move.style, 'boxing', id + ' at roll ' + r + ' met with ' + b.move.id);
    }
  }
  assert.ok(met > 0, 'no strike was met');
});

test('every style off: a strike that lands still runs on into a combo (#493)', () => {
  let chained = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game } = loadMain({ seed });
    for (const k in game.cfg.styles) game.cfg.styles[k] = false;
    const [a, e] = game.fighters;
    const jab = move(game, 'jab');
    Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
    Object.assign(e, { x: 300 + (jab.range[0] + jab.range[1]) / 2, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
    for (const f of game.fighters) f.W = f.joints();
    a.startMove(jab, true);
    for (let t = 0; t < 3 && a.state === 'attack'; t += 1 / 60) game.update(1 / 60);
    chained += game.stats.combos;
  }
  assert.ok(chained >= 10, chained + ' combo strikes in 40 seeds');
});
