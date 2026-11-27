// Runs main.js in a sandbox with a stubbed canvas and window, then pins the ragdoll, physics
// and fight-state rules that could break with every other test green (issue #270): bone
// lengths, the end of a moving body's simulation, floor friction, the wall bounce, a body
// rising through a ledge, the state sets for substitution, overlap and hits, the hit sweep,
// ground contact through the knees, the depth and specials weights, and the window narrowing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper with a seeded Math.random (an LCG). Every fighter waits flinching on the
// floor at the far right, so only the fighters a test moves do anything.
function load(search = '?count=4&mode=ffa', props = {}) {
  const listeners = {};
  const { game, window } = loadMain({ search, window: { addEventListener: (t, f) => (listeners[t] ||= []).push(f) }, properties: props });
  window.resize = (w, h) => { window.innerWidth = w; window.innerHeight = h; for (const f of listeners.resize) f(); };
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999, retarget: 999 });
    f.W = f.joints();
  }
  return { game, window };
}
const run = (game, secs, each = () => {}) => {
  for (let t = 0; t < secs; t += 1 / 60) { game.update(1 / 60); each(); }
};
// Knocks f out where it stands; with free set, its bones are dropped so every point moves alone
function knockOut(f, x, free = false) {
  Object.assign(f, { x, z: 60, alt: 0, state: 'hit', st: 0, dur: 999 });
  f.W = f.joints();
  f.ko(0, 0);
  if (free) f.rag.bones = [];
  return f.rag;
}
const pts = r => Object.values(r.pts);

// ---------- Ragdoll ----------

test('a knocked-out body keeps its bone lengths as it flies and lands (#270)', () => {
  const { game } = load();
  const f = game.fighters[0];
  Object.assign(f, { x: 400 }); f.W = f.joints();
  f.ko(-200, -300);
  let worst = 0;
  run(game, 3, () => {
    for (const [a, b, len] of f.rag.bones) {
      const A = f.rag.pts[a], B = f.rag.pts[b];
      worst = Math.max(worst, Math.abs(Math.hypot(A.x - B.x, A.y - B.y) - len) / len);
    }
  });
  assert.ok(worst < 0.1, 'a bone stretched by ' + (worst * 100).toFixed(1) + '%');
});

test('a body still falling after 5 s goes on simulating until it lands (#270)', () => {
  const { game } = load();
  const f = game.fighters[0];
  const r = knockOut(f, 400);
  run(game, 1);
  // Lifted 300 above the floor just before the 5 s a body at rest simulates for
  for (const o of pts(r)) { o.y -= 300; o.py -= 300; }
  r.age = 4.95;
  run(game, 4);
  const gap = game.groundY(f.z) - 1.5 - Math.max(...pts(r).map(o => o.y));
  assert.ok(gap < 3, 'the body hangs ' + gap.toFixed(0) + ' above the floor');
});

test('a body sliding on the floor is slowed by friction (#270)', () => {
  const { game } = load();
  const f = game.fighters[0];
  const r = knockOut(f, 300, true);
  const fl = game.groundY(f.z) - 1.5;
  // A foot on the floor, sliding right at 2 units a step (240 a second)
  const o = r.pts.fF;
  Object.assign(o, { x: 300, px: 298, y: fl, py: fl });
  run(game, 0.5);
  assert.ok(o.x - 300 < 10, 'slid ' + (o.x - 300).toFixed(1) + ' in 0.5 s');
  assert.ok(Math.abs(o.x - o.px) < 0.05, 'still sliding at ' + (o.x - o.px).toFixed(3) + ' a step');
});

test('a body hitting a wall bounces back at half its speed (#270)', () => {
  const { game } = load();
  const f = game.fighters[0];
  const r = knockOut(f, 40, true);
  // A hand high in the air, flying left into the wall at 3 units a step
  const o = r.pts.hF;
  Object.assign(o, { x: 5, px: 8, y: 100, py: 100 });
  game.update(1 / 60);
  // Two steps: the first meets the wall at 3 * 0.998 and bounces at half that, the second
  // only loses 0.2% to air drag
  const back = o.x - o.px, expected = 3 * 0.998 * 0.5 * 0.998;
  assert.ok(back > 0, 'not bounced: moving ' + back.toFixed(3) + ' a step');
  assert.ok(Math.abs(back - expected) < 0.05, 'bounced at ' + back.toFixed(3) + ' a step, expected ' + expected.toFixed(3));
});

test('a body rising through a ledge from below is not pushed out past its end (#270)', () => {
  const { game } = load('?count=4&mode=ffa', { platforms: { value: true } });
  const p = game.platforms[0];
  const f = game.fighters[0];
  const mid = (p.x0 + p.x1) / 2;
  Object.assign(f, { x: mid, z: 60, alt: 0, state: 'hit', st: 0, dur: 999 }); f.W = f.joints();
  f.ko(0, -900);
  let jump = 0, through = false;
  const before = new Map(pts(f.rag).map(o => [o, o.x]));
  run(game, 1, () => {
    for (const o of pts(f.rag)) {
      jump = Math.max(jump, Math.abs(o.x - before.get(o))); before.set(o, o.x);
      if (o.x > p.x0 && o.x < p.x1 && o.y < p.y - 2) through = true;
    }
  });
  assert.ok(through, 'the body never rose above the ledge');
  assert.ok(jump < 15, 'a point jumped ' + jump.toFixed(0) + ' sideways in one frame');
});

// ---------- State sets ----------

