// Runs main.js in a sandbox with a stubbed canvas and window, then pins Fighter rules for
// movement, defense and hits that could break with every other test green (issue #269):
// air dashes, double jumps and air moves, the end of a ground dash, the winner's slowdown,
// footwork, warning reach, the dodge, depth damping, damage, flinch and knockback, launches,
// landing, splats, thawing, aura, whiffs and walking off a ledge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

const DT = 1 / 60;
// Loads the wallpaper with a seeded Math.random. Setting rig.force to a number makes every
// Math.random() return it, so a test can pick which branch a random choice takes.
function load(props = {}) {
  const rig = { force: null };
  const seeded = lcg(269);
  const { game } = loadMain({ random: () => rig.force ?? seeded(), properties: props });
  for (const f of game.fighters) hold(f, { x: 900, z: 60 });
  const [a, e] = game.fighters;
  a.target = e; e.target = a;
  // The right edge of the world: a fighter is kept 14 px inside it
  hold(e, { x: 1e6 }); e.update(DT);
  const worldW = e.x + 14;
  hold(e, { x: 900, z: 60 });
  return { game, a, e, rig, worldW };
}
// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, ...o });
  f.W = f.joints();
}
const move = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
// In the air at alt, its target at dx and dz away on the floor
function inAir(a, e, { dx = 300, dz = 0, alt = 150, cool = 0, ...o } = {}) {
  hold(e, { x: 400 + dx, z: 60 + dz });
  hold(a, { x: 400, z: 60, alt, state: 'air', cool, facing: 1, target: e, dashed: false, dj: false, ...o });
}

// ---- Air ----
test('in the air, a fighter far from its target air dashes at 560, then keeps that speed until the dash ends', () => {
  const { a, e, rig } = load();
  inAir(a, e, { dx: 300 });
  rig.force = 0.1;
  a.update(DT);
  rig.force = 0.99;
  assert.equal(a.dashed, true, 'no air dash');
  assert.equal(a.vx, 560);
  assert.equal(a.trailOn, true);
  a.update(DT);
  assert.equal(a.vx, 560, 'steered during the dash');
  for (let i = 0; i < 20; i++) a.update(DT);
  assert.equal(a.trailOn, false, 'the dash never ended');
});

test('in the air, a fighter near its target double jumps at 560', () => {
  const { a, e, rig } = load();
  inAir(a, e, { dx: 50, alt: 10, va: 0 });
  rig.force = 0.35;
  a.update(DT);
  assert.equal(a.dj, true, 'no double jump');
  assert.ok(Math.abs(a.va - (560 - 1400 * DT)) < 1e-9, 'va ' + a.va);
});

test('in the air, a fighter drifts toward its target', () => {
  const { a, e, rig } = load();
  inAir(a, e, { dx: 300, cool: 5, vx: 0 });
  rig.force = 0.99;
  a.update(DT);
  assert.ok(Math.abs(a.vx - 200 * DT) < 1e-9, 'vx ' + a.vx);
});

test('in the air, a special starts only at about the target depth', () => {
  for (const [dz, starts] of [[0, true], [40, false]]) {
    const { a, e, rig } = load();
    inAir(a, e, { dx: 300, dz, dashed: true, dj: true });
    rig.force = 0.9;
    a.update(DT);
    assert.equal(a.state === 'attack', starts, 'depth gap ' + dz + ': state ' + a.state + (a.move ? ' ' + a.move.id : ''));
    if (starts) assert.ok(a.move.type && a.move.air, a.move.id + ' is not an air special');
  }
});

test('on the floor, a fighter jumps more often at an airborne target, and jumps 480 to 640 high', () => {
  for (const [alt, jumps] of [[0, false], [100, true]]) {
    const { game, a, e, rig } = load();
    hold(e, { x: 500, z: 60, alt });
    hold(a, { x: 400, z: 60, state: 'idle', facing: 1, target: e, retarget: 99, nextMove: move(game, 'jab') });
    rig.force = 0.01;
    a.update(DT);
    assert.equal(a.state === 'air', jumps, 'target at alt ' + alt + ': state ' + a.state);
  }
  // Both still under the 1.2 a second chance of a jump
  for (const r of [0, 0.015]) {
    const { game, a, e, rig } = load();
    hold(e, { x: 500, z: 60, alt: 100 });
    hold(a, { x: 400, z: 60, state: 'idle', facing: 1, target: e, retarget: 99, nextMove: move(game, 'jab') });
    rig.force = r;
    a.update(DT);
    assert.equal(a.state, 'air');
    const va = a.va + 1400 * DT;
    assert.ok(Math.abs(va - (480 + 160 * r)) < 1e-6, 'jumped at ' + va.toFixed(1));
  }
});

