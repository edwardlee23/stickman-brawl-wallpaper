// Runs main.js in a sandbox with a stubbed canvas and window, then pins the numbers and
// rules of the special moves that could break with every other test green (issue #268):
// the SPECIALS table (ranges, air and anti-air flags, damage, shot speed) and the
// martial-arts reach, and how the barrage, rising uppercut, dive, beam, slam, shadow
// clones, lightning, wall run, teleport, substitution and projectiles play out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;
function load(search = '?count=2&mode=ffa') {
  // Seeded, so every random pick is the same every run
  const { game } = loadMain({ search, seed: 268 });
  for (const f of game.fighters) hold(f, { x: 900, z: 60 });
  const [a, e] = game.fighters;
  a.target = e; e.target = a;
  return { game, a, e };
}
// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false, ...o });
  f.W = f.joints();
}
const special = (game, id) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
// Logs every hit f takes: the stand-in attacker's facing, the options, and f's health lost and velocity right after
function spy(f) {
  const log = [], takeHit = Object.getPrototypeOf(f).takeHit;
  f.takeHit = function (att, m, zone, H, o = {}) {
    const hp = this.hp, r = takeHit.call(this, att, m, zone, H, o);
    log.push({ facing: att.facing, o, lost: hp - this.hp, vx: this.vx, va: this.va, state: this.state, r });
    return r;
  };
  return log;
}
// Runs the whole fight for s seconds; a target that recovered from a hit is held again where it is
function run(game, s, keep = [], each = () => {}) {
  for (let t = 0; t < s - 1e-9; t += DT) {
    for (const f of keep) if (f.state === 'idle' || f.state === 'air') hold(f, { x: f.x, z: f.z, alt: f.alt, hp: f.hp });
    game.update(DT);
    if (each() === true) return;
  }
}
// Starts special id for a, at a's place, aimed at e
function begin(game, a, e, id, o = {}) {
  Object.assign(a, { state: 'idle', cool: 99, ...o });
  a.target = e;
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(special(game, id));
}
const flatRing = (game, r1) => game.fx.some(f => f.type === 'ring' && f.flat && f.r1 === r1);

test('the SPECIALS table: ranges, air and anti-air flags, damage and shot speed', () => {
  const { game } = load();
  const got = [...game.SUPER, ...game.MAGIC, ...game.NINJA].map(m =>
    [m.id, [...m.range], !!m.air, !!m.antiAir, m.dmg ?? '-', m.speed ?? '-'].join(' '));
  assert.deepEqual(got, [
    'beam 90,9999 true true 22 -',
    'blast 100,9999 true true 4 540',
    'barrage 14,40 false false 1.4 -',
    'rising 8,42 false true 10 -',
    'dive 60,480 true true 12 -',
    'slam 30,240 true false 12 -',
    'teleport 110,9999 false false - -',
    'wallrun 0,9999 false false - -',
    'fireball 90,9999 true false 10 430',
    'lightning 120,9999 false false 14 -',
    'ice 80,9999 true false 5 720',
    'shield 0,9999 false false - -',
    'shuriken 80,9999 true false 3 620',
    'clones 40,220 false false 5 -',
    'smoke 0,9999 false false - -',
    'substitute 0,9999 false false - -',
  ]);
});

const MIN_REACH = { jab: 33, cross: 21.6, hook: 17.5, uppercut: 18.4, teep: 17.3, roundhouse: 4, elbow: 19.7, knee: 11.9,
  lowkick: 4, sidekick: 18.7, backkick: 34.4, axekick: 19.4 };

test('a strike reaches in to 4 px inside the nearest point it sweeps with 0.7 of its lunge, and at least 4', () => {
  const { game } = load();
  const got = Object.fromEntries(game.MOVES.filter(m => !m.grab).map(m => [m.id, Math.round(m.range[0] * 10) / 10]));
  assert.deepEqual(got, MIN_REACH);
});

