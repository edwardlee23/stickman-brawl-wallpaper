// Pins drawing details no other test saw: ledges, the torso, poses, fighter extras, backdrop
// decorations, shots and effects, spark cleanup and where the score and win text go (issue #274).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, mulberry32 } from './load-main.mjs';

// A 2D context that logs every method call as [name, ...args] and every property set as
// ['=name', value]; methods return the same recorder, so gradients log their stops too.
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? () => ({ width: 40 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}

// Loads the wallpaper with a recording screen and offscreen canvases. Math.random is a seeded
// generator (mulberry32), so every run draws the same numbers.
function load({ query = '?count=2', seed = 1 } = {}) {
  const screen = [], made = [], listeners = {};
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  let next = null;
  const { window } = loadMain({
    stiff: true,   // pins drawing against f.W
    search: query, canvas, random: mulberry32(seed),
    document: { createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); made.push(c); return c; } },
    window: { addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  const game = window.__stickmanBrawl;
  let t = 0;
  return {
    game, screen, made, listeners,
    we: window.wallpaperPropertyListener,
    // Runs n animation frames of ms each
    frames: (n = 1, ms = 16) => { for (let i = 0; i < n; i++) { t += ms; screen.length = 0; next(t); } },
    render: () => { screen.length = 0; game.render(); },
    click: (x, y) => { for (const f of listeners.pointerdown) f({ button: 0, clientX: x, clientY: y, timeStamp: (t += 1000) }); },
  };
}
const S = 720 / 540;   // World to screen scale at 1280 x 720 and figure size 100%
const near = (a, b) => Math.abs(a - b) < 1e-9;
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
const pathAt = (log, pts) => seq(log, [['beginPath'], ['moveTo', pts[0].x, pts[0].y], ...pts.slice(1).map(p => ['lineTo', p.x, p.y]), ['stroke']]);
const poseOf = f => JSON.stringify(f.pose);

// ---------- Ledges and the body ----------
test('each ledge is drawn as a line-colored top and a faint underside', () => {
  const w = load();
  w.we.applyUserProperties({ platforms: { value: true } });
  w.frames();
  const ps = w.game.platforms;
  assert.ok(ps.length > 0);
  const line = w.game.cfg.line;
  for (const p of ps) {
    const top = w.screen.findIndex(e => e[0] === 'fillRect' && near(e[1], p.x0) && near(e[2], p.y) && near(e[3], p.x1 - p.x0) && e[4] === 2.5);
    assert.ok(top > 0, `no top drawn for the ledge at ${p.x0}`);
    assert.deepEqual(w.screen[top - 1], ['=globalAlpha', 0.85]);
    const style = w.screen.slice(0, top).filter(e => e[0] === '=fillStyle').pop();
    assert.deepEqual(style, ['=fillStyle', line]);
    assert.ok(w.screen.some(e => e[0] === 'fillRect' && near(e[1], p.x0 + 3) && near(e[2], p.y + 2.5) && near(e[3], p.x1 - p.x0 - 6) && e[4] === 4),
      `no underside drawn for the ledge at ${p.x0}`);
  }
});

test('every fighter is drawn with a spine and neck from hip to shoulders to head', () => {
  const w = load();
  w.frames();
  w.render();
  for (const f of w.game.fighters) assert.ok(pathAt(w.screen, [f.W.hip, f.W.sh, f.W.head]) >= 0, `fighter ${f.id} has no torso`);
});

test('a fighter hidden in smoke draws no body', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[1];
  f.invis = true;
  w.render();
  assert.equal(pathAt(w.screen, [f.W.hip, f.W.sh, f.W.head]), -1);
});

// ---------- Poses ----------
test('blocking, falling, tumbling and charging a beam each move the pose', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  const step = (setup) => {
    setup();
    f.from = JSON.parse(JSON.stringify(f.pose));
    const before = poseOf(f);
    f.update(0.05);
    return poseOf(f) !== before;
  };
  assert.ok(step(() => { f.state = 'block'; f.st = 0; f.dur = 1; }), 'block');
  f.endMove();
  assert.ok(step(() => { f.state = 'fall'; f.st = 0; f.dur = 1; f.fallSign = 1; }), 'fall');
  f.endMove();
  assert.ok(step(() => { f.state = 'launched'; f.alt = 200; f.va = 0; f.vx = 0; f.vz = 0; f.rotV = 0; }), 'tumble');
  f.endMove(); f.alt = 0;
  assert.ok(step(() => f.startMove(w.game.SUPER.find(m => m.id === 'beam'))), 'beam charge');
});

// ---------- Fighter extras ----------
test('head gear fades with its fighter', () => {
  const w = load();
  w.we.applyUserProperties({ headgear: { value: true } });
  w.frames();
  const f = w.game.fighters[0];
  f.alpha = 0.4;
  w.render();
  // drawHeadgear sets its 2 px line, then its alpha, after the head circle
  const i = seq(w.screen, [['=lineWidth', 2], ['=lineCap', 'round'], ['=lineJoin', 'round'], e => e[0] === '=globalAlpha']);
  assert.ok(i >= 0, 'no head gear drawn');
  assert.ok(near(w.screen[i + 3][1], 0.4), `head gear alpha ${w.screen[i + 3][1]}`);
});

