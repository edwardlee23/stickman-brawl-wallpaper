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
  return { game, a: game.fighters[0], e: game.fighters[1], window, context };
}

// Puts f dy above the top of p (a positive dy is higher), in a flinch that runs no AI, so it only falls
function dropAbove(game, f, x, p, dy) {
  const z = 60;
  Object.assign(f, { x, z, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999 });
  f.alt = game.groundY(z) - p.y + dy;
}
const feetY = (game, f) => game.groundY(f.z) - f.alt;
// Makes Math.random inside the sandbox a seeded generator, so a test that counts random picks is repeatable
function seed(context, s = 1) {
  context.__seed = s >>> 0;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
}
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
  const { game, a, e, context } = load();
  seed(context, 3);   // Random jumps and air dashes can take it back up; a fixed seed keeps the time it takes repeatable
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
  const { game, a, e, context } = load();
  seed(context, 3);
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

// Issue #107: standing on a ledge is not being in the air
test('a fighter standing on a platform keeps to the styles that are on', () => {
  const { game, a, e, context } = load();
  seed(context, 7);
  const p = game.platforms[0];
  for (const s in game.cfg.styles) game.cfg.styles[s] = s === 'boxing';
  dropAbove(game, a, p.x0 + 40, p, 0);
  dropAbove(game, e, p.x0 + 80, p, 0);
  run(game, 0.1);
  assert.ok(Math.abs(feetY(game, a) - p.y) < 1e-6, 'standing on the platform');
  const got = {};
  for (let i = 0; i < 2000; i++) { const m = game.pickMove(a, e); got[m.style] = (got[m.style] || 0) + 1; }
  assert.deepEqual(got, { boxing: 2000 });
});

test('a fighter on a platform picks martial-arts moves about as often as on the floor', () => {
  const rate = onLedge => {
    const { game, a, e, context } = load();
    seed(context, 11);
    const p = game.platforms[0];
    if (onLedge) { dropAbove(game, a, p.x0 + 40, p, 0); dropAbove(game, e, p.x0 + 80, p, 0); }
    else Object.assign(a, { x: 500, z: 60, alt: 0 }), Object.assign(e, { x: 540, z: 60, alt: 0 });
    run(game, 0.1);
    const martial = new Set(game.MOVES);
    let n = 0;
    for (let i = 0; i < 2000; i++) if (martial.has(game.pickMove(a, e))) n++;
    return n / 2000;
  };
  const floor = rate(false), ledge = rate(true);
  assert.ok(floor > 0.2, `martial rate on the floor ${floor}`);
  assert.ok(Math.abs(ledge - floor) < 0.08, `martial rate ${ledge} on a platform, ${floor} on the floor`);
});

test('an idle jump from a platform starts from its top', () => {
  const { game, a, e, context } = load();
  const p = game.platforms[0];
  dropAbove(game, a, p.x0 + 40, p, 0);
  dropAbove(game, e, p.x0 + 120, p, 0);
  run(game, 0.1);
  const top = a.alt;
  Object.assign(a, { state: 'idle', cool: 999, target: e, retarget: 999, nextMove: game.MOVES[0] });
  vm.runInContext('Math.random = () => 0.001', context);
  game.update(1 / 60);
  assert.equal(a.state, 'air');
  assert.ok(a.alt > top, `jumped from alt ${a.alt}, below the platform top at ${top}`);
  assert.ok(a.va > 0);
});

test('a held hit does not lift a target standing on a platform', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  dropAbove(game, e, p.x0 + 80, p, 0);
  run(game, 0.1);
  const top = e.alt;
  Object.assign(e, { state: 'idle', cool: 999 });
  e.takeHit(a, game.MOVES[0], 'body', { x: e.x, y: feetY(game, e) - 40 }, { hold: true });
  assert.equal(e.va, 0, 'lifted off the platform');
  game.update(1 / 60);
  assert.ok(Math.abs(e.alt - top) < 1e-6, `alt ${e.alt}, platform top at ${top}`);
});