test('a barrage lands a punch every 0.08 s while drifting forward, then a 9 damage finisher', () => {
  const { game, a, e } = load();
  hold(e, { x: 425, z: 60 });
  const log = spy(e), x0 = 400;
  begin(game, a, e, 'barrage', { x: x0, z: 60, facing: 1 });
  let drift = 0;
  run(game, 0.94, [e], () => { drift = a.x - x0; });
  const jabs = log.filter(h => h.o.dmg === 1.4);
  assert.ok(jabs.length >= 11 && jabs.length <= 12, jabs.length + ' punches in 0.9 s');
  assert.ok(drift > 15 && drift < 30, 'drifted ' + drift.toFixed(1) + ' px');
  run(game, 0.1, [e]);
  const fin = log.at(-1);
  assert.equal(fin.state, 'launched');
  assert.ok(fin.lost > 7, 'the finisher took ' + fin.lost.toFixed(1));
});

test('a rising uppercut jumps at 720 and launches its target at 860', () => {
  const { game, a, e } = load();
  hold(e, { x: 420, z: 60 });
  const log = spy(e);
  begin(game, a, e, 'rising', { x: 400, z: 60, facing: 1 });
  let top = 0;
  run(game, 1.2, [], () => { top = Math.max(top, a.alt); });
  assert.ok(top > 150, 'rose to ' + top.toFixed(0));
  assert.equal(log.length, 1);
  assert.equal(log[0].va, 860);
  assert.equal(log[0].vx, 160);
});

test('a dive at a far target sets off at a shallow angle', () => {
  const { game, a, e } = load();
  hold(e, { x: 750, z: 60 });
  begin(game, a, e, 'dive', { x: 300, z: 60, facing: 1 });
  run(game, 1, [e], () => a.md && a.md.ph === 'dive');
  assert.equal(a.md.ph, 'dive');
  assert.ok(a.md.a < 0.8, 'angle ' + a.md.a.toFixed(2));
  assert.ok(a.vx > 550, 'vx ' + a.vx.toFixed(0));
});

test('a dive still in the air after 2.5 s ends and falls', () => {
  const { game, a, e } = load();
  hold(e, { x: 800, z: 60 });
  begin(game, a, e, 'dive', { x: 300, z: 60, facing: 1 });
  Object.assign(a.md, { ph: 'dive', a: 0.5, jumped: true });
  Object.assign(a, { hover: true, alt: 250, vx: 700, va: -300, st: 2.45 });
  a.update(DT);
  assert.equal(a.state, 'attack', 'ended before 2.5 s');
  a.update(DT); a.update(DT); a.update(DT); a.update(DT);
  assert.equal(a.state, 'air');
  assert.ok(a.alt > 150);
});

test('a dive that lands shakes the floor', () => {
  const { game, a, e } = load();
  hold(e, { x: 800, z: 0 });
  begin(game, a, e, 'dive', { x: 300, z: 110, facing: 1 });
  Object.assign(a.md, { ph: 'dive', a: 1, jumped: true });
  Object.assign(a, { hover: true, alt: 20, vx: 300, va: -800 });
  run(game, 0.2, [e], () => a.md && a.md.ph === 'rec');
  assert.equal(a.md && a.md.ph, 'rec');
  assert.ok(flatRing(game, 70), 'no landing quake');
});

test('homing turns at most its turn rate a step, and steers to the target depth', () => {
  const { a, e } = load();
  hold(e, { x: 400, z: 100 });
  Object.assign(a, { x: 400, z: 20, alt: 200, vx: 860, va: 0 });
  a.W = a.joints();
  a.homeTo(e, 860, 2.5, DT);
  const turned = Math.atan2(-a.va, a.vx);
  assert.ok(Math.abs(turned) <= 2.5 * DT + 1e-9, 'turned ' + turned.toFixed(3) + ' rad');
  assert.ok(Math.abs(turned) > 0.02, 'did not turn');
  assert.ok(Math.abs(Math.hypot(a.vx, a.va) - 860) < 1e-6);
  assert.equal(a.vz, 120);
});

