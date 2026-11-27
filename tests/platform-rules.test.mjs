// Runs main.js in a sandbox with a stubbed canvas and window, then pins the floating platform
// rules for bodies and fighters under a ledge, and the ledges laid out on a large screen
// (issue #184): each test fails under a one-string change to those rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load([w, h] = [1280, 720], scale) {
  const props = { platforms: { value: true } };
  if (scale) props.figurescale = { value: scale };
  // A seeded generator (an LCG), so every run is the same (issue #161)
  const { game } = loadMain({ width: w, height: h, search: '?count=4&mode=ffa', properties: props });
  // Everyone but the fighter under test stays out of the way, flinching on the floor at the far right
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 1200 - i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0] };
}
const step = game => game.update(1 / 60);
const feetY = (game, f) => game.groundY(f.z) - f.alt;

test('a fighter knocked out under a platform stays under it', () => {
  for (const dx of [20, 60, 105, 150, 190]) for (const vx of [-150, 0, 150]) {
    const { game, a } = load();
    const p = game.platforms[0];
    Object.assign(a, { x: p.x0 + dx, z: 60, alt: 0 });
    a.W = a.joints(); a.hp = 0; a.ko(vx, 0);
    let top = Infinity;
    for (let t = 0; t < 4; t += 1 / 60) {
      step(game);
      top = Math.min(top, ...Object.values(a.rag.pts).map(o => o.y));
    }
    assert.ok(top > p.y, `x ${a.x.toFixed(0)} vx ${vx}: a point rose to ${top.toFixed(1)}, ledge top at ${p.y.toFixed(1)}`);
  }
});

test('a fighter falling under a platform comes down to the floor', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  assert.ok(game.groundY(60) - p.y > 60, 'the ledge is not high enough for the test');
  Object.assign(a, { x: (p.x0 + p.x1) / 2, z: 60, alt: 30, va: -10, vx: 0, state: 'air', st: 0 });
  for (let t = 0; t < 1 && a.alt > 0; t += 1 / 60) step(game);
  assert.equal(a.alt, 0, `still at alt ${a.alt}, state ${a.state}`);
});

test('a fighter falling a little above a platform top is not pulled down onto it', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  Object.assign(a, { x: (p.x0 + p.x1) / 2, z: 60, va: -1, vx: 0, state: 'hit', st: 0, dur: 999 });
  a.alt = game.groundY(60) - p.y + 3;
  step(game);
  assert.ok(p.y - feetY(game, a) > 1, `feet at ${feetY(game, a)} after one step, platform top at ${p.y}`);
});

test('a knocked-out head rests on a platform with its whole circle above the top', () => {
  let touching = 0;
  for (const dx of [40, 80, 120, 160]) for (const vx of [-200, 0, 200]) {
    const { game, a } = load();
    const p = game.platforms[0];
    Object.assign(a, { x: p.x0 + dx, z: 60, va: 0, vx: 0 });
    a.alt = game.groundY(60) - p.y + 80;
    a.W = a.joints(); a.hp = 0; a.ko(vx, 0);
    for (let t = 0; t < 6; t += 1 / 60) step(game);
    const h = a.rag.pts.head;
    if (h.x < p.x0 || h.x > p.x1 || h.y > p.y) continue;   // Slid off onto the floor
    assert.ok(h.y <= p.y - 8 + 0.01, `head centre at ${h.y.toFixed(2)}, less than its radius over the top at ${p.y}`);
    if (h.y > p.y - 9) touching++;
  }
  assert.ok(touching > 0, 'no head ever came to rest on the platform');
});

test('three platforms at 1920x1080 at 100%', () => {
  const { game } = load([1920, 1080], 100);
  assert.equal(game.platforms.length, 3);
  const [l, r] = [...game.platforms].sort((p, q) => p.x0 - q.x0).filter((p, i) => i !== 1);
  const mid = game.platforms.find(p => p !== l && p !== r);
  assert.ok(mid.x0 > l.x1 && mid.x1 < r.x0, 'no platform between the two low ones');
  assert.ok(mid.y < Math.min(...game.platforms.filter(p => p !== mid).map(p => p.y)), 'the middle platform is not the highest');
});
