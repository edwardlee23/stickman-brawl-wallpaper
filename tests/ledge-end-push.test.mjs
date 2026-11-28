// Runs main.js in a sandbox with floating platforms on and checks that the crowd push does not
// hold a fighter standing at a ledge's end just past it (issue #503). Walking in against a
// fighter that pushes it back out, it was left 1-2 px past the end: each step it turned to air,
// its walk brought it back within the half unit that lands it, and the push moved it off again.
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

for (const side of [1, -1]) test(`a fighter walking in from a side ledge's ${side > 0 ? 'right' : 'left'} end against a pusher is not held past the end, flipping between idle and air (#503)`, () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { game } = loadMain({ search: '?count=3&mode=ffa', seed, properties: { platforms: { value: true } } });
    // The strike with the shortest reach, so the fighter keeps walking in toward its target
    const knee = game.MOVES.filter(m => !m.type && !m.grab).sort((x, y) => x.range[1] - y.range[1])[0];
    const p = game.platforms.find(q => side > 0 ? q.x0 > 640 : q.x1 < 640);   // A side ledge
    const end = side > 0 ? p.x1 : p.x0;
    const [a, b, c] = game.fighters;
    const z = 60, ledge = game.groundY(z) - p.y;
    Object.assign(a, { x: end - side, z, alt: ledge, va: 0, vx: -side * 110, vz: 0, facing: -side, state: 'idle', st: 0, hp: 1000 });
    let flips = 0, past = 0, last = a.state;
    for (let i = 0; i < 90; i++) {
      // a walks in toward c, 60 px inside the end; b flinches in place 12 px inside it, in a's way
      Object.assign(a, { nextMove: knee, reachT: 0, standoff: 0, cool: 99, retarget: 99, target: c });
      for (const [f, x] of [[b, end - side * 12], [c, end - side * 60]]) {
        Object.assign(f, { x, z, alt: ledge, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999, retarget: 99, target: a });
      }
      if (i === 0) for (const f of game.fighters) f.W = f.joints();
      game.update(DT);
      if (a.state === 'air' && last !== 'air') flips++;
      if ((a.x - end) * side > 0 && a.alt > ledge - 1) past++;
      last = a.state;
    }
    assert.ok(flips <= 3, `seed ${seed}: turned to air ${flips} times, at x ${a.x.toFixed(2)} by the end at ${end.toFixed(2)}`);
    assert.ok(past <= 3, `seed ${seed}: ${past} steps past the end at ledge height`);
  }
});
