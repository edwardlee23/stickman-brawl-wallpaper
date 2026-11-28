// Pins cosmetic details whose change or removal left every other test green (issue #507): where
// and how dust is drawn and what kicks it up, the smear of a strike, speed lines only behind a
// dash, the breath of a standing fighter, the victory poses' motion, the day and night skyline,
// the shadow clones' heads, a fighter's shadow, a blast shot's size and two backdrop details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A direct eval at the end of the wallpaper's closure, to read its variables and call its functions
const PEEK = 'window.__peek = code => eval(code);';

// A 2D context that logs every method call as [name, ...args] and every property set as
// ['=name', value]; methods return the same recorder, so gradients log their stops too
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? () => ({ width: 40 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}

// Loads the wallpaper with a recording screen and offscreen canvases, Math.random seeded.
// stiff draws the game joints f.W, without the spring offset of f.V
function load({ query = '?count=2', seed = 1, stiff = true } = {}) {
  const seeded = mulberry32(seed);
  let fixed = null;
  const random = () => (fixed !== null ? fixed : seeded());
  const screen = [], made = [];
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  const document = {
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); made.push(c); return c; },
  };
  let next = null;
  const { window } = loadMain({
    stiff, search: query, canvas, document,
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
    random, expose: PEEK,
  });
  const game = window.__stickmanBrawl;
  let t = 0;
  return {
    game, screen, made,
    run: code => window.__peek(code),
    fix: v => { fixed = v; },
    we: window.wallpaperPropertyListener,
    frames: (n = 1, ms = 16) => { for (let i = 0; i < n; i++) { t += ms; screen.length = 0; next(t); } },
    render: () => { screen.length = 0; game.render(); },
  };
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// The last value set for a property before index i
const lastSet = (log, name, i) => { for (let j = i - 1; j >= 0; j--) if (log[j][0] === '=' + name) return log[j][1]; };
// A fight two frames in, with the effects and sparks emptied and the shake stopped
function quiet(opts) {
  const w = load(opts);
  w.frames(2);
  w.game.fx.length = 0;
  w.run('sparks.length = 0; shake = 0');
  return w;
}
const hideAll = w => w.game.fighters.forEach(f => { f.invis = true; });
const fxOf = (w, type) => w.game.fx.filter(o => o.type === type);
const addFx = (w, o) => { w.game.fx.push({ t: 0, dur: 1, ...o }); return o; };

// ---------- Dust ----------
test('dust is drawn behind the fighters, at 0.22 fading to nothing (#507)', () => {
  for (const [t, a] of [[0, 0.22], [0.5, 0.11]]) {
    const w = quiet();
    addFx(w, { type: 'dust', x: 600, y: 400, balls: [{ dx: 0, vx: 0, vy: 0, r: 5 }], t });
    w.render();
    const i = w.screen.findIndex(e => e[0] === 'ellipse' && e[1] === 600 && e[2] === 400);
    assert.ok(i >= 0, 'no dust drawn at t ' + t);
    assert.ok(near(w.screen[i][3], 5 * (0.7 + t)) && near(w.screen[i][4], 5 * (0.4 + t * 0.5)), 'dust size at t ' + t);
    assert.ok(near(lastSet(w.screen, 'globalAlpha', i), a), 'at t ' + t + ' alpha ' + lastSet(w.screen, 'globalAlpha', i));
    assert.equal(lastSet(w.screen, 'fillStyle', i), w.game.cfg.line);
    assert.deepEqual(w.screen[i + 1], ['fill'], 'the dust is not filled');
    const head = w.screen.findIndex(e => e[0] === 'arc' && e[3] === w.game.L.head);
    assert.ok(head >= 0, 'no fighter drawn');
    assert.ok(i < head, 'the dust is drawn over the fighters');
  }
});

test('a hard push kicks up dust the way the fighter slides, a soft one none (#507)', () => {
  for (const [push, n] of [[80, 1], [20, 0]]) {
    const w = quiet();
    w.fix(0.99);   // No dodge, block or knockdown
    const [a, e] = w.game.fighters;
    Object.assign(e, { state: 'idle', alt: 0, hp: 100 });
    e.takeHit(a, { ...w.game.MOVE_BY.jab, push }, 'body', { x: 300, y: 300 });
    assert.equal(e.state, 'hit');
    const dust = fxOf(w, 'dust');
    assert.equal(dust.length, n, 'push ' + push + ': ' + dust.length + ' dust clouds');
    for (const d of dust) for (const b of d.balls) assert.equal(Math.sign(b.vx), a.facing);
  }
});

