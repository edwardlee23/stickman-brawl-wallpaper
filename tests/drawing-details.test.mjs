// Pins drawing details a change could drop with every other test green (issue #321): the win
// text and its outline, the substitution log, ghost fists, fades, the floor line, the comic
// sunburst, the music glow, the crown, rings, ledges, the score outline, the DRAW banner,
// fire, item sparks and shadows, the held staff, sparks and afterimages.
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
  const document = {
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); made.push(c); return c; },
  };
  let next = null;
  const { window } = loadMain({
    search: query, canvas, document, random: mulberry32(seed),
    window: { addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
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
const worldW = 1280 / S, worldH = 540;
// The last value given to a property before entry i of the log
const lastSet = (log, i, k) => { for (let j = i - 1; j >= 0; j--) if (log[j][0] === '=' + k) return log[j][1]; };
// A copy of joints J moved dx to the right
const shift = (J, dx) => Object.fromEntries(Object.entries(J).map(([k, p]) => [k, { x: p.x + dx, y: p.y }]));
// Index of the torso path (hip, shoulders, head) of joints J, drawn at this alpha
const torsoAt = (log, J, alpha) => seq(log, [['=globalAlpha', alpha], ['beginPath'], ['moveTo', J.hip.x, J.hip.y], ['lineTo', J.sh.x, J.sh.y], ['lineTo', J.head.x, J.head.y], ['stroke']]);
// A loaded wallpaper one frame in, with no effects left from that frame
function ready(opts) {
  const w = load(opts);
  w.frames();
  w.game.fx.length = 0;
  return w;
}

// ---------- Text ----------
test('the win text is drawn with a 6 px black outline under its fill, centred at a fifth of the height', () => {
  const w = ready();
  w.game.fighters[1].state = 'ko';
  w.game.checkRound(0.016);
  w.game.checkRound(1);
  w.render();
  const text = w.game.winnerText;
  const s = w.screen.findIndex(e => e[0] === 'strokeText' && e[1] === text);
  const f = w.screen.findIndex(e => e[0] === 'fillText' && e[1] === text);
  assert.ok(s >= 0, 'no outline');
  assert.ok(f > s, 'no fill over the outline');
  for (const i of [s, f]) {
    assert.ok(near(w.screen[i][2], worldW / 2) && near(w.screen[i][3], worldH * 0.2), `${w.screen[i][0]} at ${w.screen[i][2]}, ${w.screen[i][3]}`);
  }
  assert.equal(lastSet(w.screen, s, 'lineWidth'), 6);
  assert.equal(lastSet(w.screen, s, 'strokeStyle'), '#000000');
});

test('a draw is announced in the line color', () => {
  const w = ready();
  w.we.applyUserProperties({ linecolor: { value: '0.2 0.6 1' } });
  for (const f of w.game.fighters) f.state = 'ko';
  w.game.checkRound(0.016);
  assert.equal(w.game.winnerText, 'DRAW');
  w.game.checkRound(1);
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'fillText' && e[1] === 'DRAW');
  assert.ok(i >= 0, 'no DRAW drawn');
  assert.equal(lastSet(w.screen, i, 'fillStyle'), w.game.cfg.line);
});

test('the score board text has a 3 px black outline', () => {
  const w = ready();
  w.we.applyUserProperties({ showscore: { value: true } });
  w.game.score.wins[0] = 2;
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'fillText');
  assert.ok(i >= 0, 'no score drawn');
  const s = w.screen.findIndex(e => e[0] === 'strokeText' && e[1] === w.screen[i][1]);
  assert.ok(s >= 0 && s < i, 'no outline under the score');
  assert.deepEqual(w.screen[s].slice(2), [14, 24]);
  assert.equal(lastSet(w.screen, s, 'lineWidth'), 3);
  assert.equal(lastSet(w.screen, s, 'strokeStyle'), '#000000');
});

// ---------- Effects ----------
// The log entries drawFx makes for one effect on its own
function fxLog(w, o) {
  w.game.fx.length = 0;
  w.game.fx.push(o);
  w.render();
  return w.screen;
}

test('the substitution log topples the way its dir says, then fades', () => {
  const w = ready();
  for (const dir of [-1, 1]) {
    for (const t of [0.35, 0.5]) {
      const log = fxLog(w, { type: 'log', x: 300, y: 400, dir, t, dur: 1 });
      const r = log.find(e => e[0] === 'rotate');
      assert.ok(r, 'no log drawn');
      assert.ok(near(r[1], dir * Math.PI / 2), `dir ${dir} at t ${t} rotated by ${r[1]}`);
    }
  }
  const log = fxLog(w, { type: 'log', x: 300, y: 400, dir: 1, t: 0.9, dur: 1 });
  const i = log.findIndex(e => e[0] === 'rotate');
  const alpha = log.slice(i).find(e => e[0] === '=globalAlpha');
  assert.ok(near(alpha[1], 0.4), `log alpha ${alpha[1]} at 90 % of its time`);
  const early = fxLog(w, { type: 'log', x: 300, y: 400, dir: 1, t: 0.1, dur: 1 }).find(e => e[0] === 'rotate');
  assert.ok(early[1] > 0 && early[1] < Math.PI / 2, `still falling at t 0.1, rotated by ${early[1]}`);
});

test('a flash fades out over its time', () => {
  const w = ready();
  w.we.applyUserProperties({ reducemotion: { value: false } });
  const full = { x: -50, y: -50, w: worldW + 100, h: worldH + 100 };
  for (const [t, a] of [[0, 0.35], [0.5, 0.175], [0.9, 0.035]]) {
    const log = fxLog(w, { type: 'flash', t, dur: 1 });
    const i = log.findIndex(e => e[0] === 'fillRect' && near(e[1], full.x) && near(e[2], full.y) && near(e[3], full.w) && near(e[4], full.h));
    assert.ok(i >= 0, 'no flash drawn');
    assert.ok(near(lastSet(log, i, 'globalAlpha'), a), `flash alpha ${lastSet(log, i, 'globalAlpha')} at t ${t}`);
  }
});

test('a crack holds, then fades over the last 30 % of its time', () => {
  const w = ready();
  for (const [t, a] of [[1, 0.55], [4.25, 0.275]]) {
    const log = fxLog(w, { type: 'crack', kind: 'wall', x: 123, y: 456, size: 20, lines: [[[123, 456], [140, 470]]], t, dur: 5 });
    const i = seq(log, [['beginPath'], ['moveTo', 123, 456], ['lineTo', 140, 470], ['stroke']]);
    assert.ok(i >= 0, 'no crack drawn');
    assert.ok(near(lastSet(log, i, 'globalAlpha'), a), `crack alpha ${lastSet(log, i, 'globalAlpha')} at t ${t}`);
  }
});

test('a flat ring is an ellipse squashed to 0.22, a round one a circle', () => {
  const w = ready();
  const ring = flat => ({ type: 'ring', x: 200, y: 300, r0: 10, r1: 10, w: 2, dur: 1, t: 0, flat });
  let log = fxLog(w, ring(true));
  assert.ok(log.some(e => e[0] === 'ellipse' && e[1] === 200 && e[2] === 300 && near(e[3], 10) && near(e[4], 2.2)), 'no flat ring');
  assert.ok(!log.some(e => e[0] === 'arc' && e[1] === 200 && e[2] === 300), 'a flat ring drawn as a circle');
  log = fxLog(w, ring(false));
  assert.ok(log.some(e => e[0] === 'arc' && e[1] === 200 && e[2] === 300 && near(e[3], 10)), 'no round ring');
});

// ---------- Fighters ----------
test('ghost fists are thrown on the side the fighter faces', () => {
  const w = ready();
  for (const facing of [1, -1]) {
    const f = w.game.fighters[0];
    f.facing = facing; f.ghost = true;
    w.render();
    const sh = f.W.sh;
    const fists = w.screen.filter(e => e[0] === 'arc' && e[3] === 2.6 && e[2] >= sh.y - 16 && e[2] <= sh.y + 10);
    const ahead = fists.filter(e => (e[1] - sh.x) * facing >= 16 && (e[1] - sh.x) * facing <= 38);
    assert.equal(ahead.length, 7, `${ahead.length} of ${fists.length} fists ahead when facing ${facing}`);
    f.ghost = false;
  }
});

test('shadow clones and afterimages are drawn faded', () => {
  const w = ready();
  const f = w.game.fighters[0];
  f.trail = [{ p: shift(f.W, 60), life: 0.5 }];
  w.render();
  assert.ok(torsoAt(w.screen, shift(f.W, 60), 0.5 * 0.3) >= 0, 'no afterimage at 0.15');
  f.trail = [];
  f.startMove(w.game.NINJA.find(m => m.id === 'clones'));
  f.md.clones = [{ x: f.x + 80, alt: 0, fac: 1, a: 0.4 }];
  w.render();
  assert.ok(torsoAt(w.screen, shift(f.W, 80), 0.5 * 0.4) >= 0, 'no clone at 0.2');
});

test('a king wears the crown only while not knocked out', () => {
  const w = ready();
  const f = w.game.fighters[0];
  f.king = true;
  w.render();
  const crowns = () => w.screen.filter(e => e[0] === '=fillStyle' && e[1] === '#ffd43b').length;
  assert.equal(crowns(), 1, 'no crown on a standing king');
  f.state = 'ko';
  w.render();
  assert.equal(crowns(), 0, 'a crown on a knocked-out king');
});

test('the music glow is turned off after each skeleton', () => {
  const w = ready();
  w.we.applyUserProperties({ reducemotion: { value: false } });
  Object.assign(w.game.cfg, { audio: true, audioStrength: 1 });
  Object.assign(w.game.music, { beat: 1, t: 0 });
  w.render();
  const glows = w.screen.map((e, i) => [e, i]).filter(([e]) => e[0] === '=shadowBlur' && near(e[1], 10));
  assert.ok(glows.length >= 2, `${glows.length} glowing skeletons`);
  for (const [, i] of glows) {
    const next = w.screen.slice(i + 1).find(e => e[0] === '=shadowBlur');
    assert.deepEqual(next, ['=shadowBlur', 0]);
  }
});

test('a held staff is drawn in the hand that strikes with it, else the front hand', () => {
  const w = ready();
  const f = w.game.fighters[0];
  f.held = { kind: 'staff', n: 3 };
  // The staff runs from 0.35 of its length behind the hand to its tip, so the hand is at
  // (start + 0.35 tip) / 1.35
  const inHand = hand => {
    w.render();
    const H = f.W[hand];
    return w.screen.some((e, i) => {
      if (e[0] !== 'moveTo' || w.screen[i + 1][0] !== 'lineTo' || w.screen[i + 2][0] !== 'stroke' || lastSet(w.screen, i, 'strokeStyle') !== '#a0703f') return false;
      const [, x0, y0] = e, [, x1, y1] = w.screen[i + 1];
      return Math.abs((x0 + 0.35 * x1) / 1.35 - H.x) < 1e-6 && Math.abs((y0 + 0.35 * y1) / 1.35 - H.y) < 1e-6;
    });
  };
  assert.ok(inHand('hF'), 'not in the front hand');
  f.move = { staff: true, hit: 'hB' };
  assert.ok(inHand('hB'), 'not in the striking back hand');
});

// ---------- Backdrop ----------
test('the floor has a faint band and a front edge line', () => {
  const w = ready();
  w.render();
  const edge = w.screen.findIndex(e => e[0] === 'fillRect' && e[1] === -20 && near(e[3], worldW + 40) && e[4] === 0.7);
  assert.ok(edge >= 0, 'no front edge');
  assert.equal(lastSet(w.screen, edge, 'globalAlpha'), 0.12);
  const band = w.screen.findIndex(e => e[0] === 'fillRect' && e[1] === -20 && near(e[3], worldW + 40) && e[4] !== 0.7);
  assert.ok(band >= 0 && band < edge, 'no floor band');
  assert.equal(lastSet(w.screen, band, 'globalAlpha'), 0.035);
});

test('the comic backdrop has a sunburst of 24 rays from the centre', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'comic' } });
  w.frames();
  const log = w.made.find(c => c.log.length).log;
  const rays = log.filter((e, i) => e[0] === 'moveTo' && e[1] === 640 && e[2] === 360 && log[i + 1][0] === 'lineTo' && log[i + 2][0] === 'lineTo' && log[i + 3][0] === 'fill');
  assert.equal(rays.length, 24);
});

