// A resize and the poses drawn after it (issue #388). While paused, resize() moved fighters inside
// the new walls but the paused frame drew the joints taken before it, so a narrower screen showed
// health bars at the wall with the bodies past it. After a wider one, a fighter splatted on the
// right wall, one running up it, and the wall's crack kept their old x, in mid-screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper at the given size with a seeded Math.random (an LCG, as the other tests
// seed it), and returns its debug hook, the window, its resize listener and a frame runner
function load(search, width, height) {
  const listeners = {};
  let next = null, t = 0;
  const { window } = loadMain({
    search, width, height, seed: 1,
    window: { addEventListener: (k, f) => { listeners[k] = f; } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  return {
    window, game: window.__stickmanBrawl, we: window.wallpaperPropertyListener,
    resize: (w, h) => { window.innerWidth = w; window.innerHeight = h; listeners.resize(); },
    frames: n => { for (let i = 0; i < n; i++) next(t += 1000 / 60); },
  };
}

for (const rules of ['normal', 'ladder']) {
  test('a paused frame after a narrower resize draws fighters where they now stand, ' + rules + ' rules (#388)', () => {
    const w = load('?count=6', 1280, 720);
    w.we.applyUserProperties({ roundrules: { value: rules } });
    w.frames(180);
    w.we.setPaused(true);
    w.resize(640, 720);
    w.frames(1);
    const worldW = w.game.worldW;
    let standing = 0;
    for (const f of w.game.fighters) {
      if (!f.alive || f.rag || !f.W) continue;
      if (f.state === 'idle' || f.state === 'wait') {
        standing++;
        assert.ok(Math.abs(f.W.hip.x - f.x) < 1, '#' + f.id + ' ' + f.state + ' at x ' + f.x.toFixed(1) + ' drawn with hip at ' + f.W.hip.x.toFixed(1));
      }
      // A fighter stands at least 14 inside a wall, and a hand or foot may reach past that;
      // the body stays on screen, and nothing reaches further than an arm past the wall.
      // A thrown body turns about its hip, which follows the throw's path.
      const thrown = f.state === 'thrown';
      for (const k of thrown ? ['hip'] : ['head', 'sh', 'hip']) assert.ok(f.W[k].x <= worldW, '#' + f.id + ' ' + f.state + ' ' + k + ' drawn at x ' + f.W[k].x.toFixed(1) + ' past the wall at ' + worldW);
      if (!thrown) for (const k in f.W) assert.ok(f.W[k].x <= worldW + 24, '#' + f.id + ' ' + f.state + ' joint ' + k + ' drawn at x ' + f.W[k].x.toFixed(1) + ' past the wall at ' + worldW);
    }
    assert.ok(standing > 0, 'no fighter standing to check');
  });
}

// Sends the first fighter flying into the right wall until it sticks there
function splatRight(w) {
  const f = w.game.fighters[0];
  for (let i = 0; i < 60 && f.state !== 'splat'; i++) {
    if (f.state !== 'launched') { f.x = w.game.worldW - 60; f.launch(900, 200); }
    w.frames(1);
  }
  assert.equal(f.state, 'splat', 'the fighter never stuck to the wall');
  assert.equal(f.splatSide, 1);
  return f;
}

test('a fighter splatted on the right wall, and its crack, move to the wall of a wider screen (#388)', () => {
  const w = load('?count=2', 1280, 720);
  w.frames(30);
  const f = splatRight(w);
  const reachOf = () => Math.max(...Object.values(f.W).map(p => p.x));
  const oldW = w.game.worldW, off = oldW - f.x, gap = oldW - reachOf();
  assert.ok(w.game.fx.some(o => o.type === 'crack' && o.kind === 'wall' && o.x === oldW), 'no wall crack at the right wall');
  w.resize(1920, 720);
  const worldW = w.game.worldW;
  assert.ok(worldW > oldW + 100);
  w.frames(1);
  if (f.state === 'splat') {
    assert.ok(worldW - f.x <= off + 1, 'splatted at x ' + f.x.toFixed(1) + ', ' + (worldW - f.x).toFixed(1) + ' from the wall at ' + worldW);
    const reach = reachOf();
    assert.ok(worldW - reach <= Math.max(gap, 20) + 1, 'splatted body reaches x ' + reach.toFixed(1) + ', the wall is at ' + worldW);
  }
  for (const o of w.game.fx) {
    if (o.type !== 'crack' || o.kind !== 'wall' || o.x < 1) continue;
    assert.equal(o.x, worldW, 'wall crack at x ' + o.x + ', the wall is at ' + worldW);
    for (const pts of o.lines) assert.ok(Math.abs(pts[0][0] - worldW) < 1, 'crack lines drawn from x ' + pts[0][0]);
  }
});

test('a fighter running up the right wall keeps to the wall of a wider screen (#388)', () => {
  const w = load('?count=2', 1280, 720);
  w.frames(30);
  const f = w.game.fighters[0];
  f.x = w.game.worldW - 30; f.alt = 0; f.va = 0;
  f.startMove(w.game.MOVE_BY.wallrun, true);
  f.md.dir = 1;
  for (let i = 0; i < 60 && f.md && f.md.ph !== 'climb'; i++) w.frames(1);
  assert.equal(f.md && f.md.ph, 'climb', 'the fighter never ran up the wall');
  const oldW = w.game.worldW, off = oldW - f.x;
  w.resize(1920, 720);
  assert.ok(w.game.worldW - f.x <= off + 1, 'climbing at x ' + f.x.toFixed(1) + ', the wall is at ' + w.game.worldW);
});
