// Pins effects, fades and drawing details whose change or removal left every other test green:
// sparks, cracks, rings and shakes, the footwork, the fades and glows, shapes, text and the
// rooftop windows (issue #430).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A direct eval added at the end of the wallpaper's closure, so a test can read and set the
// wallpaper's own variables (sparks, shake, roundOver) and call its functions
const PEEK = 'window.__peek = code => eval(code);';

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
  const seeded = mulberry32(seed);
  let fixed = null;
  const random = () => (fixed !== null ? fixed : seeded());
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
    random, expose: PEEK,
  });
  const game = window.__stickmanBrawl;
  let t = 0, clickAt = 0;
  return {
    game, screen, made, text,
    // Runs code inside the wallpaper's scope, where its own variables are
    run: code => window.__peek(code),
    // Makes Math.random return v from now on; null goes back to the seeded generator
    fix: v => { fixed = v; },
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


// The sparks of one colour made since the list was last emptied
const sparksOf = (w, col) => w.run('sparks').filter(s => s.col === col);
// A fight with the effects, sparks and shake cleared, every fighter hidden but the first
function quiet(opts) {
  const w = fight(opts);
  w.run('sparks.length = 0; shake = 0');
  return w;
}
const hideAll = w => w.game.fighters.forEach(f => { f.invis = true; });
// The alpha set before each entry of the screen log that passes test
const alphasAt = (log, test) => log.flatMap((e, i) => (test(e) ? [lastSet(log, 'globalAlpha', i)] : []));
const ELEMENT = { fire: '#ff8a3d', ice: '#9fe8ff', bolt: '#fff3a0' };

// ---------- Sparks, cracks and rings that hits leave ----------
test('a big hit throws its sparks 1.6 times as fast as a small one (#430)', () => {
  const w = quiet();
  w.fix(0.5);
  w.run('impact(100, 100, false); impact(300, 100, true)');
  const speeds = col => sparksOf(w, '#ffe28a').filter(s => s.x === col).map(s => Math.hypot(s.vx, s.vy));
  assert.equal(speeds(100).length, 10);
  assert.equal(speeds(300).length, 18);
  for (const v of speeds(100)) assert.ok(near(v, 130), 'a small hit spark at ' + v);
  for (const v of speeds(300)) assert.ok(near(v, 130 * 1.6), 'a big hit spark at ' + v);
});

test('a quake throws its dust up twice as fast, and cracks the floor 0.7 of its radius wide (#430)', () => {
  const w = quiet();
  w.fix(0.5);
  w.run('quake(300, 400, 90)');
  const dust = sparksOf(w, 'rgba(210,210,210,0.75)');
  assert.equal(dust.length, 22);
  for (const s of dust) assert.ok(near(Math.hypot(s.vx, s.vy), 55 * 2), 'dust at ' + Math.hypot(s.vx, s.vy));
  const c = w.game.fx.find(o => o.type === 'crack');
  assert.ok(c, 'no crack');
  assert.equal(c.kind, 'ground');
  assert.ok(near(c.size, 63), 'crack size ' + c.size);
});

test('a click blast cracks the wall 60 wide (#430)', () => {
  const w = quiet();
  w.we.applyUserProperties({ clickblast: { value: true } });
  w.click(480, 100);
  const c = w.game.fx.find(o => o.type === 'crack');
  assert.ok(c, 'no crack');
  assert.equal(c.kind, 'wall');
  assert.equal(c.size, 60);
});

// ---------- Fighters' effects ----------
test('a thrown fighter lands with a quake and a big impact (#430)', () => {
  const w = quiet();
  const [f] = w.game.fighters;
  Object.assign(f, { state: 'thrown', st: 0.5, alt: 0, from: { ...f.pose },
    th: { dur: 0.5, hx0: 400, hx1: 400, hy0: 300, hy1: 300, arc: 0, lie: 10 } });
  f.update(0.016);
  const fx = w.game.fx;
  assert.ok(fx.some(o => o.type === 'ring' && o.flat && o.r1 === 90), 'no quake ring');
  assert.ok(fx.some(o => o.type === 'crack' && o.kind === 'ground'), 'no floor crack');
  assert.ok(fx.some(o => o.type === 'ring' && !o.flat && o.r1 === 70), 'no big impact ring');
});

test('a frozen fighter breaking out of its ice throws 10 ice sparks (#430)', () => {
  const w = quiet();
  const [f] = w.game.fighters;
  Object.assign(f, { state: 'frozen', st: 1, dur: 1 });
  f.update(0.016);
  assert.notEqual(f.state, 'frozen');
  assert.equal(sparksOf(w, ELEMENT.ice).length, 10);
});

test('a block throws 8 blue sparks (#430)', () => {
  const w = quiet();
  w.fix(0.99);
  const [a, e] = w.game.fighters;
  Object.assign(e, { state: 'block', st: 0, dur: 1, facing: -a.facing });
  e.takeHit(a, w.game.MOVE_BY.jab, 'body', { x: 300, y: 300 });
  assert.equal(sparksOf(w, '#9fd4ff').length, 8);
});

test('a knockout blow adds the long speed lines (#430)', () => {
  const w = quiet();
  w.fix(0.99);
  const [a, e] = w.game.fighters;
  e.hp = 1;
  e.takeHit(a, w.game.MOVE_BY.jab, 'body', { x: 300, y: 300 }, { dmg: 100 });
  assert.equal(e.alive, false);
  assert.ok(w.game.fx.some(o => o.type === 'focus' && o.dur === 0.4), 'no knockout speed lines');
});

test('a launched fighter leaves an afterimage trail, a quiet launch none (#430)', () => {
  const w = quiet();
  const [f] = w.game.fighters;
  f.launch(300, 400);
  assert.equal(f.trailOn, true);
  f.launch(300, 400, true);
  assert.equal(f.trailOn, false);
});

test('a double jump leaves a small flat ring under the feet (#430)', () => {
  const w = quiet();
  const [f, t] = w.game.fighters;
  w.fix(0.35);   // Not an air dash (under 0.3), a double jump (under 0.45)
  Object.assign(f, { state: 'air', alt: 10, va: 0, cool: -1, dash: 0, dashed: false, dj: false, target: t, x: 200 });
  Object.assign(t, { x: 600, z: f.z, alt: 0 });
  f.updAir(0.016);
  assert.equal(f.dj, true, 'no double jump');
  const r = w.game.fx.find(o => o.type === 'ring');
  assert.ok(r, 'no ring');
  assert.ok(r.flat && r.r1 === 22, 'ring ' + JSON.stringify(r));
});

// ---------- Specials ----------
const SUPER = (w, type) => w.game.SUPER.find(m => m.type === type) || w.game.MAGIC.find(m => m.type === type);
function caster(w, type, md, st) {
  const [f, t] = w.game.fighters;
  Object.assign(f, { state: 'attack', move: SUPER(w, type), md, st, target: t, alt: 0 });
  assert.ok(f.move, 'no ' + type + ' move');
  return f;
}

test('the beam shakes the screen as it fires (#430)', () => {
  const w = quiet();
  const f = caster(w, 'beam', { ph: 'charge', chargeSfx: true }, 0.8);
  f.u_beam(0.016);
  assert.equal(f.md.ph, 'fire');
  assert.ok(w.run('shake') >= 7, 'shake ' + w.run('shake'));
});

test('a firing beam throws white sparks where it ends (#430)', () => {
  const w = quiet();
  const f = caster(w, 'beam', { ph: 'fire', t0: 0.1, aim: 0, hit: new Set() }, 0.2);
  w.fix(0.1);
  f.u_beam(0.016);
  const s = sparksOf(w, '#ffffff');
  assert.equal(s.length, 2);
  for (const o of s) assert.ok(near(o.x, f.md.E.x) && near(o.y, f.md.E.y), 'a spark away from the beam end');
});

test('each blast shot leaves 3 white sparks at the hand (#430)', () => {
  const w = quiet();
  const f = caster(w, 'blast', { fired: 0 }, 0);
  f.u_blast(0.016);
  assert.equal(w.game.shots.length, 1, 'no shot');
  const s = sparksOf(w, '#ffffff');
  assert.equal(s.length, 3);
  for (const o of s) assert.ok(near(o.x, w.game.shots[0].x) && near(o.y, w.game.shots[0].y), 'a spark away from the hand');
});

test('each barrage punch that lands adds 4 sparks to the hit (#430)', () => {
  const w = quiet();
  w.fix(0.99);
  const f = caster(w, 'barrage', { next: 0 }, 0);
  const e = f.target;
  Object.assign(e, { x: f.x + f.facing * 30, z: f.z, alt: 0, state: 'idle' });
  w.render();
  f.u_barrage(0.016);
  assert.ok(e.hp < e.maxHp, 'the punch missed');
  assert.equal(sparksOf(w, '#ffe28a').length, 10 + 4, 'the impact makes 10, the punch 4');
});

test('lightning marks the floor where it will fall (#430)', () => {
  const w = quiet();
  const f = caster(w, 'lightning', { ph: 'cast' }, 0.2);
  f.u_lightning(0.016);
  const m = w.game.fx.find(o => o.type === 'mark');
  assert.ok(m, 'no mark');
  assert.equal(m.col, ELEMENT.bolt);
  assert.ok(near(m.x, f.md.x) && near(m.y, f.md.gy), 'the mark is not where the bolt falls');
});

test('a falling bolt throws 14 sparks and shakes the screen (#430)', () => {
  const w = quiet();
  const f = caster(w, 'lightning', { ph: 'mark', x: 700, z: 0 }, 0.8);
  f.target.x = 200;   // Away from the bolt, so no hit shakes the screen instead
  f.u_lightning(0.016);
  assert.equal(f.md.ph, 'rec');
  assert.equal(sparksOf(w, ELEMENT.bolt).length, 14);
  assert.ok(w.run('shake') >= 8, 'shake ' + w.run('shake'));
});

// ---------- Footwork ----------
function onFeet(w) {
  const [f, t] = w.game.fighters;
  w.fix(0.99);   // No jump, no dash
  Object.assign(f, { state: 'idle', alt: 0, cool: 99, retarget: 99, target: t, evade: 0 });
  Object.assign(t, { x: f.x + f.facing * 400, z: f.z });
  return f;
}
const GUARD = w => w.run('GUARD');

test('walking swings the legs by up to 0.32 either way (#430)', () => {
  const w = quiet();
  const f = onFeet(w);
  Object.assign(f, { dash: 1, vx: f.facing * 100, walk: 0.3 });
  f.updIdle(0.08);
  const sw = Math.sin(f.walk) * 0.32;
  assert.ok(Math.abs(sw) > 0.1);
  assert.ok(near(f.pose.lF, GUARD(w).lF + sw, 1e-6), 'front leg ' + f.pose.lF);
  assert.ok(near(f.pose.lB, GUARD(w).lB - sw, 1e-6), 'back leg ' + f.pose.lB);
});

test('running fast leans the body forward by 0.4 (#430)', () => {
  const w = quiet();
  const f = onFeet(w);
  Object.assign(f, { dash: 1, vx: f.facing * 500 });
  f.updIdle(0.08);
  const b = Math.sin(f.time * 7 + f.id);
  assert.ok(near(f.pose.t, GUARD(w).t + 0.4 + b * 0.02, 1e-6), 'lean ' + f.pose.t);
});

test('the winner waves its arms (#430)', () => {
  const w = quiet();
  const [f, e] = w.game.fighters;
  e.state = 'ko';
  w.run('roundOver = true');
  Object.assign(f, { state: 'idle', alt: 0, target: null, time: 0.2 });
  f.updIdle(0.08);
  const V = w.run('VICTORY');
  assert.ok(near(f.pose.aF, V.aF + Math.sin(f.time * 6) * 0.25, 1e-6), 'front arm ' + f.pose.aF);
  assert.ok(near(f.pose.aB, V.aB + Math.sin(f.time * 6 + 1) * 0.25, 1e-6), 'back arm ' + f.pose.aB);
});

// ---------- Items ----------
test('a heart on the floor is filled pink and outlined white (#430)', () => {
  const w = quiet();
  w.game.items.length = 0;
  const it = w.game.spawnItem('heart', 500, 30, 0);
  it.t = 0;
  w.render();
  const i = w.screen.findIndex(e => e[0] === '=fillStyle' && e[1] === '#ff6b8a');
  assert.ok(i >= 0, 'no heart drawn');
  const k = seq(w.screen, [['=strokeStyle', '#ffffff'], e => e[0] === '=lineWidth', ['beginPath'], e => e[0] === 'moveTo',
    e => e[0] === 'bezierCurveTo', e => e[0] === 'bezierCurveTo', ['fill'], ['stroke']], i);
  assert.equal(k, i + 1, 'the heart is not filled and outlined');
});

for (const kind of ['staff', 'boomerang']) {
  test('picking up a ' + kind + ' throws 6 gold sparks (#430)', () => {
    const w = quiet();
    w.game.cfg.items = true;
    w.game.items.length = 0;
    const [f] = w.game.fighters;
    f.held = null;
    Object.assign(f, { state: 'idle', alt: 0 });
    w.render();
    const it = w.game.spawnItem(kind, f.W.hip.x, f.z, 0);
    Object.assign(it, { rest: true, alt: 0 });
    w.game.updateItems(0.016);
    assert.equal(f.held && f.held.kind, kind, 'not picked up');
    assert.equal(sparksOf(w, '#ffe28a').length, 6);
  });
}

// ---------- Fades ----------
test('a flame fades from 0.7 at its start to 0.35 halfway (#430)', () => {
  for (const [u, a] of [[0, 0.7], [0.5, 0.35]]) {
    const w = quiet();
    hideAll(w);
    addFx(w, { type: 'flame', x: 600, y: 400, t: u });
    w.render();
    const as = alphasAt(w.screen, e => e[0] === 'quadraticCurveTo' && e[4] === 400);
    assert.equal(as.length, 5, as.length + ' tongues');
    for (const x of as) assert.ok(near(x, a), 'at u ' + u + ' alpha ' + x);
  }
});

test('an impact ring fades from 1 to 0.5 halfway and grows easing out (#430)', () => {
  for (const [u, a, r, lw] of [[0, 1, 4, 2], [0.5, 0.5, 4 + 40 * 0.75, 2 * 0.7]]) {
    const w = quiet();
    hideAll(w);
    addFx(w, { type: 'ring', x: 600, y: 300, r0: 4, r1: 44, w: 2, t: u });
    w.render();
    const i = w.screen.findIndex(e => e[0] === 'arc' && e[1] === 600 && e[2] === 300);
    assert.ok(i >= 0, 'no ring');
    assert.ok(near(w.screen[i][3], r), 'at u ' + u + ' radius ' + w.screen[i][3]);
    assert.ok(near(lastSet(w.screen, 'globalAlpha', i), a), 'at u ' + u + ' alpha ' + lastSet(w.screen, 'globalAlpha', i));
    assert.ok(near(lastSet(w.screen, 'lineWidth', i), lw), 'at u ' + u + ' line width ' + lastSet(w.screen, 'lineWidth', i));
  }
});

test('a lightning bolt fades from 0.5 and 1 to half of each halfway (#430)', () => {
  for (const [u, a] of [[0, [0.5, 1]], [0.5, [0.25, 0.5]]]) {
    const w = quiet();
    hideAll(w);
    addFx(w, { type: 'bolt', pts: [[600, 0], [610, 100], [600, 200]], col: ELEMENT.bolt, t: u });
    w.render();
    const as = alphasAt(w.screen, e => e[0] === 'moveTo' && e[1] === 600 && e[2] === 0);
    assert.equal(as.length, 2);
    as.forEach((x, i) => assert.ok(near(x, a[i]), 'at u ' + u + ' stroke ' + i + ' alpha ' + x));
  }
});

test('the lightning mark pulses between 0.42 and 0.7 (#430)', () => {
  for (const [t, a] of [[0, 0.7 * 0.6], [Math.PI / 60, 0.7]]) {
    const w = quiet();
    hideAll(w);
    addFx(w, { type: 'mark', x: 600, y: 400, col: ELEMENT.bolt, t });
    w.render();
    const as = alphasAt(w.screen, e => e[0] === 'ellipse' && e[1] === 600 && e[2] === 400 && e[3] === 24);
    assert.equal(as.length, 1);
    assert.ok(near(as[0], a), 'at t ' + t + ' alpha ' + as[0]);
  }
});

// ---------- Glows and auras ----------
// The radius of the radial glow drawn at the fighter's hands
function glow(type, md, st) {
  const w = quiet();
  const f = caster(w, type, md, st);
  f.time = 0;
  w.render();
  const H = { x: (f.W.hF.x + f.W.hB.x) / 2, y: (f.W.hF.y + f.W.hB.y) / 2 };
  const g = w.screen.find(e => e[0] === 'createRadialGradient' && near(e[1], H.x) && near(e[2], H.y));
  assert.ok(g, 'no glow');
  return g[6];
}

test('a fireball grows between the hands from 4.8 to 17.6 across as it charges (#430)', () => {
  assert.ok(near(glow('fireball', { ph: 'charge' }, 0), 3 * 1.6), 'at the start');
  assert.ok(near(glow('fireball', { ph: 'charge' }, 0.4), 11 * 1.6), 'fully charged');
});

test('a beam charge grows from 5.4 to 19.8 across as it charges (#430)', () => {
  assert.ok(near(glow('beam', { ph: 'charge' }, 0), 3 * 1.8), 'at the start');
  assert.ok(near(glow('beam', { ph: 'charge' }, 0.75), 11 * 1.8), 'fully charged');
});

test('an aura is as strong as the fighter\'s aura level (#430)', () => {
  for (const level of [1, 0.5]) {
    const w = quiet();
    hideAll(w);
    const [f] = w.game.fighters;
    Object.assign(f, { invis: false, aura: level });
    w.fix(0.5);
    w.render();
    const as = alphasAt(w.screen, e => e[0] === 'quadraticCurveTo');
    assert.equal(as.length, 12, as.length + ' wisps');
    for (const a of as) assert.ok(near(a, 0.4 * level), 'aura ' + level + ' alpha ' + a);
  }
});

// ---------- Shots ----------
function shotLog(w, o) {
  w.game.shots.length = 0;
  w.game.shots.push({ x: 400, y: 300, vx: 300, vy: 0, z: 0, col: '#88ccff', life: 1, age: 0, owner: w.game.fighters[0], ...o });
  hideAll(w);
  w.render();
  const i = w.screen.findIndex(e => e[0] === '=fillStyle' && e[1] === '#88ccff');
  assert.ok(i >= 0, 'no shot drawn');
  return i;
}

test('a shuriken spins as it flies (#430)', () => {
  for (const life of [1, 1.1]) {
    const w = quiet();
    const i = shotLog(w, { kind: 'star', life });
    const [p] = filledPaths(w.screen, i);
    const [x, y] = p.pts[0];
    assert.ok(near(x, 400 + Math.cos(life * 25) * 6.5, 1e-6) && near(y, 300 + Math.sin(life * 25) * 6.5, 1e-6), 'at life ' + life + ' the first point is at ' + x + ',' + y);
  }
});

test('shots are drawn adding light (#430)', () => {
  const w = quiet();
  const i = shotLog(w, { kind: 'fire' });
  let j = i - 1;
  for (; j >= 0; j--) if (w.screen[j][0] === '=globalCompositeOperation' || w.screen[j][0] === 'restore') break;
  assert.deepEqual(w.screen[j], ['=globalCompositeOperation', 'lighter']);
});

// ---------- Shapes ----------
test('a crack is drawn in lines 0.9 wide (#430)', () => {
  const w = quiet();
  hideAll(w);
  addFx(w, { type: 'crack', x: 600, y: 300, kind: 'wall', size: 40, lines: [[[600, 300], [620, 310]]], dur: 5 });
  w.render();
  const i = seq(w.screen, [['beginPath'], ['moveTo', 600, 300], ['lineTo', 620, 310], ['stroke']]);
  assert.ok(i >= 0, 'no crack');
  assert.equal(lastSet(w.screen, 'lineWidth', i), 0.9);
  assert.ok(near(lastSet(w.screen, 'globalAlpha', i), 0.55));
});

test('the log a substitution leaves is 46 high and 12 wide (#430)', () => {
  const w = quiet();
  hideAll(w);
  addFx(w, { type: 'log', x: 600, y: 400, dir: 1 });
  w.render();
  assert.ok(seq(w.screen, [['fillRect', -6, -46, 12, 46], ['strokeRect', -6, -46, 12, 46]]) >= 0, 'no log 46 high');
});

test('the ice block reaches 8 past the body on each side and 4 above the head (#430)', () => {
  const w = quiet();
  hideAll(w);
  const [f] = w.game.fighters;
  Object.assign(f, { invis: false, state: 'frozen', st: 0, dur: 1 });
  w.render();
  const J = f.W, ks = Object.keys(J).filter(k => J[k] && typeof J[k].x === 'number');
  const xs = ks.map(k => J[k].x), ys = ks.map(k => J[k].y);
  const x0 = Math.min(...xs) - 8, y0 = Math.min(...ys) - w.game.L.head - 4, x1 = Math.max(...xs) + 8, y1 = Math.max(...ys) + 4;
  const i = w.screen.findIndex(e => e[0] === 'fillRect' && lastSet(w.screen, 'fillStyle', w.screen.indexOf(e)) === ELEMENT.ice);
  assert.ok(i >= 0, 'no ice block');
  const [, x, y, ww, hh] = w.screen[i];
  assert.ok(near(x, x0, 1e-6) && near(y, y0, 1e-6) && near(ww, x1 - x0, 1e-6) && near(hh, y1 - y0, 1e-6), 'block at ' + [x, y, ww, hh]);
});

// ---------- Text ----------
test('the score board\'s " : " is drawn in the line colour (#430)', () => {
  const w = quiet({ query: '?count=2&mode=teams' });
  w.game.cfg.showScore = true;
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'fillText' && e[1] === ' : ');
  assert.ok(i >= 0, 'no " : " drawn');
  assert.equal(lastSet(w.screen, 'fillStyle', i), w.game.cfg.line);
});