test('a clash kicks up dust behind both fighters (#507)', () => {
  const w = quiet();
  const [a, b] = w.game.fighters;
  for (const f of [a, b]) f.alt = 0;
  w.run('clash(fighters[0], fighters[1], { x: 300, y: 300 }, { x: 310, y: 300 })');
  const dust = fxOf(w, 'dust');
  assert.equal(dust.length, 2);
  dust.forEach((d, i) => {
    const f = [a, b][i];
    assert.ok(near(d.x, f.x), 'dust away from fighter ' + i);
    for (const ball of d.balls) assert.equal(Math.sign(ball.vx), -f.facing);
  });
});

test('a dash and the rush out of a standoff kick up dust behind the fighter (#507)', () => {
  {
    const w = quiet();
    const [a, b] = w.game.fighters;
    Object.assign(a, { state: 'idle', alt: 0, x: 100, vx: 0, cool: 5, dash: 0, evade: 0, standoff: 0, target: b, retarget: 5, nextMove: w.game.MOVE_BY.jab });
    Object.assign(b, { state: 'idle', alt: 0, x: 900, z: a.z });
    w.fix(0.01);   // Under the dash chance of a frame, over the jump's
    a.update(1 / 60);
    assert.ok(a.dash > 0, 'no dash');
    const dust = fxOf(w, 'dust');
    assert.equal(dust.length, 1);
    for (const ball of dust[0].balls) assert.equal(Math.sign(ball.vx), -a.facing);
  }
  {
    const w = quiet();
    const [a] = w.game.fighters;
    Object.assign(a, { evade: 0 });
    a.rush(w.game.MOVE_BY.jab, 300);
    assert.ok(a.dash > 0, 'no rush');
    const dust = fxOf(w, 'dust');
    assert.equal(dust.length, 1);
    for (const ball of dust[0].balls) assert.equal(Math.sign(ball.vx), -a.facing);
  }
});

// ---------- The smear of a strike ----------
// A fighter some way into a roundhouse's active time, its smear long enough to draw
function smearing(w) {
  const [a, b] = w.game.fighters;
  b.x = a.x + 400;
  const m = w.game.MOVES.find(x => x.id === 'roundhouse');
  a.startMove(m);
  const seen = [];
  while (a.state === 'attack' && a.st < m.wind + m.act * 0.8) {
    w.game.update(1 / 120);
    if (a.smear.length) seen.push({ last: a.smear[a.smear.length - 1], V: a.V, W: a.W });
  }
  assert.equal(a.state, 'attack');
  return { a, m, seen };
}

test('a smear is filled in the fighter\'s colour at 0.35, between the tip\'s path and the root\'s (#507)', () => {
  const w = quiet();
  const { a } = smearing(w);
  const s = a.smear;
  assert.ok(s.length > 1 && Math.hypot(s[s.length - 1].ex - s[0].ex, s[s.length - 1].ey - s[0].ey) > 8, 'no smear to draw');
  w.render();
  const want = [...s.map(p => ['lineTo', p.ex, p.ey]), ...s.slice().reverse().map(p => ['lineTo', p.rx, p.ry]), ['closePath'], ['fill']];
  const i = w.screen.findIndex((e, k) => e[0] === 'beginPath' && JSON.stringify(w.screen.slice(k + 1, k + 1 + want.length)) === JSON.stringify(want));
  assert.ok(i >= 0, 'no smear filled');
  assert.ok(near(lastSet(w.screen, 'globalAlpha', i), 0.35 * a.alpha), 'smear alpha ' + lastSet(w.screen, 'globalAlpha', i));
  assert.equal(lastSet(w.screen, 'fillStyle', i), w.run('colorOf')(a));
});

test('a smear follows the drawn joints, not the game joints (#507)', () => {
  const w = quiet({ stiff: false });
  const { m, seen } = smearing(w);
  const root = w.run('SMEAR_ROOT')[m.hit];
  assert.ok(seen.length > 2, 'no smear');
  let apart = 0;
  for (const { last, V, W } of seen) {
    assert.deepEqual([last.ex, last.ey, last.rx, last.ry], [V[m.hit].x, V[m.hit].y, V[root].x, V[root].y]);
    if (Math.hypot(V[m.hit].x - W[m.hit].x, V[m.hit].y - W[m.hit].y) > 1e-6) apart++;
  }
  assert.ok(apart > 0, 'the drawn tip never left the game one, so this test shows nothing');
});

