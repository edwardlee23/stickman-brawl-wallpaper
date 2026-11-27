// The first animation frame never steps the fight backwards (issue #255): in Chrome a
// requestAnimationFrame timestamp can be a few milliseconds earlier than a performance.now()
// read just before the request, which made the first step negative.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

test('a first frame timestamped before load steps no fighter timer backwards (#255)', () => {
  let next = null;
  // A seeded generator (an LCG) for Math.random, so every run is the same
  const { game } = loadMain({
    search: '?count=2',
    globals: {
      performance: { now: () => 1000 },   // Load reads 1000 ms
      requestAnimationFrame: cb => { next = cb; },
    },
  });
  const before = game.fighters.map(f => ({ time: f.time, st: f.st }));
  next(995);                         // The first rAF comes 5 ms "before" load
  game.fighters.forEach((f, i) => {
    assert.ok(f.time >= before[i].time, `fighter ${i}'s time went from ${before[i].time} to ${f.time}`);
    assert.ok(f.st >= 0, `fighter ${i}'s state timer is ${f.st}`);
  });
  const mid = game.fighters.map(f => f.time);
  next(995 + 1000 / 60);             // The next frame steps forward as usual
  game.fighters.forEach((f, i) => assert.ok(f.time > mid[i], `fighter ${i}'s time did not move on the second frame`));
});
