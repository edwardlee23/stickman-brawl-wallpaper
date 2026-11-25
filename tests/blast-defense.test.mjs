// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the
// defenses picked against an energy blast last through its whole volley of shots
// (issue #214): a shield stops every shot, and a smoke escape stays hidden until
// the last shot could have arrived.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// r fixes Math.random, which picks the target's reaction in warn(): 0.4 raises a
// shield (magic), 0.5 vanishes in smoke (ninjutsu).
function blastAt(r) {
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
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  const [a, e] = game.fighters;
  // Attacker on the left facing right, target 200 to its right facing it.
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', target: e });
  Object.assign(e, { x: 500, z: 50, alt: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  vm.runInContext(`Math.random = () => ${r};`, context);
  a.startMove(game.SUPER.find(m => m.id === 'blast'));
  const reactions = new Set();
  let fired = 0;
  for (let t = 0; t < 2; t += 1 / 60) {
    game.update(1 / 60);
    if (e.move) reactions.add(e.move.type);
    fired = Math.max(fired, a.md && a.move && a.move.type === 'blast' ? a.md.fired : fired);
    a.cool = 99;   // No second attack after the blast
  }
  return { game, e, reactions, fired };
}

test('a shield raised against an energy blast stops every shot of it', () => {
  const { game, e, reactions, fired } = blastAt(0.4);
  assert.ok(reactions.has('shield'), 'the target did not raise a shield');
  assert.equal(fired, 6);
  assert.equal(game.stats.hits.blast || 0, 0, 'blast shots hit through the shield');
  assert.equal(e.hp, 1000);
});

test('a smoke escape from an energy blast stays hidden until the last shot has passed', () => {
  const { game, e, reactions, fired } = blastAt(0.5);
  assert.ok(reactions.has('smoke'), 'the target did not vanish in smoke');
  assert.equal(fired, 6);
  assert.equal(game.stats.hits.blast || 0, 0, 'blast shots hit the fighter after it reappeared');
  assert.equal(e.hp, 1000);
});
