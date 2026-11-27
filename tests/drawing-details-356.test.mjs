// Pins drawing details whose removal left every other test green: the beam, the bolt and the
// flame, the charge glows, the lightning mark, health bars, trails, auras, clones, cracks, smoke,
// speed lines, rings, head gear, backdrop panels and dots, name tags, screen shake and the
// click blast (issue #356).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A 2D context that logs every method call as [name, ...args] and every property set as
// ['=name', value]; methods return the same recorder, so gradients log their stops too.
// measureText gives the width the test asks for.
function recorder(log, textWidth) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? () => ({ width: textWidth() }) : (...args) => { log.push([k, ...args]); return self; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}

// Loads the wallpaper with a recording screen and offscreen canvases. Math.random is a seeded
// generator (mulberry32), so every run draws the same numbers.
function load({ query = '?count=2', seed = 1 } = {}) {
  const screen = [], made = [], listeners = {};
  const text = { width: 40 };
  const canvas = { getContext: () => recorder(screen, () => text.width), style: {}, width: 0, height: 0 };
  const document = {
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log, () => text.width); made.push(c); return c; },
  };
  let next = null;
  const { window } = loadMain({
    stiff: true,   // pins drawing against f.W
    search: query, canvas, document,
    window: { addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
    random: mulberry32(seed),
  });
  const game = window.__stickmanBrawl;
  let t = 0, clickAt = 0;
  return {
    game, screen, made, text,
    we: window.wallpaperPropertyListener,
    // Runs n animation frames of ms each
    frames: (n = 1, ms = 16) => { for (let i = 0; i < n; i++) { t += ms; screen.length = 0; next(t); } },
    render: () => { screen.length = 0; game.render(); },
    // A click in world units, its time stamp apart from the frame clock
    click: (x, y) => { for (const f of listeners.pointerdown) f({ button: 0, clientX: x * S, clientY: y * S, timeStamp: (clickAt += 1000) }); },
  };
}
const S = 720 / 540;   // World to screen scale at 1280 x 720 and figure size 100%
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// Index of the first place where the log has these entries in a row; a function entry tests one
function seq(log, items, from = 0) {
  outer: for (let i = from; i + items.length <= log.length; i++) {
    for (let j = 0; j < items.length; j++) {
      const it = items[j], e = log[i + j];
      if (typeof it === 'function' ? !it(e) : JSON.stringify(e) !== JSON.stringify(it)) continue outer;
    }
    return i;
  }
  return -1;
}
// A stroked path through the given points, as path() draws it
const pathSteps = pts => [['beginPath'], ['moveTo', pts[0].x, pts[0].y], ...pts.slice(1).map(p => ['lineTo', p.x, p.y]), ['stroke']];
const pathAt = (log, pts, from = 0) => seq(log, pathSteps(pts), from);
const torsoAt = (log, f) => pathAt(log, [f.W.hip, f.W.sh, f.W.head]);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const isAlpha = a => e => e[0] === '=globalAlpha' && near(e[1], a);
// The last value set for a property before index i
const lastSet = (log, name, i) => { for (let j = i - 1; j >= 0; j--) if (log[j][0] === '=' + name) return log[j][1]; };

// A loaded fight two frames in, with the effects list emptied
function fight(opts) {
  const w = load(opts);
  w.frames(2);
  w.game.fx.length = 0;
  return w;
}
const addFx = (w, o) => { w.game.fx.push({ t: 0, dur: 1, ...o }); return o; };

