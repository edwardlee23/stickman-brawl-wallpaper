// Runs main.js in a node:vm sandbox with a recording canvas and drives its animation frames,
// to pin rules of the frame loop and of drawing that could break with every test green
// (issue #185): pausing, the cap on a frame's time, screen shake, speed lines under Reduce
// motion, the health bar of a King, and the fades of name tags and the win banner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// A copy of main.js that hands its screen shake and impact() to the test as window.__in
const END = /requestAnimationFrame\(frame\);\s*\}\)\(\);\s*$/;
const hooked = source.replace(END, m => 'window.__in = { get shake() { return shake; }, set shake(v) { shake = v; }, impact };\n' + m);

// Loads the wallpaper with a seeded Math.random (an LCG, issue #161). calls records every
// canvas method called, with its arguments and the globalAlpha last assigned before it.
function load(search = '?count=2&mode=ffa') {
  const calls = [];
  let alpha = 1;
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'globalAlpha' ? alpha : (...a) => { calls.push({ k, a, alpha }); return grad; },
    set: (_, k, v) => { if (k === 'globalAlpha') alpha = v; return true; },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  let next = null;
  const M = Object.create(Math);
  let s = 1;
  M.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: M, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(hooked, window);
  const game = window.__stickmanBrawl;
  return {
    game, calls,
    we: window.wallpaperPropertyListener,
    frame: now => next(now),
    draws: () => calls.filter(c => c.k === 'fillRect' && c.a[0] === 0 && c.a[1] === 0 && c.a[2] === 1280 && c.a[3] === 720).length,
    inside: window.__in,
  };
}

// Holds every fighter in a long flinch, so nobody attacks, no hit stop eats game time and
// the round never ends
function hold(game) {
  for (const f of game.fighters) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0 });
}

test('the test hook finds the end of main.js', () => assert.match(source, END));

test('a paused wallpaper neither simulates nor draws, and picks up without a jump', () => {
  const { game, we, frame, draws } = load();
  const f = game.fighters[0];
  let now = 0;
  for (let i = 0; i < 60; i++) { hold(game); frame(now += 1000 / 60); }
  we.setPaused(true);
  const t0 = f.time, d0 = draws();
  for (let i = 0; i < 120; i++) { hold(game); frame(now += 1000 / 60); }
  assert.equal(f.time, t0, 'game time ran while paused');
  assert.equal(draws(), d0, 'drew while paused');
  we.setPaused(false);
  hold(game);
  frame(now += 1000 / 60);
  const ran = f.time - t0;
  assert.ok(ran > 0 && ran < 0.05, `the first frame after the pause ran ${ran.toFixed(3)} s`);
});

test('game time keeps up with real time at 5 frames a second', () => {
  const { game, frame } = load();
  const f = game.fighters[0];
  hold(game);
  const t0 = f.time;
  for (let i = 1; i <= 50; i++) { hold(game); frame(i * 200); }
  const ran = f.time - t0;
  assert.ok(Math.abs(ran - 10) < 0.2, `10 s of real time at 5 fps ran ${ran.toFixed(2)} s of game time`);
});

test('screen shake dies away within a second with Reduce motion off', () => {
  const { game, we, frame, inside } = load();
  we.applyUserProperties({ reducemotion: { value: false } });
  inside.shake = 13;
  let now = 0;
  for (let i = 0; i < 6; i++) { hold(game); frame(now += 1000 / 60); }
  assert.ok(inside.shake > 0.3, 'the shake stopped at once');
  for (let i = 0; i < 60; i++) { hold(game); frame(now += 1000 / 60); }
  assert.equal(inside.shake, 0);
});

// The fill() calls a frame draws, with a speed-line effect just started or none
function fills(reduceMotion, focus) {
  const { game, we, calls } = load();
  we.applyUserProperties({ reducemotion: { value: reduceMotion } });
  hold(game);
  for (const f of game.fighters) f.W = f.joints();
  game.fx.length = 0;
  if (focus) game.fx.push({ type: 'focus', x: 400, y: 300, dur: 0.28, t: 0 });
  calls.length = 0;
  game.render();
  return calls.filter(c => c.k === 'fill').length;
}

test('a big hit draws speed lines, and Reduce motion hides them', () => {
  const { game, we, inside } = load();
  we.applyUserProperties({ reducemotion: { value: false } });
  inside.impact(400, 300, true);
  assert.ok(game.fx.some(o => o.type === 'focus'), 'a big hit started no speed lines');
  assert.ok(fills(false, true) - fills(false, false) >= 40, 'no speed lines drawn with Reduce motion off');
  assert.equal(fills(true, true), fills(true, false), 'speed lines drawn with Reduce motion on');
});

test('a King\'s health bar is as wide as anyone\'s at full health, and half as wide at half', () => {
  const { game, calls } = load();
  hold(game);
  const k = game.fighters[0];
  Object.assign(k, { king: true, maxHp: 200, hp: 200 });
  const widths = () => {
    for (const f of game.fighters) f.W = f.joints();
    calls.length = 0;
    game.render();
    // Each bar is a 26-wide back and a front as wide as the health left
    return calls.filter(c => c.k === 'fillRect' && c.a[3] === 2.5).map(c => c.a[2]);
  };
  game.fighters[1].hp = 100;
  assert.deepEqual(widths().sort((a, b) => a - b), [26, 26, 26, 26]);
  k.hp = 100;
  assert.deepEqual(widths().sort((a, b) => a - b), [13, 26, 26, 26]);
});

test('a name tag fades with its fighter', () => {
  const { game, we, calls } = load();
  we.applyUserProperties({ fighternames: { value: 'ann' } });
  hold(game);
  const f = game.fighters[0];
  for (const g of game.fighters) g.W = g.joints();
  f.alpha = 0.4;
  calls.length = 0;
  game.render();
  const tag = calls.find(c => c.k === 'fillText' && c.a[0] === 'ann');
  assert.ok(tag, 'no name tag drawn');
  assert.ok(Math.abs(tag.alpha - 0.85 * 0.4) < 1e-9, `tag drawn at alpha ${tag.alpha}`);
});

test('the win banner is drawn solid, then fades out over the last second of the round', () => {
  const { game, calls } = load();
  for (const f of game.fighters) f.W = f.joints();
  for (const f of game.fighters) if (f.id !== 0) { f.hp = 0; f.ko(0, 0); }
  game.checkRound(0);
  const text = game.winnerText;
  assert.ok(text, 'the round did not end');
  const banner = () => {
    calls.length = 0;
    game.render();
    const c = calls.find(c => c.k === 'fillText' && c.a[0] === text);
    assert.ok(c, 'no win banner drawn');
    return c.alpha;
  };
  assert.equal(banner(), 1);
  game.update(4);
  assert.ok(Math.abs(banner() - 0.5) < 1e-9, 'not half faded half a second before the next round');
});