// ---- Ground ----
test('a ground dash ends after 0.22 s and slows down', () => {
  const { game, a, e, rig } = load();
  hold(e, { x: 900, z: 60 });
  hold(a, { x: 300, z: 60, state: 'idle', facing: 1, target: e, retarget: 99, nextMove: move(game, 'jab'),
    vx: 520, dash: 0.22, trailOn: true });
  rig.force = 0.99;
  for (let i = 0; i < 60; i++) a.update(DT);
  assert.equal(a.trailOn, false);
  assert.ok(a.dash <= 0);
  assert.ok(a.x < 700, 'slid to x ' + a.x.toFixed(0));
  assert.ok(Math.abs(a.vx) <= 110, 'vx ' + a.vx);
});

test('with no one left to fight, a fighter slows to a stop', () => {
  const { a, e, rig } = load();
  e.ko(0, 0);
  hold(a, { x: 300, z: 60, state: 'idle', facing: 1, target: null, retarget: 0, vx: 300, vz: 40 });
  rig.force = 0.99;
  for (let i = 0; i < 90; i++) a.update(DT);
  assert.equal(a.target, null);
  assert.equal(a.vx, 0);
  assert.equal(a.vz, 0);
  assert.ok(a.x - 300 < 200, 'slid ' + (a.x - 300).toFixed(0) + ' px');
});

test('in reach of its move, a fighter shuffles its feet', () => {
  const { game, a, e, rig } = load();
  const jab = move(game, 'jab'), d = (jab.range[0] + jab.range[1]) / 2;
  hold(e, { x: 400 + d, z: 60 });
  hold(a, { x: 400, z: 60, state: 'idle', facing: 1, target: e, retarget: 99, nextMove: jab });
  a.time = (Math.PI / 2 - a.id) / 2.3;   // The shuffle at its forward peak: sin(time * 2.3 + id) is 1
  rig.force = 0.99;
  for (let i = 0; i < 6; i++) a.update(DT);
  assert.ok(a.vx > 20 && a.vx <= 0.35 * 110 + 1e-9, 'vx ' + a.vx);
});

// ---- Defense ----
test('a warning reaches only enemies within its reach and depth', () => {
  for (const [dx, dz, reacts] of [[30, 0, true], [700, 0, false], [30, 30, false]]) {
    const { game, a, e, rig } = load();
    hold(a, { x: 400, z: 60, facing: 1 });
    hold(e, { x: 400 + dx, z: 60 + dz, state: 'idle', facing: -1 });
    a.move = move(game, 'jab');
    rig.force = 0.1;
    a.warn(50, false);
    assert.equal(e.state === 'block', reacts, 'dx ' + dx + ' dz ' + dz + ': state ' + e.state);
  }
});

test('a dodge backs away from the attacker, and slows down while it lasts', () => {
  const { game, a, e, rig } = load();
  hold(a, { x: 400, z: 60, facing: 1 });
  hold(e, { x: 430, z: 60, state: 'idle', facing: -1 });
  a.move = move(game, 'jab');
  rig.force = 0.3;
  a.warn(50, false);
  assert.equal(e.evade, 0.3);
  assert.ok(Math.abs(e.vx - (160 + 70 * 0.3)) < 1e-9, 'vx ' + e.vx);
  Object.assign(e, { target: a, retarget: 99, nextMove: move(game, 'jab'), cool: 99 });
  rig.force = 0.99;
  const v = e.vx;
  e.update(DT);
  assert.ok(Math.abs(e.vx - (v - 500 * DT)) < 1e-9, 'vx ' + e.vx);
});

// ---- Depth ----
test('a strike slows its depth movement, and ending a move stops it', () => {
  const { game, a, e } = load();
  hold(a, { x: 400, z: 60, facing: 1, state: 'idle', vz: 60 });
  a.startMove(move(game, 'jab'));
  a.update(DT);
  assert.ok(Math.abs(a.vz - (60 - 300 * DT)) < 1e-9, 'vz ' + a.vz);
  a.vz = 50;
  a.endMove();
  assert.equal(a.vz, 0);
});

