// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the attack a
// teleport or a substitution follows up with is not started at a target knocked down while the
// fighter was unseen (#419): as everywhere else (#338), no move starts at a target that cannot
// be hit, and the fighter picks a move again instead. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;
const FOLLOW = ['hook', 'roundhouse', 'backkick', 'uppercut', 'elbow', 'rising', 'barrage', 'clones'];

function load(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = seed >>> 0;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 450, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, e };
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const knockDown = e => Object.assign(e, { state: 'down', st: 0, downDur: 99 });

// Steps a alone for 0.6 s; returns the follow-up moves it started and the strikes that whiffed
function watch(game, a) {
  const started = new Set(), whiff0 = game.stats.whiff;
  for (let t = 0; t < 0.6; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (a.move && FOLLOW.includes(a.move.id)) started.add(a.move.id);
  }
  return { started: [...started], whiffs: game.stats.whiff - whiff0 };
}

for (const down of [true, false]) {
  test('a teleport ' + (down ? 'starts no follow-up at a target knocked down while it was gone' : 'still follows up at a target it can hit'), () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { game, a, e } = load(seed);
      a.startMove(byId(game, 'teleport'));
      for (let t = 0; t < 1 && !(a.md && a.md.ph === 'gone'); t += DT) a.update(DT);
      assert.equal(a.md && a.md.ph, 'gone', 'the teleport vanished');
      if (down) knockDown(e);
      const r = watch(game, a);
      if (down) {
        assert.deepEqual(r.started, [], `seed ${seed}: started ${r.started} at a down target`);
        assert.equal(r.whiffs, 0, `seed ${seed}: strikes whiffed`);
      } else {
        assert.equal(r.started.length, 1, `seed ${seed}: no follow-up`);
      }
    }
  });

  test('a substitution ' + (down ? 'starts no follow-up at an attacker knocked down meanwhile' : 'still follows up at an attacker it can hit'), () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { game, a, e } = load(seed);
      a.substitute(e);
      assert.equal(a.move && a.move.id, 'substitute', 'the substitution began');
      if (down) knockDown(e);
      const r = watch(game, a);
      if (down) {
        assert.deepEqual(r.started, [], `seed ${seed}: started ${r.started} at a down target`);
        assert.equal(r.whiffs, 0, `seed ${seed}: strikes whiffed`);
      } else {
        assert.equal(r.started.length, 1, `seed ${seed}: no follow-up`);
      }
    }
  });
}
