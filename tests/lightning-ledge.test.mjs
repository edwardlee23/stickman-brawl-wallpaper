// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a floating
// platform stops a lightning bolt (issue #174): the bolt ends at the platform top and hits the
// fighter on it, not the one on the floor under it; in the open it still ends at the floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so the bolt's zigzag is the same on every run (issue #161)
  return loadMain({ search: '?count=3&mode=ffa', properties: { platforms: { value: true } } }).game;
}

// a casts lightning at x; e stands on the floor there and f at the screen height feet (or not at all)
function strike(game, x, feet) {
  const [a, e, f] = game.fighters, z = 50;
  const still = { z, facing: 1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, vx: 0, va: 0 };
  Object.assign(a, { x: x + 250, z, alt: 0, facing: -1, state: 'idle', target: e, vx: 0 });
  Object.assign(e, still, { x, alt: 0 });
  Object.assign(f, still, feet === undefined ? { x: 1200, alt: 0 } : { x, alt: game.groundY(z) - feet });
  for (const g of game.fighters) g.W = g.joints();
  a.startMove(game.MAGIC.find(m => m.id === 'lightning'));
  for (let t = 0; t < 1 && a.move; t += 1 / 60) { for (const g of game.fighters) g.W = g.joints(); a.update(1 / 60); }
  const bolt = game.fx.find(o => o.type === 'bolt');
  assert.ok(bolt, 'a bolt fell');
  return { e, f, end: bolt.pts[bolt.pts.length - 1][1] };
}

test('a platform stops the bolt: it ends at the top and hits only the fighter on it', () => {
  const game = load();
  const p = game.platforms[0], x = (p.x0 + p.x1) / 2;
  const { e, f, end } = strike(game, x, p.y);
  assert.ok(Math.abs(end - p.y) < 1e-6, 'bolt ends at y ' + end + ', platform top at ' + p.y);
  assert.ok(f.hp < 1000, 'the fighter on the platform is hit');
  assert.equal(e.hp, 1000, 'the fighter on the floor under it is not');
});

test('a platform with nobody on it still stops the bolt and spares the fighter under it', () => {
  const game = load();
  const p = game.platforms[0], x = (p.x0 + p.x1) / 2;
  const { e, end } = strike(game, x);
  assert.ok(Math.abs(end - p.y) < 1e-6, 'bolt ends at y ' + end + ', platform top at ' + p.y);
  assert.equal(e.hp, 1000, 'the fighter under the platform is not hit');
});

test('in the open the bolt ends at the floor and hits the fighter there', () => {
  const game = load();
  const p = game.platforms[0], x = p.x1 + 60;
  assert.ok(game.platforms.every(q => x < q.x0 || x > q.x1), 'no platform over x');
  const { e, end } = strike(game, x);
  assert.ok(Math.abs(end - game.groundY(50)) < 1e-6, 'bolt ends at the floor, y ' + end);
  assert.ok(e.hp < 1000, 'the fighter on the floor is hit');
});
