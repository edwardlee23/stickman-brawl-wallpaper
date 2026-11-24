// Runs main.js in a sandbox with a stubbed canvas and window, then checks
// fighter state after grabs and knockouts.
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
    addEventListener() {},
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
