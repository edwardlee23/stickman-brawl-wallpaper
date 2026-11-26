// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a teleport or a
// substitution that would appear behind a fighter standing at a ledge end, with its back to
// the drop, appears in front of it on the ledge instead of in mid-air beside the ledge, and
// that the teleport's follow-up hits (issue #309).
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
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  return window.__stickmanBrawl;
}

// The left ledge, and the altitude of its top at depth z
function ledge(game, z) {
  const p = game.platforms[0];
  assert.ok(p && p.x0 < 200, 'the left ledge is there');
  return { p, alt: game.groundY(z) - p.y };
}

// Where f stands: the platform whose top is under its feet (or null, as platformAt in main.js
// finds it) and whether it is in the air
function where(game, f) {
  const feet = game.groundY(f.z) - f.alt;
  const on = game.platforms.find(p => f.x >= p.x0 && f.x <= p.x1 && Math.abs(p.y - feet) <= 0.5) || null;
  return { on, aloft: f.aloft() };
}

test('a teleport behind a fighter at a ledge end appears on the ledge, and its follow-up hits (#309)', () => {
  const game = load(309);
  const [a, e] = game.fighters;
  const z = 40, { p, alt } = ledge(game, z);
  // The target is held in a flinch at the ledge's right end, facing left: behind it is the drop
  Object.assign(e, { x: p.x1 - 10, z, alt, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, cool: 99, target: a });
  Object.assign(a, { x: 900, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', cool: 99, target: e });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'teleport'));
  let i = 0;
  for (; i < 60 && a.move && a.move.id === 'teleport'; i++) { e.st = 0; e.cool = 99; game.update(1 / 60); }
  assert.notEqual(a.move && a.move.id, 'teleport', 'the teleporter appeared and attacked');
  const w = where(game, a);
  assert.equal(w.on, p, 'appeared at x ' + a.x + ', alt ' + a.alt + ', not on the ledge (' + p.x0 + ' to ' + p.x1 + ')');
  assert.equal(w.aloft, false, 'in the air after appearing');
  const hp = e.hp;
  for (let j = 0; j < 60; j++) { e.cool = 99; game.update(1 / 60); }
  assert.ok(e.hp < hp, 'the follow-up ' + a.move?.id + ' missed: target hp ' + e.hp);
});

test('a substitution behind an attacker at a ledge end appears on the ledge (#309)', () => {
  const game = load(309);
  const [a, e] = game.fighters;
  const z = 40, { p, alt } = ledge(game, z);
  // The attacker stands at the ledge's right end facing left, toward the victim: behind it is the drop
  Object.assign(a, { x: p.x1 - 4, z, alt, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', cool: 99, target: e });
  Object.assign(e, { x: p.x1 - 34, z, alt, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  e.subFrom = a; e.subT = 1;
  assert.equal(e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'head', e.bodyPoint()), 'sub', 'the substitution took the hit');
  const w = where(game, e);
  assert.equal(w.on, p, 'appeared at x ' + e.x + ', alt ' + e.alt + ', not on the ledge (' + p.x0 + ' to ' + p.x1 + ')');
  assert.equal(w.aloft, false, 'in the air after appearing');
  // Through the fade-in and the attack that follows it stays on the ledge, not down on the floor
  for (let j = 0; j < 120 && e.state === 'attack'; j++) {
    a.cool = 99; game.update(1 / 60);
    assert.ok(e.surfaceAlt() > 0 && e.alt > alt / 2, 'fell off the ledge: alt ' + e.alt);
  }
  assert.notEqual(e.state, 'attack', 'the follow-up ended');
});

test('a teleport behind a fighter in the middle of a ledge still appears behind it', () => {
  const game = load(309);
  const [a, e] = game.fighters;
  const z = 40, { p, alt } = ledge(game, z);
  const mid = (p.x0 + p.x1) / 2;
  Object.assign(e, { x: mid, z, alt, va: 0, vx: 0, facing: -1, state: 'idle', cool: 99, target: a });
  a.appearBehind(e);
  assert.equal(a.x, mid + 28, 'behind the target');
  assert.equal(a.facing, -1, 'facing the target');
  assert.equal(where(game, a).on, p);
});
