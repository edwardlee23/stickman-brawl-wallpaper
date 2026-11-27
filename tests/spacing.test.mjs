// Pins spacing: a fighter waiting with its target in reach now and then backs off to hold it
// just out of reach, circles it in depth, then rushes in and strikes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

const DT = 1 / 60;
// Two fighters on the floor, d apart; Math.random gives the numbers in state.next first, then
// state.fixed while that is set
function pair(d, { platforms } = {}) {
  const rnd = lcg(5), state = { fixed: null, next: [] };
  const { game } = loadMain({ search: '?count=2&mode=ffa', ctx: stubContext(), random: () => (state.next.length ? state.next.shift() : state.fixed ?? rnd()),
    properties: platforms ? { platforms: { value: true } } : undefined });
  const [a, b] = game.fighters;
  const jab = game.MOVES.find(m => m.id === 'cross');
  Object.assign(a, { state: 'idle', x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, cool: 0.5, retarget: 99, target: b, nextMove: jab, dash: 0, evade: 0 });
  Object.assign(b, { state: 'hit', x: 400 + d, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, st: 0, dur: 99, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, b, jab, state };
}
const run = (a, n) => { for (let i = 0; i < n; i++) { a.update(DT); a.W = a.joints(); } };

test('waiting in reach, a fighter may back off into a standoff, circle in depth, then rush in', () => {
  const { game, a, b, jab, state } = pair(40);
  // Start a standoff at once; then no jump, no dash
  state.next = [0.001]; state.fixed = 0.5;
  run(a, 1);
  assert.ok(a.standoff > 0, 'no standoff');
  assert.equal(game.stats.standoffs, 1);
  const hold = a.standoffD;
  assert.ok(hold >= jab.range[1] + 35 && hold <= jab.range[1] + 70, 'holds ' + hold);
  let far = 0, zs = new Set();
  while (a.standoff > 0) {
    run(a, 1);
    assert.notEqual(a.state, 'attack', 'struck during the standoff');
    far = Math.max(far, b.x - a.x); zs.add(Math.round(a.z));
  }
  assert.ok(far > jab.range[1] + 20, 'backed off only to ' + far);
  assert.ok(zs.size > 3, 'did not circle in depth');
  // The rush: a dash that stops in reach, and no wait before the strike
  assert.ok(a.dash > 0 && a.vx > 300, 'no rush: dash ' + a.dash + ', vx ' + a.vx);
  assert.equal(a.cool, 0);
  for (let i = 0; i < 40 && a.state !== 'attack'; i++) run(a, 1);
  assert.equal(a.state, 'attack');
  assert.ok(Math.abs(a.z - b.z) < 9);
});

test('no standoff with a throw or a special queued', () => {
  for (const id of ['osotogari', 'beam']) {
    const { game, a, state } = pair(id === 'beam' ? 150 : 20);
    a.nextMove = [...game.MOVES, ...game.SUPER].find(m => m.id === id);
    state.next = [0.001]; state.fixed = 0.5;
    run(a, 1);
    assert.equal(a.standoff, 0, id);
  }
});

test('on a ledge a standoff does not circle in depth, which would step off it', () => {
  const { game, a, b, state } = pair(40, { platforms: true });
  const p = game.platforms.find(q => q.x1 < 480 && q.x1 - q.x0 > 150);
  const alt = game.groundY(50) - p.y;
  Object.assign(a, { x: (p.x0 + p.x1) / 2, alt });
  Object.assign(b, { x: a.x + 40, alt });
  for (const f of game.fighters) f.W = f.joints();
  state.next = [0.001]; state.fixed = 0.5;
  run(a, 1);
  assert.ok(a.standoff > 0);
  for (let i = 0; i < 30; i++) { run(a, 1); assert.equal(a.z, 50); assert.ok(Math.abs(a.alt - alt) < 1e-9, 'alt ' + a.alt); }
});

test('standoffs happen in a fight', () => {
  let n = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const { game } = loadMain({ search: '?count=6&mode=ffa', ctx: stubContext(), random: lcg(seed) });
    for (let i = 0; i < 60 * 60; i++) game.update(DT);
    n += game.stats.standoffs;
  }
  assert.ok(n >= 6, n + ' standoffs in 3 minutes');
});