// ---- Hits ----
test('a hit deals 0.85 of its damage, flinches for a time and pushes by its damage', () => {
  const { game, a, e, rig } = load();
  hold(a, { x: 400, z: 60, facing: 1 });
  hold(e, { x: 430, z: 60, facing: -1 });
  rig.force = 0.5;   // rand(0.85, 1.15) is 1, and no knockdown roll succeeds
  const jab = move(game, 'jab');
  e.takeHit(a, jab, 'body', e.bodyPoint(), { dmg: 5 });
  assert.equal(e.state, 'hit');
  assert.ok(Math.abs(1000 - e.hp - 5 * 0.85) < 1e-9, 'lost ' + (1000 - e.hp));
  assert.ok(Math.abs(e.dur - (0.16 + 5 * 0.85 * 0.025)) < 1e-9, 'flinch ' + e.dur);
  assert.ok(Math.abs(e.vx - ((jab.push || 30) + 5 * 0.85 * 2) * 2.2) < 1e-9, 'vx ' + e.vx);
});

test('a hit in the air launches by the move: down for an axe kick, up for an uppercut', () => {
  for (const [id, va] of [['axekick', -400], ['uppercut', 620]]) {
    const { game, a, e, rig } = load();
    hold(a, { x: 400, z: 60, facing: 1 });
    hold(e, { x: 430, z: 60, facing: -1, alt: 100 });
    rig.force = 0.5;
    e.takeHit(a, move(game, id), 'body', e.bodyPoint());
    assert.equal(e.state, 'launched');
    assert.equal(e.va, va, id);
  }
});

test('a knockout launches the body 1.4 times as fast sideways and 1.3 times plus 150 up', () => {
  const { game, a, e, rig } = load();
  hold(a, { x: 400, z: 60, facing: 1 });
  hold(e, { x: 430, z: 60, facing: -1, hp: 1 });
  const got = [], ko = Object.getPrototypeOf(e).ko;
  e.ko = function (vx, vy) { got.push([vx, vy]); return ko.call(this, vx, vy); };
  rig.force = 0.5;
  e.takeHit(a, move(game, 'jab'), 'body', e.bodyPoint(), { launch: { vx: 100, va: 200 } });
  assert.deepEqual(got, [[140, -410]]);
});

test('a shield broken by a fan stops the rest of the fan only from the front', () => {
  for (const [facing, stopped] of [[-1, true], [1, false]]) {
    const { game, a, e, rig } = load();
    hold(a, { x: 300, z: 60, facing: 1 });
    hold(e, { x: 500, z: 60, facing, state: 'idle' });
    e.startMove(move(game, 'shield'), true);
    const fan = {};
    Object.assign(e.md, { ph: 'rec', t0: 0, fan });
    rig.force = 0.5;
    e.takeHit({ facing: 1, owner: a }, move(game, 'shuriken'), 'body', e.bodyPoint(), { dmg: 3, fan, hold: true });
    assert.equal(e.hp === 1000, stopped, 'facing ' + facing + ': hp ' + e.hp);
  }
});

test('a raised shield takes the hit and is pushed back 60', () => {
  const { game, a, e, rig } = load();
  hold(a, { x: 300, z: 60, facing: 1 });
  hold(e, { x: 500, z: 60, facing: -1, state: 'idle' });
  e.startMove(move(game, 'shield'), true);
  rig.force = 0.5;
  e.takeHit(a, move(game, 'jab'), 'body', e.bodyPoint());
  assert.equal(e.hp, 1000);
  assert.equal(e.vx, 60);
});

test('a launch faster than 650 is a big impact, a slower one is not', () => {
  for (const [vx, big] of [[600, true], [300, false]]) {
    const { game, a, e, rig } = load();
    hold(a, { x: 300, z: 60, facing: 1 });
    hold(e, { x: 330, z: 60, facing: -1 });
    game.fx.length = 0;
    rig.force = 0.5;
    e.takeHit(a, move(game, 'jab'), 'body', e.bodyPoint(), { launch: { vx, va: 300 } });
    const ring = game.fx.find(f => f.type === 'ring' && !f.flat);
    assert.equal(ring.r1, big ? 70 : 34, 'launch at ' + vx);
  }
});

test('a grab takes an enemy just behind, and counts as a throw', () => {
  const { game, a, e, rig } = load();
  const m = game.MOVES.find(q => q.grab === 'reap');
  hold(a, { x: 400, z: 60, facing: 1, state: 'idle' });
  hold(e, { x: 395, z: 60, facing: 1 });
  a.startMove(m, true);
  a.st = m.wind + m.act * 0.5;
  rig.force = 0.5;
  const throws = game.stats.throws;
  a.checkHit();
  assert.equal(a.hitDone, true, 'missed the enemy 5 px behind');
  assert.equal(game.stats.throws, throws + 1);
});

