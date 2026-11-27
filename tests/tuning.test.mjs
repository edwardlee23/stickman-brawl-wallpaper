// Pins tuning numbers in main.js that a one-string change could alter with every
// other test still green (issue #226): the canvas backing size on a high-density
// screen, shield, smoke and beam times, the hit stop gap, move damage and ranges,
// grab reach, leg hit radii, the same-level check, jump and ragdoll physics, the
// slam shake, music smoothing, ledge snapping, lightning and grab depth and height
// checks, the knockout hit stop, fighter colors, and item pickup and seeking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';
// Code run at the end of main.js that also exposes the internals these tests drive or read
const EXPOSE = 'window.__in = { hitStop, quake, hitTest, altFits, makeRag, stepRag, RAG_H, platformAlt, seekItem, L,\n' +
  '  get freeze() { return freeze; }, get shake() { return shake; } };';

// Loads the wallpaper with a seeded Math.random (mulberry32, see #161). Returns its debug
// hook, the exposed internals, the settings listener, the audio listeners, the canvas, the
// setTransform calls made so far and a function that runs one frame 16 ms after the last.
function load(search, { seed = 226, dpr = 1 } = {}) {
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const transforms = [];
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'setTransform' ? (...a) => transforms.push(a) : stub,
    set: () => true,
  });
  const listeners = [];
  let next = null, now = 0;
  const { window, canvas } = loadMain({
    search, dpr, ctx, random: mulberry32(seed), expose: EXPOSE,
    window: { wallpaperRegisterAudioListener: cb => listeners.push(cb) },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
  });
  return {
    game: window.__stickmanBrawl, inner: window.__in, we: window.wallpaperPropertyListener, listeners,
    canvas, transforms, frame: () => next(now += 16),
  };
}

// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 100, cool: 99, target: null, ...o });
  f.W = f.joints();
}
const special = (game, id) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const move = (game, id) => game.MOVES.find(m => m.id === id) || special(game, id);

test('on a 2x screen the canvas has twice the pixels and draws at twice the scale', () => {
  const { canvas, transforms, frame } = load('?count=2', { dpr: 2 });
  assert.equal(canvas.width, 2560);
  assert.equal(canvas.height, 1440);
  assert.equal(canvas.style.width, '1280px');
  assert.equal(canvas.style.height, '720px');
  transforms.length = 0;
  frame();
  assert.ok(transforms.length > 0, 'no transform set');
  assert.ok(transforms.some(a => a.join() === '2,0,0,2,0,0'), 'the screen transform is not 2x');
  for (const a of transforms) assert.ok(a[0] >= 2 && a[3] >= 2, 'a transform draws below 2x: ' + a.join());
});

// Runs fighter a alone with the move id until its phase leaves ph, and returns how long that took
function phaseTime(id, ph) {
  const { game } = load('?count=2&mode=ffa');
  const [a, e] = game.fighters;
  hold(e, { x: 1100, z: 50, facing: -1 });
  hold(a, { x: 300, z: 50, facing: 1, state: 'idle', target: e });
  a.startMove(move(game, id), true);
  let t = 0, start = null;
  for (let i = 0; i < 600 && a.move; i++) {
    if (a.md.ph === ph && start === null) start = t;
    if (start !== null && a.md.ph !== ph) return t - start;
    a.W = a.joints(); a.update(1 / 60); t += 1 / 60;
  }
  // A smoke escape ends the move straight from its out phase
  if (start !== null && !a.move) return t - start;
  assert.fail(id + ' never left phase ' + ph);
}

test('a shield stays up 1.1 s, a smoke escape hides 0.3 s and a beam fires 0.65 s', () => {
  for (const [id, ph, want] of [['shield', 'up', 1.1], ['smoke', 'out', 0.3], ['beam', 'fire', 0.65]]) {
    const t = phaseTime(id, ph);
    assert.ok(Math.abs(t - want) <= 1 / 60 + 1e-9, id + ' ' + ph + ' lasted ' + t.toFixed(3) + ' s, not ' + want);
  }
});

test('after a hit stop the fight runs 12 times as long before the next one can start', () => {
  const run = gap => {
    const { game, inner, frame } = load('?count=2&mode=ffa');
    const still = () => { for (const f of game.fighters) hold(f, { x: f.id ? 900 : 300, z: 50, hp: 1e6 }); game.shots.length = 0; };
    still(); frame();
    inner.hitStop(0.1);
    // 0.1 s paused, then gap seconds of fight
    for (let t = 0; t < 0.1 + gap - 1e-9; t += 0.016) { still(); frame(); }
    inner.hitStop(0.05);
    return inner.freeze;
  };
  assert.equal(run(0.9), 0, 'a hit stop started 0.9 s after a 0.1 s one');
  assert.ok(run(1.4) > 0, 'no hit stop started 1.4 s after a 0.1 s one');
});