test('a frozen fighter is drawn in a filled and outlined block of ice', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  f.state = 'frozen';
  w.render();
  const box = w.screen.find(e => e[0] === 'strokeRect');
  assert.ok(box, 'no outline');
  assert.ok(w.screen.some(e => e[0] === 'fillRect' && JSON.stringify(e.slice(1)) === JSON.stringify(box.slice(1))), 'no fill');
});

test('a shadow clone with fac -1 is drawn mirrored about its own x', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  f.startMove(w.game.NINJA.find(m => m.id === 'clones'));
  f.md.clones = [{ x: 300, alt: 0, fac: -1, a: 1 }];
  w.render();
  const J = f.W, at = p => ({ x: 300 - (p.x - f.x), y: p.y });
  assert.ok(pathAt(w.screen, [at(J.hip), at(J.sh), at(J.head)]) >= 0, 'no mirrored clone torso');
});

test('a charging fighter is drawn with an aura of 12 flickers', () => {
  const w = load();
  w.frames();
  w.game.fx.length = 0;
  w.render();
  const calm = w.screen.filter(e => e[0] === 'quadraticCurveTo').length;
  w.game.fighters[0].aura = 1;
  w.render();
  assert.equal(w.screen.filter(e => e[0] === 'quadraticCurveTo').length - calm, 12);
});

test('afterimages are capped at 10', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  f.trailOn = true; f.trailT = 0;
  f.trail = Array.from({ length: 10 }, () => ({ p: f.W, life: 1 }));
  w.game.update(0.001);
  assert.equal(f.trail.length, 10);
});

test('a fighter knocked out at the end of a fall is thrown up 40 a second', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  f.state = 'down'; f.st = 0; f.downDur = 99; f.hp = 0; f.koPending = true;
  w.game.update(0.001);
  assert.ok(f.rag, 'no ragdoll');
  const head = f.rag.pts.head;
  assert.ok(near((head.y - head.py) * 120, -40), `head moves at ${(head.y - head.py) * 120}`);
});

// ---------- Backdrop decorations ----------
function backdrop(theme, hour = 12) {
  const w = load();
  w.game.bg.now = () => new Date(2026, 0, 1, hour, 0);
  w.we.applyUserProperties({ backgroundtheme: { value: theme } });
  w.frames();
  return w.made.find(c => c.log.length).log;
}
const rects = (log, cw, ch) => log.filter(e => e[0] === 'fillRect' && e[3] === cw && e[4] === ch);

test('the night sky of Day and night has 90 stars, the day sky none', () => {
  assert.equal(rects(backdrop('daynight', 23), 1.5, 1.5).length, 90);
  assert.equal(rects(backdrop('daynight', 12), 1.5, 1.5).length, 0);
});

test('the rooftop has a moon and lit windows; the daytime skyline has none lit', () => {
  const log = backdrop('rooftop');
  assert.ok(log.some(e => e[0] === 'arc' && near(e[1], 1280 * 0.8) && near(e[2], 720 * 0.16) && near(e[3], 720 * 0.055)), 'no moon');
  assert.ok(rects(log, 5, 7).length > 10, 'no lit windows');
  assert.equal(rects(backdrop('daynight', 12), 5, 7).length, 0);
  assert.ok(rects(backdrop('daynight', 23), 5, 7).length > 10, 'no lit windows at night');
});

test('the dojo floor is laid in boards', () => {
  const log = backdrop('dojo');
  const floor = load().game.groundY(0) * S;
  const seams = log.filter(e => e[0] === 'fillRect' && e[1] === 0 && e[2] >= floor && e[3] === 1280 && e[4] === 1.5);
  assert.ok(seams.length >= 4, `${seams.length} board seams`);
  assert.ok(log.some(e => e[0] === 'fillRect' && e[2] >= floor && e[3] === 1.5), 'no board ends');
});

// ---------- Shots and effects ----------
function shot(w, kind, extra = {}) {
  w.game.shots.length = 0;
  w.game.shots.push({ kind, x: 400, y: 300, vx: 300, vy: 0, z: 0, col: '#88ccff', life: 1, age: 0, owner: w.game.fighters[0], ...extra });
  w.render();
  return w.screen.filter(e => e[0] === 'arc' && e[1] === 400 && e[2] === 300);
}

test('an ice shard and a shuriken are pointed shapes, not round shots', () => {
  const w = load();
  w.frames();
  for (const kind of ['ice', 'star']) {
    assert.equal(shot(w, kind).length, 0, kind + ' drawn as a circle');
    assert.ok(w.screen.some(e => e[0] === 'closePath'), kind + ' drawn as no shape');
  }
  assert.equal(shot(w, 'blast').length, 2, 'a plain shot is drawn as a circle with a core');
});

