// Pins main-loop and themed-backdrop rules that no other test saw: where the painted floor
// lands, a backdrop painted at high DPI, the Day and night phase bounds, the substep size,
// the shake decay, a hidden fighter's shadow, the draw order and Click to blast on bodies
// (issue #273).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// A 2D context that logs every method call as [name, ...args] and every property set as
// ['=name', value]; methods return the same recorder, so gradients log their stops too.
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : (...args) => { log.push([k, ...args]); return self; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}

// Loads the wallpaper with a recording screen and offscreen canvases. Math.random returns
// random.value, so every run draws the same numbers; frame(ms) runs one animation frame.
function load({ query = '?count=2', dpr = 1 } = {}) {
  const screen = [], made = [], listeners = {};
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  const document = {
    getElementById: () => canvas, body: { style: {} },
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); made.push(c); return c; },
  };
  const random = { value: 0.5 };
  let next = null;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: dpr,
    addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } };
  Object.assign(window, {
    window, document, location: { search: query }, URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: Object.assign(Object.create(Math), { random: () => random.value }),
    Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  const game = window.__stickmanBrawl;
  return {
    game, screen, made, listeners, random,
    we: window.wallpaperPropertyListener,
    frame: ms => { screen.length = 0; next(ms); },
    render: () => { screen.length = 0; game.render(); },
  };
}
const S = 720 / 540;   // World to screen scale at 1280 x 720 and figure size 100%

// ---------- Backdrop ----------
for (const [theme, ground] of [['dojo', '#17120c'], ['rooftop', '#0c0d12'], ['daynight', '#0c0d12']]) {
  test(`the ${theme} backdrop paints its floor from the world floor line`, () => {
    const w = load();
    w.game.bg.now = () => new Date(2026, 0, 1, 12, 0);
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    w.frame(16);
    const log = w.made.find(c => c.log.length).log;
    const F = w.game.groundY(0) * S;
    const i = log.findIndex(([k, x, y, cw, ch]) => k === 'fillRect' && x === 0 && Math.abs(y - F) < 1e-9 && cw === 1280 && Math.abs(ch - (720 - F)) < 1e-9);
    assert.ok(i > 0, `no floor fill from y = ${F}`);
    assert.deepEqual(log[i - 1], ['=fillStyle', ground]);
  });
}

test('at device pixel ratio 2 the backdrop cache is painted scaled, so it covers the whole cache', () => {
  const w = load({ dpr: 2 });
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' } });
  w.frame(16);
  const cache = w.made.find(c => c.log.length);
  assert.deepEqual([cache.width, cache.height], [2560, 1440]);
  const first = cache.log.findIndex(([k]) => k === 'fillRect');
  assert.deepEqual(cache.log[first], ['fillRect', 0, 0, 1280, 720]);
  const tf = cache.log.slice(0, first).filter(([k]) => k === 'setTransform').pop();
  assert.deepEqual(tf, ['setTransform', 2, 0, 0, 2, 0, 0], 'the 1280 x 720 fill covers only a quarter of the cache');
  assert.ok(w.screen.some(([k, img, x, y, dw, dh]) => k === 'drawImage' && img === cache && x === 0 && y === 0 && dw === 1280 && dh === 720));
});

test('Day and night changes phase at 5:00, 7:30, 18:00 and 20:30', () => {
  const { bg } = load().game;
  const at = (h, m) => bg.skyPhase(new Date(2026, 0, 1, h, m));
  assert.deepEqual([at(4, 59), at(5, 0)], ['night', 'dawn']);
  assert.deepEqual([at(7, 29), at(7, 30)], ['dawn', 'day']);
  assert.deepEqual([at(17, 59), at(18, 0)], ['day', 'dusk']);
  assert.deepEqual([at(20, 29), at(20, 30)], ['dusk', 'night']);
});

// ---------- Main loop ----------
// Records the step each update of the first fighter is given
function steps(w) {
  const f = w.game.fighters[0], dts = [];
  const upd = f.update;
  f.update = function (dt) { dts.push(dt); return upd.call(this, dt); };
  return dts;
}

test('at 300% speed a 0.2 s stall is simulated in steps of at most 1/60 s', () => {
  const w = load({ query: '?count=2&speed=3' });
  w.frame(16);
  const dts = steps(w);
  w.frame(216);
  assert.ok(dts.length > 0);
  for (const dt of dts) assert.ok(dt <= 1 / 60 + 1e-9, `a step of ${dt} s`);
});

test('a slightly long 60 fps frame at 100% speed is simulated in one step', () => {
  const w = load();
  w.frame(16);
  const dts = steps(w);
  w.frame(16 + 17.5);
  assert.equal(dts.length, 1, `${dts.length} steps`);
  assert.ok(Math.abs(dts[0] - 0.0175) < 1e-9, `a step of ${dts[0]} s`);
});

test('screen shake decays to 0.0015 of itself per second', () => {
  const w = load();
  w.we.applyUserProperties({ reducemotion: { value: false }, clickblast: { value: true } });
  w.frame(16);
  for (const f of w.listeners.pointerdown) f({ button: 0, clientX: 20, clientY: 20, timeStamp: 1000 });
  w.random.value = 0.75;   // A shake offset of rand(-shake, shake) is then shake / 2
  w.frame(116);
  const tf = w.screen.find(([k, a]) => k === 'setTransform' && Math.abs(a - S) < 1e-9);
  assert.ok(tf, 'no world transform was set');
  const want = 9 * Math.pow(0.0015, 0.1) / 2;
  assert.ok(Math.abs(tf[5] - want) < 1e-6, `shake offset ${tf[5]}, want ${want}`);
});

// ---------- Render ----------
const shadowsAt = (w, x) => w.screen.filter(([k, ex]) => k === 'ellipse' && Math.abs(ex - x) < 1e-9).length;

test('a fighter hidden in smoke casts no shadow', () => {
  const w = load();
  w.frame(16);
  const f = w.game.fighters[1];
  w.render();
  assert.equal(shadowsAt(w, f.x), 1, 'a visible fighter casts one shadow');
  f.invis = true;
  w.render();
  assert.equal(shadowsAt(w, f.x), 0);
});

test('knocked-out bodies are drawn before, so under, living fighters', () => {
  const w = load();
  w.frame(16);
  const [a, b] = w.game.fighters;
  a.z = 0; b.z = 100;   // By depth alone the body would be drawn last
  b.ko(0, 0);
  w.render();
  const hip = b.rag.pts.hip.x;
  const order = w.screen.filter(([k, x]) => k === 'ellipse' && (Math.abs(x - hip) < 1e-9 || Math.abs(x - a.x) < 1e-9)).map(([, x]) => x);
  assert.deepEqual(order, [hip, a.x]);
});

test('Click to blast throws a body level with the click upward too', () => {
  const w = load();
  w.we.applyUserProperties({ clickblast: { value: true } });
  w.frame(16);
  const b = w.game.fighters[1];
  b.ko(0, 0);
  w.render();
  const hip = b.rag.pts.hip;
  hip.px = hip.x; hip.py = hip.y;
  for (const f of w.listeners.pointerdown) f({ button: 0, clientX: (hip.x - 50) * S, clientY: hip.y * S, timeStamp: 1000 });
  const vy = (hip.y - hip.py) * 120;   // Units a second; the ragdoll steps 1/120 s
  assert.ok(Math.abs(vy + 250) < 1e-6, `the hip moves at ${vy} up/down`);
  assert.ok(hip.x - hip.px > 0, 'the hip is not pushed away from the click');
});
