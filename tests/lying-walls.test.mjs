// Runs main.js in a sandbox and checks that a fighter knocked down or landing
// next to a side wall lies, and gets up, inside the walls, and that a
// knockout there does not make the body jump (issue #244). Math.random is
// stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;
const HEAD = 8;   // L.head: the head is drawn as a circle of this radius round its joint

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
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const W = 1280 / (720 / 540);
  // Both fighters stand still, with plenty of health, and do not attack
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i % 2 ? 1 : -1) * 20, z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  const [e, a] = game.fighters;
  return { game, W, e, a };
}

const LYING = new Set(['fall', 'down', 'getup']);

// Steps the game until e is on its feet again or knocked out. Returns e's joints on each
// step it was falling, lying or getting up, and the ragdoll's points on each step after a knockout.
function run(game, e) {
  const lying = [], rag = [];
  for (let i = 0; i < 600; i++) {
    game.update(DT);
    if (e.rag) rag.push(Object.fromEntries(Object.entries(e.rag.pts).map(([k, p]) => [k, { x: p.x, y: p.y }])));
    else if (LYING.has(e.state)) lying.push(e.W);
    else if (lying.length && e.state === 'idle') break;
    if (rag.length >= 60) break;
  }
  return { lying, rag };
}

function inside(frames, W, what) {
  assert.ok(frames.length > 0, `no ${what} frames`);
  frames.forEach((J, i) => {
    for (const k in J) {
      const m = k === 'head' ? HEAD : 4;
      assert.ok(J[k].x >= m - 1e-6 && J[k].x <= W - m + 1e-6, `${what} step ${i}: ${k} at x ${J[k].x.toFixed(1)}, walls at 0 and ${W.toFixed(0)}`);
    }
  });
}

// side -1 is the left wall, 1 the right; the victim stands by the wall facing out, its attacker inside it
function reap(game, W, e, a, side, id) {
  Object.assign(e, { x: side < 0 ? 14 : W - 14, facing: -side });
  Object.assign(a, { x: side < 0 ? 30 : W - 30, facing: side });
  for (const f of game.fighters) f.W = f.joints();
  a.move = game.MOVES.find(m => m.id === id);
  a.applyGrab(e);
  a.move = null;
}

function land(game, W, e, a, side, x, vx) {
  Object.assign(e, { x: side < 0 ? x : W - x, facing: -side });
  Object.assign(a, { x: W / 2, facing: side });
  for (const f of game.fighters) f.W = f.joints();
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint(), { dmg: 1, launch: { vx: side * Math.abs(vx), va: 300 } });
  assert.equal(e.state, 'launched');
}

for (const side of [-1, 1]) {
  const wall = side < 0 ? 'left' : 'right';
  for (const id of ['osotogari', 'doubleleg']) {
    test(`a fighter reaped by ${id} at the ${wall} wall falls, lies and gets up inside the walls`, () => {
      const { game, W, e, a } = load();
      reap(game, W, e, a, side, id);
      const { lying, rag } = run(game, e);
      assert.equal(rag.length, 0);
      assert.equal(e.state, 'idle');
      inside(lying, W, 'lying');
    });

    test(`a fighter knocked out by ${id} at the ${wall} wall does not jump`, () => {
      const { game, W, e, a } = load();
      e.hp = 5;
      reap(game, W, e, a, side, id);
      const { lying, rag } = run(game, e);
      inside(lying, W, 'lying');
      assert.ok(rag.length > 30, 'knocked out');
      inside(rag, W, 'ragdoll');
      // The ragdoll starts nearly at rest where the body lay, so no point moves far in a step,
      // and the body stays where it fell rather than being pushed back in by the walls
      for (let i = 1; i < rag.length; i++) {
        for (const k in rag[i]) {
          const d = Math.hypot(rag[i][k].x - rag[i - 1][k].x, rag[i][k].y - rag[i - 1][k].y);
          assert.ok(d < 6, `ragdoll step ${i}: ${k} moved ${d.toFixed(1)}`);
        }
      }
      const drift = Math.abs(rag[rag.length - 1].hip.x - rag[0].hip.x);
      assert.ok(drift < 6, `hip moved ${drift.toFixed(1)} in the ragdoll's first second`);
    });
  }

  for (const [x, vx] of [[60, 120], [90, 200]]) {
    test(`a fighter launched at ${vx} toward the ${wall} wall from ${x} away lands, lies and gets up inside the walls`, () => {
      const { game, W, e, a } = load();
      land(game, W, e, a, side, x, vx);
      const { lying, rag } = run(game, e);
      assert.equal(rag.length, 0);
      assert.equal(e.state, 'idle');
      inside(lying, W, 'lying');
    });
  }
}