test('a name tag is in a 9 px bold font (#430)', () => {
  const w = quiet();
  w.we.applyUserProperties({ fighternames: { value: 'ANA,BOB' } });
  w.game.cfg.names = ['ANA', 'BOB'];
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'fillText' && e[1] === 'ANA');
  assert.ok(i >= 0, 'no name tag');
  assert.equal(lastSet(w.screen, 'font', i), '700 9px sans-serif');
});

// ---------- The rooftop ----------
test('the rooftop lights 22% of its window places (#430)', () => {
  const w = load();
  w.game.bg.now = () => new Date(2026, 0, 1, 12, 0);
  w.we.applyUserProperties({ backgroundtheme: { value: 'rooftop' } });
  w.frames();
  const log = w.made.find(c => c.log.length).log;
  const hash = w.run('bgHash');
  const buildings = [], lit = [];
  log.forEach((e, i) => {
    if (e[0] !== 'fillRect') return;
    const fill = lastSet(log, 'fillStyle', i);
    if (fill === '#0a0c14') buildings.push(e);
    else if (fill === '#3a3420') lit.push(e.slice(1, 3).join());
  });
  // Every window place of each building, as the skyline lays them out
  const want = [];
  buildings.forEach(([, x, top, w1, h], i) => {
    const bw = w1 - 1;
    for (let wy = top + 10; wy < top + h - 12; wy += 16)
      for (let wx = x + 7, j = 0; wx < x + bw - 10; wx += 13, j++)
        if (hash(i * 131 + wy * 7 + j) < 0.22) want.push([wx, wy].join());
  });
  assert.ok(want.length > 10, want.length + ' windows');
  assert.deepEqual(lit, want);
});
