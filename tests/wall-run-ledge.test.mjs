// Runs main.js in a sandbox with floating platforms on and checks that a wall run's flying kick
// at a fighter on the floor past a side ledge hits (issue #422). The leap homed in from high on
// the wall and came down on the ledge between the wall and the target, which ends the move as a
// landing; now the climb stops under that ledge and the leap flies beneath it. Math.random is
// seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

function load(seed, platforms) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = seed >>> 0;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: platforms } });
  return window.__stickmanBrawl;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a, at x 150 on the floor at depth z, wall-runs at e, held flinching on the floor at frac of
// the world's width. Returns whether the flying kick hit.
function wallRun(seed, z, frac, platforms = true) {
  const game = load(seed, platforms);
  const [a, e] = game.fighters;
  const ex = game.worldW * frac;
  Object.assign(a, { x: 150, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  const hold = () => Object.assign(e, { x: ex, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  hold();
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(byId(game, 'wallrun'));
  for (let t = 0; t < 5 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (game.stats.hits.wallrun) break;
    hold(); e.W = e.joints();
  }
  return (game.stats.hits.wallrun || 0) > 0;
}

test('a wall run at a fighter on the floor past a side ledge flies under the ledge and hits (#422)', () => {
  for (const frac of [0.34, 0.42, 0.6]) {
    let hits = 0;
    const misses = [];
    for (const z of [10, 60, 110]) {
      for (let seed = 1; seed <= 12; seed++) {
        if (wallRun(seed, z, frac)) hits++;
        else misses.push('z ' + z + ' seed ' + seed);
      }
    }
    assert.ok(hits >= 30, 'target at ' + frac + ' of the width: ' + hits + ' of 36 hit; missed: ' + misses.join(', '));
  }
});

test('with platforms off the same wall run still hits every time', () => {
  for (const z of [10, 60, 110]) {
    for (let seed = 1; seed <= 12; seed++) assert.ok(wallRun(seed, z, 0.34, false), 'z ' + z + ' seed ' + seed);
  }
});
