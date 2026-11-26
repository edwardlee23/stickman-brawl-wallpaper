// Runs main.js in a sandbox with a stubbed canvas and window, and changes a setting while a
// move is under way (issue #390): Items off during a staff strike leaves no staff to hit
// from, and Floating platforms off between a lightning mark and its strike lets the bolt
// fall to the floor instead of stopping at the ledge that is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DT = 1 / 60;
function load(props = {}) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A fixed Math.random of 0.99 turns off the random jumps, dashes and blocks
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const listener = window.wallpaperPropertyListener;
  listener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  return { game, listener, a, e };
}
// Keeps e stunned where it stands and a from starting another attack, for n frames
function run(game, a, e, n) {
  const { x, z } = e;
  for (let i = 0; i < n; i++) {
    Object.assign(e, { x, z, vx: 0, vz: 0, state: e.alive ? 'hit' : e.state, st: 0, dur: 99 });
    a.cool = 99;
    game.update(DT);
  }
}

test('a staff jab started at 66 px does not hit once Items is turned off during its wind-up (#390)', () => {
  const { game, listener, a, e } = load({ items: { value: true } });
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 99, target: e, hp: 100 });
  Object.assign(e, { x: 466, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'staff', n: 3 };
  a.startMove(game.STAFF_MOVE.jab);
  run(game, a, e, 1);
  listener.applyUserProperties({ items: { value: false } });
  assert.equal(a.held, null);
  run(game, a, e, 60);
  assert.equal(e.hp, 100, 'the target was hit from a staff that is gone');
});

test('a staff jab started at 66 px with Items left on hits (#390)', () => {
  const { game, a, e } = load({ items: { value: true } });
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 99, target: e, hp: 100 });
  Object.assign(e, { x: 466, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  a.held = { kind: 'staff', n: 3 };
  a.startMove(game.STAFF_MOVE.jab);
  run(game, a, e, 60);
  assert.ok(e.hp < 100, 'the staff jab missed');
});

// The bolt drawn by the last lightning strike, and the target's hp after it
function lightning(off) {
  const { game, listener, a, e } = load({ platforms: { value: true } });
  const p = game.platforms.reduce((l, q) => (q.x0 < l.x0 ? q : l));
  Object.assign(e, { x: (p.x0 + p.x1) / 2, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  Object.assign(a, { x: e.x + 300, z: 50, alt: 0, vx: 0, vz: 0, facing: -1, state: 'idle', cool: 99, target: e, hp: 100 });
  a.W = a.joints(); e.W = e.joints();
  a.startMove(game.MAGIC.find(m => m.id === 'lightning'));
  run(game, a, e, 12);
  assert.equal(a.md.ph, 'mark');
  if (off) listener.applyUserProperties({ platforms: { value: false } });
  run(game, a, e, 40);
  const bolt = game.fx.filter(f => f.type === 'bolt').pop();
  assert.ok(bolt, 'no bolt fell');
  return { end: bolt.pts[bolt.pts.length - 1][1], floor: game.groundY(e.z), ledge: p.y, hp: e.hp };
}

test('lightning marked under a ledge strikes the ledge while the platforms stay (#390)', () => {
  const r = lightning(false);
  assert.equal(r.end, r.ledge);
  assert.equal(r.hp, 100, 'the ledge did not shelter the target under it');
});

test('lightning marked under a ledge strikes the floor once Floating platforms is turned off before it falls (#390)', () => {
  const r = lightning(true);
  assert.equal(r.end, r.floor, 'the bolt ended at y ' + r.end + ', the floor is at ' + r.floor);
  assert.ok(r.hp < 100, 'the target under the vanished ledge was not hit');
});
