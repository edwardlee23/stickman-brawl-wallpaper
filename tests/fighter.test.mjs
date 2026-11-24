// Runs main.js in a sandbox with a stubbed canvas and window, then checks
// fighter state after grabs, knockouts, landings and resizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  // A canvas context that accepts every call and property write.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    listeners: {},
    addEventListener(type, f) { this.listeners[type] = f; },
  };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=4&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  e.W = e.joints();
  return { game, a, e, window };
}

// Puts the fighter in the state a special leaves behind mid-move.
function midSpecial(f) {
  Object.assign(f, {
    move: f.move ?? {}, md: { ph: 'fade' }, spin: true, hover: true, rot: 1,
    ghost: true, alpha: 0.4, trailOn: true, invis: true, aura: 1,
  });
}

function assertCleared(f) {
  assert.equal(f.md, null, 'md');
  assert.equal(f.spin, false, 'spin');
  assert.equal(f.hover, false, 'hover');
  assert.equal(f.ghost, false, 'ghost');
  assert.equal(f.alpha, 1, 'alpha');
  assert.equal(f.invis, false, 'invis');
  assert.equal(f.aura, 0, 'aura');
  assert.equal(f.rot, 0, 'rot');
}

for (const kind of ['over', 'reap', 'takedown']) {
  test(`the "${kind}" grab clears the grabbed fighter's special`, () => {
    const { game, a, e } = load();
    a.move = game.MOVES.find(m => m.grab === kind);
    midSpecial(e);
    e.hp = 1000;
    a.applyGrab(e);
    assert.equal(e.move, null, 'move');
    assertCleared(e);
    assert.equal(e.trailOn, false, 'trailOn');
    assert.equal(e.state, kind === 'over' ? 'thrown' : 'fall');
  });
}

test('a teleport follows up only with moves from enabled styles', () => {
  const { game, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'super';
  a.target = e;
  for (let i = 0; i < 50; i++) {
    a.startMove(game.SUPER.find(m => m.id === 'teleport'));
    a.md.ph = 'gone';
    a.st = 0.25;
    a.u_teleport(0);
    assert.equal(a.move.style, 'super', `follow-up ${a.move.id}`);
  }
});

test('a fighter knocked into a wall near the floor does not sink below it', () => {
  const { e } = load();
  e.x = 15;
  e.launch(-600, -300);
  e.updLaunched(0.05);   // Crosses the wall and the floor in the same step
  assert.equal(e.state, 'splat');
  assert.ok(e.alt >= 0, `alt ${e.alt}`);
});

test('a knockout clears the special but keeps the ragdoll trail', () => {
  const { e } = load();
  midSpecial(e);
  e.ko(0, -40);
  assert.equal(e.state, 'ko');
  assert.equal(e.move, null, 'move');
  assertCleared(e);
  assert.equal(e.trailOn, true, 'trailOn');
});

test('turning a style off drops the moves fighters had queued from it', () => {
  const { game, a, e, window } = load();
  a.nextMove = game.MOVES.find(m => m.style === 'judo');
  e.nextMove = game.MOVES.find(m => m.style === 'boxing');
  window.wallpaperPropertyListener.applyUserProperties({ stylejudo: { value: false } });
  assert.equal(game.cfg.styles.judo, false);
  assert.equal(a.nextMove, null, 'judo move still queued');
  assert.equal(e.nextMove.style, 'boxing', 'boxing move dropped');
});

// The stub window is 1280 x 720 at 100% figure size, so the world is 960 wide.
const WORLD_W = 1280 / (720 / 540);
for (const [wall, x, facing] of [['left', 14, 1], ['right', WORLD_W - 14, -1]]) {
  test(`a teleport to a target with its back to the ${wall} wall lands beside it, facing it`, () => {
    const { game, a, e } = load();
    Object.assign(e, { x, facing, state: 'idle', alt: 0 });
    a.x = WORLD_W / 2; a.target = e;
    a.startMove(game.SUPER.find(m => m.id === 'teleport'));
    a.md.ph = 'gone';
    a.st = 0.25;
    a.u_teleport(0);
    assert.ok(Math.abs(a.x - e.x) >= 20, `attacker at ${a.x}, target at ${e.x}`);
    assert.equal(a.facing, Math.sign(e.x - a.x), 'faces the target');
  });
}

test('a knockout trail stops once the ragdoll comes to rest (issue #30)', () => {
  const { game, a, e } = load();
  for (const f of game.fighters) if (f !== e) f.hp = 1000;
  e.hp = 1;
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint(), { dmg: 50 });
  assert.equal(e.state, 'ko');
  assert.equal(e.trailOn, true, 'no trail while flying');
  for (let t = 0; t < 4; t += 1 / 60) game.update(1 / 60);
  assert.equal(game.fighters[1], e, 'a new round started');
  assert.equal(e.trailOn, false, 'trail still recording');
  assert.equal(e.trail.length, 0, 'afterimages stacked on the body');
});