// ---------- The beam, the bolt and the flame ----------
test('a firing energy beam is drawn as three strokes from its origin to its end, with two glows (#356)', () => {
  const w = fight();
  const f = w.game.fighters[0];
  f.move = w.game.SUPER.find(m => m.id === 'beam');
  const O = { x: 100, y: 200 }, E = { x: 600, y: 210 };
  f.md = { ph: 'fire', w: 6, O, E };
  w.render();
  const widths = [];
  for (let i = pathAt(w.screen, [O, E]); i >= 0; i = pathAt(w.screen, [O, E], i + 1)) widths.push(lastSet(w.screen, 'lineWidth', i));
  assert.deepEqual(widths.map(x => +x.toFixed(6)), [16.8, 10.2, 4.8], 'beam strokes');
  assert.ok(w.screen.some(e => e[0] === 'arc' && e[1] === O.x && e[2] === O.y && near(e[3], 7.8)), 'no glow at the origin');
  assert.ok(w.screen.some(e => e[0] === 'arc' && e[1] === E.x && e[2] === E.y && e[3] >= 10.8 && e[3] <= 16.8), 'no glow at the end');
});

test('a lightning bolt is drawn along its points, wide in its color and thin in white (#356)', () => {
  const w = fight();
  const pts = [[300, 0], [310, 100], [295, 200], [305, 300]];
  addFx(w, { type: 'bolt', col: '#99ddff', pts });
  w.render();
  const steps = [['beginPath'], ['moveTo', ...pts[0]], ...pts.slice(1).map(p => ['lineTo', ...p]), ['stroke']];
  const a = seq(w.screen, steps), b = a < 0 ? -1 : seq(w.screen, steps, a + 1);
  assert.ok(a >= 0 && b >= 0, 'the bolt is not drawn twice');
  assert.deepEqual([lastSet(w.screen, 'lineWidth', a), lastSet(w.screen, 'strokeStyle', a)], [7, '#99ddff']);
  assert.deepEqual([lastSet(w.screen, 'lineWidth', b), lastSet(w.screen, 'strokeStyle', b)], [2.5, '#ffffff']);
});

test('a flame is drawn as five tongues of fire (#356)', () => {
  const w = fight();
  addFx(w, { type: 'flame', x: 500, y: 400 });
  w.render();
  for (let i = 0; i < 5; i++) {
    const x = 500 + (i - 2) * 5;
    const k = seq(w.screen, [['beginPath'], ['moveTo', x - 4, 400], e => e[0] === 'quadraticCurveTo' && e[3] === x + 4 && e[4] === 400, ['fill']]);
    assert.ok(k >= 0, 'no tongue ' + i);
  }
});

// ---------- Charge glows ----------
for (const [id, list, r0, r1] of [['fireball', 'MAGIC', 16, 19.2], ['beam', 'SUPER', 18, 21.6]]) {
  test('charging a ' + id + ' draws a growing glow between the hands (#356)', () => {
    const w = fight();
    const f = w.game.fighters[0];
    f.move = w.game[list].find(m => m.id === id);
    assert.ok(f.move, 'no ' + id + ' move');
    f.md = { ph: 'charge' }; f.st = 2;
    w.render();
    const H = mid(f.W.hF, f.W.hB);
    const glow = w.screen.find(e => e[0] === 'arc' && near(e[1], H.x) && near(e[2], H.y) && e[3] >= r0 - 1e-9 && e[3] <= r1 + 1e-9);
    assert.ok(glow, 'no glow at the hands');
    assert.ok(w.screen.some(e => e[0] === 'createRadialGradient' && near(e[1], H.x) && near(e[6], glow[3])), 'no gradient');
  });
}

test('the lightning mark is a ring as wide as the strike hits, 24 (#356)', () => {
  const w = fight();
  addFx(w, { type: 'mark', x: 400, y: 450, col: '#99ddff' });
  w.render();
  assert.ok(w.screen.some(e => e[0] === 'ellipse' && e[1] === 400 && e[2] === 450 && e[3] === 24 && e[4] === 5));
});

// ---------- Health bars ----------
// The health bar's two rects for a fighter whose head is at hx: [background, fill]
const bars = (w, hx) => w.screen.filter(e => e[0] === 'fillRect' && near(e[1], hx - 13) && e[4] === 2.5);

