// Pins drawing details whose removal left every other test green: the ice shard, the shuriken,
// a staff and a boomerang on the floor, the topknot bun, the speed lines, the shield fill and
// the rooftop windows (issue #394).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

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
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const screen = [], made = [], listeners = {};
  const text = { width: 40 };
  const canvas = { getContext: () => recorder(screen, () => text.width), style: {}, width: 0, height: 0 };
  const document = {
    getElementById: () => canvas, body: { style: {} },
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log, () => text.width); made.push(c); return c; },
  };
  let next = null;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } };
  Object.assign(window, {
    window, document, location: { search: query }, URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: Object.assign(Object.create(Math), { random }),
    Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
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
// The [x, y] points of each path filled after index from: beginPath, then moveTo or lineTo
// calls, then closePath (when it has one) and fill
function filledPaths(log, from = 0) {
  const out = [];
  for (let i = from; i < log.length; i++) {
    if (log[i][0] !== 'beginPath') continue;
    const pts = [];
    let j = i + 1;
    for (; log[j] && (log[j][0] === 'moveTo' || log[j][0] === 'lineTo'); j++) pts.push(log[j].slice(1));
    if (log[j] && log[j][0] === 'closePath') j++;
    if (pts.length && log[j] && log[j][0] === 'fill') out.push({ at: i, pts });
  }
  return out;
}
// The area of a polygon, by the shoelace formula
const area = pts => Math.abs(pts.reduce((s, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return s + x * v - u * y; }, 0)) / 2;

const addFx = (w, o) => { w.game.fx.push({ t: 0, dur: 1, ...o }); return o; };

// ---------- Shots ----------
function shot(w, kind) {
  w.game.shots.length = 0;
  w.game.shots.push({ kind, x: 400, y: 300, vx: 300, vy: 0, z: 0, col: '#88ccff', life: 1, age: 0, owner: w.game.fighters[0] });
  w.render();
  const i = w.screen.findIndex(e => e[0] === '=fillStyle' && e[1] === '#88ccff');
  assert.ok(i >= 0, 'no ' + kind + ' drawn');
  const [p] = filledPaths(w.screen, i);
  assert.ok(p, 'no filled shape for the ' + kind);
  return p.pts;
}

test('an ice shard is a diamond of four points around the shot, 9 ahead and 12 behind (#394)', () => {
  const w = fight();
  const pts = shot(w, 'ice');
  assert.deepEqual(pts.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]), [[409, 300], [398, 303], [388, 300], [398, 297]]);
  assert.ok(area(pts) > 0, 'the shard has no area');
});

test('a shuriken is a star of eight points around the shot, 6.5 and 2 out in turn (#394)', () => {
  const w = fight();
  const pts = shot(w, 'star');
  assert.equal(pts.length, 8, pts.length + ' points');
  pts.forEach(([x, y], i) => assert.ok(near(Math.hypot(x - 400, y - 300), i % 2 ? 2 : 6.5, 1e-6), 'point ' + i + ' at ' + x + ',' + y));
  assert.ok(area(pts) > 0, 'the star has no area');
});

// ---------- Items on the floor ----------
// An item lying on the floor, the only one, drawn at rest with no bob
function floorItem(kind) {
  const w = fight();
  w.game.items.length = 0;
  const it = w.game.spawnItem(kind, 500, 30, 0);
  it.t = 0;
  w.render();
  return { w, x: it.x, y: w.game.groundY(it.z) - 6 };
}

test('a staff lying on the floor is drawn as a stroke 36 long (#394)', () => {
  const { w, x, y } = floorItem('staff');
  assert.ok(pathAt(w.screen, [{ x: x - 18, y: y + 3 }, { x: x + 18, y: y - 3 }]) >= 0, 'no staff drawn');
});

test('a boomerang lying on the floor is drawn as two arms meeting at its centre (#394)', () => {
  const { w, x, y } = floorItem('boomerang');
  const a = -Math.PI / 2, r = 9;
  const k = seq(w.screen, [['beginPath'],
    e => e[0] === 'moveTo' && near(e[1], x + Math.cos(a - 1) * r) && near(e[2], y + Math.sin(a - 1) * r),
    ['lineTo', x, y],
    e => e[0] === 'lineTo' && near(e[1], x + Math.cos(a + 1) * r) && near(e[2], y + Math.sin(a + 1) * r),
    ['stroke']]);
  assert.ok(k >= 0, 'no boomerang drawn');
});

