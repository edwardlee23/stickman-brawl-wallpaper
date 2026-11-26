// Runs main.js in a sandbox with a stubbed canvas and window, and pins fight rules that could
// change with every other test still green (issue #393): who blocks a frozen fighter, blocking
// with a substitution readied, smoke puffs, the uppercut's reach downward, lying times, the
// splat and getup, depth footwork, ledge chasing, strike depth, the beam, barrage, clones,
// blast, slam, dive and wall run, shot life, spell recovery, a KO through a block, the slam
// bounce, the item cap, head gear and a click during screen shake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
// A copy of main.js that also exposes, as window.__in, the internals these tests read or set
const END_ANCHOR = 'requestAnimationFrame(frame);\n})();';
assert.ok(source.includes(END_ANCHOR), 'anchor not found in main.js');
const exposed = source.replace(END_ANCHOR, 'requestAnimationFrame(frame);\nwindow.__in = { altFits, MOVE_BY,' +
  ' get view() { return view; }, set shake(v) { shake = v; } };\n})();');

// 1280 x 720 at figure size 100%: one world unit is 720 / 540 screen pixels
const S = 720 / 540;
const DT = 1 / 60;

// Loads the wallpaper with a seeded Math.random (an LCG), or context.__rnd when a test sets it.
// Every fighter flinches on the floor at the far right, out of the way, until a test moves it.
function load(props = {}, count = 2) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=' + count + '&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = 393; context.__rnd = null;
  vm.runInContext('Math.random = () => __rnd ?? (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(exposed, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
    f.W = f.joints();
  }
  const ledges = list => { game.platforms.length = 0; game.platforms.push(...list); };
  return { game, inn: window.__in, listeners, context, ledges, a: game.fighters[0], e: game.fighters[1] };
}

// Steps f alone until done(f) is true or s seconds pass; returns the time it took
function until(f, done, s = 5) {
  let t = 0;
  while (!done(f) && t < s) { f.update(DT); t += DT; }
  return t;
}
const special = (game, id) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
// a on the floor at x facing e, who flinches (so no warning makes it dodge) at ex
function face(x, ex, o = {}) {
  const l = load(o.props);
  const { a, e } = l;
  Object.assign(e, { x: ex, z: 60, alt: o.ealt ?? 0, state: o.estate ?? 'hit', st: 0, dur: 999, downDur: 999 });
  e.W = e.joints();
  Object.assign(a, { x, z: 60, alt: o.alt ?? 0, facing: Math.sign(ex - x), state: o.alt ? 'air' : 'idle', cool: 999, target: e, retarget: 999 });
  a.W = a.joints();
  return l;
}
// Records the options of every hit e takes, instead of taking it
function spy(e) {
  const got = [];
  e.takeHit = (_att, _m, _zone, _pt, o = {}) => { got.push(o); };
  return got;
}

// ---------- States ----------
test('a frozen fighter is solid: one standing in it is pushed out (#393)', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 500, z: 50, state: 'frozen', st: 0, dur: 999 });
  Object.assign(e, { x: 505, z: 50 });
  a.W = a.joints(); e.W = e.joints();
  game.update(DT);
  assert.ok(e.x - a.x > 5.5, 'gap ' + (e.x - a.x).toFixed(2));
});

// e blocks a, with a substitution readied against a
function blockWithSub() {
  const l = face(400, 430);
  const { a, e } = l;
  Object.assign(e, { state: 'block', st: 0, dur: 999, facing: -1, subFrom: a });
  l.game.fx.length = 0;
  return { ...l, r: e.takeHit(a, l.game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint(), {}) };
}

test('a readied substitution takes a hit while its fighter blocks (#393)', () => {
  assert.equal(blockWithSub().r, 'sub');
});

test('the smoke puffs of a substitution last 0.5 s (#393)', () => {
  const { game } = blockWithSub();
  const puffs = game.fx.filter(o => o.type === 'puff');
  assert.equal(puffs.length, 2);
  for (const p of puffs) assert.equal(p.dur, 0.5);
});

// ---------- Move choice ----------
test('the rising uppercut fits a target 20 below, not one 60 below (#393)', () => {
  const { game, inn } = load();
  const m = special(game, 'rising');
  assert.equal(inn.altFits({ alt: 60, z: 60 }, m, { alt: 40, x: 500, z: 60 }), true, '20 below');
  assert.equal(inn.altFits({ alt: 60, z: 60 }, m, { alt: 0, x: 500, z: 60 }), false, '60 below');
});

// ---------- Down and up ----------
test('a fighter knocked down lies 0.7 to 1.4 s (#393)', () => {
  const { a } = load();
  Object.assign(a, { x: 500, hp: 100 });
  a.knockDown(1, 0.3);
  until(a, f => f.state !== 'fall');
  assert.equal(a.state, 'down');
  assert.ok(a.downDur >= 0.7 && a.downDur <= 1.4, 'lies ' + a.downDur.toFixed(2) + ' s');
});