test('a beam lifts what it hits, is 11 wide, recoils a little and cracks the floor it hits', () => {
  const { game, a, e } = load();
  hold(e, { x: 600, z: 60 });
  const log = spy(e);
  begin(game, a, e, 'beam', { x: 300, z: 60, facing: 1 });
  const w = [], vx = [];
  run(game, 1.1, [], () => { if (a.md && a.md.ph === 'fire' && a.md.w !== undefined) { w.push(a.md.w); vx.push(a.vx); } });
  assert.equal(log.length, 1);
  assert.ok(log[0].va > 100, 'lifted at ' + log[0].va.toFixed(0));
  assert.ok(Math.max(...w) > 9 && Math.max(...w) < 13.5, 'width ' + Math.max(...w).toFixed(1));
  const r = vx.slice(2);
  assert.ok(r.every(v => v < -10 && v > -30), 'recoil ' + r.map(v => v.toFixed(0)).join(','));

  // From the air, down at a target on the floor: the beam meets the floor and cracks it
  const g2 = load();
  hold(g2.e, { x: 520, z: 60 });
  begin(g2.game, g2.a, g2.e, 'beam', { x: 300, z: 60, alt: 200, facing: 1 });
  let ground = false;
  run(g2.game, 1.0, [g2.e], () => { if (g2.a.md && g2.a.md.ground) ground = true; });
  assert.ok(ground, 'the beam never met the floor');
  assert.ok(flatRing(g2.game, 110), 'no crack where the beam meets the floor');
});

test('a rapid punch finds an enemy in front, not one behind', () => {
  const { a, e } = load();
  Object.assign(a, { x: 400, z: 60, facing: 1 });
  hold(e, { x: 370, z: 60 });
  assert.equal(a.frontEnemy(48), null);
  hold(e, { x: 396, z: 60 });
  assert.equal(a.frontEnemy(48), e);
  hold(e, { x: 430, z: 60 });
  assert.equal(a.frontEnemy(48), e);
});

test('a slam comes down at 1300, launches at 540 and misses a fighter 100 deep away', () => {
  for (const [z, hits] of [[60, true], [120, false]]) {
    const { game, a, e } = load();
    hold(e, { x: 470, z });
    const log = spy(e);
    begin(game, a, e, 'slam', { x: 400, z: 20, facing: 1 });
    let down = null;
    run(game, 1.5, [], () => { if (down === null && a.md && a.md.ph === 'down') down = a.va; });
    assert.ok(down <= -1250, 'came down at ' + down);
    assert.equal(log.length, hits ? 1 : 0, 'z ' + z);
    if (hits) assert.equal(log[0].va, 540);
  }
});

test('shadow clones hit from both sides, the real strike at 1.6 times, and only at the target depth', () => {
  const { game, a, e } = load();
  hold(e, { x: 520, z: 60 });
  const log = spy(e);
  begin(game, a, e, 'clones', { x: 400, z: 60, facing: 1 });
  run(game, 1.2, [e]);
  assert.equal(log.length, 3);
  assert.deepEqual(log.slice(0, 2).map(h => h.facing).sort(), [-1, 1], 'one clone hits from behind');
  assert.ok(log[2].lost > 7.2, 'the real strike took ' + log[2].lost.toFixed(1));

  const g2 = load();
  hold(g2.e, { x: 520, z: 90 });
  const log2 = spy(g2.e);
  begin(g2.game, g2.a, g2.e, 'clones', { x: 400, z: 60, facing: 1 });
  run(g2.game, 1.2, [g2.e]);
  assert.equal(log2.length, 0, 'hit a target 30 deeper');
});

test('lightning falls at the target depth 0.75 s after the cast and launches at 420', () => {
  const { game, a, e } = load();
  hold(e, { x: 700, z: 110 });
  const log = spy(e);
  begin(game, a, e, 'lightning', { x: 300, z: 10, facing: 1 });
  let at = null;
  run(game, 1.2, [], () => { if (at === null && log.length) at = a.st; });
  assert.equal(log.length, 1, 'the bolt missed a target 100 deeper than the caster');
  assert.ok(at > 0.74 && at < 0.8, 'struck at ' + at);
  assert.equal(log[0].va, 420);
});

