// Runs main.js in a sandbox and checks that, with floating platforms on, a dodge or a dash is
// not pulled back toward a target on another level by chaseSurface (issue #381).
// Math.random is seeded for loading and held at 0.5 while stepping, so no random jump starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

function load(platforms) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=3&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = 7;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: platforms }, items: { value: false } });
  return { game: window.__stickmanBrawl, context };
}

// The attacker a just left of the dodger e; e's own target t, farther left, is on the highest ledge with
// platforms on, on the floor below it with them off. e starts the given motion and is stepped.
function run(platforms, ex, motion, frames) {
  const { game, context } = load(platforms);
  const p = game.platforms.length ? game.platforms.reduce((q, r) => (r.y < q.y ? r : q)) : null;
  const tx = 480, z = 60;
  const [a, e, t] = game.fighters;
  Object.assign(a, { x: ex - 40, z, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(t, { x: tx, z, alt: p ? game.groundY(z) - p.y : 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: ex, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: t, nextMove: null }, motion);
  vm.runInContext('Math.random = () => 0.5', context);
  for (const f of game.fighters) f.W = f.joints();
  for (let i = 0; i < frames; i++) e.update(DT);
  return { x: e.x, from: ex, gap: e.x - a.x - 40 };
}

test('a dodge away from an attacker is not pulled back toward a target on a ledge (#381)', () => {
  // Dodging right, away from a and from the target t
  const dodge = { evade: 0.3, vx: 200 };
  const off = run(false, 650, dodge, 18), on = run(true, 650, dodge, 18);
  assert.ok(off.gap >= 25, `platforms off: only ${off.gap.toFixed(1)} px farther from the attacker`);
  assert.ok(on.gap >= 25, `platforms on: only ${on.gap.toFixed(1)} px farther from the attacker after 0.3 s`);
});

test('a dash covers the same distance with platforms on as off (#381)', () => {
  // Dashing left, toward the target, on the floor right of its ledge
  const dash = { vx: -520, dash: 0.22, trailOn: true };
  const off = run(false, 900, dash, 14), on = run(true, 900, dash, 14);
  const dOff = off.from - off.x, dOn = on.from - on.x;
  assert.ok(dOff > 100, `platforms off: dash covered ${dOff.toFixed(1)} px`);
  assert.ok(Math.abs(dOn - dOff) < 0.5, `dash covered ${dOff.toFixed(1)} px with platforms off, ${dOn.toFixed(1)} on`);
});