test('a thrown fighter lies 0.9 to 1.5 s (#393)', () => {
  const { game, a, e } = face(400, 422, { estate: 'idle' });
  a.move = game.MOVES.find(m => m.id === 'seoinage');
  a.applyGrab(e);
  until(e, f => f.state !== 'thrown');
  assert.equal(e.state, 'down');
  assert.ok(e.downDur >= 0.9 && e.downDur <= 1.5, 'lies ' + e.downDur.toFixed(2) + ' s');
});

test('a fighter splatted on a wall drops off it at 90 (#393)', () => {
  const { a } = load();
  Object.assign(a, { x: 16, alt: 120, state: 'splat', st: 0.41, splatSide: -1 });
  a.update(DT);
  assert.equal(a.state, 'launched');
  assert.ok(Math.abs(a.vx - 90) < 5, 'vx ' + a.vx.toFixed(1));
});

test('a fighter that gets up waits 0.2 to 0.6 s before it acts (#393)', () => {
  const { a } = load();
  Object.assign(a, { x: 500, state: 'getup', st: 0, cool: 0 });
  until(a, f => f.state !== 'getup');
  assert.equal(a.state, 'idle');
  assert.ok(a.cool >= 0.2 && a.cool <= 0.6, 'cool ' + a.cool.toFixed(2));
});

// ---------- Footwork ----------
test('a fighter closes a depth gap at up to 45 a second (#393)', () => {
  const { a, e } = face(400, 500);
  Object.assign(e, { z: 110 });
  e.W = e.joints();
  let vz = 0;
  for (let t = 0; t < 0.4; t += DT) { a.update(DT); vz = Math.max(vz, a.vz); }
  assert.ok(vz > 40 && vz <= 45, 'vz ' + vz.toFixed(1));
});

test('a fighter walks toward a target on a ledge at 130 (#393)', () => {
  const { a, e, ledges, game } = face(200, 700);
  ledges([{ x0: 600, x1: 800, y: game.groundY(60) - 120 }]);
  Object.assign(e, { alt: 120 });
  e.W = e.joints();
  a.vx = 0;
  assert.equal(a.chaseSurface(e, 0.2), false);
  assert.equal(a.vx, 130);
});

// ---------- Strikes and specials ----------
test('a strike hits within 16 of its depth, not 30 (#393)', () => {
  for (const [dz, hit] of [[10, true], [30, false]]) {
    const { a, e } = face(400, 430);
    e.z = 60 + dz;
    e.W = e.joints();
    const c = e.bodyPoint();
    assert.equal(!!a.sweepHit({ x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }), hit, 'depth gap ' + dz);
  }
});

test('a beam launches its target at 780 along it (#393)', () => {
  const { game, a, e } = face(400, 700);
  const got = spy(e);
  a.startMove(special(game, 'beam'));
  until(a, () => got.length > 0);
  assert.ok(got.length, 'the beam missed');
  assert.ok(got[0].launch.vx > 700, 'launched at vx ' + got[0].launch.vx.toFixed(0));
});

test('the barrage finisher launches at 720 forward and 260 up (#393)', () => {
  const { game, a, e } = face(400, 476);
  const got = spy(e);
  a.startMove(special(game, 'barrage'));
  until(a, f => f.state !== 'attack');
  const fin = got.find(o => o.launch);
  assert.ok(fin, 'the finisher missed');
  assert.deepEqual([fin.launch.vx, fin.launch.va], [720, 260]);
});

test('a shadow clone leaps over the target, 34 up (#393)', () => {
  const { game, a } = face(400, 500);
  a.startMove(special(game, 'clones'));
  let top = 0;
  until(a, f => { if (f.md && f.md.clones) top = Math.max(top, f.md.clones[1].alt); return f.state !== 'attack' || f.md.ph === 'strike'; });
  assert.ok(Math.abs(top - 34) < 1, 'clone at alt ' + top.toFixed(1));
});

test('the clones do not strike a target that got 200 away (#393)', () => {
  const { game, a, e } = face(400, 500);
  a.startMove(special(game, 'clones'));
  until(a, f => f.state !== 'attack' || f.md.ph === 'strike');
  assert.equal(a.md.ph, 'strike');
  e.x = a.x + 200;
  e.W = e.joints();
  const got = spy(e);
  a.update(DT);
  assert.equal(got.length, 0);
});

test('an energy blast fired in the air is fired hovering (#393)', () => {
  const { game, a } = face(400, 900, { alt: 150 });
  a.startMove(special(game, 'blast'));
  until(a, f => f.state !== 'attack' || f.st > 0.6);
  assert.ok(Math.abs(a.alt - 150) < 1, 'alt ' + a.alt.toFixed(1));
});

