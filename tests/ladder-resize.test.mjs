// Ladder rules across a resize (issue #312): the waiting rows were laid out only at round start,
// so a narrower window clamped every waiting fighter past the new right wall onto one spot,
// with the bout pushed into the same pile. After a resize they are laid out again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper in a window of the given size with a seeded Math.random, and returns its
// debug hook, the window, its resize listener and a function that runs one animation frame.
function load(width, height) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  let next = null;
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    addEventListener: (type, cb) => { listeners[type] = cb; },
  };
  const context = vm.createContext({
    window, console, URLSearchParams,
    performance: { now: () => 0 },
    location: { search: '?count=8&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame: cb => { next = cb; },
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener, window, resize: () => listeners.resize(), frame: now => next(now) };
}

function assertLaidOut(game, worldW, when) {
  const bout = game.fighters.filter(f => f.state !== 'wait');
  const wait = game.fighters.filter(f => f.state === 'wait');
  assert.equal(bout.length, 2, when + ': two fighting');
  assert.ok(wait.length >= 4, when + ': ' + wait.length + ' waiting');
  const xs = wait.map(f => f.x).sort((p, q) => p - q);
  for (const x of xs) assert.ok(x >= 14 && x <= worldW - 14, when + ': waiting fighter at x ' + x + ' of ' + worldW);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] - xs[i - 1] >= 4, when + ': waiting fighters share a spot: ' + xs.map(x => x.toFixed(1)));
  }
  const [lo, hi] = bout.map(f => f.x).sort((p, q) => p - q);
  assert.ok(hi - lo >= 4, when + ': the bout is piled on one spot: ' + lo + ', ' + hi);
  for (const f of wait) {
    for (const b of bout) assert.ok(Math.abs(f.x - b.x) >= 24, when + ': waiting x ' + f.x + ' too close to bout x ' + b.x);
    assert.ok(f.x < lo || f.x > hi, when + ': waiting x ' + f.x + ' between the two fighting');
  }
}

for (const [w, h] of [[405, 720], [640, 720], [720, 1280]]) {
  test('Ladder with 8 fighters resized from 1280x720 to ' + w + 'x' + h + ' mid-bout: the waiting stay apart and clear of the bout', () => {
    const { game, we, window, resize, frame } = load(1280, 720);
    we.applyUserProperties({ roundrules: { value: 'ladder' } });
    let t = 0;
    for (let i = 0; i < 30; i++) frame(t += 1000 / 60);
    assertLaidOut(game, 960, 'before the resize');
    window.innerWidth = w; window.innerHeight = h;
    resize();
    const worldW = w / (h / 540);
    assertLaidOut(game, worldW, 'right after the resize');
    // Waiting fighters do not walk, so the rows stay apart while the bout goes on
    for (let i = 0; i < 180; i++) frame(t += 1000 / 60);
    const wait = game.fighters.filter(f => f.state === 'wait').map(f => f.x).sort((p, q) => p - q);
    for (let i = 1; i < wait.length; i++) assert.ok(wait[i] - wait[i - 1] >= 4, '3 s later: waiting fighters share a spot: ' + wait);
  });
}
