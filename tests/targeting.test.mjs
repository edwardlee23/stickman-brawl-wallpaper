// Runs main.js in a sandbox with a stubbed canvas and window, then checks how
// fighters pick a move and a target: the all-styles-off fallback, the wall-run
// range and the crowd penalty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(count = 2) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: `?count=${count}&mode=ffa` },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}
const WORLD_W = 1280 / (720 / 540);   // 960

test('with every style off, fighters use every martial-arts style and nothing else (README)', () => {
  const game = load();
  const [a] = game.fighters;
  Object.assign(a, { x: 300, alt: 0 });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const styles = new Set(), others = new Set();
  const martial = new Set(game.MOVES);
  for (let i = 0; i < 2000; i++) {
    const m = game.pickMove(a);
    if (martial.has(m)) styles.add(m.style); else others.add(m.id);
  }
  assert.deepEqual([...others], [], 'picked a super, magic or ninjutsu move');
  assert.deepEqual([...styles].sort(), [...new Set(game.MOVES.map(m => m.style))].sort());
});

test('a wall run is only picked near a wall', () => {
  const game = load();
  const [a] = game.fighters;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'super';
  const count = x => {
    Object.assign(a, { x, alt: 0 });
    let n = 0;
    for (let i = 0; i < 2000; i++) if (game.pickMove(a).id === 'wallrun') n++;
    return n;
  };
  assert.equal(count(WORLD_W / 2), 0, 'wall run picked mid-screen');
  assert.ok(count(60) > 0, 'wall run never picked next to the wall');
});

test('an opponent already attacked by three fighters is picked less often than a free one', () => {
  const game = load(6);
  const [me, A, B, ...crowd] = game.fighters;
  Object.assign(me, { x: 100, z: 50, state: 'idle', target: null });
  // A is a little closer, so without the crowd penalty it would win most of the time
  Object.assign(A, { x: 280, z: 50, state: 'idle', target: me });
  Object.assign(B, { x: 300, z: 50, state: 'idle', target: me });
  for (const o of crowd) Object.assign(o, { x: 900, z: 50, state: 'idle', target: A });
  let a = 0, b = 0;
  for (let i = 0; i < 500; i++) {
    const t = game.pickTarget(me);
    if (t === A) a++; else if (t === B) b++;
  }
  assert.ok(b > a, `picked the crowded opponent ${a} times and the free one ${b} times`);
});