test('a ledge underside is drawn faint', () => {
  const w = load();
  w.we.applyUserProperties({ platforms: { value: true } });
  w.frames();
  const p = w.game.platforms[0];
  const i = w.screen.findIndex(e => e[0] === 'fillRect' && near(e[1], p.x0 + 3) && near(e[2], p.y + 2.5) && e[4] === 4);
  assert.ok(i >= 0, 'no underside');
  assert.equal(lastSet(w.screen, i, 'globalAlpha'), 0.15);
});

// ---------- Fire, items and sparks ----------
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

const FIRE = '#ff8a3d';   // ELEMENT.fire
test('a fireball trails fire sparks, leaves a flame on the floor and on a fighter it hits', () => {
  const w = ready();
  const g = w.game, [a, b] = g.fighters;
  const fire = extra => ({ kind: 'fire', vx: 0, vy: 0, z: b.z, col: FIRE, life: 2, age: 0, owner: a, m: g.MAGIC.find(m => m.id === 'fireball'), dmg: 1, ...extra });
  // In flight in open air, high above everyone
  g.shots.length = 0;
  g.shots.push(fire({ x: 480, y: 40 }));
  for (let i = 0; i < 10; i++) g.update(0.01);
  w.render();
  assert.ok(sparkLines(w).some(([, c]) => c === FIRE), 'no fire sparks behind the fireball');
  // Coming down onto the floor
  g.shots.length = 0; g.fx.length = 0;
  g.shots.push(fire({ x: 480, y: g.groundY(b.z) - 1, vy: 300, z: b.z }));
  g.update(0.01);
  const ground = g.fx.find(o => o.type === 'flame');
  assert.ok(ground, 'no flame on the floor');
  assert.equal(ground.dur, 0.7);
  // Into a fighter
  g.shots.length = 0; g.fx.length = 0;
  const H = b.W.sh;
  g.shots.push(fire({ x: H.x - 4, y: H.y, vx: 400 }));
  g.update(0.01);
  const hit = g.fx.find(o => o.type === 'flame');
  assert.ok(hit, 'no flame on the fighter hit');
  assert.equal(hit.dur, 0.5);
});

