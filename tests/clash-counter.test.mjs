// Pins clashes and counters: two strikes that meet knock both fighters back with no damage, a
// block made in time parries a strike and lets the blocker hit straight back, and an enemy
// warned of a strike may meet it with one of its own thrown with the same kind of limb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

// Loads two fighters face to face, d apart. R() is Math.random: a seeded generator unless the
// test sets fixed, which then takes its place
function duel(d, { styles } = {}) {
  const rnd = lcg(3);
  const state = { fixed: null };
  const { game } = loadMain({ search: '?count=2&mode=ffa', ctx: stubContext(), random: () => (state.fixed ?? rnd()) });
  if (styles) for (const k in game.cfg.styles) game.cfg.styles[k] = styles.includes(k);
  const [a, b] = game.fighters;
  for (const f of [a, b]) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  Object.assign(a, { x: 400, facing: 1, target: b });
  Object.assign(b, { x: 400 + d, facing: -1, target: a });
  game.update(1 / 120);
  return { game, a, b, state };
}
const move = (game, id) => game.MOVES.find(m => m.id === id);
const step = (game, n, dt = 1 / 120) => { for (let i = 0; i < n; i++) game.update(dt); };

test('two jabs thrown at each other at once meet: both fighters reel back, neither is hurt', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.99;   // No reactions to the warnings
  const jab = move(game, 'jab');
  a.startMove(jab, true); b.startMove(jab, true);
  for (let i = 0; i < 60 && !game.stats.clashes; i++) step(game, 1);
  assert.equal(game.stats.clashes, 1);
  assert.equal(a.state, 'hit'); assert.equal(b.state, 'hit');
  assert.equal(a.hp, 100); assert.equal(b.hp, 100);
  assert.ok(a.vx < 0 && b.vx > 0, 'pushed apart: ' + a.vx + ', ' + b.vx);
  assert.equal(game.stats.hits.jab, undefined);
});

test('a strike that lands on an enemy kicking back is a hit, not a clash: the limbs differ', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.99;
  a.startMove(move(game, 'jab'), true);
  b.startMove(move(game, 'axekick'), true);
  for (let i = 0; i < 40 && a.state === 'attack' && !a.hitDone; i++) step(game, 1);
  assert.equal(game.stats.clashes, 0);
  assert.ok(b.hp < 100, 'the jab did not land');
});

test('a block parries a strike when the roll is under the chance: no damage, and the blocker strikes back', () => {
  const { game, a, b, state } = duel(48, { styles: ['boxing'] });
  state.fixed = 0.1;   // Under the parry chance; under 0.25 the warning makes b block
  a.startMove(move(game, 'cross'));
  assert.equal(b.state, 'block');
  for (let i = 0; i < 60 && !game.stats.parries; i++) step(game, 1);
  assert.equal(game.stats.parries, 1);
  assert.equal(b.hp, 100);
  assert.equal(a.state, 'hit');
  assert.equal(a.move, null);
  assert.equal(b.state, 'attack');
  assert.equal(b.move.style, 'boxing');
  assert.equal(game.stats.counters, 1);
});

test('#506 a counter is a surprise: an idle enemy in front of it does not block, dodge or meet it', () => {
  const state = { fixed: null }, rnd = lcg(3);
  const { game } = loadMain({ search: '?count=3&mode=ffa', ctx: stubContext(), random: () => (state.fixed ?? rnd()) });
  for (const k in game.cfg.styles) game.cfg.styles[k] = k === 'boxing';
  const [a, b, c] = game.fighters;
  for (const f of [a, b, c]) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  Object.assign(a, { x: 400, facing: 1, target: b });
  Object.assign(b, { x: 448, facing: -1, target: a });
  // c stands behind a, in reach of b's counter and out of a's strike, which faces away from it
  Object.assign(c, { x: 390, facing: 1, target: b });
  game.update(1 / 120);
  state.fixed = 0.1;   // Under the parry chance; under 0.25 a warning makes an enemy block
  a.startMove(move(game, 'cross'));
  for (let i = 0; i < 60 && !game.stats.counters; i++) step(game, 1);
  assert.equal(game.stats.counters, 1);
  assert.ok(Math.abs(c.x - b.x) <= b.move.range[1] + 15, 'c is out of the counter\'s warning reach');
  // The surprise flag stops the counter warning anyone: a bystander would block it, as the roll
  // stands. The attacker reels and would not react to a warning anyway
  assert.equal(c.state, 'idle');
  assert.ok(c.evade <= 0, 'c dodged');
});

test('a block over the parry chance takes the hit as before: a little damage, pushed back', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.1;
  a.startMove(move(game, 'cross'));
  assert.equal(b.state, 'block');
  state.fixed = 0.9;
  for (let i = 0; i < 60 && !game.stats.blocked; i++) step(game, 1);
  assert.equal(game.stats.blocked, 1);
  assert.equal(game.stats.parries, 0);
  assert.ok(b.hp < 100 && b.hp > 98, 'hp ' + b.hp);
});

