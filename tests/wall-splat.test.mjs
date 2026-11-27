// Runs main.js in a sandbox and checks that a fighter splatted against a wall
// stays on screen, and that a knockout during the splat does not make the
// body jump (issue #223). Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

// Loads the wallpaper at a figure size of scale (1 is 100%)
function load(scale = 1, count = 2) {
  const { game } = loadMain({
    search: `?count=${count}&mode=ffa`, random: 0.99,
    properties: scale !== 1 ? { figurescale: { value: scale * 100 } } : undefined,
  });
  // The world is 540 units tall; its width follows the 16:9 window
  const W = 1280 / (scale * 720 / 540);
  // Every fighter stands far from the walls, out of reach, with plenty of health
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i % 2 ? 1 : -1) * 20, z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  return { game, W, f: game.fighters[0] };
}

// Launches f into the wall on side (-1 left, 1 right) from 60 away and steps
// f alone until it splats. Returns its joints on each step of the splat.
function splat(game, W, f, side, facing) {
  Object.assign(f, { x: side < 0 ? 60 : W - 60, alt: 40, facing });
  f.launch(side * 900, 0);
  for (let i = 0; i < 60 && f.state === 'launched'; i++) { f.update(DT); f.W = f.joints(); }
  assert.equal(f.state, 'splat');
  const frames = [];
  for (let i = 0; i < 60 && f.state === 'splat'; i++) { frames.push(f.W); f.update(DT); f.W = f.joints(); }
  return frames;
}

for (const scale of [1, 2]) {
  for (const side of [-1, 1]) {
    for (const facing of [-1, 1]) {
      test(`at figure size ${scale * 100}%, a fighter facing ${facing} splatted on the ${side < 0 ? 'left' : 'right'} wall stays on screen`, () => {
        const { game, W, f } = load(scale);
        const frames = splat(game, W, f, side, facing);
        frames.forEach((J, i) => {
          for (const k in J) {
            assert.ok(J[k].x >= 0 && J[k].x <= W, `${k} at x ${J[k].x.toFixed(1)}, screen 0 to ${W}`);
          }
          // Once stuck to the wall, the body stays put while its limbs spread
          if (i) {
            const d = Math.hypot(J.hip.x - frames[i - 1].hip.x, J.hip.y - frames[i - 1].hip.y);
            assert.ok(d < 6, `step ${i}: hip moved ${d.toFixed(1)}`);
          }
        });
      });

      test(`at figure size ${scale * 100}%, a fighter facing ${facing} knocked out while splatted on the ${side < 0 ? 'left' : 'right'} wall does not jump`, () => {
        const { game, W, f } = load(scale);
        Object.assign(f, { x: side < 0 ? 60 : W - 60, alt: 40, facing });
        f.launch(side * 900, 0);
        for (let i = 0; i < 60 && f.state === 'launched'; i++) { f.update(DT); f.W = f.joints(); }
        assert.equal(f.state, 'splat');
        f.update(DT); f.W = f.joints();
        f.hp = 0; f.koPending = true;
        game.update(DT);
        assert.equal(f.state, 'ko');
        // A normal step: the ragdoll starts at rest, so no point should move far
        const max = 12;
        for (let i = 0; i < 6; i++) {
          const before = Object.fromEntries(Object.entries(f.rag.pts).map(([k, p]) => [k, { x: p.x, y: p.y }]));
          game.update(DT);
          for (const k in before) {
            const d = Math.hypot(f.rag.pts[k].x - before[k].x, f.rag.pts[k].y - before[k].y);
            assert.ok(d < max, `step ${i}: ${k} moved ${d.toFixed(1)}, more than ${max.toFixed(1)}`);
          }
        }
      });
    }
  }
}
