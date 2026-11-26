// A resize while Wallpaper Engine has the wallpaper paused draws one frame (issue #256):
// setting canvas.width clears the canvas, and paused frames draw nothing, so without it the
// screen stayed blank until the wallpaper resumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper at 1280 x 720 with a screen context that logs every call as
// [name, ...args], and a seeded Math.random (an LCG, as the other tests seed it)
function load() {
  const screen = [];
  const ctx = new Proxy({}, { get: (_, k) => (...args) => { screen.push([k, ...args]); return { addColorStop() {} }; }, set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  let next = null, t = 0;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (k, f) => { listeners[k] = f; } };
  const context = vm.createContext({
    window, console, URLSearchParams,
    performance: { now: () => 0 },
    location: { search: '?count=2' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame: cb => { next = cb; },
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
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