test('a slam keeps a fifth of its forward speed as it comes down (#393)', () => {
  const { game, a } = face(400, 900);
  a.startMove(special(game, 'slam'));
  let before = null;
  until(a, f => { if (f.md.ph === 'up') before = f.vx; return f.state !== 'attack' || f.md.ph === 'down'; });
  assert.equal(a.md.ph, 'down');
  assert.ok(before > 200, 'rose at vx ' + before);
  assert.ok(Math.abs(a.vx - before * 0.2) < 2, 'came down at vx ' + a.vx.toFixed(1) + ' after ' + before.toFixed(1));
});

test('a dive homes in on its target at 860, turning up to 2.5 rad a second (#393)', () => {
  const { game, a } = face(200, 900, { ealt: 0 });
  a.startMove(special(game, 'dive'));
  until(a, f => f.state !== 'attack' || f.md.ph === 'dive');
  assert.equal(a.md.ph, 'dive');
  const calls = [], homeTo = a.homeTo;
  a.homeTo = function (t, speed, turn, dt) { calls.push([speed, turn]); return homeTo.call(this, t, speed, turn, dt); };
  a.update(DT);
  assert.deepEqual(calls, [[860, 2.5]]);
});

test('a wall run sprints at 450 (#393)', () => {
  const { game, a } = face(400, 700);
  a.startMove(special(game, 'wallrun'));
  a.update(DT);
  assert.equal(a.md.ph, 'run');
  assert.equal(Math.abs(a.vx), 450);
});

// ---------- Spells ----------
test('a fireball flies for 3 s (#393)', () => {
  const { game, a } = face(400, 900);
  a.move = special(game, 'fireball');
  assert.equal(a.castShot({ x: a.x, y: 300 }, 'fire', 430, 0).life, 3);
});

// Seconds from the throw of the spell id to the end of the move
function recovery(id) {
  const { game, a } = face(400, 900);
  a.startMove(special(game, id));
  until(a, f => f.state !== 'attack' || f.md.ph === 'throw');
  assert.equal(a.md.ph, 'throw');
  return until(a, f => f.state !== 'attack');
}

test('a fireball caster recovers within 0.4 s of the throw (#393)', () => {
  const t = recovery('fireball');
  assert.ok(t < 0.4, 'recovered after ' + t.toFixed(2) + ' s');
});

test('an ice caster recovers within 0.35 s of the throw (#393)', () => {
  const t = recovery('ice');
  assert.ok(t < 0.35, 'recovered after ' + t.toFixed(2) + ' s');
});

// ---------- Knockouts and bounces ----------
test('a fighter knocked out through its block is thrown back, not dropped where it stood (#393)', () => {
  const { game, a, e } = face(400, 430);
  Object.assign(e, { state: 'block', st: 0, dur: 999, facing: -1, hp: 0.01 });
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint(), {});
  assert.equal(e.state, 'ko');
  const hip = e.rag.pts.hip;
  assert.ok(hip.x - hip.px > 1, 'the body flies back at ' + (hip.x - hip.px).toFixed(2) + ' a step');
  assert.ok(hip.y - hip.py < -1, 'and up at ' + (hip.y - hip.py).toFixed(2) + ' a step');
});

test('a launched fighter slamming into the floor bounces back at 42% (#393)', () => {
  const { a } = load();
  Object.assign(a, { x: 500, alt: 0.5, va: -1000, vx: 0, state: 'launched', st: 0, rot: 0, rotV: 0 });
  a.update(DT);
  assert.ok(Math.abs(a.va / 1000 - 0.42) < 0.03, 'bounced at va ' + a.va.toFixed(0));
});

// ---------- Items ----------
test('no third item drops while two are out (#393)', () => {
  const { game } = load({ items: { value: true } });
  for (const f of game.fighters) f.x = 100;
  game.spawnItem('staff', 400, 60);
  game.spawnItem('boomerang', 600, 60);
  game.updateItems(DT);
  game.updateItems(20);
  assert.equal(game.items.length, 2);
});

// ---------- Drawing ----------
test('a fighter keeps the same head gear every round (#393)', () => {
  const { game } = load({}, 4);
  const first = game.fighters.map(game.gearOf);
  for (let r = 1; r < 4; r++) {
    game.stats.rounds = r;
    assert.deepEqual(game.fighters.map(game.gearOf), first, 'round ' + r);
  }
});

test('a click during screen shake blasts where it lands on the shaken view (#393)', () => {
  const { game, inn, listeners, context } = load({ clickblast: { value: true }, reducemotion: { value: false } });
  // Math.random 0.99: the shake moves the view 0.98 times the shake in x and y
  context.__rnd = 0.99;
  inn.shake = 10;
  game.render();
  game.fx.length = 0;
  const wx = 300, wy = 200, off = 0.98 * 10;
  for (const fn of listeners.pointerdown) fn({ clientX: wx * S + off, clientY: wy * S + off, button: 0, timeStamp: 0 });
  const c = game.fx.find(o => o.type === 'crack');
  assert.ok(c, 'no crack');
  assert.ok(Math.abs(c.x - wx) < 0.01 && Math.abs(c.y - wy) < 0.01, 'blast at ' + c.x.toFixed(2) + ', ' + c.y.toFixed(2));
});
