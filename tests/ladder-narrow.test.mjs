// Ladder rules on a narrow screen (issue #171): with many fighters and large figures the
// waiting fighters' spacing shrinks, so each stays on screen and clear of the two who fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load(w, h) {
  // A seeded generator, so every run shuffles the ladder the same way (issue #161)
  const { game, window } = loadMain({ width: w, height: h, seed: 1 });
  return { game, we: window.wallpaperPropertyListener };
}

for (const [w, h] of [[1920, 1080], [1024, 768], [1080, 1920]]) {
  test('Ladder at ' + w + 'x' + h + ' with 16 fighters at 200%: the waiting stay on screen and clear of the bout', () => {
    const { game, we } = load(w, h);
    we.applyUserProperties({ fightercount: { value: 16 }, figurescale: { value: 200 }, roundrules: { value: 'ladder' } });
    const worldW = w / (2 * h / 540);
    const bout = game.fighters.filter(f => f.state !== 'wait');
    const wait = game.fighters.filter(f => f.state === 'wait');
    assert.equal(bout.length, 2);
    assert.equal(wait.length, 14);
    for (const f of wait) {
      assert.ok(f.x >= 14 && f.x <= worldW - 14, 'waiting fighter on screen: x ' + f.x + ' of ' + worldW);
      for (const b of bout) assert.ok(Math.abs(f.x - b.x) >= 24, 'waiting x ' + f.x + ' too close to bout x ' + b.x);
    }
    // Each side faces the middle and stays on its own side of the bout
    const [lo, hi] = bout.map(f => f.x).sort((p, q) => p - q);
    for (const f of wait) assert.ok(f.x < lo || f.x > hi, 'waiting x ' + f.x + ' between the two fighting');
  });
}
