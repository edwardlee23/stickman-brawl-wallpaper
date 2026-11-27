// Runs main.js in a sandbox with a stubbed canvas and window, and checks that a boomerang
// thrown at a target high in the air stays on the screen and comes back at every figure size
// (issue #348). The throw aims at the target's body, up to 1 rad upward, and flies about 300 px
// out; on the short world of a large figure size that line left the top of the screen, where
// the boomerang burst and its thrower lost it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const FIG_TOP = 110;   // As in main.js: the jump ceiling is groundY(z) - FIG_TOP

function load(size) {
  // A fixed Math.random of 0.99 turns off the random jumps, dashes and blocks
  const { game } = loadMain({ random: 0.99, properties: { figurescale: { value: size } } });
  game.cfg.items = true;
  // With no move style on, the thrower picks no move of its own, so it throws as soon as it can
  for (const k in game.cfg.styles) game.cfg.styles[k] = false;
  return game;
}

// a, on the floor, throws at e, gap away and held at its jump ceiling; once the boomerang is
// out, e moves out of its way (as a dodge or smoke escape would). Returns the least y the
// boomerang reached and how it ended.
function throwHigh(size, gap) {
  const game = load(size);
  const [a, e] = game.fighters;
  Object.assign(a, { x: 150, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 0, retarget: 99, target: e, hp: 100 });
  a.W = a.joints();
  a.held = { kind: 'boomerang' };
  let s = null, x0 = a.x, minY = Infinity, minD = Infinity;
  for (let t = 0; t < 5; t += 1 / 60) {
    if (!s) {
      Object.assign(e, { x: 150 + gap, z: 50, alt: game.groundY(50) - FIG_TOP, va: 0, vx: 0, vz: 0, facing: -1,
        state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
      e.W = e.joints();
    }
    game.update(1 / 60);
    if (!s) {
      s = game.shots.find(q => q.kind === 'boomerang');
      if (s) { x0 = a.x; e.z = 5; e.x = 450; }
      continue;
    }
    if (a.state !== 'attack') { a.x = x0; a.vx = 0; a.cool = 99; }
    minY = Math.min(minY, s.y);
    if (s.age > 1 && a.W) minD = Math.min(minD, Math.hypot(a.W.hF.x - s.x, a.W.hF.y - s.y));
    if (!game.shots.includes(s)) return { thrown: true, minY, minD, age: s.age };
  }
  return { thrown: !!s, minY, minD, age: s ? s.age : 0 };
}

test('a boomerang thrown at a target at its jump ceiling stays on screen and is caught at every figure size (#348)', () => {
  for (const size of [200, 150, 100]) {
    for (const gap of [80, 90, 100]) {
      const r = throwHigh(size, gap);
      const at = 'size ' + size + '%, gap ' + gap;
      assert.ok(r.thrown, at + ': no boomerang thrown');
      assert.ok(r.minY >= 0, at + ': the boomerang flew above the top of the screen, to y ' + r.minY.toFixed(1));
      assert.ok(r.minD < 24 && r.age < 2.6, at + ': passed ' + r.minD.toFixed(1) + ' from the hand, gone at age ' + r.age.toFixed(2));
    }
  }
});