test('move damage', () => {
  const { game } = load('?count=2');
  const want = { jab: 4, beam: 22, barrage: 1.4, ice: 5, shuriken: 3 };
  for (const [id, dmg] of Object.entries(want)) assert.equal(move(game, id).dmg, dmg, id);
});

test('move ranges, and a grab reaches as far as its reach and 0.6 of its lunge', () => {
  const { game } = load('?count=2');
  assert.deepEqual([...move(game, 'dive').range], [60, 480]);
  assert.deepEqual([...move(game, 'teleport').range], [110, 9999]);
  const grabs = game.MOVES.filter(m => m.grab);
  assert.ok(grabs.length >= 4);
  for (const m of grabs) assert.deepEqual([...m.range], [2, m.reach + m.lunge * 0.6], m.id);
  assert.equal(move(game, 'seoinage').range[1], 32);
});

test('a strike 5 px off a thigh or 4 px off a shin hits the leg', () => {
  const { inner } = load('?count=2');
  const J = { head: { x: 0, y: -200 }, sh: { x: 0, y: -30 }, hip: { x: 0, y: 0 },
    kF: { x: 10, y: 20 }, kB: { x: -10, y: 20 }, fF: { x: 10, y: 40 }, fB: { x: -10, y: 40 } };
  const at = (x, y) => inner.hitTest({ x, y }, { x, y }, J);
  // 5 px from the middle of the front thigh, away from the body and the other leg
  const n = 5 / Math.hypot(2, 1);
  assert.equal(at(5 + 2 * n, 10 - n), 'leg', 'missed 5 px off the thigh');
  assert.equal(at(14, 30), 'leg', 'missed 4 px off the shin');
  assert.equal(at(16, 30), null, 'hit 6 px off the shin');
});

test('a same-level special fits only a target less than 35 px above or below', () => {
  const { inner } = load('?count=2');
  const m = { sameAlt: true };
  assert.equal(inner.altFits({ alt: 0 }, m, { alt: 30 }), true);
  assert.equal(inner.altFits({ alt: 0 }, m, { alt: 40 }), false);
  assert.equal(inner.altFits({ alt: 60 }, m, { alt: 0 }), false);
});

test('a fighter in the air falls at 1400 px/s²', () => {
  const { game } = load('?count=2&mode=ffa');
  const [a, e] = game.fighters;
  hold(e, { x: 1100, z: 50 });
  hold(a, { x: 300, z: 50, alt: 300 });
  a.update(1 / 60);
  assert.ok(Math.abs(a.va + 1400 / 60) < 1e-9, 'speed after 1/60 s: ' + a.va);
});

test('a ragdoll falls at 900 px/s² with 0.998 damping, and its upper body takes more of a blow', () => {
  const { game, inner } = load('?count=2&mode=ffa');
  const f = game.fighters[0];
  hold(f, { x: 600, z: 50 });
  const J = f.joints();
  const r = inner.makeRag(J, 120, -60);
  const H = inner.RAG_H;
  const weights = { head: 1, sh: 1, hip: 0.6, kF: 0.35, fF: 0.2 };
  for (const [k, w] of Object.entries(weights)) {
    const o = r.pts[k];
    assert.ok(Math.abs(o.x - o.px - 120 * w * H) < 1e-9, k + ' x speed');
    assert.ok(Math.abs(o.y - o.py + 60 * w * H) < 1e-9, k + ' y speed');
  }
  // From rest, every point falls together, so the bones never pull
  const still = inner.makeRag(J, 0, 0);
  const y0 = still.pts.hip.y;
  let v = 0, y = y0;
  for (let i = 0; i < 40; i++) {
    inner.stepRag(still, 1e6);
    v = v * 0.998 + 900 * H * H; y += v;
  }
  assert.ok(Math.abs(still.pts.hip.y - y) < 1e-6, 'fell ' + (still.pts.hip.y - y0) + ' px, not ' + (y - y0));
});

test('a slam quake shakes the screen by 10', () => {
  const { inner } = load('?count=2');
  assert.equal(inner.shake, 0);
  inner.quake(300, 300, 60);
  assert.equal(inner.shake, 10);
});

