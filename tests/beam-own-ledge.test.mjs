// Runs main.js in a sandbox with floating platforms on and checks that the energy beam is not
// picked from a ledge when its line to the target would end on that same ledge (issue #387).
// A beam coming down stops at the first ledge top it meets, the shooter's own included (#217),
// so from the middle ledge at a target on the floor past the ledge's end it often ended a few
// steps in front of the shooter and could not hit. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

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
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  return window.__stickmanBrawl;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const middle = game => game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge is the highest

// a stands on the middle ledge at x, at depth 40, facing e, which flinches on the floor tx
// past the ledge's end on side (1 right, -1 left). Returns how often pickMove chose the beam in
// 400 picks, and, when the beam is fired, whether it ended on a's own ledge all through its firing (after its
// first 0.1 s, while the hands still swing up from the charge) and whether it hit e.
function shot(x, tx, side) {
  const game = load(1);
  const p = middle(game), z = 40, [a, e] = game.fighters;
  Object.assign(a, { x, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, facing: side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: side > 0 ? p.x1 + tx : p.x0 - tx, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  let picks = 0;
  for (let i = 0; i < 400; i++) if (game.pickMove(a, e).id === 'beam') picks++;
  a.startMove(byId(game, 'beam'));
  let fired = 0, own = true;
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    const md = a.md;
    if (!md || md.ph !== 'fire' || !md.E || a.st - md.t0 < 0.1) continue;
    fired++;
    if (!(Math.abs(md.E.y - p.y) < 0.5 && md.E.x >= p.x0 && md.E.x <= p.x1)) own = false;
  }
  own = own && fired > 0;
  return { picks, own, hit: e.hp < 1000 };
}

test('the beam is not picked from a ledge when its line would end on that ledge (#387)', () => {
  const p = middle(load(1));
  const bad = [];
  let ownCases = 0;
  for (const side of [1, -1]) for (let x = p.x0 + 10; x <= p.x1 - 10; x += 20) {
    for (let tx = 40; tx <= 684; tx += 40) {
      const r = shot(x, tx, side);
      if (r.own) ownCases++;
      if (r.own && r.picks) bad.push(`side ${side} x ${x.toFixed(0)} target ${tx} out: ${r.picks} beam picks`);
    }
  }
  assert.ok(ownCases > 0, 'no beam ended on its own ledge');
  assert.deepEqual(bad, []);
});

test('from the ledge the beam is still picked at every floor target it hits (#387)', () => {
  const p = middle(load(1));
  const dropped = [];
  let hits = 0;
  for (const side of [1, -1]) for (let x = p.x0 + 10; x <= p.x1 - 10; x += 20) {
    for (let tx = 40; tx <= 684; tx += 40) {
      const r = shot(x, tx, side);
      if (!r.hit) continue;
      hits++;
      if (!r.picks) dropped.push(`side ${side} x ${x.toFixed(0)} target ${tx} out`);
    }
  }
  assert.ok(hits >= 10, `only ${hits} beams hit`);
  assert.deepEqual(dropped, [], 'beams that hit but are no longer picked');
});
