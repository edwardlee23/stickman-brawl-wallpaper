// Checks that every pose key is one some pose moves (issue #179): a key that stays at
// its GUARD value in every pose is interpolated every frame for nothing, and a change
// to how fk applies it would leave every other test green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('wallpaper/main.js', 'utf8');

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=6&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(src, context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

const KEYS = JSON.parse(src.match(/const KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

test('a fighter\'s pose holds exactly the interpolated keys', () => {
  const game = load();
  assert.deepEqual(Object.keys(game.fighters[0].pose).sort(), [...KEYS].sort());
});

test('every pose key moves away from its guard value during a fight', () => {
  const game = load();
  const start = { ...game.fighters[0].pose }, moved = new Set();
  for (let t = 0; t < 30 && moved.size < KEYS.length; t += 1 / 60) {
    game.update(1 / 60);
    for (const f of game.fighters) for (const k of KEYS) if (Math.abs(f.pose[k] - start[k]) > 1e-6) moved.add(k);
  }
  assert.deepEqual(KEYS.filter(k => !moved.has(k)), [], 'keys no pose ever changes');
});

test('fk reads only the pose keys', () => {
  const body = src.match(/function fk\(p\) \{[\s\S]*?\n\}/)[0];
  for (const [, k] of body.matchAll(/\bp\.(\w+)/g)) assert.ok(KEYS.includes(k), 'fk reads p.' + k + ', which is not in KEYS');
});
