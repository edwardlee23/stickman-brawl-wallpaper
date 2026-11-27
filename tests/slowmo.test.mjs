// Runs main.js in a node:vm sandbox and checks the optional slow-motion finish
// (issue #90): the blow that ends a round slows game time to a quarter for
// about 1.2 s of real time and zooms in on the knocked-out fighter, unless
// "Reduce flashing and screen shake" is on; any other knockout changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain, source } from './load-main.mjs';

// A copy of main.js that adds up, in window.__sim, the game time each frame hands
// to its substeps, hit stops included
const SIM_ANCHOR = 'const n = clamp(Math.ceil(sim / SUBSTEP';
const counted = source.replace(SIM_ANCHOR, 'window.__sim += sim; ' + SIM_ANCHOR);

// Loads the wallpaper and returns its debug hook, its settings listener, a
// function that runs one animation frame at the given time in ms, the game time
// simulated so far, and the scale of the last world transform drawn
function load(search) {
  let scale = 0, most = 0, textScale = 0;
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'setTransform' ? (a, b, c, d) => { if (a !== 1) { scale = a; most = Math.max(most, a); } }
      : k === 'fillText' ? () => { textScale = scale; }
      : k === 'measureText' ? t => ({ width: String(t).length * 8 }) : stub,
    set: () => true,
  });
  let next = null;
  const { window } = loadMain({
    search, ctx, patch: () => counted,
    window: { __sim: 0 },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
    random: null,
  });
  return {
    game: window.__stickmanBrawl,
    we: window.wallpaperPropertyListener,
    frame: now => { most = 0; next(now); },
    sim: () => window.__sim,
    // the largest world transform of the last frame, and the one text was last drawn with
    scale: () => most,
    textScale: () => textScale,
  };
}

// Holds every standing fighter in a long flinch, so nobody attacks and no hit stop eats game time
function hold(game) {
  for (const f of game.fighters) if (f.alive) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0 });
}

// Starts a fight of `count` fighters with the given settings, knocks out the last
// fighter, and runs one frame so the round is checked. Returns the loaded wallpaper
// and the time of the last frame, in ms.
function knockout({ count = 2, slowmo = true, reduce = false } = {}) {
  const w = load(`?count=${count}&reducemotion=${reduce ? 1 : 0}`);
  w.we.applyUserProperties({ slowmofinish: { value: slowmo } });
  assert.ok(w.game.cfg.speed === 1);
  let t = 1000 / 60;
  hold(w.game); w.frame(t);
  const f = w.game.fighters[count - 1];
  f.hp = 0; f.ko(0, -40);
  hold(w.game); w.frame(t += 1000 / 60);
  return { ...w, t };
}

// Game time simulated by one 1/60 s frame at time t
function step(w, t) {
  const s0 = w.sim();
  hold(w.game); w.frame(t);
  return (w.sim() - s0) * 60;
}

test('the frame after a round-ending knockout runs at about a quarter speed, and full speed is back within 1.5 s', () => {
  const w = knockout();
  let t = w.t;
  const first = step(w, t += 1000 / 60);
  assert.ok(Math.abs(first - 0.25) < 0.03, `ran at ${first.toFixed(3)} of real time`);
  for (let i = 0; i < 89; i++) step(w, t += 1000 / 60);   // 1.5 s after the knockout
  const later = step(w, t += 1000 / 60);
  assert.ok(Math.abs(later - 1) < 1e-6, `still at ${later.toFixed(3)} of real time`);
});

test('a knockout that leaves more than one side standing does not slow time', () => {
  const w = knockout({ count: 3 });
  const rate = step(w, w.t + 1000 / 60);
  assert.ok(Math.abs(rate - 1) < 1e-6, `ran at ${rate.toFixed(3)} of real time`);
  assert.equal(w.game.cfg.slowmo, true);
});

test('with the setting off, a round-ending knockout changes neither time nor the view', () => {
  const w = knockout({ slowmo: false });
  const base = w.scale();
  let t = w.t;
  for (let i = 0; i < 60; i++) {
    const rate = step(w, t += 1000 / 60);
    assert.ok(Math.abs(rate - 1) < 1e-6, `ran at ${rate.toFixed(3)} of real time`);
    assert.equal(w.scale(), base);
  }
});

test('the slow-motion finish zooms in up to 1.4x toward the knocked-out fighter, then back out', () => {
  const w = knockout();
  const base = w.scale();
  let t = w.t, most = 0;
  for (let i = 0; i < 90; i++) { step(w, t += 1000 / 60); most = Math.max(most, w.scale() / base); }
  assert.ok(most > 1.3 && most <= 1.4 + 1e-9, `zoomed to ${most.toFixed(3)}x`);
  assert.equal(w.scale(), base, 'the view is back to normal after 1.5 s');
});

test('the win text and the score are drawn unzoomed while the finish zooms the fight', () => {
  const w = knockout();
  w.we.applyUserProperties({ showscore: { value: true } });
  const base = w.scale();
  let t = w.t, zoomed = false;
  for (let i = 0; i < 20; i++) {
    step(w, t += 1000 / 60);
    if (w.scale() > base * 1.1) { zoomed = true; assert.equal(w.textScale(), base); }
  }
  assert.ok(zoomed, 'the fight zoomed in');
});

test('with "Reduce flashing and screen shake" on, time slows but the view has no zoom', () => {
  const w = knockout({ reduce: true });
  const base = w.scale();
  let t = w.t;
  const first = step(w, t += 1000 / 60);
  assert.ok(first < 0.3, `ran at ${first.toFixed(3)} of real time`);
  for (let i = 0; i < 90; i++) { step(w, t += 1000 / 60); assert.equal(w.scale(), base); }
});

test('the slow-motion finish is off by default', () => {
  const w = load('?count=2');
  assert.equal(w.game.cfg.slowmo, false);
  const project = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8'));
  assert.equal(project.general.properties.slowmofinish.value, false);
});
