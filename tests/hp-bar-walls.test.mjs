// Runs main.js in a sandbox with a recording canvas, to check that a fighter's health bar
// stays inside the side walls, so its fill shows the health left (issue #352)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper with a context that keeps the styles set on it and logs each fillRect
function load() {
  const rects = [], state = {};
  const ctx = new Proxy(state, {
    get: (s, k) => (k in s ? s[k] : (...a) => { if (k === 'fillRect') rects.push(a); return { addColorStop() {} }; }),
    set: (s, k, v) => { s[k] = v; return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, rects };
}
const worldW = 1280 / (720 / 540);

// The two rects of the first fighter's bar, its head put at headX, with 15% health left
function barAt(headX) {
  const { game, rects } = load();
  const [a, b] = game.fighters;
  Object.assign(a, { x: headX < worldW / 2 ? 14 : worldW - 14, z: 50, alt: 0 });
  Object.assign(b, { x: worldW / 2, z: 50, alt: 0 });
  for (const f of game.fighters) f.W = f.joints();
  a.W.head.x = headX;
  a.hp = a.maxHp * 0.15;
  rects.length = 0;
  game.render();
  // A bar is two 2.5 px tall rects; the other fighter's starts near the middle of the screen
  const bar = rects.filter(r => r[3] === 2.5 && Math.abs(r[0] - headX) < 40);
  assert.equal(bar.length, 2, 'the fighter has a two-part bar');
  return bar;
}

for (const [where, headX] of [['left', 8], ['right', worldW - 8]]) {
  test(`a fighter lying at the ${where} wall shows its health bar inside the walls (#352)`, () => {
    const [back, fill] = barAt(headX);
    assert.ok(back[0] >= 0 && back[0] + back[2] <= worldW, `bar spans ${back[0]} to ${back[0] + back[2]} of ${worldW}`);
    assert.equal(back[2], 26);
    assert.equal(fill[0], back[0], 'the fill starts where the bar does');
    assert.ok(Math.abs(fill[2] - 26 * 0.15) < 1e-9, `fill is ${fill[2]} px wide`);
  });
}
