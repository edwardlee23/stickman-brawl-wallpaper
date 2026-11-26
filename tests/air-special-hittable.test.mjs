// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// fighter in the air starts no move at a target that cannot be hit (#338), as a
// fighter on the ground already waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A seeded Math.random keeps the run the same every time
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function load(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const math = Object.create(Math);
  math.random = seeded(seed);
  const context = vm.createContext({
    window, console, performance, URLSearchParams, Math: math,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

// Puts the attacker in the air next to its target and steps updAir once; returns
// the move it started, or null
function airMove(seed, targetState) {
  const game = load(seed);
  const [a, e] = game.fighters;
  Object.assign(e, { x: 600, z: 40, alt: 0, va: 0, vx: 0, state: targetState, st: 0, downDur: 99, cool: 99 });
  Object.assign(a, { x: 400, z: 40, alt: 120, va: 0, vx: 0, state: 'air', st: 0, cool: 0, dashed: true, dj: true, dash: 0, move: null, md: null });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.updAir(1 / 60);
  return a.move;
}

test('an airborne fighter starts no move at a target lying down (#338)', () => {
  let started = 0;
  for (let seed = 1; seed <= 200; seed++) if (airMove(seed, 'down')) started++;
  assert.equal(started, 0, started + ' of 200 seeds started a move at a down target');
});

test('an airborne fighter still starts moves at a target it can hit (#338)', () => {
  let started = 0;
  for (let seed = 1; seed <= 200; seed++) if (airMove(seed, 'idle')) started++;
  assert.ok(started > 50, 'only ' + started + ' of 200 seeds started a move at an idle target');
});
