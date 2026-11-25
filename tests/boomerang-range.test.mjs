// Runs main.js in a sandbox with a stubbed canvas and window, and checks that a boomerang
// thrown at the far end of its range reaches a target that stands still (issue #220). The
// flight slows and turns at 1 s, so its throw range must end where the flight can reach.
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

// a holds a boomerang and e stands still, gap away on the same line. Returns whether a threw
// it and whether it hit e before it was gone.
function throwAt(gap) {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 0, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: 300 + gap, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'boomerang' };
  let s = null;
  for (let t = 0; t < 4; t += 1 / 60) {
    if (!s) a.x = 300;
    e.x = 300 + gap; e.z = 50; e.vx = 0; e.vz = 0; e.state = 'hit'; e.st = 0; e.dur = 99; e.cool = 99;
    game.update(1 / 60);
    if (!s) s = game.shots.find(q => q.kind === 'boomerang') || null;
    if (e.hp < 100) return { thrown: true, hit: true };
    if (s && !game.shots.includes(s)) break;
  }
  return { thrown: !!s, hit: false };
}

// Every gap the holder throws at must be one the flight reaches. 300 px is the end of the
// throw range; a throw is only required out to 250 px, so the fix may shorten the range instead.
test('a boomerang thrown at the far end of its range hits a target that stands still (#220)', () => {
  for (let gap = 240; gap <= 310; gap += 5) {
    const r = throwAt(gap);
    if (!r.thrown) { assert.ok(gap > 250, 'no boomerang thrown at gap ' + gap); continue; }
    assert.ok(r.hit, 'gap ' + gap + ': the boomerang turned back before it reached a still target');
  }
});