test('an item kicks up 4 sparks where it lands, and its shadow is faint', () => {
  const w = ready();
  w.we.applyUserProperties({ items: { value: true } });
  const g = w.game;
  g.items.length = 0;
  g.spawnItem('heart', 480, 20, 0.01);
  g.update(0.01);
  assert.ok(g.items[0].rest, 'the item has not landed');
  w.render();
  assert.equal(sparkLines(w).filter(([, c]) => c === 'rgba(200,200,200,0.6)').length, 4);
  const i = w.screen.findIndex(e => e[0] === 'ellipse' && e[1] === 480 && e[3] === 8 && e[4] === 1.8);
  assert.ok(i >= 0, 'no item shadow');
  assert.equal(lastSet(w.screen, i, 'globalAlpha'), 0.12);
});

test('sparks fall at 300 per second squared and burn out in 0.4 s', () => {
  const w = ready();
  w.we.applyUserProperties({ clickblast: { value: true } });
  w.click(60, 60);
  const lit = () => { w.render(); return sparkLines(w).filter(([, c]) => c === '#ffe28a'); };
  // Each is drawn from its point back 0.03 s along its velocity
  const vy = ([, , from, to]) => (from.y - to.y) / 0.03;
  const before = lit();
  assert.ok(before.length > 0, 'no sparks');
  w.game.update(0.1);
  const after = lit();
  assert.equal(after.length, before.length);
  after.forEach((s, i) => {
    assert.ok(Math.abs(vy(s) - vy(before[i]) - 30) < 1e-6, `vy went from ${vy(before[i])} to ${vy(s)}`);
    assert.ok(near(s[0], 0.75), `spark alpha ${s[0]} after 0.1 s`);
  });
});

test('afterimages are taken every 0.03 s and fade at 3.5 a second', () => {
  const w = ready();
  const f = w.game.fighters[0];
  f.trailOn = true; f.trailT = 0; f.trail = [];
  w.game.update(0.001);
  assert.equal(f.trail.length, 1);
  assert.ok(near(f.trailT, 0.03), `next afterimage in ${f.trailT}`);
  assert.ok(near(f.trail[0].life, 1 - 0.001 * 3.5), `afterimage life ${f.trail[0].life}`);
});
