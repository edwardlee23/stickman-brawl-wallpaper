// Runs main.js in a sandbox with a stubbed canvas and window, and checks that a boomerang
// thrown toward a nearby side wall turns back before it and is caught (issue #423). The
// outbound flight slows to a stop at 1 s, about 300 px out, so a throw within that of the
// wall the thrower faces left the screen, where a shot bursts, and its thrower lost it. #348
// fixed the same for the top of the screen.
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
  // With no move style on, neither fighter picks a move of its own, so a throws as soon as it
  // can and e casts nothing at it
  for (const k in game.cfg.styles) game.cfg.styles[k] = false;
  return game;
}

// a, wall px from the side wall it faces (dir 1: the right one), throws at e, 80 px away on
// the same line. Once the boomerang is out, e steps to another depth so it
// misses. Returns the farthest the boomerang got past the wall's edge and how it ended.
function throwAtWall(wall, dir) {
  const game = load();
  const [a, e] = game.fighters;
  const x = dir > 0 ? game.worldW - wall : wall;
  Object.assign(a, { x, z: 50, alt: 0, vx: 0, vz: 0, facing: dir, state: 'idle', cool: 0, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: x + dir * 80, z: 50, alt: 0, vx: 0, vz: 0, facing: -dir, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'boomerang' };
  let s = null, x0 = 0, past = -Infinity, minD = Infinity;
  for (let t = 0; t < 5; t += 1 / 60) {
    game.update(1 / 60);
    if (!s) {
      s = game.shots.find(q => q.kind === 'boomerang');
      if (s) { x0 = a.x; e.z = 5; }
      continue;
    }
    if (a.state !== 'attack') { a.x = x0; a.vx = 0; a.cool = 99; }
    past = Math.max(past, dir > 0 ? s.x - game.worldW : -s.x);
    if (s.age > 1 && a.W) minD = Math.min(minD, Math.hypot(a.W.hF.x - s.x, a.W.hF.y - s.y));
    if (!game.shots.includes(s)) return { thrown: true, past, minD, age: s.age };
  }
  return { thrown: !!s, past, minD, age: s ? s.age : 0 };
}

test('a boomerang thrown toward a nearby side wall stays on screen and is caught (#423)', () => {
  for (const dir of [1, -1]) {
    for (const wall of [240, 200, 160]) {
      const r = throwAtWall(wall, dir);
      const at = (dir > 0 ? 'right' : 'left') + ' wall ' + wall + ' px away';
      assert.ok(r.thrown, at + ': no boomerang thrown');
      assert.ok(r.past <= 0, at + ': the boomerang flew ' + r.past.toFixed(1) + ' px past the wall');
      assert.ok(r.minD < 24 && r.age < 2.6, at + ': passed ' + r.minD.toFixed(1) + ' from the hand, gone at age ' + r.age.toFixed(2));
    }
  }
});
