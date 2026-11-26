// Runs main.js in a sandbox with a stubbed canvas and window, then checks that warn()
// lets an enemy react to an attack anywhere in depth that the attack can hit it (issue #263):
// a beam hits up to 22 depth units away, strikes and shots up to 16.
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
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  // 0.1 makes every warned enemy block (warn() blocks below 0.25)
  vm.runInContext('Math.random = () => 0.1;', context);
  return game;
}

// Has the attacker warn of move id, as the move does when it strikes or fires, an idle
// enemy dx to its right and dz deeper, and says whether the enemy blocked.
function blocks(id, dx, dz) {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', target: e });
  Object.assign(e, { x: 300 + dx, z: 50 + dz, alt: 0, facing: -1, state: 'idle', target: a });
  const m = [...game.MOVES, ...game.SUPER].find(m => m.id === id);
  if (m.type) { a.state = 'attack'; a.move = m; a.warn(9999, false); }
  else a.startMove(m);   // A strike warns as it starts
  return e.state === 'block';
}

test('an enemy 15 or 20 depth units from an energy beam it would be hit by reacts to it', () => {
  assert.ok(blocks('beam', 250, 10), 'no reaction at dz 10');
  assert.ok(blocks('beam', 250, 15), 'no reaction at dz 15');
  assert.ok(blocks('beam', 250, 20), 'no reaction at dz 20');
});

test('an enemy deeper than an energy beam reaches does not react to it', () => {
  assert.ok(!blocks('beam', 250, 26), 'reacted at dz 26');
});

test('an enemy 15 depth units from a strike or an energy blast reacts to it', () => {
  assert.ok(blocks('jab', 30, 15), 'no reaction to a jab at dz 15');
  assert.ok(blocks('blast', 250, 15), 'no reaction to a blast at dz 15');
  assert.ok(!blocks('jab', 30, 20), 'reacted to a jab at dz 20');
});
