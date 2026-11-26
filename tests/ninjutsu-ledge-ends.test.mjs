// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a smoke escape
// on a ledge reappears on the ledge, and that shadow clones cast on a ledge stay within its
// ends, instead of being placed past its end in mid-air (issue #345).
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

const near = (game, f) => game.platforms.find(p => f.x >= p.x0 && f.x <= p.x1 && Math.abs(game.groundY(f.z) - f.alt - p.y) <= 0.5) || null;

for (const side of [-1, 1]) {
  test('a smoke escape on a ledge reappears on the ledge, attacker to the ' + (side > 0 ? 'right' : 'left') + ' (#345)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = load(seed);
      const [a, e] = game.fighters;
      const z = 40, { p, alt } = ledge(game, z);
      // Near the ledge end away from the attacker, so "away" is past that end
      const x = side > 0 ? p.x0 + 32 : p.x1 - 32;
      Object.assign(e, { x, z, alt, va: 0, vx: 0, vz: 0, facing: side, state: 'idle', cool: 99, target: a });
      Object.assign(a, { x: x + side * 60, z, alt, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 999, cool: 99, target: e });
      for (const f of game.fighters) f.W = f.joints();
      e.startMove(game.NINJA.find(m => m.id === 'smoke'), true);
      e.md.from = a.x;
      for (let i = 0; i < 60 && e.move && e.move.id === 'smoke'; i++) { a.st = 0; a.cool = 99; e.cool = 99; game.update(1 / 60); }
      assert.notEqual(e.move && e.move.id, 'smoke', 'seed ' + seed + ': the smoke escape ended');
      assert.equal(near(game, e), p, 'seed ' + seed + ': reappeared at x ' + e.x + ', alt ' + e.alt + ', off the ledge (' + p.x0 + ' to ' + p.x1 + ')');
      assert.equal(e.aloft(), false, 'seed ' + seed + ': in the air after reappearing');
    }
  });
}

for (const side of [-1, 1]) {
  test('shadow clones cast at the ' + (side > 0 ? 'right' : 'left') + ' end of a ledge stay within its ends (#345)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = load(seed);
      const [a, e] = game.fighters;
      const z = 40, { p, alt } = ledge(game, z);
      const x = side > 0 ? p.x1 - 10 : p.x0 + 10;
      Object.assign(a, { x, z, alt, va: 0, vx: 0, vz: 0, facing: -side, state: 'idle', st: 0, cool: 99, target: e });
      Object.assign(e, { x: side > 0 ? p.x0 + 12 : p.x1 - 12, z, alt, va: 0, vx: 0, vz: 0, facing: side, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, target: a });
      for (const f of game.fighters) f.W = f.joints();
      a.startMove(game.NINJA.find(m => m.id === 'clones'));
      let seen = 0;
      for (let i = 0; i < 90 && a.move && a.move.id === 'clones'; i++) {
        a.W = a.joints(); e.W = e.joints(); a.update(1 / 60);
        if (!(a.md && a.md.clones) || !near(game, a)) continue;
        for (const c of a.md.clones) {
          seen++;
          assert.ok(c.x >= p.x0 && c.x <= p.x1, 'seed ' + seed + ': clone at x ' + c.x + ', phase ' + a.md.ph + ', ledge ' + p.x0 + ' to ' + p.x1);
        }
      }
      assert.ok(seen > 0, 'seed ' + seed + ': the clones appeared on the ledge');
    }
  });
}