test('no health bar is drawn over a knocked-out body (#356)', () => {
  const w = fight();
  w.game.cfg.showHP = true;
  const f = w.game.fighters[1];
  w.render();
  assert.equal(bars(w, f.W.head.x).length, 2, 'no bar while alive');
  f.state = 'ko';
  w.render();
  assert.equal(bars(w, f.W.head.x).length, 0);
});

test('a health bar below zero health is empty, not negative (#356)', () => {
  const w = fight();
  w.game.cfg.showHP = true;
  const f = w.game.fighters[1];
  f.hp = -30;
  w.render();
  const [, fill] = bars(w, f.W.head.x);
  assert.ok(fill, 'no bar');
  assert.equal(fill[3], 0);
});

test('a health bar stays 30 above the hip when the head is lower (#356)', () => {
  const w = fight();
  w.game.cfg.showHP = true;
  const f = w.game.fighters[1];
  f.W.head = { x: f.W.head.x, y: f.W.hip.y };
  w.render();
  const [back] = bars(w, f.W.head.x);
  assert.ok(back, 'no bar');
  assert.ok(near(back[2], f.W.hip.y - 30 - 17), 'bar at y = ' + back[2]);
});

// ---------- Fighter extras ----------
test('afterimages fade with their fighter (#356)', () => {
  const w = fight();
  const f = w.game.fighters[0];
  f.alpha = 0.5;
  f.trail = [{ p: f.W, life: 1 }];
  w.render();
  assert.ok(seq(w.screen, [isAlpha(0.15), ...pathSteps([f.W.hip, f.W.sh, f.W.head])]) >= 0, 'no afterimage at alpha 0.15');
});

test('a knocked-out fighter draws no aura (#356)', () => {
  const w = fight();
  const f = w.game.fighters[0];
  w.render();
  const calm = w.screen.filter(e => e[0] === 'quadraticCurveTo').length;
  f.aura = 1; f.state = 'ko';
  w.render();
  assert.equal(w.screen.filter(e => e[0] === 'quadraticCurveTo').length, calm);
});

test('a shadow clone in the air is drawn at its altitude (#356)', () => {
  const w = fight();
  const f = w.game.fighters[0];
  f.move = w.game.NINJA.find(m => m.id === 'clones');
  f.md = { clones: [{ x: 300, alt: 50, fac: 1, a: 1 }] };
  w.render();
  const J = f.W, at = p => ({ x: 300 + (p.x - f.x), y: p.y - 50 });
  assert.ok(pathAt(w.screen, [at(J.hip), at(J.sh), at(J.head)]) >= 0);
});

// ---------- Head gear ----------
// The strokes drawHeadgear makes for fighter i, the only one drawn
function gearPaths(w, i) {
  w.game.fighters.forEach((f, k) => { f.invis = k !== i; });
  w.render();
  const start = seq(w.screen, [['=lineWidth', 2], ['=lineCap', 'round'], ['=lineJoin', 'round'], e => e[0] === '=globalAlpha']);
  assert.ok(start >= 0, 'no head gear drawn');
  const out = [];
  let k = start + 4;
  while (w.screen[k] && w.screen[k][0] === 'beginPath' && w.screen[k + 1][0] === 'moveTo') {
    const pts = [];
    let j = k + 1;
    for (; w.screen[j][0] === 'moveTo' || w.screen[j][0] === 'lineTo'; j++) pts.push(w.screen[j].slice(1));
    if (w.screen[j][0] !== 'stroke') break;
    out.push(pts);
    k = j + 1;
  }
  return out;
}

test('the mask has two eye slits and a knot; the cap a brim and a button (#356)', () => {
  const w = fight({ query: '?count=3' });
  w.game.cfg.headgear = true;
  assert.equal(w.game.gearOf(w.game.fighters[1]), 'mask');
  assert.equal(w.game.gearOf(w.game.fighters[2]), 'cap');
  assert.equal(gearPaths(w, 1).length, 3, 'mask strokes');
  assert.equal(gearPaths(w, 2).length, 2, 'cap strokes');
});

