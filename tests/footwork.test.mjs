// Runs main.js in a sandbox with a stubbed canvas and window, then checks that
// a fighter does not hold on to a queued move it cannot reach (issue #35).
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
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  // The target stays in a long flinch, so it neither attacks nor moves on its own.
  Object.assign(e, { z: 50, alt: 0, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, target: a });
  Object.assign(a, { z: 50, alt: 0, state: 'idle', cool: 0, target: e, retarget: 99 });
  return { game, a, e };
}
const move = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const inRange = (m, d) => d >= m.range[0] && d <= m.range[1];

test('a fighter backed against a wall drops a queued move that needs more room', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 14, facing: 1, nextMove: move(game, 'fireball') });
  e.x = 64;
  a.W = a.joints(); e.W = e.joints();
  game.update(1 / 60);
  // Either it already started a move, or the move it now has queued reaches 50 px
  if (a.state !== 'attack') {
    assert.ok(a.nextMove, 'a move is queued');
    assert.ok(inRange(a.nextMove, Math.abs(e.x - a.x)), `${a.nextMove.id} reaches the target`);
  }
});

test('a queued move kept out of reach by a retreating target is replaced', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 300, facing: 1, nextMove: move(game, 'osotogari') });
  e.x = 370;
  a.W = a.joints(); e.W = e.joints();
  // The target backs away at the same pace, 70 px ahead, out of the throw's reach
  const step = 1 / 60;
  let streak = 0, longest = 0;
  for (let t = 0; t < 6; t += step) {
    e.x = Math.min(a.x + 70, 940); e.z = a.z;
    game.update(step);
    // Waiting for a knocked-down target to get up does not count
    const stuck = a.state === 'idle' && e.hittable && a.nextMove && !inRange(a.nextMove, Math.abs(e.x - a.x));
    streak = stuck ? streak + step : 0;
    longest = Math.max(longest, streak);
  }
  assert.ok(longest < 2.2, `stood out of reach for ${longest.toFixed(2)} s`);
});
