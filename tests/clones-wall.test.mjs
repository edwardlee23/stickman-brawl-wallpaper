// Runs main.js in a sandbox with a stubbed canvas and window, then checks that shadow
// clones started next to a wall stay on screen, and so does their smoke (issue #172).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  return loadMain({ seed: 1 }).game;
}

for (const wall of ['left', 'right']) {
  test('shadow clones started at the ' + wall + ' wall and their smoke stay on screen', () => {
    const game = load();
    const [a, e] = game.fighters;
    // A fighter pushed past the right wall is put back at its edge, which tells where that edge is
    Object.assign(a, { x: 1e6, z: 50, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, cool: 99 });
    a.update(1 / 60);
    const hi = a.x, lo = 14;
    assert.ok(hi > 500, 'right edge at ' + hi);
    const x = wall === 'left' ? lo : hi, dir = wall === 'left' ? 1 : -1;
    Object.assign(a, { x, z: 50, alt: 0, va: 0, vx: 0, state: 'idle', st: 0, facing: dir, cool: 99, target: e });
    Object.assign(e, { x: x + dir * 180, z: 50, alt: 0, va: 0, vx: 0, facing: -dir, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, target: a });
    a.W = a.joints(); e.W = e.joints();
    const n0 = game.fx.length;
    a.startMove(game.NINJA.find(m => m.id === 'clones'));
    const xs = [];
    for (let i = 0; i < 90 && a.move; i++) {
      a.W = a.joints(); e.W = e.joints(); a.update(1 / 60);
      if (a.md && a.md.clones) for (const c of a.md.clones) xs.push(c.x);
    }
    const puffs = game.fx.slice(n0).filter(o => o.type === 'puff');
    assert.equal(puffs.length, 4, 'two puffs on the split and two on the vanish');
    assert.ok(xs.length > 0, 'the clones appeared');
    for (const cx of xs) assert.ok(cx >= lo && cx <= hi, 'clone at x ' + cx + ', screen ' + lo + '-' + hi);
    for (const o of puffs) assert.ok(o.x >= lo && o.x <= hi, 'puff at x ' + o.x + ', screen ' + lo + '-' + hi);
  });
}
