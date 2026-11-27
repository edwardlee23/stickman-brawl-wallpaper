// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the log
// and first puff of a substitution made on a ledge or in the air are where the fighter
// was, not on the floor under it (issue #258; #167 did the same for the other effects).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same
  return loadMain({ seed: 258, properties: { platforms: { value: true } } }).game;
}

// Puts the victim e at z 60 where place(game, z) says ({ x, alt }) with a substitution readied against
// a, has a jab from a hit it, and returns where its feet and the floor under it were, and
// the log and first puff.
function substitute(place, state) {
  const game = load();
  const [a, e] = game.fighters;
  const z = 60, { x, alt } = place(game, z);
  Object.assign(e, { x, z, alt, va: 0, vx: 0, facing: -1, state, hover: state === 'air', cool: 99, target: a });
  Object.assign(a, { x: x - 30, z, alt: e.alt, va: 0, vx: 0, facing: 1, state: 'idle', cool: 99, target: e });
  a.W = a.joints(); e.W = e.joints();
  e.subFrom = a; e.subT = 1;
  const feet = game.groundY(z) - e.alt, n0 = game.fx.length;
  // On a ledge or the floor it stands on that surface; in the air, no ledge is under it
  assert.equal(e.surfaceAlt(), state === 'air' ? 0 : alt, state === 'air' ? 'a ledge under the fighter in the air' : 'not standing where it was put');
  assert.equal(e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'head', e.bodyPoint()), 'sub', 'the substitution took the hit');
  const added = game.fx.slice(n0);
  return { feet, floor: game.groundY(z), log: added.find(o => o.type === 'log'), puff: added.find(o => o.type === 'puff') };
}

test('a substitution on a ledge leaves its log and first puff on the ledge (#258)', () => {
  const r = substitute((game, z) => {
    const p = game.platforms[0];   // Standing in the middle of its top
    return { x: (p.x0 + p.x1) / 2, alt: game.groundY(z) - p.y };
  }, 'idle');
  assert.ok(r.feet < r.floor - 50, 'feet at y ' + r.feet + ', not on a ledge above the floor at ' + r.floor);
  assert.equal(r.log.y, r.feet, 'log at y ' + r.log.y + ', feet at ' + r.feet);
  assert.equal(r.puff.y, r.feet - 40, 'puff at y ' + r.puff.y);
});

test('a substitution in the air leaves its log and first puff where the fighter was (#258)', () => {
  const r = substitute(() => ({ x: 640, alt: 150 }), 'air');
  assert.equal(r.log.y, r.feet, 'log at y ' + r.log.y + ', feet at ' + r.feet);
  assert.equal(r.puff.y, r.feet - 40, 'puff at y ' + r.puff.y);
});

test('a substitution on the floor leaves its log on the floor', () => {
  const r = substitute(() => ({ x: 640, alt: 0 }), 'idle');
  assert.equal(r.log.y, r.feet);
  assert.equal(r.puff.y, r.feet - 40);
});
