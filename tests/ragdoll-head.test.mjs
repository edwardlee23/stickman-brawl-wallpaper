// Runs main.js in a sandbox and checks that a knocked-out body's head, drawn as a
// circle of radius L.head round its point, stays whole inside the walls and the
// ceiling (issue #265). Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;
const HEAD = 8;   // L.head
const W = 1280 / (720 / 540);   // The world is 540 units tall; its width follows the 16:9 window

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
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i % 2 ? 1 : -1) * 20, z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  return { game, f: game.fighters[0] };
}

// Knocks f out from x with the given velocity and returns the head's lowest distance to
// the left wall, the right wall and the ceiling over 600 ragdoll steps
function fly(x, vx, vy) {
  const { game, f } = load();
  f.x = x; f.W = f.joints();
  f.ko(vx, vy);
  let left = Infinity, right = Infinity, top = Infinity;
  for (let i = 0; i < 600; i++) {
    game.update(DT);
    const h = f.rag.pts.head;
    left = Math.min(left, h.x); right = Math.min(right, W - h.x); top = Math.min(top, h.y);
  }
  return { left, right, top };
}

test('a body knocked into the left wall keeps its whole head on screen', () => {
  const { left } = fly(60, -720, -260);
  assert.ok(left >= HEAD - 1e-6, `head centre came within ${left.toFixed(2)} of the wall`);
});

test('a body knocked into the right wall keeps its whole head on screen', () => {
  const { right } = fly(W - 60, 720, -260);
  assert.ok(right >= HEAD - 1e-6, `head centre came within ${right.toFixed(2)} of the wall`);
});

test('a body knocked up into the ceiling keeps its whole head on screen', () => {
  const { top } = fly(480, 0, -2500);
  assert.ok(top >= HEAD - 1e-6, `head centre came within ${top.toFixed(2)} of the ceiling`);
});
