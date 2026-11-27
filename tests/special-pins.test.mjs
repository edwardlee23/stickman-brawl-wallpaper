// Runs main.js in a sandbox with a stubbed canvas and window, then pins special-move, item
// and click rules that could break with every other test green (issue #319): the wall run,
// the shadow clones, shuriken in the air, grab depth, leg damage, the slam's hit stop, the
// spinning kick, the throw's rotation, barrage, rising uppercut, dive, beam and blast aims,
// the air dash, the winner's pose, the boomerang's return and the click cooldown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// main.js also exposes, as window.__in, the internals these tests read or call
const EXPOSE = 'window.__in = { MOVE_BY, BOOMERANG, hitStop, steerBoomerang, music,' +
  ' get freeze() { return freeze; }, get worldW() { return worldW; } };';

// Loads the wallpaper with a seeded Math.random (an LCG), so every run is the same. Every
// fighter flinches on the floor at the far right, out of the way, until a test moves it.
function load(props = {}, count = 2, seed = 319) {
  const listeners = {};
  const { game, window } = loadMain({
    search: '?count=' + count + '&mode=ffa', seed, expose: EXPOSE, properties: props,
    window: { addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } },
  });
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
    f.W = f.joints();
  }
  return { game, inn: window.__in, listeners, a: game.fighters[0], e: game.fighters[1] };
}
const DT = 1 / 60;

// Steps f alone until test(f) is true or s seconds pass; returns the time it took
function until(f, done, s = 5) {
  let t = 0;
  while (!done(f) && t < s) { f.update(DT); t += DT; }
  return t;
}
const special = (game, id) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const strike = (game, id) => game.MOVES.find(m => m.id === id);
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

test('a wall run that starts far from the wall reaches it and climbs', () => {
  const { game, a } = face(400, 700);
  a.startMove(special(game, 'wallrun'));
  until(a, f => f.state !== 'attack' || f.md.ph !== 'run');
  assert.equal(a.state, 'attack', 'the wall run ended at x ' + a.x.toFixed(0));
  assert.equal(a.md.ph, 'climb');
});

test('a wall run ends when the runner lands', () => {
  const { game, a } = face(400, 700);
  a.startMove(special(game, 'wallrun'));
  a.md.ph = 'leap';
  a.onLand();
  assert.notEqual(a.state, 'attack');
  assert.equal(a.move, null);
});

test('the shadow clones strike, launch the target up, and vanish on time', () => {
  const { game, a, e } = face(400, 500);
  a.startMove(special(game, 'clones'));
  const at = {};
  let va = null, now = 0;
  const end = until(a, f => {
    if (f.md && at[f.md.ph] === undefined) at[f.md.ph] = now;
    if (va === null && e.state === 'launched') va = e.va;
    now += DT;
    return f.state !== 'attack';
  });
  assert.ok(va > 300, 'the finisher launched at va ' + va);
  assert.ok(Math.abs(at.vanish - at.strike - 0.2) < 0.03, 'struck for ' + (at.vanish - at.strike).toFixed(3) + ' s');
  assert.ok(Math.abs(end - at.vanish - 0.15) < 0.03, 'vanished over ' + (end - at.vanish).toFixed(3) + ' s');
});

test('shuriken thrown in the air are thrown hovering', () => {
  const { game, a } = face(400, 700, { alt: 150 });
  a.startMove(special(game, 'shuriken'));
  until(a, f => f.state !== 'attack', 0.4);
  assert.ok(Math.abs(a.alt - 150) < 1, 'alt ' + a.alt.toFixed(1) + ' after the throw');
});

test('a throw catches an enemy only within 14 of its depth', () => {
  for (const [dz, caught] of [[10, true], [30, false]]) {
    const { game, a, e } = face(400, 420);
    e.z = 60 + dz;
    const m = strike(game, 'seoinage');
    Object.assign(a, { state: 'attack', move: m, st: m.wind + m.act * 0.5, hitDone: false });
    a.checkHit();
    assert.equal(a.hitDone, caught, 'depth gap ' + dz);
  }
});

test('a leg hit does 0.8 times the damage of a body hit', () => {
  const { game, a, e } = face(400, 420);
  const mean = zone => {
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      Object.assign(e, { hp: 1000, state: 'hit', st: 0 });
      e.takeHit(a, strike(game, 'jab'), zone, { x: 420, y: 300 }, { dmg: 10, hold: true });
      sum += 1000 - e.hp;
    }
    return sum / 400;
  };
  const r = mean('leg') / mean('body');
  assert.ok(Math.abs(r - 0.8) < 0.04, 'leg to body damage ' + r.toFixed(3));
});