test('a fighter lying on a platform is drawn on its top, not through it', () => {
  const lowest = onLedge => {
    const { game, a } = load();
    const p = game.platforms[0];
    if (onLedge) dropAbove(game, a, (p.x0 + p.x1) / 2, p, 0);
    else Object.assign(a, { x: 500, z: 60, alt: 0 });
    run(game, 0.1);
    a.knockDown(1, 0.3);
    for (let t = 0; t < 1 && a.state !== 'down'; t += 1 / 60) game.update(1 / 60);
    assert.equal(a.state, 'down');
    const J = a.joints();
    return Math.max(...Object.values(J).map(o => o.y)) - feetY(game, a);
  };
  const floor = lowest(false), ledge = lowest(true);
  assert.ok(Math.abs(ledge - floor) < 1e-6, `lowest joint ${ledge} below a platform top, ${floor} below the floor`);
});

// Issue #108: slams, dives and wall-run leaps land on ledges
const special = (game, type) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.type === type);
const onTop = (game, f, p) => Math.abs(feetY(game, f) - p.y) < 1e-6;

test('a slam started on a platform lands on it and hits a target beside it there', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  dropAbove(game, a, p.x0 + 40, p, 0);
  dropAbove(game, e, p.x0 + 90, p, 0);
  e.hp = 1000;
  run(game, 0.1);
  Object.assign(a, { state: 'idle', target: e, retarget: 999 });
  a.startMove(special(game, 'slam'));
  let landed = false;
  for (let t = 0; t < 2 && a.state === 'attack' && !landed; t += 1 / 60) {
    game.update(1 / 60);
    landed = a.md && a.md.ph === 'rec';
  }
  assert.ok(landed, 'the slam never landed');
  assert.ok(onTop(game, a, p), `landed with its feet at ${feetY(game, a)}, platform top at ${p.y}`);
  assert.ok(e.hp < 1000, 'the shockwave missed the target on the platform');
});

test('a slam on a platform does not hit a target on the floor below it', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  dropAbove(game, a, p.x0 + 40, p, 0);
  Object.assign(e, { x: p.x0 + 90, z: 60, alt: 0 });
  e.hp = 1000;
  run(game, 0.1);
  Object.assign(a, { state: 'idle', target: e, retarget: 999 });
  a.startMove(special(game, 'slam'));
  for (let t = 0; t < 2 && a.state === 'attack'; t += 1 / 60) game.update(1 / 60);
  assert.equal(e.hp, 1000);
});

test('a missed dive over a platform stops on its top', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  // The target is unseen on the floor under the platform, so the dive steers down at it and misses
  Object.assign(e, { x: (p.x0 + p.x1) / 2 + 20, z: 60, alt: 0, invis: true });
  dropAbove(game, a, (p.x0 + p.x1) / 2, p, 100);
  game.update(1 / 60);
  Object.assign(a, { state: 'idle', target: e, retarget: 999 });
  a.startMove(special(game, 'dive'));
  Object.assign(a.md, { ph: 'dive', a: 1.2, prev: null });
  Object.assign(a, { hover: true, va: -600, vx: 0 });
  let landed = false;
  for (let t = 0; t < 3 && a.state === 'attack' && !landed; t += 1 / 60) {
    game.update(1 / 60);
    landed = a.md && a.md.ph === 'rec';
  }
  assert.ok(landed, 'the dive never landed');
  assert.ok(onTop(game, a, p), `landed with its feet at ${feetY(game, a)}, platform top at ${p.y}`);
});

test('a wall-run leap that ends over a platform lands on it', () => {
  const { game, a, e } = load();
  const p = game.platforms[0];
  Object.assign(e, { x: (p.x0 + p.x1) / 2 + 30, z: 60, alt: 0, invis: true });
  dropAbove(game, a, (p.x0 + p.x1) / 2 - 30, p, 60);
  game.update(1 / 60);
  Object.assign(a, { state: 'idle', target: e, retarget: 999, facing: 1 });
  a.startMove(special(game, 'wallrun'));
  Object.assign(a.md, { ph: 'leap', t0: a.st, prev: null, dir: -1 });
  Object.assign(a, { hover: true, va: -300, vx: 200 });
  for (let t = 0; t < 3 && a.state === 'attack'; t += 1 / 60) game.update(1 / 60);
  assert.notEqual(a.state, 'attack', 'the leap never ended');
  run(game, 0.3);
  assert.ok(onTop(game, a, p), `feet at ${feetY(game, a)}, platform top at ${p.y}`);
});
