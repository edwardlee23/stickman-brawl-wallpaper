// Runs main.js in a sandbox and checks that a hit on a fighter tumbling through
// the air keeps its spin, so a juggle hit does not stand it upright for a
// frame (issue #347). Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

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
  vm.runInContext('Math.random = () => 0.5;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const W = 1280 / (720 / 540);
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i ? 40 : -40), z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    facing: i ? -1 : 1, state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  return { game, a: game.fighters[0], e: game.fighters[1] };
}

// Launches e and steps it alone until its spin has turned it well off upright
function tumbling() {
  const { game, a, e } = load();
  e.launch(300, 700);
  for (let i = 0; i < 120 && Math.abs(e.rot) < 1.3; i++) { e.update(DT); e.W = e.joints(); }
  assert.equal(e.state, 'launched');
  assert.ok(Math.abs(e.rot) >= 1.3, `spun to ${e.rot.toFixed(2)}`);
  return { game, a, e, jab: game.MOVES.find(m => m.id === 'jab') };
}

test('a juggle hit on a tumbling fighter keeps its rotation (#347)', () => {
  const { a, e, jab } = tumbling();
  const rot = e.rot, head = e.joints().head;
  e.takeHit(a, jab, 'body', e.bodyPoint());
  assert.equal(e.state, 'launched', 'the hit launches it again');
  assert.equal(e.rot, rot, `rotation ${rot.toFixed(2)} became ${e.rot.toFixed(2)}`);
  const now = e.joints().head, d = Math.hypot(now.x - head.x, now.y - head.y);
  assert.ok(d < 1, `the head jumped ${d.toFixed(1)}`);
});

test('after the juggle hit the head moves only a few units on the next frame (#347)', () => {
  const { a, e, jab } = tumbling();
  const head = e.joints().head;
  e.takeHit(a, jab, 'body', e.bodyPoint());
  e.update(DT);
  const now = e.joints().head, d = Math.hypot(now.x - head.x, now.y - head.y);
  assert.ok(d < 15, `the head moved ${d.toFixed(1)} in one frame`);
});

test("a hit during a wall run still resets the special's own rotation (#347)", () => {
  const { game, a, e } = load(), jab = game.MOVES.find(m => m.id === 'jab');
  // Stand-in for the wall run's sideways body: a special in progress with its rotation
  Object.assign(e, { state: 'attack', move: { id: 'wallrun', type: 'wallrun' }, md: { ph: 'run' }, rot: -Math.PI / 2 });
  e.takeHit(a, jab, 'body', e.bodyPoint());
  assert.equal(e.rot, 0);
});
