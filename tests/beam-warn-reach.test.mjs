// Runs main.js in a sandbox with a stubbed canvas and window, then checks that an energy
// beam warns only the opponents along its length (issue #343): one past the point where the
// beam ends (on the floor or a ledge) does not block, shield or vanish from it.
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
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  // 0.1 makes every warned enemy block (warn() blocks below 0.25)
  vm.runInContext('Math.random = () => 0.1;', context);
  return game;
}

// a hovers at x 300, 150 px up, and beams down at its target on the floor at x 450, so the
// beam ends on the floor short of x 600. An idle enemy stands on the floor at bx.
// Returns where the beam ended and whether that enemy blocked.
function beamAt(bx) {
  const game = load();
  const [a, t, b] = game.fighters;
  const held = { z: 50, vx: 0, vz: 0, va: 0, alt: 0, cool: 99, retarget: 99, hp: 1000 };
  Object.assign(a, held, { x: 300, alt: 150, facing: 1, state: 'idle', target: t });
  Object.assign(t, held, { x: 450, facing: -1, state: 'hit', st: 0, dur: 99, target: a });
  Object.assign(b, held, { x: bx, facing: -1, state: 'idle', target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(game.SUPER.find(m => m.id === 'beam'));
  let endX = null;
  for (let k = 0; k < 120 && a.md.ph === 'charge'; k++) {
    for (const f of game.fighters) f.W = f.joints();
    a.update(1 / 60);
  }
  assert.equal(a.md.ph, 'fire', 'the beam fired');
  const blocked = b.state === 'block';
  for (const f of game.fighters) f.W = f.joints();
  a.update(1 / 60);
  endX = a.md.E.x;
  return { endX, blocked };
}

test('an enemy past the end of an energy beam does not react to it (#343)', () => {
  const { endX, blocked } = beamAt(1100);
  assert.ok(endX < 700, 'the beam ends on the floor near its target, at x ' + endX.toFixed(0));
  assert.ok(!blocked, 'the enemy at x 1100 blocked a beam that ends at x ' + endX.toFixed(0));
});

test('an enemy along an energy beam, short of its end, still reacts to it (#343)', () => {
  const { endX, blocked } = beamAt(400);
  assert.ok(endX > 400, 'the beam ends past x 400, at x ' + endX.toFixed(0));
  assert.ok(blocked, 'the enemy at x 400 did not block a beam that ends at x ' + endX.toFixed(0));
});