test('a fireball is larger than a plain shot and flickers in size', () => {
  const w = load();
  w.frames();
  const r1 = shot(w, 'fire', { life: 1 })[0][3], r2 = shot(w, 'fire', { life: 1.04 })[0][3];
  assert.ok(r1 > 9 && r1 < 13, `radius ${r1}`);
  assert.notEqual(r1, r2, 'the radius does not flicker');
});

// The spark strokes of the last frame: [alpha, color, from, to]
function sparkLines(w) {
  const out = [];
  for (let i = 0; i + 5 < w.screen.length; i++) {
    const [a, c, b, m, l, s] = w.screen.slice(i, i + 6);
    if (a[0] === '=globalAlpha' && c[0] === '=strokeStyle' && b[0] === 'beginPath' && m[0] === 'moveTo' && l[0] === 'lineTo' && s[0] === 'stroke')
      out.push([a[1], c[1], { x: m[1], y: m[2] }, { x: l[1], y: l[2] }]);
  }
  return out;
}

test('sparks fade as they burn out, and burned-out sparks are removed', () => {
  const w = load();
  w.we.applyUserProperties({ clickblast: { value: true } });
  w.frames();
  w.click(60, 60);
  w.frames(6);   // About 0.1 s
  const lit = sparkLines(w).filter(([, c]) => c === '#ffe28a');
  assert.ok(lit.length >= 18, `${lit.length} sparks`);
  for (const [a] of lit) assert.ok(a > 0 && a < 1, `a spark drawn at alpha ${a}`);
  w.frames(60);  // About a second: every spark of the click has burned out
  const dead = sparkLines(w).filter(([a]) => a === 0);
  assert.equal(dead.length, 0, `${dead.length} burned-out sparks still drawn`);
});

test('a fighter landing from a fall sends 22 dust sparks upward', () => {
  const w = load();
  w.frames();
  const f = w.game.fighters[0];
  f.state = 'fall'; f.st = 0.999; f.dur = 1; f.fallSign = 1; f.from = JSON.parse(JSON.stringify(f.pose));
  f.update(0.01);
  w.render();
  const dust = sparkLines(w).filter(([, c]) => c === 'rgba(210,210,210,0.75)');
  assert.equal(dust.length, 22);
  // Each is drawn back along its velocity, so a spark flying up trails below its point
  for (const [, , from, to] of dust) assert.ok(to.y > from.y, 'a dust spark flies down');
});

test('a smoke escape leaves a cloud of 7 balls', () => {
  const w = load();
  w.frames();
  w.game.fx.length = 0;
  const f = w.game.fighters[0];
  f.startMove(w.game.NINJA.find(m => m.id === 'smoke'));
  f.update(0.01);
  const cloud = w.game.fx.find(o => o.type === 'puff');
  assert.ok(cloud, 'no smoke');
  assert.equal(cloud.balls.length, 7);
});

test('a crack stays 5 s, and a floor crack is squashed flat for perspective', () => {
  const w = load({ seed: 7 });
  w.we.applyUserProperties({ clickblast: { value: true } });
  w.frames();
  const y = (w.game.groundY(0) + 40) * S;
  w.click(400 * S, y);
  const cr = w.game.fx.find(o => o.type === 'crack');
  assert.ok(cr, 'no crack');
  assert.equal(cr.kind, 'ground');
  assert.equal(cr.dur, 5);
  // Each of its lines is 4 segments of at most 0.45 of the size, squashed to 0.3 of that up and down
  for (const pts of cr.lines) for (const [, py] of pts) assert.ok(Math.abs(py - cr.y) <= cr.size * 0.45 * 4 * 0.3 + 1e-9, 'a floor crack line reaches too far up or down');
  const spread = Math.max(...cr.lines.flat().map(([, py]) => Math.abs(py - cr.y)));
  assert.ok(spread > 0, 'the crack is flat');
});

// ---------- Text ----------
test('the score board is drawn at the top left, 24 px down, mostly opaque', () => {
  const w = load();
  w.we.applyUserProperties({ showscore: { value: true } });
  w.frames();
  w.game.score.wins[0] = 2;
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'fillText');
  assert.ok(i >= 0, 'no score drawn');
  assert.equal(w.screen[i][2], 14);
  assert.equal(w.screen[i][3], 24);
  const alpha = w.screen.slice(0, i).filter(e => e[0] === '=globalAlpha').pop();
  assert.deepEqual(alpha, ['=globalAlpha', 0.85]);
});

test('the win text is drawn at a fifth of the screen height', () => {
  const w = load();
  w.frames();
  w.game.fighters[1].state = 'ko';
  w.game.checkRound(0.016);
  w.game.checkRound(1);
  w.render();
  const t = w.screen.find(e => e[0] === 'fillText' && e[1] === w.game.winnerText);
  assert.ok(t, 'no win text');
  assert.ok(near(t[3], 540 * 0.2), `win text at y = ${t[3]}`);
});
