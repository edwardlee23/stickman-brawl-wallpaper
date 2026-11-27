// Runs main.js in a sandbox with a stubbed canvas and window, then checks combos: a strike that
// lands on a reeling target may run straight on into the next strike of its chain (COMBO_NEXT),
// up to COMBO_MAX strikes, only with moves from styles that are on, and never at a target that
// blocked. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

// a strikes first, unwarned, from the middle of the jab's reach; e stands reeling, so it
// neither moves nor reacts
function load(seed, eState = 'hit') {
  const { game } = loadMain({ seed });
  const [a, e] = game.fighters;
  const r = jab(game).range;
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 300 + (r[0] + r[1]) / 2, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: eState, st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, e };
}
const jab = game => game.MOVES.find(m => m.id === 'jab');

// Starts the move and runs until a stops attacking; returns the strikes it threw in a row
function strikes(game, a, m) {
  const ids = [];
  a.startMove(m, true);
  for (let t = 0; t < 3 && a.state === 'attack'; t += DT) {
    if (a.move && a.move !== ids.at(-1)?.m) ids.push({ m: a.move, id: a.move.id });
    game.update(DT);
  }
  return ids.map(s => s.id);
}

test('a strike that lands can run on into the next strikes of its chain, up to COMBO_MAX', () => {
  let chained = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a } = load(seed);
    const ids = strikes(game, a, jab(game));
    assert.ok(ids.length <= game.COMBO_MAX, `seed ${seed}: ${ids} is longer than ${game.COMBO_MAX}`);
    for (let i = 1; i < ids.length; i++) {
      assert.ok(game.COMBO_NEXT[ids[i - 1]].includes(ids[i]), `seed ${seed}: ${ids[i - 1]} does not lead on to ${ids[i]}`);
    }
    if (ids.length > 1) chained++;
  }
  assert.ok(chained >= 10, 'combos in ' + chained + ' of 40 seeds');
});

test('every strike of a combo lands', () => {
  for (const first of Object.keys(loadMain().game.COMBO_NEXT)) {
    for (let seed = 1; seed <= 20; seed++) {
      const { game, a, e } = load(seed);
      const m = game.MOVES.find(x => x.id === first);
      e.x = 300 + (m.range[0] + m.range[1]) / 2; e.W = e.joints();
      const ids = strikes(game, a, m);
      assert.equal(game.stats.whiff, 0, `seed ${seed}: ${ids.join(' > ')} whiffed`);
    }
  }
});

test('every strike of a combo with a staff lands', () => {
  let chained = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a, e } = load(seed);
    game.cfg.items = true;
    a.held = { kind: 'staff', n: 99 };
    const m = game.withStaff(a, jab(game));
    e.x = 300 + (m.range[0] + m.range[1]) / 2; e.W = e.joints();
    const ids = strikes(game, a, m);
    assert.equal(game.stats.whiff, 0, `seed ${seed}: ${ids.join(' > ')} whiffed`);
    if (ids.length > 1) chained++;
  }
  // Fewer than bare: a staff strike reaches far, so fewer of them fit the distance left
  assert.ok(chained >= 3, 'combos in ' + chained + ' of 40 seeds');
});

test('a combo uses only the moves of styles that are on', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a } = load(seed);
    for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'boxing';
    const ids = strikes(game, a, jab(game));
    for (const id of ids) assert.equal(game.MOVES.find(m => m.id === id).style, 'boxing', `seed ${seed}: ${ids}`);
  }
});

test('a strike that is blocked starts no combo', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a } = load(seed, 'block');
    const ids = strikes(game, a, jab(game));
    assert.deepEqual(ids, ['jab'], `seed ${seed}`);
    assert.equal(game.stats.combos, 0);
  }
});

test('a move started anew starts a new combo count', () => {
  const { game, a } = load(1);
  a.combo = 3;
  a.startMove(jab(game), true);
  assert.equal(a.combo, 0);
});
