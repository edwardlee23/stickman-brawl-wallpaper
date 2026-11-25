// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// optional floating platforms (issue #87): fighters and ragdolls land on them,
// fighters walk off their edges, and with the setting off there are none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(on = true, scale) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=4&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const props = {};
  if (scale) props.figurescale = { value: scale };
  if (on) props.platforms = { value: true };
  window.wallpaperPropertyListener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  // Everyone but the fighter under test stays out of the way, flinching on the floor at the far right
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0], e: game.fighters[1], window };
}

// Puts f dy above the top of p (a positive dy is higher), in a flinch that runs no AI, so it only falls
function dropAbove(game, f, x, p, dy) {
  const z = 60;
  Object.assign(f, { x, z, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999 });
  f.alt = game.groundY(z) - p.y + dy;
}
const feetY = (game, f) => game.groundY(f.z) - f.alt;
const run = (game, s) => { for (let t = 0; t < s; t += 1 / 60) game.update(1 / 60); };

test('platforms are off by default and none exists then', () => {
  const { game, a } = load(false);
  assert.equal(game.cfg.platforms, false);
  assert.equal(game.platforms.length, 0);
  Object.assign(a, { x: 300, z: 60, alt: 150, va: 0, state: 'hit', st: 0, dur: 999 });
  run(game, 2);
  assert.equal(a.alt, 0, 'a fighter in the air falls to the floor');
});

test('turning platforms on lays out two or three, all below the headroom', () => {
  for (const scale of [50, 100, 150, 200]) {
    const { game } = load(true, scale);
    const n = game.platforms.length;
    if (scale <= 100) assert.ok(n >= 2 && n <= 3, `${n} platforms at ${scale}%`);
    for (const p of game.platforms) {
      assert.ok(p.y >= 110, `platform top ${p.y} above the headroom at ${scale}%`);
      assert.ok(p.y < game.groundY(0) - 40, `platform top ${p.y} too close to the floor at ${scale}%`);
      assert.ok(p.x0 >= 0 && p.x1 > p.x0, 'platform span');
    }
  }
});

test('a fighter dropped above a platform lands on it and stays', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  dropAbove(game, a, (p.x0 + p.x1) / 2, p, 60);
  run(game, 1);
  assert.ok(Math.abs(feetY(game, a) - p.y) < 1e-6, `feet at ${feetY(game, a)}, platform top at ${p.y}`);
  assert.equal(a.va, 0);
  run(game, 1);
  assert.ok(Math.abs(feetY(game, a) - p.y) < 1e-6, 'still on the platform a second later');
});

test('a fighter dropped past the edge of a platform falls to the floor', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  dropAbove(game, a, p.x1 + 25, p, 60);
  run(game, 2);
  assert.equal(a.alt, 0);
});

test('a fighter standing on a platform walks off its edge and falls', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  dropAbove(game, a, p.x1 - 2, p, 0);
  run(game, 0.2);
  assert.ok(Math.abs(feetY(game, a) - p.y) < 1e-6, 'standing on it');
  a.x = p.x1 + 25;
  run(game, 2);
  assert.equal(a.alt, 0);
});

test('a ragdoll dropped on a platform rests on it', () => {
  const { game, a } = load();
  const p = game.platforms[0];
  dropAbove(game, a, (p.x0 + p.x1) / 2, p, 80);
  a.W = a.joints();
  a.hp = 0; a.ko(0, 0);
  run(game, 4);
  const ys = Object.values(a.rag.pts).map(o => o.y);
  assert.ok(Math.max(...ys) <= p.y + 0.01, `a point sank to ${Math.max(...ys)} below the top at ${p.y}`);
  assert.ok(Math.max(...ys) > p.y - 5, `body hangs above the platform (lowest point ${Math.max(...ys)})`);
});

test('a fighter on a platform gets down to a target on the floor', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  // Unseen, so no blow knocks it away from where it stands
  Object.assign(e, { x: (p.x0 + p.x1) / 2, z: 60, alt: 0, invis: true });
  for (const s of ['super', 'magic', 'ninjutsu']) game.cfg.styles[s] = false;
  dropAbove(game, a, (p.x0 + p.x1) / 2 + 10, p, 0);
  Object.assign(a, { state: 'idle', cool: 999, target: e, retarget: 999 });
  let t = 0;
  for (; t < 6 && a.alt > 0; t += 1 / 60) game.update(1 / 60);
  assert.equal(a.alt, 0, 'still up on the platform');
});

test('a fighter on the floor jumps up to a target on a platform', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  dropAbove(game, e, (p.x0 + p.x1) / 2, p, 0);
  e.invis = true;   // Unseen, so no blow knocks it off its platform
  // Specials, magic and ninjutsu hover in the air for seconds; this is about getting up there
  for (const s of ['super', 'magic', 'ninjutsu']) game.cfg.styles[s] = false;
  Object.assign(a, { x: p.x1 + 60, z: 60, alt: 0, state: 'idle', cool: 999, target: e, retarget: 999 });
  let up = false;
  for (let t = 0; t < 10 && !up; t += 1 / 60) {
    game.update(1 / 60);
    up = a.state === 'idle' && Math.abs(feetY(game, a) - p.y) < 1e-6;
  }
  assert.ok(up, 'never got onto the platform');
});