test('a slam landing starts a hit stop', () => {
  const { game, inn, a } = face(400, 900);
  a.startMove(special(game, 'slam'));
  until(a, f => f.state !== 'attack' || f.md.ph === 'rec');
  assert.equal(a.md.ph, 'rec');
  assert.ok(Math.abs(inn.freeze - 0.08) < 1e-9, 'hit stop ' + inn.freeze);
});

test('a spinning kick turns only during its strike, not in the wind-up', () => {
  const { game, a } = face(400, 700);
  const m = strike(game, 'backkick');
  a.startMove(m);
  let spun = 0;
  until(a, f => {
    if (f.state === 'attack') {
      if (f.st < m.wind - 0.02 || f.st > m.wind + m.act + m.rec * 0.5 + 0.02) assert.equal(f.spin, false, 'spinning at ' + f.st.toFixed(3) + ' s');
      if (f.spin) spun++;
    }
    return f.state !== 'attack';
  });
  assert.ok(spun > 5, 'spun ' + spun + ' frames');
});

test('a thrown fighter turns over in the air', () => {
  const { game, a, e } = face(400, 422, { estate: 'idle' });
  a.move = strike(game, 'seoinage');
  a.applyGrab(e);
  let rot = 0;
  until(e, f => { rot = Math.max(rot, Math.abs(f.rot)); return f.state !== 'thrown'; });
  assert.ok(rot > 4, 'turned ' + rot.toFixed(2) + ' rad');
});

test('the barrage punches reach 48 ahead and its finisher 56', () => {
  // Punches: an enemy 44 ahead is hit in the first 0.3 s, before the slow advance closes in
  {
    const { game, a, e } = face(400, 444);
    a.startMove(special(game, 'barrage'));
    until(a, f => f.st >= 0.3);
    assert.ok(e.hp < 1000, 'no punch landed 44 ahead');
  }
  // Finisher: 76 ahead is out of the punches' reach for the whole flurry (25 a second for
  // 0.95 s brings it to about 52), and inside the finisher's
  {
    const { game, a, e } = face(400, 476);
    a.startMove(special(game, 'barrage'));
    until(a, f => f.st >= 0.92);
    assert.equal(e.hp, 1000, 'a punch landed');
    until(a, f => f.md && f.md.fin);
    assert.ok(e.hp < 1000, 'the finisher missed ' + (e.x - a.x).toFixed(1) + ' ahead');
  }
});

test('the rising uppercut ends at the top of its rise, and hits up to 70 above', () => {
  // A miss, to find the top of the rise
  const { game, a } = face(400, 900);
  a.startMove(special(game, 'rising'));
  let va = null;
  until(a, f => { if (f.state !== 'attack') { va = f.va; return true; } return false; });
  assert.ok(va <= 0 && va > -40, 'ended at va ' + va.toFixed(0));
  const top = { x: a.x, alt: a.alt };
  // An enemy 60 above that top and a little ahead is hit on the way up
  const r = face(400, top.x + 20, { ealt: top.alt + 60 });
  r.a.startMove(special(r.game, 'rising'));
  until(r.a, f => f.state !== 'attack');
  assert.ok(r.e.hp < 1000, 'missed an enemy 60 above the top at alt ' + top.alt.toFixed(0));
});

test('a dive comes down at least 0.3 rad steep and recovers for 0.3 s', () => {
  // A target well above the dive's start would be aimed at upward; the dive still goes down
  {
    const { game, a } = face(200, 900, { ealt: 260 });
    a.startMove(special(game, 'dive'));
    until(a, f => f.state !== 'attack' || f.md.ph === 'dive');
    assert.equal(a.md.ph, 'dive');
    assert.ok(Math.abs(a.md.a - 0.3) < 1e-9, 'dive angle ' + a.md.a.toFixed(3));
  }
  // A dive at a target lying on the floor close by misses it, lands, then recovers
  {
    const { game, a } = face(400, 470, { estate: 'down' });
    a.startMove(special(game, 'dive'));
    until(a, f => f.state !== 'attack' || f.md.ph === 'rec');
    assert.equal(a.md && a.md.ph, 'rec', 'the dive never landed');
    const t = until(a, f => f.state === 'attack' && f.md.ph === 'rec' ? false : true);
    assert.ok(Math.abs(t - 0.3) < 0.03, 'recovered for ' + t.toFixed(3) + ' s');
  }
});

