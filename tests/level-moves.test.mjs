// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the shadow
// clones and the rising uppercut are not picked or started against a target on another
// level of the floating platforms, where they can never hit (issue #166).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  return loadMain({ seed: 1, properties: { platforms: { value: true } } }).game;
}

// Only one style on; fighter a stands on the left ledge or on the floor, e stands still at
// the other height, gap to the right of a
function setup(style, aOnLedge, gap) {
  const game = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === style;
  const [a, e] = game.fighters;
  const p = game.platforms[0], z = 50, ledge = game.groundY(z) - p.y;
  assert.ok(ledge > 60, 'the ledge is high above the floor: ' + ledge);
  Object.assign(a, { x: p.x0 + 20, z, alt: aOnLedge ? ledge : 0, facing: 1, state: 'idle', target: e, retarget: 99, va: 0, vx: 0, cool: 0 });
  Object.assign(e, { x: p.x0 + 20 + gap, z, alt: aOnLedge ? 0 : ledge, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  // Every move a starts, with the target's height above a's at that moment
  const starts = [];
  const start = a.startMove;
  a.startMove = function (m, ...rest) { starts.push([m.id, e.alt - a.alt]); return start.call(this, m, ...rest); };
  return { game, a, e, starts };
}
const run = (game, a, e, secs) => {
  for (let t = 0; t < secs; t += 1 / 60) { a.W = a.joints(); e.W = e.joints(); a.update(1 / 60); }
};

for (const aOnLedge of [true, false]) {
  test('queued shadow clones never start against a target on another level (' + (aOnLedge ? 'ledge to floor' : 'floor to ledge') + ')', () => {
    for (let k = 0; k < 10; k++) {
      const { game, a, e, starts } = setup('ninjutsu', aOnLedge, 150);
      for (let i = 0; i < k; i++) Math.random();
      a.nextMove = game.NINJA.find(m => m.id === 'clones');
      run(game, a, e, 2);
      for (const [id, dAlt] of starts) if (id === 'clones') assert.ok(Math.abs(dAlt) < 45, 'clones started ' + dAlt.toFixed(0) + ' from the target height');
    }
  });
}

test('a queued rising uppercut never starts against a target below on the floor', () => {
  for (let k = 0; k < 10; k++) {
    const { game, a, e, starts } = setup('super', true, 30);
    for (let i = 0; i < k; i++) Math.random();
    a.nextMove = game.SUPER.find(m => m.id === 'rising');
    run(game, a, e, 2);
    for (const [id, dAlt] of starts) if (id === 'rising') assert.ok(dAlt > -35, 'rising started ' + dAlt.toFixed(0) + ' above the target');
  }
});

test('the clones and the rising uppercut are not picked against a target on another level', () => {
  const { game, a, e } = setup('super', true, 30);
  const picks = new Set();
  game.cfg.styles.ninjutsu = true;
  for (let i = 0; i < 300; i++) picks.add(game.pickMove(a, e, 30).id);
  assert.ok(!picks.has('rising'), 'rising picked: ' + [...picks]);
  e.x = a.x + 150;
  for (let i = 0; i < 300; i++) picks.add(game.pickMove(a, e, 150).id);
  assert.ok(!picks.has('clones'), 'clones picked: ' + [...picks]);
  // On the same level both are still picked
  e.alt = a.alt;
  picks.clear();
  for (let i = 0; i < 300; i++) picks.add(game.pickMove(a, e, 150).id);
  assert.ok(picks.has('clones'), 'clones picked on the same level: ' + [...picks]);
  e.x = a.x + 30;
  for (let i = 0; i < 300; i++) picks.add(game.pickMove(a, e, 30).id);
  assert.ok(picks.has('rising'), 'rising picked on the same level: ' + [...picks]);
});