// Steps one fighter alone, with every other fighter held still, for up to
// `seconds` or until `stop` returns true.
function stepUntil(game, f, stop, seconds = 5) {
  for (let t = 0; t < seconds && !stop(); t += 1 / 60) {
    for (const o of game.fighters) if (o !== f) Object.assign(o, { state: 'hit', st: 0, dur: 999 });
    game.update(1 / 60);
  }
}

for (const kind of ['over', 'reap', 'takedown']) {
  test(`a fighter caught rising by the "${kind}" grab does not float up while down (issue #46)`, () => {
    const { game, a, e } = load();
    Object.assign(e, { state: 'air', alt: 5, va: 600, vx: 200, hp: 1000 });
    a.move = game.MOVES.find(m => m.grab === kind);
    a.applyGrab(e);
    let top = 0;
    stepUntil(game, e, () => {
      if (e.state === 'fall' || e.state === 'down') top = Math.max(top, e.alt);
      return e.state === 'getup';
    }, 4);
    assert.equal(e.state, 'getup');
    assert.ok(top <= 5, `rose to ${top.toFixed(1)} while falling or down`);
    assert.equal(e.alt, 0, 'on the floor by the getup');
  });
}

for (const kind of ['ice', 'hold']) {
  test(`a fighter back on its feet after ${kind === 'ice' ? 'an ice' : 'a hold'} hit in the air can be juggled again (issue #47)`, () => {
    const { game, a, e } = load();
    Object.assign(e, { x: 600, z: 50, hp: 1000, cool: 99 });
    Object.assign(a, { x: 200 });
    e.launch(100, 500); e.launch(100, 300); e.launch(100, 200);   // Three juggles in the air
    stepUntil(game, e, () => false, 0.1);
    e.takeHit({ facing: 1 }, game.MOVES[0], 'body', { x: e.x, y: 300 },
      kind === 'ice' ? { dmg: 1, freeze: 1.1 } : { dmg: 1, hold: true });
    stepUntil(game, e, () => e.state === 'idle' && e.alt === 0);
    assert.equal(e.state, 'idle');
    stepUntil(game, e, () => false, 1 / 60);   // One idle step on the floor
    e.launch(100, 500);
    assert.equal(e.hittable, true, `juggle ${e.juggle}`);
  });
}

test('a slam from the air gives back the air dash and double jump on landing (issue #48)', () => {
  const { game, a, e } = load();
  Object.assign(a, { state: 'air', alt: 150, va: 0, dashed: true, dj: true, target: e });
  e.x = a.x + 300;
  a.W = a.joints();
  a.startMove(game.SUPER.find(m => m.id === 'slam'));
  stepUntil(game, a, () => a.state !== 'attack', 3);
  stepUntil(game, a, () => false, 1 / 60);   // One step on the floor
  assert.equal(a.alt, 0, 'landed');
  assert.equal(a.dashed, false, 'dashed');
  assert.equal(a.dj, false, 'dj');
});

test('a jump that reaches the top of the screen falls back at once (issue #49)', () => {
  const { game, window } = load();
  // At 200% the top of the screen is below a normal jump's apex
  window.wallpaperPropertyListener.applyUserProperties({ figurescale: { value: 200 } });
  const [f] = game.fighters;
  Object.assign(f, { x: 200, z: 0, alt: 1, va: 640, state: 'air', cool: 99, dashed: true, dj: true });
  const path = [];
  stepUntil(game, f, () => { path.push({ alt: f.alt, va: f.va }); return f.state !== 'air'; }, 2);
  const top = Math.max(...path.map(p => p.alt));
  const held = path.filter(p => p.alt === top && p.va > 0).length;
  assert.ok(held <= 1, `held at the top for ${held} steps while still rising`);
});

test('a knocked-out body at rest moves back on screen when the window narrows (issue #45)', () => {
  const { game, e, window } = load();
  e.x = 940;
  e.W = e.joints();
  e.ko(300, -100);
  stepUntil(game, e, () => e.rag.age >= 6, 8);
  window.innerWidth = 640;
  window.listeners.resize();
  const xs = Object.values(e.rag.pts).map(o => o.x);
  const worldW = 640 / (720 / 540);
  assert.ok(Math.max(...xs) <= worldW - 4 + 1e-9, `body reaches x ${Math.max(...xs).toFixed(1)} of ${worldW}`);
  assert.ok(Math.min(...xs) >= 4 - 1e-9, `body reaches x ${Math.min(...xs).toFixed(1)}`);
});
