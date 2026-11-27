// Runs main.js in a sandbox with a stubbed canvas and window, then pins item rules that
// could break with every other test green (issue #182): a heart at full health, the walk to
// an item, pickup depth, smoke, the boomerang throw and catch, the staff with every style
// off, and the gap between drops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const BOOMERANG_COL = '#d9a066';

// strokes records every strokeStyle set on the canvas, with the globalAlpha it was set at
function load(random) {
  const strokes = [], props = {};
  const ctx = new Proxy({}, {
    get: (o, k) => k in props ? props[k] : () => ({ addColorStop() {} }),
    set: (o, k, v) => { props[k] = v; if (k === 'strokeStyle') strokes.push({ col: v, alpha: props.globalAlpha }); return true; },
  });
  // A fixed Math.random of 0.99 turns off the random jumps and dashes; without one a seeded
  // generator (an LCG) stands in, so every run is the same (issue #161)
  const { game } = loadMain({ ctx, random: random || undefined });
  game.cfg.items = true;
  return { game, strokes };
}

// Two fighters on one line: a idle, e held still in a hit it does not recover from
function duel(game, gap, dz = 0) {
  const [a, e] = game.fighters;
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 99, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: 400 + gap, z: 50 + dz, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  return [a, e];
}
const run = (game, secs, until = () => false) => {
  for (let t = 0; t < secs && !until(); t += 1 / 60) game.update(1 / 60);
};

test('a fighter at full health leaves a heart at its feet where it lies (#182)', () => {
  const { game } = load();
  const [a] = duel(game, 400);
  a.state = 'hit'; a.st = 0; a.dur = 99;
  const heart = game.spawnItem('heart', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.ok(game.items.includes(heart), 'a fighter at full health used up the heart');
  assert.equal(a.hp, 100);
});

test('a fighter at full health does not walk to a heart (#182)', () => {
  const { game } = load(0.99);
  const [a] = duel(game, 600);
  game.spawnItem('heart', 250, 50, 0);
  run(game, 1);
  assert.ok(a.x > 390, 'walked toward the heart: x ' + a.x);
});

test('a hurt fighter with an enemy beside it does not walk to an item (#182)', () => {
  for (const gap of [60, 110]) {
    const { game } = load(0.99);
    const [a, e] = duel(game, gap);
    a.hp = 50;
    // The heart lies beyond the enemy, so footwork alone never takes a toward it
    game.spawnItem('heart', 500 + gap, 50, 0);
    run(game, 1);
    assert.ok(a.x < 402, 'with an enemy ' + gap + ' away it walked to the heart: x ' + a.x);
    // With the enemy far behind it, a does walk to the heart
    Object.assign(e, { x: 40 }); e.W = e.joints();
    Object.assign(a, { x: 400, vx: 0 }); a.W = a.joints();
    run(game, 1);
    assert.ok(a.x > 420, 'with the enemy away it did not walk to the heart: x ' + a.x);
  }
});

test('an item at another depth is not picked up (#182)', () => {
  const { game } = load();
  const [a] = duel(game, 400);
  Object.assign(a, { z: 60, state: 'hit', st: 0, dur: 99, hp: 50 });
  a.W = a.joints();
  const heart = game.spawnItem('heart', a.W.hip.x, 30, 0);
  game.update(1 / 60);
  assert.ok(game.items.includes(heart), 'picked up a heart 30 deep away');
  assert.equal(a.hp, 50);
});

test('a fighter hidden in smoke neither picks up an item nor shows the one it holds (#182)', () => {
  const { game, strokes } = load();
  const [a] = duel(game, 400);
  Object.assign(a, { state: 'hit', st: 0, dur: 99, hp: 50, invis: true });
  const heart = game.spawnItem('heart', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.ok(game.items.includes(heart), 'a hidden fighter picked up a heart');
  assert.equal(a.hp, 50);
  game.items.length = 0;
  a.held = { kind: 'boomerang' };
  strokes.length = 0;
  game.render();
  assert.ok(!strokes.some(s => s.col === BOOMERANG_COL), 'the boomerang of a hidden fighter was drawn');
  // Seen again but faded, it is drawn as faded as the fighter
  a.invis = false; a.alpha = 0.4;
  strokes.length = 0;
  game.render();
  const drawn = strokes.filter(s => s.col === BOOMERANG_COL);
  assert.ok(drawn.length > 0, 'the boomerang was not drawn');
  assert.ok(drawn.every(s => s.alpha === 0.4), 'drawn at alpha ' + drawn.map(s => s.alpha));
});

test('a thrown boomerang comes back and its thrower catches it (#182)', () => {
  const { game } = load(0.99);
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a, e] = duel(game, 200);
  a.held = { kind: 'boomerang' }; a.cool = 0;
  run(game, 1, () => game.shots.some(s => s.kind === 'boomerang'));
  const s = game.shots.find(s => s.kind === 'boomerang');
  assert.ok(s, 'thrown');
  // The target steps off the line, so nothing stops the boomerang but the catch
  Object.assign(e, { z: 110 }); e.W = e.joints();
  for (let t = 0; t < 3 && game.shots.includes(s); t += 1 / 60) {
    // The thrower stands where it threw, and on its way back the boomerang flies level with
    // the thrower's hand, so it comes within reach
    Object.assign(a, { x: 400, z: 50, vx: 0, vz: 0, cool: 99 });
    if (s.age > 1.2) s.y = a.W.hF.y;
    game.update(1 / 60);
  }
  assert.ok(!game.shots.includes(s), 'never came back');
  assert.ok(s.age < 2.4, 'not caught but timed out at age ' + s.age);
  assert.ok(s.age > 1, 'gone before it turned, at age ' + s.age);
});

test('a boomerang is not thrown at point-blank range or along another line (#182)', () => {
  for (const [gap, dz] of [[40, 0], [200, 20]]) {
    const { game } = load(0.99);
    for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
    const [a] = duel(game, gap, dz);
    a.held = { kind: 'boomerang' }; a.cool = 0;
    game.update(1 / 60);
    assert.ok(!(a.move && a.move.id === 'boomerang'), 'thrown at gap ' + gap + ', depth ' + dz);
    assert.equal(a.held.kind, 'boomerang');
  }
});

test('with every style off, a fighter picks up and keeps a staff (README) (#182)', () => {
  const { game } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a] = duel(game, 400);
  a.state = 'hit'; a.st = 0; a.dur = 99;
  game.spawnItem('staff', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.ok(a.held && a.held.kind === 'staff', 'did not pick up the staff');
  game.update(1 / 60);
  assert.ok(a.held && a.held.kind === 'staff', 'dropped the staff');
});

test('every drop, not only the first, waits 8 to 15 s after the one before (#182)', () => {
  const { game } = load();
  for (const f of game.fighters) f.hp = 1e9;
  const times = [];
  let t = 0;
  // Every drop is pushed to the list of items, even one a fighter catches as it falls
  game.items.push = function (...it) { times.push(t); return Array.prototype.push.apply(this, it); };
  // Within the first round: a round ends by time well after 140 s, and its pause holds drops back
  for (; t < 140; t += 1 / 60) {
    game.update(1 / 60);
    // Clearing the field each step lets every drop fall, so none is skipped for a full field
    game.items.length = 0;
  }
  assert.ok(times.length >= 8, 'drops: ' + times.length);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap > 8 - 0.05 && gap < 15 + 0.05, 'drop ' + i + ' came ' + gap.toFixed(2) + ' s after the one before');
  }
});