test('the headband tails wave over time (#356)', () => {
  const w = fight();
  w.game.cfg.headgear = true;
  const f = w.game.fighters[0];
  assert.equal(w.game.gearOf(f), 'headband');
  f.time = 0;
  const a = gearPaths(w, 0);
  f.time = 0.15;
  const b = gearPaths(w, 0);
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], b[0], 'the band itself moved');
  assert.notDeepEqual(a[1], b[1], 'the first tail does not wave');
  assert.notDeepEqual(a[2], b[2], 'the second tail does not wave');
});

// ---------- Cracks, smoke, speed lines and rings ----------
test('a crack is drawn under the fighters, a floor crack with a shadow (#356)', () => {
  const w = fight();
  addFx(w, { type: 'crack', kind: 'ground', x: 420, y: 460, size: 60, lines: [[[420, 460], [440, 462]]] });
  w.render();
  const line = seq(w.screen, [['beginPath'], ['moveTo', 420, 460], ['lineTo', 440, 462], ['stroke']]);
  assert.ok(line >= 0, 'no crack drawn');
  for (const f of w.game.fighters) assert.ok(line < torsoAt(w.screen, f), 'the crack is drawn over fighter ' + f.id);
  assert.ok(w.screen.some(e => e[0] === 'ellipse' && e[1] === 420 && e[2] === 460 && near(e[3], 21) && near(e[4], 4.8)), 'no shadow');
});

test('a smoke puff is drawn over the fighters and fades (#356)', () => {
  const w = fight();
  addFx(w, { type: 'puff', t: 0.5, x: 200, y: 300, balls: [{ dx: 0, dy: 0, r: 10 }] });
  w.render();
  const ball = w.screen.findIndex(e => e[0] === 'arc' && e[1] === 200 && near(e[2], 295) && near(e[3], 10));
  assert.ok(ball >= 0, 'no smoke drawn');
  for (const f of w.game.fighters) assert.ok(ball > torsoAt(w.screen, f), 'the smoke is under fighter ' + f.id);
  assert.ok(near(lastSet(w.screen, 'globalAlpha', ball), 0.5), 'smoke alpha ' + lastSet(w.screen, 'globalAlpha', ball));
});

test('speed lines are drawn under a white flash (#356)', () => {
  const w = fight();
  w.game.cfg.reduceMotion = false;
  addFx(w, { type: 'flash' });
  addFx(w, { type: 'focus', t: 0.3, x: 480, y: 270 });
  w.render();
  const lines = w.screen.findIndex(isAlpha(0.35 * 0.7));
  const flash = w.screen.findIndex(e => e[0] === 'fillRect' && e[1] === -50 && e[2] === -50);
  assert.ok(lines >= 0 && flash >= 0, 'not drawn');
  assert.ok(lines < flash, 'the speed lines are drawn over the flash');
});

test('a ring is drawn in its own color, else in white (#356)', () => {
  for (const [col, want] of [['#ff3355', '#ff3355'], [undefined, '#ffffff']]) {
    const w = fight();
    addFx(w, { type: 'ring', x: 333, y: 222, r0: 10, r1: 40, w: 3, col });
    w.render();
    const i = w.screen.findIndex(e => e[0] === 'arc' && e[1] === 333 && e[2] === 222 && e[3] === 10);
    assert.ok(i >= 0, 'no ring');
    assert.equal(lastSet(w.screen, 'strokeStyle', i), want);
  }
});

// ---------- Backdrops ----------
function backdrop(theme) {
  const w = load();
  w.game.bg.now = () => new Date(2026, 0, 1, 12, 0);
  w.we.applyUserProperties({ backgroundtheme: { value: theme } });
  w.frames();
  return w.made.find(c => c.log.length).log;
}

