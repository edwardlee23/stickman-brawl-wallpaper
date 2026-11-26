// React to music speeds up the wait between moves in the air as it does on the ground
// (issue #264): with the music at full drive the wait runs out 3x as fast in both.
// Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {},
    wallpaperRegisterAudioListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('Math.random = () => 0.5;', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  window.wallpaperPropertyListener.applyUserProperties({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  return game;
}

// How much of the wait before the next move one step of 0.1 s uses up, on the ground or in the air
function used(game, where) {
  // The music counts as heard just now: musicDrive resets it when no frame came for 3 s,
  // and the listener is never called here, so without this the result depends on how long the process has run
  game.music.t = performance.now();
  const [f, e] = game.fighters;
  Object.assign(e, { x: 1100, z: 50, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 99, cool: 99 });
  Object.assign(f, { x: 300, z: 50, alt: where === 'air' ? 200 : 0, va: 0, vx: 0, vz: 0, dash: 0, evade: 0,
    state: where, target: e, retarget: 99, cool: 100 });
  if (where === 'air') f.updAir(0.1); else f.updIdle(0.1);
  return 100 - f.cool;
}

test('with the music at full drive the wait runs out 3x as fast in the air, as on the ground', () => {
  const game = load();
  const calm = { ground: used(game, 'idle'), air: used(game, 'air') };
  assert.ok(Math.abs(calm.ground - 0.1) < 1e-9, 'ground, no music: ' + calm.ground);
  assert.ok(Math.abs(calm.air - 0.1) < 1e-9, 'air, no music: ' + calm.air);
  game.music.level = 1; game.music.beat = 1;
  const loud = { ground: used(game, 'idle'), air: used(game, 'air') };
  assert.ok(Math.abs(loud.ground - 0.3) < 1e-9, 'ground, full drive: ' + loud.ground);
  assert.ok(Math.abs(loud.air - 0.3) < 1e-9, 'air, full drive: ' + loud.air);
});
