// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// fighter's health bar fades with it, as in a teleport, smoke escape or
// substitution (issue #170), the way its name tag and the King's crown do (#120).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('the health bar fades with its fighter (#170)', () => {
  // A context that keeps the styles set on it and logs each fillRect with the alpha it used
  const rects = [], state = {};
  const ctx = new Proxy(state, {
    get: (s, k) => (k in s ? s[k] : (...a) => { if (k === 'fillRect') rects.push({ args: a, alpha: s.globalAlpha }); return { addColorStop() {} }; }),
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
  // A seeded generator (an LCG), so every run is the same (issue #161)
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  assert.ok(game.cfg.showHP, 'health bars are on by default');
  const [a, b] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0 });
  Object.assign(b, { x: 900, z: 50, alt: 0 });
  for (const f of game.fighters) f.W = f.joints();
  a.alpha = 0.1;
  rects.length = 0;
  game.render();
  // A bar is two 2.5 px tall rects, 26 px wide at most, starting 13 px left of the head
  const bar = f => rects.filter(r => r.args[3] === 2.5 && Math.abs(r.args[0] - (f.W.head.x - 13)) < 0.5);
  const faded = bar(a), solid = bar(b);
  assert.equal(faded.length, 2, 'the fading fighter has a two-part bar');
  assert.equal(solid.length, 2, 'the other fighter has a two-part bar');
  for (const [i, r] of faded.entries()) {
    assert.ok(Math.abs(r.alpha - solid[i].alpha * 0.1) < 1e-9, 'bar rect ' + i + ' is drawn at alpha ' + r.alpha + ', not ' + solid[i].alpha + ' x 0.1');
  }
});