test('the music level moves a tenth of the way to the loudness each update', () => {
  const { game, we, listeners } = load('?count=2&mode=ffa');
  we.applyUserProperties({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  assert.ok(listeners.length > 0);
  for (const cb of listeners) cb(new Array(128).fill(0.25));
  assert.ok(Math.abs(game.music.level - 0.05) < 1e-9, 'level ' + game.music.level);
});

test('a platform counts as under the feet only within half a pixel above them', () => {
  const { game, inner } = load('?count=2');
  game.platforms.length = 0;
  const y = game.groundY(50) - 60;
  game.platforms.push({ x0: 100, x1: 300, y });
  assert.equal(inner.platformAlt(200, 50, y + 10), 0, 'a top 10 px above the feet');
  assert.equal(inner.platformAlt(200, 50, y + 0.4), 60, 'a top 0.4 px above the feet');
  assert.equal(inner.platformAlt(200, 50, y - 10), 60, 'a top below the feet');
});

// a casts lightning at t; f stands at the same x, dz deeper; returns f
function lightning(dz) {
  const { game, we } = load('?count=3&mode=ffa');
  we.applyUserProperties({ platforms: { value: false } });
  const [a, t, f] = game.fighters;
  hold(a, { x: 650, z: 30, facing: -1, state: 'idle', target: t });
  hold(t, { x: 400, z: 30, hp: 1000 });
  hold(f, { x: 400, z: 30 + dz, hp: 1000 });
  a.startMove(move(game, 'lightning'));
  for (let s = 0; s < 1.5 && a.move; s += 1 / 60) { for (const g of game.fighters) g.W = g.joints(); a.update(1 / 60); }
  assert.ok(t.hp < 1000, 'the bolt missed its target');
  return f;
}

test('lightning hits only a fighter within 20 px in depth of where it falls', () => {
  assert.ok(lightning(10).hp < 1000, 'missed one 10 px deeper');
  assert.equal(lightning(40).hp, 1000, 'hit one 40 px deeper');
});

// a throws e with a seoinage while e is up in the air at altitude alt; returns whether it caught
function grab(alt) {
  const { game } = load('?count=2&mode=ffa');
  const [a, e] = game.fighters;
  hold(a, { x: 300, z: 50, facing: 1, state: 'idle', target: e });
  const still = () => hold(e, { x: 318, z: 50, facing: -1, alt, hover: true });
  still();
  a.startMove(move(game, 'seoinage'));
  for (let i = 0; i < 120 && a.move && !a.hitDone; i++) { game.update(1 / 60); if (!a.hitDone) still(); }
  return !!a.hitDone;
}

test('a grab catches only a fighter within 30 px above or below', () => {
  assert.equal(grab(0), true, 'missed one on the same level');
  assert.equal(grab(60), false, 'caught one 60 px above');
});

test('a knockout hit stops the fight for 0.16 s', () => {
  const { game, inner } = load('?count=2&mode=ffa');
  const [a, e] = game.fighters;
  hold(a, { x: 300, z: 50, facing: 1 });
  hold(e, { x: 330, z: 50, facing: -1, hp: 1 });
  e.takeHit(a, move(game, 'jab'), 'body', e.bodyPoint(), {});
  assert.equal(e.alive, false, 'not knocked out');
  assert.equal(inner.freeze, 0.16);
});

test('fighters get evenly spread hues', () => {
  const { game } = load('?count=4&mode=ffa');
  assert.deepEqual([...game.fighters.map(f => f.hue)], [10, 100, 190, 280]);
});

// A heart at rest dx from a hurt fighter's hip; returns whether it was picked up
function pickup(dx) {
  const { game, we } = load('?count=2&mode=ffa');
  we.applyUserProperties({ items: { value: true }, platforms: { value: false } });
  const [a, e] = game.fighters;
  hold(a, { x: 400, z: 50, hp: 50 });
  hold(e, { x: 1100, z: 50 });
  game.items.length = 0;
  const it = game.spawnItem('heart', a.W.hip.x + dx, 50, 0);
  it.rest = true;
  game.update(1 / 60);
  return !game.items.includes(it);
}

test('an item is picked up from at most 16 px away', () => {
  assert.equal(pickup(10), true, 'not picked up from 10 px');
  assert.equal(pickup(30), false, 'picked up from 30 px');
});

// A hurt idle fighter, an enemy ex away and a heart ix away; returns whether it walks to the heart
function seeks(ex, ix) {
  const { game, we, inner } = load('?count=2&mode=ffa');
  we.applyUserProperties({ items: { value: true }, platforms: { value: false } });
  const [a, e] = game.fighters;
  hold(a, { x: 500, z: 50, hp: 50, state: 'idle' });
  hold(e, { x: 500 + ex, z: 50 });
  game.items.length = 0;
  const it = game.spawnItem('heart', 500 - ix, 50, 0);
  it.rest = true;
  inner.seekItem(a, 1 / 60);
  return a.vx !== 0;
}

test('an idle fighter with no enemy within 130 px walks to an item within 320 px', () => {
  assert.equal(seeks(200, 200), true, 'did not walk to an item 200 px away with the enemy 200 px away');
  assert.equal(seeks(100, 200), false, 'walked to an item with an enemy 100 px away');
  assert.equal(seeks(400, 400), false, 'walked to an item 400 px away');
});