test('the dojo wall has lighter panels (#356)', () => {
  const log = backdrop('dojo');
  const pw = Math.max(80, 1280 / 7);
  const panels = log.filter((e, i) => e[0] === 'fillRect' && near(e[3], pw * 0.8) && near(e[2], 720 * 0.08) && lastSet(log, 'fillStyle', i) === '#29231a');
  assert.ok(panels.length >= 5, panels.length + ' panels');
});

test('the comic dots grow with distance from the centre, up to 4 (#356)', () => {
  const log = backdrop('comic');
  const cx = 640, cy = 360, r = Math.hypot(1280, 720);
  const dots = log.filter(e => e[0] === 'arc');
  assert.ok(dots.length > 100, dots.length + ' dots');
  for (const [, x, y, rad] of dots) assert.ok(near(rad, Math.min(4, Math.hypot(x - cx, y - cy) / (r / 2) * 3.2)), 'dot at ' + x + ',' + y + ' of ' + rad);
  assert.ok(dots.some(e => e[3] < 3), 'no small dots');
});

// ---------- Name tags ----------
test('a long name tag beside the bar at the top stays inside the left wall (#356)', () => {
  const w = fight();
  w.we.applyUserProperties({ fighternames: { value: 'Somebody' } });
  w.text.width = 2000;
  const f = w.game.fighters[0];
  f.W.head = { x: f.W.head.x, y: 10 };
  w.render();
  const tag = w.screen.find(e => e[0] === 'fillText' && e[1] === 'Somebody');
  assert.ok(tag, 'no name tag');
  assert.equal(tag[2], 0);
});

// ---------- Screen shake and the click blast ----------
test('screen shake goes on until it falls under 0.3 (#356)', () => {
  const w = fight();
  Object.assign(w.game.cfg, { reduceMotion: false, clickBlast: true, speed: 0 });
  w.click(40, 40);
  const shaken = [];
  for (let i = 0; i < 40; i++) {
    w.frames();
    const t = w.screen.find(e => e[0] === 'setTransform' && near(e[1], S));
    shaken.push(t[5] !== 0 || t[6] !== 0);
  }
  // From 9, shake falls to 0.3 after about 33 frames of 16 ms, and under 1 after about 21
  assert.ok(shaken.slice(22, 31).every(Boolean), 'shake stops early: ' + shaken.map(Number).join(''));
  assert.ok(!shaken.slice(36).some(Boolean), 'shake never stops');
});

test('a click blast launches a fighter harder the closer it is, up to 800 (#356)', () => {
  const w = fight();
  w.game.cfg.clickBlast = true;
  const f = w.game.fighters[0];
  const c = f.bodyPoint();
  w.click(c.x - 60, c.y);
  assert.equal(f.state, 'launched');
  assert.ok(near(f.vx, 260 + 540 * 0.6, 1e-6), 'vx ' + f.vx);
});

test('a click blast pushes ragdoll points up to 150 away (#356)', () => {
  const w = fight();
  w.game.cfg.clickBlast = true;
  const f = w.game.fighters[0];
  f.state = 'down'; f.st = 0; f.downDur = 99; f.hp = 0; f.koPending = true;
  w.game.update(0.001);
  assert.ok(f.rag, 'no ragdoll');
  const pts = Object.values(f.rag.pts);
  const x = Math.max(...pts.map(o => o.x)) + 120, y = f.rag.pts.hip.y;
  const far = pts.filter(o => { const d = Math.hypot(o.x - x, o.y - y); return d > 100 && d < 150; });
  assert.ok(far.length > 0, 'no point between 100 and 150 away');
  const before = far.map(o => [o.px, o.py]);
  w.click(x, y);
  far.forEach((o, i) => assert.notDeepEqual([o.px, o.py], before[i], 'a point ' + Math.hypot(o.x - x, o.y - y) + ' away was not pushed'));
});