// ---------- Head gear ----------
test('the topknot has a round bun at the end of its stalk (#394)', () => {
  const w = fight({ query: '?count=4' });
  w.game.cfg.headgear = true;
  const f = w.game.fighters[3];
  assert.equal(w.game.gearOf(f), 'topknot');
  w.game.fighters.forEach(g => { g.invis = g !== f; });
  w.render();
  const start = seq(w.screen, [['=lineWidth', 2], ['=lineCap', 'round'], ['=lineJoin', 'round'], e => e[0] === '=globalAlpha']);
  assert.ok(start >= 0, 'no head gear drawn');
  // The stalk, then the bun
  const k = seq(w.screen, [['beginPath'], e => e[0] === 'moveTo', e => e[0] === 'lineTo', ['stroke'], ['beginPath'], e => e[0] === 'arc', ['stroke']], start);
  assert.equal(k, start + 4, 'no stalk and bun');
  const [, bx, by, r, a0, a1] = w.screen[k + 5];
  const head = f.W.head, R = r / 0.35;
  assert.ok(r > 0, 'bun radius ' + r);
  assert.deepEqual([a0, a1], [0, Math.PI * 2]);
  assert.ok(near(Math.hypot(bx - head.x, by - head.y), Math.hypot(0.35, 1.65) * R, 1e-6), 'the bun is not at the top of the head');
  // The bun sits beyond the end of the stalk, away from the neck
  const [, ex, ey] = w.screen[k + 2];
  assert.ok(Math.hypot(bx - head.x, by - head.y) > Math.hypot(ex - head.x, ey - head.y), 'the bun is inside the stalk');
});

// ---------- Speed lines ----------
test('every one of the 46 speed lines is a thin triangle with area (#394)', () => {
  const w = fight();
  w.game.cfg.reduceMotion = false;
  addFx(w, { type: 'focus', t: 0.3, x: 480, y: 270 });
  w.render();
  const i = w.screen.findIndex(isAlpha(0.35 * 0.7));
  assert.ok(i >= 0, 'no speed lines drawn');
  const lines = filledPaths(w.screen, i).filter(p => near(p.pts[0][0], 480, 131) && near(p.pts[0][1], 270, 131));
  assert.equal(lines.length, 46, lines.length + ' speed lines');
  for (const { pts } of lines) {
    assert.equal(pts.length, 3, 'a speed line of ' + pts.length + ' points');
    assert.ok(area(pts) > 0, 'a speed line with no area');
  }
});

// ---------- The shield ----------
test('a raised shield is filled faintly, then outlined (#394)', () => {
  const w = fight();
  const f = w.game.fighters[0];
  f.move = w.game.MAGIC.find(m => m.id === 'shield');
  assert.ok(f.move, 'no shield move');
  f.md = { ph: 'up' };
  w.render();
  const flick = 0.85 + Math.sin(f.time * 30) * 0.1;
  const k = seq(w.screen, [['beginPath'], e => e[0] === 'arc' && e[3] === 34, isAlpha(0.18 * flick), ['fill'], isAlpha(0.8 * flick), ['stroke']]);
  assert.ok(k >= 0, 'the shield is not filled and outlined');
});

// ---------- Rooftop windows ----------
test('every rooftop window lies inside its building (#394)', () => {
  const w = load();
  w.game.bg.now = () => new Date(2026, 0, 1, 12, 0);
  w.we.applyUserProperties({ backgroundtheme: { value: 'rooftop' } });
  w.frames();
  const log = w.made.find(c => c.log.length).log;
  let building = null, windows = 0;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e[0] !== 'fillRect') continue;
    const fill = lastSet(log, 'fillStyle', i);
    if (fill === '#0a0c14') building = e;
    else if (fill === '#3a3420') {
      windows++;
      assert.ok(building, 'a window before any building');
      const [, bx, by, bw, bh] = building, [, x, y, ww, wh] = e;
      assert.ok(x >= bx && x + ww <= bx + bw && y >= by && y + wh <= by + bh, 'a window at ' + x + ',' + y + ' outside its building at ' + bx + ' to ' + (bx + bw));
    }
  }
  assert.ok(windows > 10, windows + ' windows');
});
