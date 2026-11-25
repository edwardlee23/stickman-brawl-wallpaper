// Runs main.js in a sandbox with a stubbed canvas and window, and checks that a thrower
// catches its own boomerang when it misses (issue #211). The boomerang leaves from the hand
// in the low throwing pose, but by the time it comes back the thrower is in guard with that
// hand much higher, so a boomerang that only retraced its path flew past under the hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  // A fixed Math.random of 0.99 turns off the random jumps, dashes and blocks
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  game.cfg.items = true;
  return game;
}

// a throws at e, gap away on the same line. Once the boomerang is out, e steps to another
// depth so it misses, and a is held at x0 + walk. Returns how the boomerang ended.
function throwAndMiss(gap, walk = 0) {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 0, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: 400 + gap, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'boomerang' };
  let s = null, x0 = 0, minD = Infinity;
  for (let t = 0; t < 5; t += 1 / 60) {
    game.update(1 / 60);
    if (!s) {
      s = game.shots.find(q => q.kind === 'boomerang');
      if (s) { x0 = a.x; e.z = 5; }
      continue;
    }
    if (a.state !== 'attack') { a.x = x0 + walk; a.vx = 0; a.cool = 99; }
    if (s.age > 1 && a.W) minD = Math.min(minD, Math.hypot(a.W.hF.x - s.x, a.W.hF.y - s.y));
    if (!game.shots.includes(s)) return { thrown: true, age: s.age, minD };
  }
  return { thrown: !!s, age: s ? s.age : 0, minD };
}

test('a thrower standing still catches its own boomerang that missed (#211)', () => {
  for (const gap of [250, 300]) {
    const r = throwAndMiss(gap);
    assert.ok(r.thrown, 'no boomerang thrown at gap ' + gap);
    assert.ok(r.minD < 24, 'gap ' + gap + ': the boomerang passed ' + r.minD.toFixed(1) + ' from the hand');
    assert.ok(r.age < 2.5, 'gap ' + gap + ': caught by age 2.5, not left to run out its life (age ' + r.age.toFixed(2) + ')');
  }
});

// 320 puts the thrower past the farthest point of a 600 px/s throw (about 300 px out)
test('a thrower that stepped aside after the throw, even past the boomerang, still catches it (#211)', () => {
  for (const walk of [-60, 40, 320]) {
    const r = throwAndMiss(250, walk);
    assert.ok(r.minD < 24 && r.age < 2.6, 'walked ' + walk + ': passed ' + r.minD.toFixed(1) + ' from the hand, gone at age ' + r.age.toFixed(2));
  }
});
