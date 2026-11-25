// Ladder rules on a narrow screen (issue #171): with many fighters and large figures the
// waiting fighters' spacing shrinks, so each stays on screen and clear of the two who fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(w, h) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: w, innerHeight: h, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator, so every run shuffles the ladder the same way (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener };
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
