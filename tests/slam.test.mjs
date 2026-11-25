// Runs main.js in a sandbox with a stubbed canvas and window, then checks that
// a slam's shockwave is blocked by the side each target stands on, not by the
// way the slammer faces (issue #57).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

// The slammer stands at x 400 facing right; a blocking target stands at ex facing ef.
// Lands the slam and returns the game and the target.
function slam(ex, ef) {
  const game = load();
  // No smoke escape or substitution, so the shockwave always reaches the target
  game.cfg.styles.ninjutsu = false;
  const [a, e] = game.fighters;
  Object.assign(a, { x: 400, z: 20, alt: 0, facing: 1, cool: 99 });
  Object.assign(e, { x: ex, z: 20, alt: 0, facing: ef, state: 'block', st: 0, dur: 5, hp: 100, cool: 99 });
  a.target = e; e.target = a;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.type === 'slam')); a.vx = 0;
  let push = 0;   // The target's speed on the step the shockwave lands
  for (let i = 0; a.state === 'attack' && i < 200; i++) {
    const hp = e.hp;
    game.update(1 / 60);
    if (a.md?.ph === 'up') a.vx = 0;
    if (!push && e.hp < hp) push = e.vx;
  }
  return { game, e, push };
}

test('a fighter in front of the slammer, facing it, blocks the shockwave', () => {
  const { game, push } = slam(450, -1);
  assert.equal(game.stats.blocked, 1);
  assert.ok(push > 0, 'pushed away from the impact');
});

test('a fighter behind the slammer, facing it, blocks the shockwave and is pushed away', () => {
  const { game, e, push } = slam(350, 1);
  assert.equal(game.stats.blocked, 1);
  assert.notEqual(e.state, 'launched');
  assert.ok(push < 0, 'pushed away from the impact');
});

test('a fighter behind the slammer, facing away, does not block the shockwave', () => {
  const { game, e } = slam(350, -1);
  assert.equal(game.stats.blocked, 0);
  assert.ok(e.hp < 95, 'took the full hit');
});
