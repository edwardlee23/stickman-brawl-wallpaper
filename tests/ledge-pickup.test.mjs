// Runs main.js in a sandbox with a stubbed canvas and window, then checks that an item at
// rest on a floating platform is picked up only from that platform, never through it by a
// fighter on the floor below (issue #168).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run is the same (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener };
}

// A heart at rest on the left ledge at depth z, fighter a hurt and held still at the same x
// and depth, on the floor (onLedge false) or on the ledge; e far away and held still too
function setup(kind, z, onLedge) {
  const { game, we } = load();
  we.applyUserProperties({ platforms: { value: true }, items: { value: true } });
  const p = game.platforms[0];
  const [a, e] = game.fighters;
  const x = (p.x0 + p.x1) / 2;
  const it = game.spawnItem(kind, x, z, game.groundY(z) - p.y);
  it.rest = true;
  Object.assign(a, { x, z, alt: onLedge ? game.groundY(z) - p.y : 0, vx: 0, va: 0, state: 'hit', st: 0, dur: 99, hp: 50, cool: 99, held: null });
  Object.assign(e, { x: x + 600, z, alt: 0, vx: 0, state: 'hit', st: 0, dur: 99, cool: 99 });
  a.W = a.joints(); e.W = e.joints();
  game.update(1 / 60);
  return { game, a, it };
}

test('a fighter on the floor under a ledge does not pick up an item on top of it (#168)', () => {
  for (const z of [0, 10, 20, 30]) {
    const { game, a, it } = setup('heart', z, false);
    assert.ok(game.items.includes(it), 'the heart left the ledge at depth ' + z);
    assert.equal(a.hp, 50, 'healed through the ledge at depth ' + z);
    for (const kind of ['staff', 'boomerang']) {
      const r = setup(kind, z, false);
      assert.ok(r.game.items.includes(r.it), 'the ' + kind + ' left the ledge at depth ' + z);
      assert.equal(r.a.held, null, 'took the ' + kind + ' through the ledge at depth ' + z);
    }
  }
});

test('a fighter standing on the ledge still picks up an item lying on it (#168)', () => {
  const { game, a, it } = setup('heart', 20, true);
  assert.ok(!game.items.includes(it), 'the heart is still on the ledge');
  assert.ok(Math.abs(a.hp - 80) < 1e-9, 'healed by 30: ' + a.hp);
});