test('a ragdoll adds nothing to a smear (#507)', () => {
  const w = quiet();
  const { a } = smearing(w);
  assert.ok(a.smear.length > 0);
  a.rag = { pts: a.W };
  a.time += 0.01;
  w.run('updSmear')(a);
  assert.equal(a.smear.length, 0);
});

// ---------- Speed lines ----------
test('a fast fighter that is not dashing draws no speed lines (#507)', () => {
  const lines = dash => {
    const w = quiet();
    w.game.cfg.reduceMotion = false;
    const [a] = w.game.fighters;
    a.dash = dash; a.vx = a.facing * 520;
    w.render();
    const c = w.screen;
    return c.filter((e, i) => e[0] === 'moveTo' && c[i + 1]?.[0] === 'lineTo' && c[i + 1][2] === e[2] &&
      Math.sign(c[i + 1][1] - e[1]) === -a.facing && Math.abs(c[i + 1][1] - e[1]) >= 25).length;
  };
  assert.ok(lines(0.2) >= 5, 'no speed lines behind a dash');
  assert.equal(lines(0), 0);
});

// ---------- Breathing and victory poses ----------
test('a fighter standing idle or waiting its bout breathes, its chest rising and arms lifting (#507)', () => {
  const w = quiet({ query: '?count=3&rules=ladder' });
  const BREATH = w.run('BREATH');
  for (const state of ['idle', 'wait']) {
    const f = w.game.fighters[0];
    Object.assign(f, { state, vx: 0 });
    f.flair.w = 0;
    const at = b => {
      f.time = (Math.asin(b) - f.id * 1.7) / BREATH;
      const p = { t: 0, aF: 0, aB: 0, eF: 0, eB: 0 };
      f.addFlair(p);
      return p;
    };
    const out = at(0), inn = at(1);
    assert.ok(near(out.t, 0, 1e-9) && near(out.aF, 0, 1e-9), state + ': a breath between in and out');
    assert.ok(near(inn.t, -0.03, 1e-9), state + ': chest ' + inn.t);
    assert.ok(near(inn.aF, 0.05, 1e-9) && near(inn.aB, 0.05, 1e-9), state + ': arms ' + inn.aF + ', ' + inn.aB);
  }
});

test('the fist-pump and arms-folded victory poses move (#507)', () => {
  const { game } = load();
  const pose = (i, t) => { const p = {}; game.VICTORIES[i](p, t); return p; };
  const p0 = pose(1, 0), p1 = pose(1, Math.PI / 16);
  assert.ok(near(p1.aF - p0.aF, 0.35, 1e-9), 'the fist is not pumped up: ' + (p1.aF - p0.aF));
  assert.ok(near(p1.eF - p0.eF, -0.9, 1e-9), 'the elbow does not straighten: ' + (p1.eF - p0.eF));
  const q0 = pose(2, 0), q1 = pose(2, Math.PI / 6);
  assert.ok(near(q1.t - q0.t, 0.05, 1e-9), 'the shoulders do not nod: ' + (q1.t - q0.t));
});

// ---------- Backdrops ----------
// The offscreen backdrop's log in the theme at the given hour
function backdrop(theme, hour = 12) {
  const w = load();
  w.game.bg.now = () => new Date(2026, 0, 1, hour, 0);
  w.we.applyUserProperties({ backgroundtheme: { value: theme } });
  w.frames();
  const c = w.made.find(x => x.log.length);
  return { w, c, log: c.log };
}

test('Day and night lights none of its windows by day, 10% at dawn and dusk and 22% at night (#507)', () => {
  for (const [hour, share] of [[12, 0], [6, 0.1], [19, 0.1], [23, 0.22]]) {
    const { w, log } = backdrop('daynight', hour);
    const hash = w.run('bgHash');
    const buildings = [], lit = [];
    log.forEach((e, i) => {
      if (e[0] !== 'fillRect') return;
      const fill = lastSet(log, 'fillStyle', i);
      if (fill === '#0a0c14') buildings.push(e);
      else if (fill === '#3a3420') lit.push(e.slice(1, 3).join());
    });
    const want = [];
    buildings.forEach(([, x, top, w1, h], i) => {
      for (let wy = top + 10; wy < top + h - 12; wy += 16)
        for (let wx = x + 7, j = 0; wx < x + w1 - 1 - 10; wx += 13, j++)
          if (hash(i * 131 + wy * 7 + j) < share) want.push([wx, wy].join());
    });
    assert.ok(buildings.length > 3, 'no skyline at ' + hour);
    if (share) assert.ok(want.length > 5, want.length + ' windows at ' + hour);
    assert.deepEqual(lit, want, 'at ' + hour + ':00');
  }
});

