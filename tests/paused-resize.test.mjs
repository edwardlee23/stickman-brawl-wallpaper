// A resize while Wallpaper Engine has the wallpaper paused draws one frame (issue #256):
// setting canvas.width clears the canvas, and paused frames draw nothing, so without it the
// screen stayed blank until the wallpaper resumed. A setting changed while paused draws one
// frame too (issue #307), so the screen does not keep showing the old colors or round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper at 1280 x 720 with a screen context that logs every call as
// [name, ...args], and a seeded Math.random (an LCG, as the other tests seed it)
function load() {
  const screen = [];
  const ctx = new Proxy({}, { get: (_, k) => (...args) => { screen.push([k, ...args]); return { addColorStop() {} }; }, set: () => true });
  const listeners = {};
  let next = null, t = 0;
  const { window, canvas } = loadMain({
    search: '?count=2', ctx, seed: 1,
    window: { addEventListener: (k, f) => { listeners[k] = f; } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  return {
    window, canvas, screen, game: window.__stickmanBrawl, we: window.wallpaperPropertyListener,
    resize: () => listeners.resize(),
    // Runs n frames and returns how many of them cleared the screen to the background
    frames: n => {
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        screen.length = 0; next(t += 1000 / 60);
        if (screen.some(([k, x, y, w, h]) => k === 'fillRect' && x === 0 && y === 0 && w === window.innerWidth && h === window.innerHeight)) drawn++;
      }
      return drawn;
    },
  };
}

test('a resize while paused draws one frame at the new size, then nothing more (#256)', () => {
  const w = load();
  assert.equal(w.frames(5), 5);
  w.we.setPaused(true);
  assert.equal(w.frames(10), 0, 'a paused frame drew');
  w.window.innerWidth = 1600; w.window.innerHeight = 900;
  w.resize();
  assert.equal(w.canvas.width, 1600);
  assert.equal(w.frames(60), 1, 'after a resize while paused, not exactly one frame drew');
  assert.equal(w.frames(60), 0, 'paused frames drew again with no resize');
  w.we.setPaused(false);
  assert.equal(w.frames(5), 5);
});

test('a paused frame drawn after a resize does not move the fight (#256)', () => {
  const w = load();
  w.frames(5);
  w.we.setPaused(true);
  const snap = () => JSON.stringify(w.game.fighters.map(f => [f.x, f.z, f.alt, f.time, f.st, f.state, f.hp]));
  w.window.innerWidth = 1600; w.window.innerHeight = 900;
  w.resize();
  const placed = snap();   // resize() may keep fighters inside the new walls; the frame must not
  w.frames(30);
  assert.equal(snap(), placed);
});

test('each setting change while paused draws exactly one frame, then nothing more (#307)', () => {
  const w = load();
  assert.equal(w.frames(30), 30);
  w.we.setPaused(true);
  assert.equal(w.frames(5), 0, 'a paused frame drew');
  const changes = [
    { linecolor: { value: '1 0 0' } },
    { fightercount: { value: 8 } },
    { backgroundtheme: { value: 'dojo' } },
  ];
  for (const p of changes) {
    w.we.applyUserProperties(p);
    assert.equal(w.frames(30), 1, 'after ' + Object.keys(p)[0] + ' while paused, not exactly one frame drew');
  }
  assert.equal(w.game.fighters.length, 8);
  assert.equal(w.frames(60), 0, 'paused frames drew again with no change');
  w.we.setPaused(false);
  assert.equal(w.frames(5), 5);
});
