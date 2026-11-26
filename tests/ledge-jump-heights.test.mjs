// Runs main.js in a sandbox with floating platforms on and checks how often an idle fighter on
// a ledge jumps when its target stands on the same ledge at another depth. A ledge top is at
// one screen height at every depth, so the jump-at-a-higher-target check measures heights from
// each fighter's surface and the depth gap does not change the jump rate (issue #386).
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

function load(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = seed >>> 0;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true }, items: { value: false } });
  return window.__stickmanBrawl;
}

// Both idle on the highest ledge, a 100 left of e; each of the frames starts from the same
// placement and is stepped once. Returns a's jumps per second.
function jumpRate(az, ez, frames = 20000) {
  const game = load(11);
  const p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q)), mid = (p.x0 + p.x1) / 2;
  const [a, e] = game.fighters;
  let jumps = 0;
  for (let i = 0; i < frames; i++) {
    Object.assign(a, { x: mid - 50, z: az, alt: game.groundY(az) - p.y, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', st: 0, hp: 1000, cool: 99, retarget: 99, target: e, evade: 0, dash: 0 });
    Object.assign(e, { x: mid + 50, z: ez, alt: game.groundY(ez) - p.y, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', st: 0, hp: 1000, cool: 99, retarget: 99, target: a, evade: 0, dash: 0 });
    a.update(DT);
    if (a.state === 'air' && a.va > 300) jumps++;
  }
  return jumps / (frames * DT);
}

// a in the air 60 above the highest ledge, e standing on it 100 to the right; each frame starts
// from the same placement with the air dash used up. Returns how many frames start a double jump.
function doubleJumps(az, ez, frames = 2000) {
  const game = load(13);
  const p = game.platforms.reduce((q, r) => (r.y < q.y ? r : q)), mid = (p.x0 + p.x1) / 2;
  const [a, e] = game.fighters;
  let n = 0;
  for (let i = 0; i < frames; i++) {
    Object.assign(a, { x: mid - 50, z: az, alt: game.groundY(az) - p.y + 60, va: 0, vx: 0, vz: 0, facing: 1, state: 'air', st: 0, hp: 1000, cool: 0, dashed: true, dj: false, dash: 0, target: e });
    Object.assign(e, { x: mid + 50, z: ez, alt: game.groundY(ez) - p.y, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', st: 0, hp: 1000, cool: 99, retarget: 99, target: a });
    a.update(DT);
    if (a.dj) n++;
  }
  return n;
}

test('a fighter in the air above a ledge does not double jump at a target below it on the ledge, whatever the depths (#386)', () => {
  for (const [az, ez] of [[60, 60], [0, 120], [120, 0]])
    assert.equal(doubleJumps(az, ez), 0, `a at depth ${az}, target at ${ez}`);
});

test('a fighter on a ledge jumps as often at a target deeper on the same ledge as at one level with it (#386)', () => {
  const level = jumpRate(60, 60), front = jumpRate(0, 120), back = jumpRate(120, 0);
  assert.ok(level > 0.1, `only ${level.toFixed(2)} jumps per second at no depth gap`);
  for (const [name, r] of [['in front of the target', front], ['behind the target', back]])
    assert.ok(Math.abs(r - level) < level * 0.35, `${name}: ${r.toFixed(2)} jumps per second, ${level.toFixed(2)} at no depth gap`);
});
