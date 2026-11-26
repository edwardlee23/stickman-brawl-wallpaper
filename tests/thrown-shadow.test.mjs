// Runs main.js in a sandbox with a canvas that records each ellipse, throws a fighter over the
// shoulder, and checks that the shadow under the flying body shrinks with the hip's height, as
// a launched fighter's does, and is full size again once the body lands (issue #353).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ellipses = [];
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'ellipse' ? (...a) => ellipses.push(a) : () => ({ addColorStop() {} }),
    set: () => true,
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run throws the same way
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: false } });
  return { game: window.__stickmanBrawl, ellipses };
}

// The width of the fighter shadow drawn centred on x
function shadowAt(game, ellipses, x) {
  ellipses.length = 0;
  game.render();
  const s = ellipses.filter(e => Math.abs(e[0] - x) < 1e-6 && e[2] > 1 && e[2] <= 14);
  assert.equal(s.length, 1, 'one shadow under x ' + x);
  return s[0][2];
}

test('a body thrown over the shoulder casts a shadow that shrinks with its hip height (#353)', () => {
  const { game, ellipses } = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 600, z: 60, alt: 0, vx: 0, va: 0, vz: 0, facing: 1, state: 'hit', st: 0, dur: 99, cool: 99 });
  Object.assign(e, { x: 625, z: 60, alt: 0, vx: 0, va: 0, vz: 0, facing: -1, state: 'idle', st: 0, cool: 99, hp: 1000 });
  a.W = a.joints(); e.W = e.joints();
  a.move = game.MOVES.find(m => m.id === 'seoinage');
  a.applyGrab(e);
  assert.equal(e.state, 'thrown');
  const floor = game.groundY(e.z);
  let peak = 0;
  for (let i = 0; i < 60 && e.state === 'thrown'; i++) {
    e.update(1 / 60);
    if (e.state !== 'thrown') break;
    e.W = e.joints();
    const hip = floor - e.th.hy, rx = shadowAt(game, ellipses, e.th.hx);
    peak = Math.max(peak, hip);
    // A launched fighter's shadow at this height, less the 14 its hip is drawn above its feet
    const launched = 14 * (1 - Math.min(0.7, Math.max(0, hip - 14) / 300));
    if (hip > 100) assert.ok(rx < launched + 0.5, 'hip ' + hip.toFixed(0) + ' above the floor: shadow width ' + rx.toFixed(2) + ', a launched body there gets about ' + launched.toFixed(2));
  }
  assert.ok(peak > 150, 'the throw peaks ' + peak.toFixed(0) + ' above the floor');
  assert.equal(e.state, 'down', 'the body has landed');
  e.W = e.joints();
  assert.ok(shadowAt(game, ellipses, e.x) > 13.9, 'a landed body casts a full-size shadow');
});