test('a beam aims at most 0.7 rad up', () => {
  const { game, a } = face(400, 430, { ealt: 300 });
  a.startMove(special(game, 'beam'));
  until(a, f => f.state !== 'attack' || f.md.ph === 'fire');
  assert.equal(a.md.ph, 'fire');
  assert.ok(Math.abs(a.md.aim + 0.7) < 1e-9, 'aimed at ' + a.md.aim.toFixed(3));
});

test('the shots of an energy blast spread up to 0.12 rad about the aim', () => {
  const { game, a, e } = face(400, 800);
  a.startMove(special(game, 'blast'));
  const c = { x: (e.W.sh.x + e.W.hip.x) / 2, y: (e.W.sh.y + e.W.hip.y) / 2 };
  const devs = [];
  until(a, f => {
    for (const s of game.shots.splice(0)) devs.push(Math.atan2(s.vy, Math.abs(s.vx)) - Math.atan2(c.y - s.y, Math.abs(c.x - s.x) + 1));
    return f.state !== 'attack';
  });
  assert.equal(devs.length, 6);
  for (const d of devs) assert.ok(Math.abs(d) <= 0.12 + 1e-9, 'off the aim by ' + d.toFixed(3));
  assert.ok(Math.max(...devs.map(Math.abs)) > 0.03, 'spread ' + devs.map(d => d.toFixed(3)).join(', '));
});

test('an air dash lifts a falling fighter', () => {
  const { a, e } = face(400, 700, { alt: 150 });
  let dashed = false;
  for (let i = 0; i < 200 && !dashed; i++) {
    Object.assign(a, { x: 400, alt: 150, va: -200, state: 'air', dj: true, dashed: false, cool: 0, dash: 0, target: e });
    a.updAir(DT);
    dashed = a.dashed;
  }
  assert.ok(dashed, 'never dashed');
  assert.equal(a.va, 60);
});

test('the winner of a round strikes the victory pose with an aura', () => {
  const { game, a, e } = face(400, 700);
  e.hp = 0; e.ko(0, 0);
  game.checkRound(0);
  for (let t = 0; t < 0.5; t += DT) a.update(DT);
  assert.equal(a.target, null);
  assert.equal(a.aura, 0.6);
  // The pose is the winner's victory pose (VICTORIES, by the round and the fighter), not the guard
  const want = {}, keys = Object.keys(game.GUARD);
  game.VICTORIES[game.victoryOf(a)](want, a.time);
  const off = p => keys.reduce((s, k) => s + Math.abs(a.pose[k] - p[k]), 0);
  assert.ok(off(want) < 0.5 && off(game.GUARD) > 2, `${off(want).toFixed(2)} off the victory pose, ${off(game.GUARD).toFixed(2)} off the guard`);
});

test('a boomerang flies back at the speed it slowed from: half its throw speed 0.5 s after turning', () => {
  const { inn, a } = face(400, 700);
  a.W = a.joints();
  const s = { x: 500, y: a.W.hF.y, vx: 600, vy: 0, v0x: 600, v0y: 0, age: 0, life: 2.6, owner: a };
  for (let t = 0; t < 1.5 - 1e-9; t += DT) { inn.steerBoomerang(s, DT); s.x += s.vx * DT; s.y += s.vy * DT; }
  assert.ok(s.life > 0, 'caught early');
  const v = Math.hypot(s.vx, s.vy);
  assert.ok(Math.abs(v - 300) < 15, 'flies back at ' + v.toFixed(0) + ' at age ' + s.age.toFixed(2));
});

test('Click to blast ignores clicks for half a second after one', () => {
  const { game, listeners, a } = face(300, 900);
  game.cfg.clickBlast = true;
  const S = 720 / 540;
  const c = a.bodyPoint();
  const click = ms => { for (const fn of listeners.pointerdown) fn({ clientX: (c.x - 20) * S, clientY: c.y * S, button: 0, timeStamp: ms }); };
  const reset = () => { Object.assign(a, { state: 'idle', vx: 0, va: 0, alt: 0, rot: 0 }); a.W = a.joints(); };
  click(1000);
  assert.equal(a.state, 'launched');
  reset(); click(1450);
  assert.equal(a.state, 'idle', 'a click 0.45 s later blasted');
  click(1550);
  assert.equal(a.state, 'launched', 'a click 0.55 s later did nothing');
});
