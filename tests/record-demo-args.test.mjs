// The demo recorder's --seed must name the fight it records, --seed and --scan do not mix,
// and the scan counts move styles from the fighters main.js really has (issue #224).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { exposeFighters, fixedClock, countMoveStyles, parseArgs } from '../scripts/record-demo.mjs';

test('--seed takes 0 to 4294967295, the seeds Math.random can be given', () => {
  assert.equal(parseArgs(['--seed', '0']).seed, 0);
  assert.equal(parseArgs(['--seed', '4294967295']).seed, 4294967295);
  assert.throws(() => parseArgs(['--seed', '4294967296']), /--seed/);
  assert.throws(() => parseArgs(['--seed', '4294967306']), /--seed/);
});

test('--scan takes only seeds from 0 to 4294967295, as --seed does (#357)', () => {
  assert.deepEqual(parseArgs(['--scan', '4294967294-4294967295']).scan, { from: 4294967294, to: 4294967295 });
  assert.deepEqual(parseArgs(['--scan', '0-4294967295']).scan, { from: 0, to: 4294967295 });
  assert.deepEqual(parseArgs(['--scan', '0']).scan, { from: 0, to: 0 });
  for (const v of ['4294967296', '4294967295-4294967297', '1-99999999999']) {
    assert.throws(() => parseArgs(['--scan', v]), /--scan takes a seed or a range such as 1-12, from 0 to 4294967295/, v);
  }
});

test('--seed together with --scan is an error', () => {
  assert.throws(() => parseArgs(['--seed', '5', '--scan', '1-2']), /--seed and --scan/);
  assert.throws(() => parseArgs(['--scan', '1-2', '--seed', '5']), /--seed and --scan/);
});

// Runs the patched main.js the way the recorder's page does: the seeded clock first, then
// main.js, with a stubbed canvas. window is the global, as in a browser.
function page(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const context = vm.createContext({
    console, URLSearchParams,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {},
    performance: { now: () => 0 },
    location: { search: '?count=6&mode=ffa&sound=0' },
    document: { getElementById: () => canvas, querySelector: () => canvas, body: { style: {} } },
  });
  context.window = context;
  vm.runInContext(fixedClock(seed), context);
  const src = exposeFighters(readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8'));
  vm.runInContext(src, context, { filename: 'wallpaper/main.js' });
  return context;
}

test('a scan counts the move styles the fighters start', () => {
  const win = page(1);
  const game = win.__stickmanBrawl;
  const styles = new Set([...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].map(m => m.style));
  const counts = countMoveStyles(win.__advance, win.__fighters, 20 * 14, 20);
  const seen = Object.keys(counts);
  assert.ok(seen.length >= 3, 'a 14 s six-fighter fight showed only ' + JSON.stringify(counts));
  for (const s of seen) assert.ok(styles.has(s), 'counted a style no move has: ' + s);
  for (const n of Object.values(counts)) assert.ok(Number.isInteger(n) && n > 0);
});
