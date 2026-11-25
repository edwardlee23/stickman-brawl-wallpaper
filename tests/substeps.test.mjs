// Runs main.js in a node:vm sandbox with a stubbed canvas, window and
// requestAnimationFrame, and checks that a slow, fast-forwarded frame still
// simulates the fight in small steps: an energy blast must not pass through a
// fighter at 300% speed and 20 fps (issue #4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper with the given query string and returns its debug hook
// plus a function that runs one animation frame at the given time in ms.
// Math.random is a seeded generator, so every run plays the same rounds.
function load(query, seed) {
  let s = seed >>> 0;
  const random = () => {   // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const noop = () => {};
  // Any 2D context call or property is a no-op that returns the same stub.
  const ctx = new Proxy(function () {}, { get: () => ctx, set: () => true, apply: () => ctx });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  let next = null;
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: noop,
  };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search: query },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: Object.assign(Object.create(Math), { random }), Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return { game: window.__stickmanBrawl, frame: now => next(now) };
}

test('a blast cannot pass through a fighter at 300% speed and 20 fps', () => {
  let hits = 0, tries = 0;
  for (let k = 0; k < 40 && tries < 20; k++) {
    const { game, frame } = load('?count=2&speed=3', k + 1);
    frame(50);   // One 50 ms frame first, so every fighter has world joints
    const [owner, target] = game.fighters;
    if (!target.hittable || target.alt > 0) continue;   // Only aim at a fighter standing on the floor
    tries++;
    const W = target.W;
    // Aim at the middle of the torso from 40 units away. One unsplit 0.15 s
    // step moves the blast 81 units, from in front of the body to behind it.
    const y = (W.hip.y + W.sh.y) / 2, x = (W.hip.x + W.sh.x) / 2 - 40;
    game.shots.length = 0;
    game.shots.push({ x, y, vx: 540, vy: 0, z: target.z, owner, m: game.SUPER[0], life: 3, col: '#fff' });
    const hp = target.hp;
    frame(100);
    if (target.hp < hp) hits++;
  }
  assert.equal(tries, 20, 'too few rounds started with a standing target');
  assert.equal(hits, tries, `only ${hits} of ${tries} blasts hit`);
});