test('a substitution readied against an attacker takes its hit in the air too (#270)', () => {
  for (const state of ['idle', 'air']) {
    const { game } = load();
    const [a, e] = game.fighters;
    Object.assign(e, { x: 400, z: 60, state, alt: state === 'air' ? 80 : 0, st: 0, dur: 999, subFrom: a, subT: 5 });
    Object.assign(a, { x: 360, z: 60, state: 'idle', facing: 1 });
    a.W = a.joints(); e.W = e.joints();
    const res = e.takeHit(a, game.MOVES[0], 'body', { x: 400, y: 300 });
    assert.equal(res, 'sub', 'a fighter in state ' + state + ' did not substitute');
  }
});

test('two fighters blocking at one spot are pushed apart (#270)', () => {
  const { game } = load();
  const [a, b] = game.fighters;
  Object.assign(a, { x: 400, z: 60, state: 'block', st: 0, dur: 99, facing: 1 });
  Object.assign(b, { x: 402, z: 60, state: 'block', st: 0, dur: 99, facing: -1 });
  game.update(1 / 60);
  assert.ok(b.x - a.x > 4, 'still overlapping ' + (b.x - a.x).toFixed(1) + ' apart');
});

test('fighters 10 apart on one line are pushed apart (#270)', () => {
  const { game } = load();
  const [a, b] = game.fighters;
  Object.assign(a, { x: 400, z: 60, facing: 1 });
  Object.assign(b, { x: 410, z: 60, facing: -1 });
  game.update(1 / 60);
  assert.ok(b.x - a.x > 12, 'not pushed apart: ' + (b.x - a.x).toFixed(1) + ' apart');
});

test('a splatted fighter can be hit until its juggle limit (#270)', () => {
  const { game } = load();
  const e = game.fighters[1];
  Object.assign(e, { state: 'splat', juggle: 0, invis: false });
  assert.equal(e.hittable, true);
  e.juggle = 4;
  assert.equal(e.hittable, false);
});

test('a strike sweeping across a head between its end points hits it (#270)', () => {
  const { game } = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 360, z: 60, state: 'idle', facing: 1 });
  Object.assign(e, { x: 400, z: 60, state: 'idle', facing: -1 });
  a.W = a.joints(); e.W = e.joints();
  const h = e.W.head;
  // Both ends are 30 from the head, out of its reach; the sweep's middle passes through it
  const hit = a.sweepHit({ x: h.x - 30, y: h.y - 4 }, { x: h.x + 30, y: h.y - 4 });
  assert.ok(hit, 'the sweep missed');
  assert.equal(hit[0], e);
  assert.equal(hit[1], 'head');
});

test('a crouching fighter rests on its lowest knee, not through the floor (#270)', () => {
  const { game } = load();
  const f = game.fighters[0];
  // Halfway through a kip-up the pose is CROUCH, its back knee lower than both feet
  Object.assign(f, { x: 400, z: 60, alt: 0, state: 'getup', st: 0.225 - 1 / 60, fallSign: -1 });
  f.update(1 / 60);
  f.rot = 0; f.state = 'idle';
  const W = f.joints(), floor = game.groundY(f.z);
  assert.ok(Math.max(W.kB.y, W.kF.y) > Math.max(W.fB.y, W.fF.y) + 1, 'no knee is lower than the feet here');
  const low = Math.max(...Object.values(W).map(j => j.y));
  assert.ok(Math.abs(low - floor) < 0.01, 'the lowest joint is ' + (low - floor).toFixed(2) + ' below the floor');
});

// ---------- Targeting ----------

test('an enemy at another depth counts as farther when picking a target (#270)', () => {
  const { game } = load('?count=3&mode=ffa');
  const [a, b, c] = game.fighters;
  for (const f of game.fighters) { f.target = null; f.state = 'idle'; }
  // b is 100 away but 40 deep (score 100 + 80); c is 150 away on a's own line
  Object.assign(a, { x: 400, z: 40 }); Object.assign(b, { x: 500, z: 80 }); Object.assign(c, { x: 550, z: 40 });
  let nb = 0;
  for (let i = 0; i < 200; i++) if (game.pickTarget(a) === b) nb++;
  assert.ok(nb < 30, 'picked the deeper, nearer enemy ' + nb + ' of 200 times');
});

test('specials are weighted 1.6 times their move weight against martial-arts moves (#270)', () => {
  const { game } = load('?count=2&mode=ffa');
  const [a, b] = game.fighters;
  for (const f of game.fighters) f.state = 'idle';
  Object.assign(a, { x: 400, z: 60, alt: 0 }); Object.assign(b, { x: 450, z: 60, alt: 0 });
  const spec = new Set([...game.SUPER, ...game.MAGIC, ...game.NINJA]);
  const N = 4000;
  let n = 0;
  for (let i = 0; i < N; i++) if (spec.has(game.pickMove(a, b))) n++;
  // Specials take about 55% of the picks here with their weight times 1.6, and about 45% without it
  assert.ok(n / N > 0.5, 'specials picked ' + (n / N * 100).toFixed(1) + '% of the time');
});

// ---------- Window ----------

test('fighters past the edge of a narrowed window are brought back inside it (#270)', () => {
  const { game, window } = load();
  const f = game.fighters[0];
  Object.assign(f, { x: 900, z: 60, state: 'idle' });
  window.resize(960, 720);
  // At 960 x 720 the world is 960 / (720 / 540) = 720 wide
  assert.ok(f.x <= 720 - 14 + 1e-9, 'a fighter stays at x ' + f.x.toFixed(1));
});