test('a wall run turns the body on the wall, leaps at 700, hits for 12 and rebounds', () => {
  const { game, a, e } = load();
  hold(e, { x: 400, z: 60, alt: 0 });
  const log = spy(e);
  begin(game, a, e, 'wallrun', { x: 80, z: 60, facing: -1 });
  let rot = null, leap = null, after = null;
  run(game, 3, [], () => {
    if (a.md && a.md.ph === 'climb' && rot === null) rot = a.rot;
    if (a.md && a.md.ph === 'leap' && leap === null) leap = a.vx;
    if (log.length && after === null) after = { va: a.va, vx: a.vx, facing: log[0].facing };
    return log.length > 0;
  });
  assert.ok(Math.abs(rot + Math.PI / 2) < 1e-9, 'rot on the wall ' + rot);
  assert.equal(leap, 700);
  assert.equal(log.length, 1);
  assert.ok(log[0].lost > 5, 'the leap took ' + log[0].lost.toFixed(1));
  assert.ok(after.va > 250, 'rebound va ' + after.va);
  assert.ok(after.vx * after.facing < 0, 'rebound vx ' + after.vx);
});

test('a wall-run leap flies at 700 and ends after 1.6 s in the air', () => {
  const { game, a, e } = load();
  // The target is well off the leap's depth, so the leap never connects
  hold(e, { x: 600, z: 120 });
  begin(game, a, e, 'wallrun', { x: 300, z: 0, facing: 1 });
  Object.assign(a.md, { ph: 'leap', dir: -1, t0: 0, prev: null });
  Object.assign(a, { hover: true, alt: 250, vx: 700, va: 0, st: 0 });
  let speed = 0;
  for (let i = 0; i < 6; i++) { a.update(DT); a.W = a.joints(); speed = Math.hypot(a.vx, a.va); }
  assert.ok(Math.abs(speed - 700) < 1e-6, 'speed ' + speed);
  a.st = 1.58;
  a.alt = 250; a.x = 300;
  a.update(DT);
  assert.equal(a.state, 'attack', 'ended before 1.6 s');
  a.alt = 250; a.x = 300;
  a.update(DT); a.update(DT);
  assert.equal(a.state, 'air');
});

test('a teleport fades out in 0.12 s, appears behind the target at its depth and height, then attacks', () => {
  const { game, a, e } = load();
  hold(e, { x: 600, z: 100, alt: 80, facing: -1 });
  begin(game, a, e, 'teleport', { x: 200, z: 10, facing: 1 });
  let alpha = null;
  for (let i = 0; i < 6; i++) { a.update(DT); if (i === 5) alpha = a.alpha; }
  assert.ok(alpha < 0.3, 'alpha at 0.1 s ' + alpha);
  for (let i = 0; i < 3; i++) a.update(DT);
  assert.equal(a.invis, true, 'still visible at 0.15 s');
  let appeared = null;
  for (let i = 0; i < 12 && !appeared; i++) { a.update(DT); if (!a.invis) appeared = { x: a.x, z: a.z, alt: a.alt }; }
  assert.ok(appeared, 'never appeared');
  assert.equal(appeared.x, 628);
  assert.equal(appeared.z, 100);
  assert.ok(appeared.alt > 70, 'appeared at alt ' + appeared.alt.toFixed(0));
  assert.equal(a.state, 'attack');
  assert.notEqual(a.move.id, 'teleport');
  assert.ok(['hook', 'roundhouse', 'backkick', 'uppercut', 'elbow', 'rising', 'barrage', 'clones'].includes(a.move.id), a.move.id);
});

test('a substitution stops the fighter where it appears', () => {
  const { game, a, e } = load();
  hold(a, { x: 400, z: 60, facing: 1 });
  hold(e, { x: 425, z: 60, facing: -1, state: 'idle', vx: 300, vz: 50 });
  e.subFrom = a; e.subT = 1;
  for (const f of game.fighters) f.W = f.joints();
  const r = e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', e.bodyPoint());
  assert.equal(r, 'sub');
  assert.equal(e.vx, 0);
  assert.equal(e.vz, 0);
});