test('the rooftop draws a lighter edge 3 high along the top of its floor (#507)', () => {
  const { c, log } = backdrop('rooftop');
  const i = log.findIndex((e, k) => e[0] === 'fillRect' && lastSet(log, 'fillStyle', k) === '#0c0d12');
  assert.ok(i >= 0, 'no floor');
  const floorY = log[i][2];
  const j = log.findIndex((e, k) => k > i && e[0] === 'fillRect' && lastSet(log, 'fillStyle', k) === '#16171e');
  assert.ok(j >= 0, 'no floor edge');
  assert.deepEqual(log[j].slice(1), [0, floorY, c.width, 3]);
});

test('the comic halftone leaves a clear middle: no dot within 0.35 of the half diagonal (#507)', () => {
  const { c, log } = backdrop('comic');
  const SW = c.width, SH = c.height, cx = SW / 2, cy = SH / 2, r = Math.hypot(SW, SH);
  const dots = log.filter((e, k) => e[0] === 'arc' && lastSet(log, 'fillStyle', k) === '#24212f').map(e => [e[1], e[2]].join());
  const want = [];
  let hole = 0;
  for (let y = 7; y < SH; y += 14) for (let x = 7 + ((y - 7) / 14) % 2 * 7; x < SW; x += 14) {
    const d = Math.hypot(x - cx, y - cy) / (r / 2);
    if (d > 0.35) want.push([x, y].join()); else hole++;
  }
  assert.ok(hole > 50, hole + ' places in the middle');
  assert.deepEqual(dots, want);
});

// ---------- Fighters ----------
test('shadow clones are drawn with filled heads (#507)', () => {
  const w = quiet();
  const [f] = w.game.fighters;
  w.game.fighters.slice(1).forEach(e => { e.invis = true; });
  f.move = w.game.MOVE_BY.clones;
  f.md = { clones: [{ x: f.x + 120, fac: 1, alt: 0, a: 1 }] };
  w.render();
  const J = f.W, hx = f.x + 120 + (J.head.x - f.x), hy = J.head.y;
  const i = w.screen.findIndex(e => e[0] === 'arc' && near(e[1], hx, 1e-6) && near(e[2], hy, 1e-6) && e[3] === w.game.L.head);
  assert.ok(i >= 0, 'no clone head');
  const stroke = w.screen.findIndex((e, k) => k > i && e[0] === 'stroke');
  assert.ok(w.screen.slice(i, stroke).some(e => e[0] === 'fill'), 'the clone\'s head is hollow');
});

test('a fighter\'s shadow shrinks by a third of its height over 100 (#507)', () => {
  const w = quiet();
  const [f] = w.game.fighters;
  w.game.fighters.slice(1).forEach(e => { e.invis = true; });
  w.game.platforms.length = 0;
  f.alt = 60;
  w.render();
  const k = 1 - 60 / 300;
  const i = w.screen.findIndex(e => e[0] === 'ellipse' && near(e[1], f.x, 1e-6) && near(e[2], w.game.groundY(f.z), 1e-6));
  assert.ok(i >= 0, 'no shadow');
  assert.ok(near(w.screen[i][3], 14 * k, 1e-9) && near(w.screen[i][4], 2.5 * k, 1e-9), 'shadow ' + w.screen[i][3] + ' x ' + w.screen[i][4]);
});

test('a blast shot is drawn 7 in radius with a white core half that (#507)', () => {
  const w = quiet();
  hideAll(w);
  w.game.shots.length = 0;
  w.game.shots.push({ x: 400, y: 300, vx: 300, vy: 0, z: 0, col: '#88ccff', life: 1, age: 0, owner: w.game.fighters[0], kind: 'blast' });
  w.render();
  const arcs = w.screen.filter(e => e[0] === 'arc' && e[1] === 400 && e[2] === 300).map(e => e[3]);
  assert.deepEqual(arcs, [7, 3.5]);
});
