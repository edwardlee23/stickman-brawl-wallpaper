// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a
// dive (issue #215) whose live target it misses falls instead of climbing to the
// top of the screen, sticking there and dropping to the floor in one frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// A seeded Math.random keeps the run the same every time
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function load(seed) {
  return loadMain({ random: seeded(seed) }).game;
}

// Starts a dive at a live target that stays put and returns how high the diver
// climbed above the height the dive began at, and its largest drop in one step
function missedDive(ax, az, tx, tz) {
  const game = load(215);
  const [a, e] = game.fighters;
  Object.assign(a, { x: ax, z: az, facing: Math.sign(tx - ax), cool: 99 });
  Object.assign(e, { x: tx, z: tz, facing: -1, cool: 99 });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'dive'));
  let i = 0;
  for (; i < 300 && !(a.md && a.md.ph === 'dive'); i++) { e.x = tx; e.z = tz; e.cool = 99; game.update(1 / 60); }
  assert.equal(a.md && a.md.ph, 'dive', 'the dive began');
  const alt0 = a.alt;
  let climb = 0, drop = 0, hit = false;
  for (; i < 600; i++) {
    e.x = tx; e.z = tz; e.cool = 99; e.alt = 0;
    const before = a.alt, hp = e.hp;
    game.update(1 / 60);
    if (e.hp < hp) hit = true;
    climb = Math.max(climb, a.alt - alt0);
    drop = Math.max(drop, before - a.alt);
    if (!a.aloft() && !(a.move && a.move.id === 'dive')) break;
  }
  return { climb, drop, hit, alive: e.alive };
}

test('a dive that misses its live target never climbs above where it began (#215)', () => {
  const r = missedDive(200, 0, 640, 80);
  assert.equal(r.alive, true);
  assert.ok(r.climb <= 1, 'climbed ' + r.climb.toFixed(0) + ' px above the start of the dive');
  assert.ok(r.drop <= 40, 'dropped ' + r.drop.toFixed(0) + ' px in one step');
});

test('no dive at a live target ends with a drop bigger than a normal fall step (#215)', () => {
  for (const [ax, az] of [[100, 0], [400, 80], [900, 0], [900, 80]]) {
    for (const tx of [100, 300, 500, 640, 800, 1000]) {
      for (const tz of [0, 40, 60, 80]) {
        if (tx === ax) continue;
        const r = missedDive(ax, az, tx, tz), at = 'diver at ' + ax + ',' + az + ', target at ' + tx + ',' + tz;
        assert.ok(r.drop <= 40, at + ': dropped ' + r.drop.toFixed(0) + ' px in one step');
        if (!r.hit) assert.ok(r.climb <= 1, at + ': climbed ' + r.climb.toFixed(0) + ' px after a miss');
      }
    }
  }
});