test('a warned enemy may meet a strike with one of the same limb, out no later than it', () => {
  const { game, a, b, state } = duel(48, { styles: ['boxing', 'muaythai', 'taekwondo'] });
  state.fixed = 0.7;   // In the meeting band, past the other reactions
  const m = move(game, 'roundhouse');
  a.startMove(m);
  assert.equal(b.state, 'attack');
  assert.equal(b.move.hit[0], m.hit[0]);
  assert.ok(b.move.wind <= m.wind + 0.02);
  assert.equal(b.facing, -1);
  assert.equal(b.target, a);
});

test('a warned enemy does not meet a throw', () => {
  const { game, a, b, state } = duel(20);
  state.fixed = 0.7;
  a.startMove(move(game, 'osotogari'));
  assert.equal(b.state, 'idle');
});

test('clashes and counters happen in a fight', () => {
  let clashes = 0, counters = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const { game } = loadMain({ search: '?count=6&mode=ffa', ctx: stubContext(), random: lcg(seed) });
    step(game, 60 * 120, 1 / 60);
    clashes += game.stats.clashes; counters += game.stats.counters;
  }
  assert.ok(clashes >= 3, clashes + ' clashes');
  assert.ok(counters >= 3, counters + ' counters');
});

// The rules of a clash, one at a time (#506): clashWith is asked whether this fighter's strike,
// swept from P0 to H, meets a strike of another fighter's, set up here in its active time with
// its point where the test wants it
const IN = 'window.__in = { clash, get shake() { return shake; }, get freeze() { return freeze; } };';
function rig(search = '?count=2&mode=ffa') {
  const state = { fixed: 0.5 };
  const { game, window } = loadMain({ search, ctx: stubContext(), random: () => state.fixed, expose: IN });
  for (const f of game.fighters) Object.assign(f, { state: 'idle', x: 1100, z: 50, alt: 0, vx: 0, vz: 0, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
  return { game, inner: window.__in, state };
}
// a at 400 facing right and e at 448 facing left, both throwing a jab that is out now
function crossing(game, a, e) {
  const jab = move(game, 'jab');
  Object.assign(a, { x: 400, facing: 1, target: e });
  Object.assign(e, { x: 448, facing: -1, target: a });
  for (const f of [a, e]) { f.startMove(jab, true); f.st = jab.wind + 0.02; f.W = f.joints(); }
  return e.W.hF;
}
const at = (P, dx) => ({ x: P.x + dx, y: P.y });

test('#506 a strike swept within CLASH_DIST of an enemy fist out in its active time clashes; farther off it does not', () => {
  const { game } = rig();
  const [a, e] = game.fighters;
  const E = crossing(game, a, e);
  const c = a.clashWith(at(E, 10), at(E, 10), null);
  assert.ok(c, 'no clash 10 from the fist');
  assert.equal(c[0], e);
  assert.equal(a.clashWith(at(E, 30), at(E, 30), null), null, 'a clash 30 from the fist');
  // Swept past the fist between two steps, the strike still meets it
  assert.ok(a.clashWith(at(E, -40), at(E, 40), null), 'no clash on a sweep across the fist');
});

test('#506 only a strike thrown back at this one, by an enemy level with it and still to land, clashes', () => {
  const cases = {
    'facing the same way': e => { e.facing = 1; },
    'more than 16 away in depth': e => { e.z += 17; },
    '35 above': e => { e.alt += 35; },
    'already landed': e => { e.hitDone = true; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const { game } = rig();
    const [a, e] = game.fighters;
    const E = crossing(game, a, e);
    change(e);
    assert.equal(a.clashWith(E, E, null), null, 'a clash with an enemy ' + name);
  }
});

test('#506 in Red vs Blue, teammates whose strikes cross do not clash', () => {
  const { game } = rig('?count=4&mode=teams');
  const a = game.fighters[0], mate = game.fighters.find(f => f !== a && f.team === a.team);
  const E = crossing(game, a, mate);
  assert.equal(a.clashWith(E, E, null), null, 'a teammate\'s fist clashed');
  // and in a fight step by step: two teammates' jabs thrown at each other pass, no clash
  const jab = move(game, 'jab');
  for (const f of [a, mate]) { f.clearMove(); Object.assign(f, { state: 'idle', st: 0 }); }
  a.startMove(jab, true); mate.startMove(jab, true);
  step(game, 40);
  assert.equal(game.stats.clashes, 0);
});

test('#506 a clash ends both combos, shakes the screen and stops time', () => {
  const { game, inner } = rig();
  const [a, e] = game.fighters;
  const E = crossing(game, a, e);
  for (const f of [a, e]) Object.assign(f, { combo: 2, chain: f === a ? e : a });
  inner.clash(a, e, a.W.hF, E);
  for (const f of [a, e]) {
    assert.equal(f.combo, 0); assert.equal(f.chain, null);
    assert.equal(f.state, 'hit'); assert.equal(f.move, null); assert.equal(f.hitDone, true);
  }
  assert.ok(inner.shake >= 6, 'shake ' + inner.shake);
  assert.ok(inner.freeze > 0, 'no hit stop');
});

test('#506 both fighters reel from a clash for about a third of a second', () => {
  const { game, a, b, state } = duel(48);
  state.fixed = 0.99;
  const jab = move(game, 'jab');
  a.startMove(jab, true); b.startMove(jab, true);
  for (let i = 0; i < 60 && !game.stats.clashes; i++) step(game, 1);
  assert.equal(game.stats.clashes, 1);
  let t = 0;
  while (a.state === 'hit' && t < 2) { step(game, 1); t += 1 / 120; }
  // The clash's hit stop holds the game still a little longer than the stagger itself
  assert.ok(t > 0.2 && t < 0.5, 'reeled ' + t.toFixed(3) + ' s');
});

test('#506 a block parries a strike PARRY_CHANCE of the time and takes the rest', () => {
  for (const [roll, parried] of [[0.34, true], [0.36, false]]) {
    const { game, a, b, state } = duel(48, { styles: ['boxing'] });
    const cross = move(game, 'cross');
    state.fixed = 0.99; a.startMove(cross, true);
    Object.assign(b, { state: 'block', st: 0, dur: 1, facing: -1 });
    a.W = a.joints();
    state.fixed = roll;
    b.takeHit(a, cross, 'body', a.W.hB);
    assert.equal(game.stats.parries, parried ? 1 : 0, 'roll ' + roll);
    assert.equal(game.stats.blocked, parried ? 0 : 1, 'roll ' + roll);
  }
});

test('#506 a parry staggers the attacker, ends its combo and pushes it back a little', () => {
  const { game, a, b, state } = duel(48, { styles: ['boxing'] });
  const cross = move(game, 'cross');
  state.fixed = 0.99; a.startMove(cross, true);
  Object.assign(a, { combo: 2, chain: b }); a.W = a.joints();
  state.fixed = 0.5;
  b.parry(a, a.W.hB);
  assert.equal(a.state, 'hit'); assert.equal(a.move, null);
  assert.equal(a.combo, 0); assert.equal(a.chain, null);
  assert.ok(a.dur >= 0.3 && a.dur <= 0.5, 'staggered ' + a.dur + ' s');
  assert.ok(a.vx < -60 && a.vx > -120, 'pushed at ' + a.vx);
});

test('#506 the counter turns to the attacker, takes it as its target and is a strike that reaches it', () => {
  let countered = 0;
  for (let d = 20; d <= 70; d += 5) {
    const { game } = loadMain({ search: '?count=3&mode=ffa', ctx: stubContext(), random: () => 0.5 });
    const [a, b, c] = game.fighters;
    for (const f of game.fighters) Object.assign(f, { state: 'idle', alt: 0, vx: 0, vz: 0, z: 50, cool: 99, retarget: 99, hp: 100, dash: 0, evade: 0 });
    Object.assign(c, { x: 1100 });
    Object.assign(a, { x: 400, facing: 1, target: b });
    // b faces away from a and is after c, as it may be when the parried strike comes from behind
    Object.assign(b, { x: 400 + d, facing: 1, target: c });
    a.startMove(move(game, 'cross'), true); a.W = a.joints();
    b.parry(a, a.W.hB);
    if (b.state !== 'attack') continue;
    assert.equal(b.facing, -1, 'not turned to the attacker at ' + d);
    assert.equal(b.target, a, 'not after the attacker at ' + d);
    assert.ok(d >= b.move.range[0] && d + 10 <= b.move.range[1], b.move.id + ' does not reach ' + d);
    countered++;
  }
  assert.ok(countered >= 5, countered + ' counters');
});

test('#506 a parry too far for any counter to reach is not answered', () => {
  const { game, a, b, state } = duel(75, { styles: ['boxing', 'muaythai', 'taekwondo'] });
  state.fixed = 0.99; a.startMove(move(game, 'cross'), true); a.W = a.joints();
  state.fixed = 0.5;
  b.parry(a, a.W.hB);
  assert.equal(game.stats.counters, 0);
  assert.notEqual(b.state, 'attack');
});

test('#506 a warned enemy meets MEET_CHANCE of the strikes it sees: the rolls from 0.63 to 0.88', () => {
  for (const [roll, meets] of [[0.64, true], [0.86, true], [0.9, false]]) {
    const { game, a, b, state } = duel(48, { styles: ['boxing', 'muaythai', 'taekwondo'] });
    state.fixed = roll;
    a.startMove(move(game, 'roundhouse'));
    assert.equal(b.state, meets ? 'attack' : 'idle', 'roll ' + roll);
  }
});

test('#506 a warned enemy farther than any strike of its reaches does not meet the strike', () => {
  // A staff strike warns farther than a bare strike reaches: here a warning from 100 away
  const { game, a, b, state } = duel(100, { styles: ['boxing', 'muaythai', 'taekwondo'] });
  state.fixed = 0.7;
  a.startMove(move(game, 'roundhouse'), true);
  a.warn(200, false);
  assert.equal(b.state, 'idle');
});
