// Runs main.js in a sandbox with a stubbed canvas and window, then checks that shadow
// clones leave a puff of smoke each whenever they disappear (issue #259): also when
// their caster is hit, or their target is knocked out by someone else, mid-technique.
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
    location: { search: '?count=3&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run is the same
  vm.runInContext('{ let s = 259; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

// Starts shadow clones from a at x ax (300 by default) at e at x 500, with a third fighter c far off,
// steps to the given phase, then runs interrupt(game, a, e, c) and one more step.
// Returns the clones before and after that step and the puffs it added.
function interrupted(phase, interrupt, ax = 300) {
  const game = load();
  const [a, e, c] = game.fighters;
  Object.assign(a, { x: ax, z: 50, alt: 0, facing: 1, state: 'idle', cool: 99, target: e });
  Object.assign(e, { x: 500, z: 50, alt: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, target: c });
  Object.assign(c, { x: 1100, z: 50, alt: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, target: e });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.NINJA.find(m => m.id === 'clones'));
  for (let i = 0; i < 90 && !(a.md && a.md.ph === phase && a.md.clones); i++) {
    for (const f of game.fighters) f.W = f.joints();
    a.update(1 / 60);
  }
  assert.equal(a.md && a.md.ph, phase, 'the clones reached the ' + phase + ' phase');
  const before = a.md.clones.length, n0 = game.fx.length;
  interrupt(game, a, e, c);
  for (const f of game.fighters) f.W = f.joints();
  a.update(1 / 60);
  const after = a.md && a.md.clones ? a.md.clones.length : 0;
  return { before, after, puffs: game.fx.slice(n0).filter(o => o.type === 'puff').length };
}
const jab = game => game.MOVES.find(m => m.id === 'jab');

for (const phase of ['split', 'rush']) {
  test('shadow clones vanish in smoke when their caster is hit in the ' + phase + ' phase (#259)', () => {
    const r = interrupted(phase, (game, a, e, c) => a.takeHit(c, jab(game), 'head', a.bodyPoint()));
    assert.equal(r.before, 2);
    assert.equal(r.after, 0, 'the clones outlived the hit');
    assert.equal(r.puffs, 2, 'puffs as the clones vanished');
  });

  test('shadow clones vanish in smoke when another fighter knocks their target out in the ' + phase + ' phase (#259)', () => {
    const r = interrupted(phase, (game, a, e, c) => e.takeHit(c, jab(game), 'head', e.bodyPoint(), { dmg: 9999 }));
    assert.equal(r.before, 2);
    assert.equal(r.after, 0, 'the clones outlived their target');
    assert.equal(r.puffs, 2, 'puffs as the clones vanished');
  });
}

test('shadow clones already vanishing do not puff again when their caster is hit (#259)', () => {
  // The target is close, so the strike lands and the clones puff as they vanish
  const r = interrupted('vanish', (game, a, e, c) => a.takeHit(c, jab(game), 'head', a.bodyPoint()), 440);
  assert.equal(r.before, 2);
  assert.equal(r.after, 0);
  assert.equal(r.puffs, 0, 'puffs after the clones had vanished');
});
