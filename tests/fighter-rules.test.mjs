// Runs main.js in a sandbox with a stubbed canvas and window, then pins Fighter rules
// that could break with every other test green (issue #180): a fatal grab of every kind
// knocks out, a started move clears the queued one, blocks and splats last as long as
// they should, knockback slows to a stop, moves start only at the target's depth, and
// with platforms on a fighter jumps up onto a higher platform its target stands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(props = {}) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=4&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // Seeded, so every random pick (damage, jumps, lying time) is the same every run
  context.__seed = 180;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  // Everyone stays out of the way, flinching on the floor at the far right, until a test moves them
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0], e: game.fighters[1] };
}
const run = (game, s) => { for (let t = 0; t < s; t += 1 / 60) game.update(1 / 60); };
// Steps f alone until it leaves state, for at most s seconds; returns the time it took
function timeIn(f, state, s = 10) {
  let t = 0;
  while (f.state === state && t < s) { f.update(1 / 60); t += 1 / 60; }
  return t;
}

for (const kind of ['over', 'reap', 'takedown']) {
  test(`a "${kind}" grab that takes the last health knocks the victim out`, () => {
    const { game, a, e } = load();
    Object.assign(a, { x: 400, z: 60, facing: 1 });
    Object.assign(e, { x: 422, z: 60, facing: -1, hp: 1 });
    a.W = a.joints(); e.W = e.joints();
    a.move = game.MOVES.find(m => m.grab === kind);
    a.applyGrab(e);
    assert.ok(e.hp <= 0, `hp ${e.hp}`);
    run(game, 3);
    assert.equal(e.state, 'ko', `hp ${e.hp.toFixed(1)}, state ${e.state}`);
  });
}

test('starting a move clears the queued one, so the next move is picked again', () => {
  const { game, a } = load();
  Object.assign(a, { x: 400, z: 60, state: 'idle' });
  a.nextMove = game.MOVES.find(m => m.id === 'roundhouse');
  a.startMove(game.MOVES.find(m => m.id === 'jab'));
  assert.equal(a.nextMove, null);
});

test('a block lasts as long as it was set to', () => {
  const { e } = load();
  Object.assign(e, { x: 400, state: 'block', st: 0, dur: 0.5 });
  const t = timeIn(e, 'block');
  assert.ok(Math.abs(t - 0.5) < 0.05, `a 0.5 s block lasted ${t.toFixed(2)} s`);
});

test('a splat against a wall holds for 0.4 s before the body drops off it', () => {
  const { e } = load();
  Object.assign(e, { x: 20, state: 'splat', st: 0, splatSide: -1 });
  const t = timeIn(e, 'splat');
  assert.ok(Math.abs(t - 0.4) < 0.05, `the splat held ${t.toFixed(2)} s`);
});

test('knockback on a flinching fighter slows to a stop', () => {
  const { e } = load();
  Object.assign(e, { x: 300, state: 'hit', st: 0, dur: 999, vx: 300, vz: 0 });
  for (let t = 0; t < 2; t += 1 / 60) e.update(1 / 60);
  // 300 px/s under 520 px/s² of friction slides about 300² / (2 · 520) = 87 px
  assert.ok(e.x - 300 > 60 && e.x - 300 < 110, `slid ${(e.x - 300).toFixed(0)} px`);
  assert.equal(e.vx, 0, 'and stopped');
});

test('a move starts on the floor only when the target is at about the same depth', () => {
  for (const [dz, starts] of [[4, true], [15, false]]) {
    const { game, a, e } = load();
    const jab = game.MOVES.find(m => m.id === 'jab');
    Object.assign(e, { x: 400 + (jab.range[0] + jab.range[1]) / 2, z: 60 + dz, facing: -1 });
    Object.assign(a, { x: 400, z: 60, facing: 1, state: 'idle', cool: 0, target: e, retarget: 999, nextMove: jab });
    a.update(1 / 60);
    assert.equal(a.state === 'attack', starts, `depth gap ${dz}: state ${a.state}`);
  }
});

test('with platforms on, a fighter under a higher platform jumps up onto it to reach its target there', () => {
  const { game, a, e } = load({ platforms: { value: true } });
  const p = game.platforms.reduce((h, q) => (q.y < h.y ? q : h));   // The highest, the middle one
  const z = 30;
  Object.assign(e, { x: (p.x0 + p.x1) / 2, z, alt: game.groundY(z) - p.y, hp: 1000 });
  Object.assign(a, { x: p.x0 + 20, z, alt: 0, facing: 1, state: 'idle', cool: 999, target: e, retarget: 999 });
  let on = false;
  for (let t = 0; t < 8 && !on; t += 1 / 60) {
    a.cool = 999; a.update(1 / 60);
    on = a.state === 'idle' && Math.abs(game.groundY(a.z) - a.alt - p.y) < 1e-6 && a.x >= p.x0 && a.x <= p.x1;
  }
  assert.ok(on, `ended at x ${a.x.toFixed(0)} alt ${a.alt.toFixed(0)} state ${a.state}; platform top alt ${game.groundY(a.z) - p.y}`);
});