// ---- Landing and launch ----
test('a reap drops its victim in 0.3 s and a takedown in 0.25 s', () => {
  for (const [kind, dur] of [['reap', 0.3], ['takedown', 0.25]]) {
    const { game, a, e, rig } = load();
    hold(a, { x: 400, z: 60, facing: 1, state: 'idle' });
    hold(e, { x: 420, z: 60, facing: -1 });
    a.startMove(game.MOVES.find(q => q.grab === kind), true);
    rig.force = 0.5;
    a.applyGrab(e);
    assert.equal(e.state, 'fall');
    assert.equal(e.dur, dur, kind);
  }
});

test('a launched fighter landing softly lies 0.6 to 1.2 s', () => {
  for (const r of [0, 0.999]) {
    const { e, rig } = load();
    hold(e, { x: 400, z: 60, state: 'launched', alt: 1, va: -100, vx: 0 });
    rig.force = r;
    e.update(DT);
    assert.equal(e.state, 'down');
    assert.ok(Math.abs(e.downDur - (0.6 + 0.6 * r)) < 1e-6, 'lies ' + e.downDur);
  }
});

test('a launch lifts off the floor, tumbles, and counts toward the juggle cap unless quiet', () => {
  const { e, rig } = load();
  hold(e, { x: 400, z: 60, facing: 1, juggle: 1 });
  rig.force = 0.5;
  e.launch(300, 300);
  assert.equal(e.alt, 2);
  assert.equal(e.rotV, -10);
  assert.equal(e.juggle, 2);
  e.launch(-90, 0, true);
  assert.equal(e.juggle, 2, 'a quiet launch counted');
  // The relaunch off a wall splat is quiet
  hold(e, { x: 20, z: 60, state: 'splat', st: 0.41, splatSide: -1, juggle: 1 });
  e.update(DT);
  assert.equal(e.state, 'launched');
  assert.equal(e.juggle, 1);
});

test('a slow launch into a wall bounces back at half speed', () => {
  const { e } = load();
  hold(e, { x: 16, z: 60, state: 'launched', alt: 100, va: 0, vx: -300 });
  e.update(DT);
  assert.equal(e.state, 'launched');
  assert.equal(e.vx, 150);
});

test('a fighter splatted on a wall faces away from it, upright', () => {
  const { e, worldW } = load();
  hold(e, { x: worldW - 20, z: 60, state: 'launched', alt: 100, va: 0, vx: 800, facing: 1, rot: 2 });
  e.update(DT);
  assert.equal(e.state, 'splat');
  assert.equal(e.facing, -1);
  assert.equal(e.rot, 0);
});

// ---- Smaller ----
test('a thawed fighter can attack again after 0.1 to 0.3 s', () => {
  for (const r of [0, 0.999]) {
    const { e, rig } = load();
    hold(e, { x: 400, z: 60, state: 'frozen', st: 1, dur: 1 });
    rig.force = r;
    e.update(DT);
    assert.equal(e.state, 'idle');
    assert.ok(Math.abs(e.cool - (0.1 + 0.2 * r)) < 1e-6, 'cool ' + e.cool);
  }
});

test('an aura fades at 2 a second', () => {
  const { e } = load();
  hold(e, { x: 400, z: 60, aura: 1 });
  e.update(DT);
  assert.ok(Math.abs(e.aura - (1 - 2 * DT)) < 1e-9, 'aura ' + e.aura);
});

test('a strike that ends without a hit counts as a whiff', () => {
  const { game, a } = load();
  hold(a, { x: 400, z: 60, state: 'idle' });
  a.startMove(move(game, 'jab'), true);
  const n = game.stats.whiff;
  a.endMove();
  assert.equal(game.stats.whiff, n + 1);
});

test('with platforms on, a fighter walks off the edge of its platform nearer its target below', () => {
  const { game, a, e } = load({ platforms: { value: true } });
  const p = game.platforms.reduce((h, q) => (q.x1 - q.x0 > h.x1 - h.x0 ? q : h));   // The widest
  const z = 30, w = p.x1 - p.x0;
  for (const [tx, way] of [[p.x0 + w * 0.2, -1], [p.x1 - w * 0.2, 1]]) {
    hold(e, { x: tx, z, alt: 0 });
    hold(a, { x: (p.x0 + p.x1) / 2, z, alt: game.groundY(z) - p.y, state: 'idle', vx: 0 });
    a.chaseSurface(e, DT);
    assert.equal(Math.sign(a.vx), way, 'target at x ' + tx.toFixed(0) + ': vx ' + a.vx);
  }
});
