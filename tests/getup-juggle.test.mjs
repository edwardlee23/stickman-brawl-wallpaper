// Getting up resets the juggle count at once (issue #433). updIdle() resets it too, but only
// on the fighter's next step: a fighter updated later in the same step can launch it before
// then, and that launch must count as the first of a new juggle, not the fourth of the old one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  context.__seed = 433;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

test('a fighter launched in the step it gets up can still be juggled (#433)', () => {
  const game = load();
  const [a, e] = game.fighters;
  a.target = e; e.target = a;
  // Three launches into the old juggle, at the last step of its kip-up
  Object.assign(e, { x: 400, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'getup', st: 0.44, fallSign: 1,
    hp: 1000, cool: 99, hover: false, juggle: 3 });
  e.W = e.joints();
  e.update(DT);
  assert.equal(e.state, 'idle', 'the kip-up did not end');
  // A hit from a fighter updated later in this step launches it before its next updIdle()
  e.launch(100, 300);
  assert.equal(e.juggle, 1, 'the launch counted as juggle ' + e.juggle);
  assert.equal(e.hittable, true, 'the first launch after getting up cannot be followed up');
});
