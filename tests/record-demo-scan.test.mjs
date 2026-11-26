// Pins the demo recorder's --scan counting and its seeded clock (issue #395): a scan counts
// move starts, not frames, and only attacks; each seed gives its own mulberry32 sequence, so
// the seed named in a commit message records that fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixedClock, countMoveStyles } from '../scripts/record-demo.mjs';

test('a scan counts each move start once, and only attacks (#395)', () => {
  const kick = { style: 'taekwondo' }, bolt = { style: 'magic' }, jab = { style: 'boxing' };
  // Frame by frame: fighter 0 holds one kick for four frames; fighter 1 has a jab
  // queued while idle, then casts one bolt over two frames
  const script = [
    [null, null], [null, null], [['attack', kick], ['idle', jab]], [['attack', kick], ['idle', jab]],
    [['attack', kick], ['idle', jab]], [['attack', kick], null], [null, null],
    [null, ['attack', bolt]], [null, ['attack', bolt]], [null, null],
  ];
  let i = -1;
  const advance = ms => { assert.equal(ms, 50); i++; };
  const fighters = () => script[i].map(s => (s ? { state: s[0], move: s[1] } : { state: 'idle', move: null }));
  const counts = countMoveStyles(advance, fighters, script.length, 20);
  assert.equal(i, 9, 'advanced once per frame');
  assert.deepEqual(counts, { taekwondo: 1, magic: 1 });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 2);
});

// The reference generator: mulberry32, as the recorder's header comment names it
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Runs the recorder's clock script in a fresh page-like context and returns its Math.random
function seeded(seed) {
  const context = vm.createContext({ performance: {} });
  context.window = context;
  vm.runInContext(fixedClock(seed), context);
  return vm.runInContext('Math.random', context);
}

test('the seeded clock gives the mulberry32 sequence for its seed (#395)', () => {
  for (const seed of [0, 1, 28, 29, 4294967295]) {
    const got = seeded(seed), want = mulberry32(seed);
    for (let k = 0; k < 8; k++) assert.equal(got(), want(), 'seed ' + seed + ', value ' + k);
  }
  assert.notEqual(seeded(28)(), seeded(29)(), 'seeds 28 and 29 give the same fight');
});

test('the seeded clock only moves when the recorder advances it (#395)', () => {
  const context = vm.createContext({ performance: {} });
  context.window = context;
  vm.runInContext(fixedClock(1), context);
  const seen = [];
  context.requestAnimationFrame(t => seen.push(t));
  assert.equal(context.performance.now(), 1000);
  context.__advance(50);
  assert.deepEqual(seen, [1050]);
  assert.equal(context.performance.now(), 1050);
});