test('a shuriken fan turns to face its target and spreads three stars', () => {
  const { game, a, e } = load();
  hold(e, { x: 700, z: 60 });
  begin(game, a, e, 'shuriken', { x: 300, z: 60, facing: -1 });
  for (let i = 0; i < 12 && !game.shots.length; i++) { a.update(DT); a.W = a.joints(); }
  assert.equal(game.shots.length, 3);
  assert.ok(game.shots.every(s => s.vx > 0), 'a star flew away from the target');
  const ang = game.shots.map(s => Math.atan2(s.vy, s.vx));
  assert.ok(Math.max(...ang) - Math.min(...ang) > 0.26, 'spread ' + (Math.max(...ang) - Math.min(...ang)).toFixed(2));
});

test('a fireball is thrown 0.4 s into the cast', () => {
  const { game, a, e } = load();
  hold(e, { x: 700, z: 60 });
  begin(game, a, e, 'fireball', { x: 300, z: 60, facing: 1 });
  let at = null;
  for (let i = 0; i < 40 && at === null; i++) { a.update(DT); a.W = a.joints(); if (game.shots.length) at = a.st; }
  assert.ok(at > 0.39 && at < 0.43, 'thrown at ' + at);
});

test('a cast shot aims at most 1.1 rad down, even at a target right below', () => {
  const { a, e } = load();
  hold(e, { x: 402, z: 60 });
  Object.assign(a, { x: 400, z: 60, alt: 300, facing: 1 });
  a.target = e; a.W = a.joints();
  a.move = { dmg: 1 };
  const s = a.castShot(a.W.hF, 'fire', 400, 0);
  assert.ok(Math.abs(Math.atan2(s.vy, s.vx) - 1.1) < 1e-9, 'aimed at ' + Math.atan2(s.vy, s.vx).toFixed(2));
});

test('a fireball launches at 420 by 300, leaves a flame on the floor, and every shot bursts', () => {
  const { game, a, e } = load();
  hold(a, { x: 200, z: 60 });
  hold(e, { x: 500, z: 60 });
  const log = spy(e), m = special(game, 'fireball');
  const y = e.bodyPoint().y;
  game.shots.push({ x: 400, y, vx: 430, vy: 0, z: 60, owner: a, m, life: 3, col: '#f80', kind: 'fire', dmg: 10 });
  run(game, 0.5, [], () => log.length > 0);
  assert.equal(log.length, 1);
  assert.equal(log[0].vx, 420);
  assert.equal(log[0].va, 300);
  assert.ok(game.fx.some(f => f.type === 'ring' && f.r1 === 22 && f.col === '#f80'), 'no burst');

  game.fx.length = 0;
  game.shots.push({ x: 300, y: game.groundY(10) - 30, vx: 0, vy: 400, z: 10, owner: a, m, life: 3, col: '#f80', kind: 'fire', dmg: 10 });
  run(game, 0.3, [e], () => !game.shots.length);
  assert.equal(game.shots.length, 0);
  assert.ok(game.fx.some(f => f.type === 'flame'), 'no flame on the floor');
  assert.ok(game.fx.some(f => f.type === 'ring' && f.r1 === 22 && f.col === '#f80'), 'no burst on the floor');
});

test('a shot that leaves past the top of the screen ends', () => {
  const { game, a, e } = load();
  hold(a, { x: 200, z: 60 });
  hold(e, { x: 900, z: 60 });
  game.shots.push({ x: 300, y: 60, vx: 0, vy: -600, z: 60, owner: a, m: special(game, 'ice'), life: 3, col: '#9fe8ff', kind: 'ice', dmg: 5 });
  run(game, 0.1, [e]);
  assert.equal(game.shots.length, 1);
  run(game, 0.15, [e]);
  assert.equal(game.shots.length, 0, 'still flying at y ' + (game.shots[0] && game.shots[0].y.toFixed(0)));
});
