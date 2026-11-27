// Runs main.js in a sandbox with a stubbed canvas and window, then pins fighter AI rules
// that could break with every other test green (issue #319): which moves pickMove offers,
// how often a fighter picks a new target, how it walks up to a downed one, when it double
// jumps or waits in the air, the jump up to a ledge, which attacks a substitution answers,
// and items out of reach on another surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// A copy of main.js that also exposes, as window.__in, the internals these tests read or call
const EXPOSE = 'window.__in = { MOVE_BY, BOOMERANG, hitStop, steerBoomerang, music,' +
  ' get freeze() { return freeze; }, get worldW() { return worldW; } };';

// Loads the wallpaper with a seeded Math.random (an LCG), so every run is the same. Every
// fighter flinches on the floor at the far right, out of the way, until a test moves it.
function load(props = {}, count = 2, seed = 319) {
  const listeners = {};
  const { game, window } = loadMain({
    search: '?count=' + count + '&mode=ffa', seed, expose: EXPOSE, properties: props,
    window: { addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } },
  });
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
    f.W = f.joints();
  }
  return { game, inn: window.__in, listeners, a: game.fighters[0], e: game.fighters[1] };
}
const DT = 1 / 60;

test('the reactive specials (shield, smoke, substitution) are never picked as attacks', () => {
  const { game, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'magic';
  Object.assign(a, { x: 400, state: 'idle' });
  Object.assign(e, { x: 450 });
  for (let i = 0; i < 500; i++) {
    const m = game.pickMove(a, e, 50);
    assert.ok(!m.reactive, 'picked ' + m.id + ' with the target 50 away');
  }
});

test('an airborne fighter is offered only the specials that work in the air', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 400, alt: 150, state: 'air' });
  Object.assign(e, { x: 600 });
  const picked = new Set();
  for (let i = 0; i < 2000; i++) {
    const m = game.pickMove(a, e);
    picked.add(m.id);
    assert.ok(m.type && m.air, 'picked ' + m.id + ' in the air');
  }
  assert.ok(picked.size > 3, 'only ' + [...picked].join(', '));
});

test('a full music beat makes specials three times as likely, weight for weight', () => {
  const { game, inn, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'boxing' || s === 'super';
  Object.assign(a, { x: 400, state: 'idle' });
  Object.assign(e, { x: 500 });
  // Every special of the style is open here except the wall run, which needs a wall nearby
  const M = game.MOVES.filter(m => m.style === 'boxing').reduce((s, m) => s + m.w, 0);
  const S = game.SUPER.filter(m => !m.needWall).reduce((s, m) => s + m.w * 1.6, 0);
  const share = k => k * S / (M + k * S);
  Object.assign(game.cfg, { audio: true, audioStrength: 1 });
  const N = 6000;
  let specials = 0;
  for (let i = 0; i < N; i++) {
    Object.assign(inn.music, { beat: 1, level: 0, hold: 0, t: performance.now() });
    if (game.pickMove(a, e).type) specials++;
  }
  const p = specials / N, half = (share(3) - share(2)) / 2;
  assert.ok(Math.abs(p - share(3)) < half, `specials ${p.toFixed(3)} of picks; x3 gives ${share(3).toFixed(3)}, x2 ${share(2).toFixed(3)}`);
});

test('an idle fighter picks its target again every 1.2 to 3 s', () => {
  const { a, e } = load();
  Object.assign(a, { x: 400, state: 'idle', cool: 999, target: e, retarget: 0 });
  for (let i = 0; i < 20; i++) {
    a.retarget = 0;
    a.updIdle(DT);
    assert.ok(a.retarget >= 1.2 && a.retarget <= 3, 'next pick in ' + a.retarget.toFixed(2) + ' s');
  }
});

test('a fighter walks up to a target lying on the floor, and waits a little way off', () => {
  const { a, e } = load();
  Object.assign(e, { x: 700, state: 'down', st: 0, downDur: 999 });
  Object.assign(a, { x: 300, state: 'idle', cool: 999, target: e, retarget: 999 });
  for (let t = 0; t < 2; t += DT) { a.retarget = 999; a.update(DT); }
  assert.ok(a.x > 550 && a.x < 700, 'ended at x ' + a.x.toFixed(0));
});

test('a fighter high above its target does not double jump; one level with it does', () => {
  let level = 0;
  for (const [ealt, can] of [[0, false], [150, true]]) {
    const { a, e } = load();
    Object.assign(e, { x: 440, alt: ealt });
    for (let i = 0; i < 200; i++) {
      Object.assign(a, { x: 400, alt: 150, va: 0, state: 'air', dj: false, dashed: true, cool: 0, dash: 0, target: e,
        move: null, md: null, hover: false });
      a.updAir(DT);
      if (!can) assert.equal(a.dj, false, 'double jumped at alt 150 over a target on the floor');
      else if (a.dj) level++;
    }
  }
  assert.ok(level > 20, 'double jumped ' + level + ' of 200 times level with the target');
});

test('a fighter in the air waits a moment after finding no special in reach', () => {
  const { a, e } = load();
  Object.assign(e, { x: 410, alt: 150 });
  for (let i = 0; i < 50; i++) {
    Object.assign(a, { x: 400, alt: 150, va: 0, state: 'air', dj: true, dashed: true, cool: 0, dash: 0, target: e });
    a.updAir(DT);
    assert.equal(a.state, 'air', 'started a move 10 away in the air');
    assert.ok(a.cool >= 0.15 && a.cool <= 0.4, 'waits ' + a.cool.toFixed(3) + ' s');
  }
});

test('the jump up to a target on a ledge carries the fighter toward it', () => {
  for (const side of [-1, 1]) {
    const { game, a, e } = load({ platforms: { value: true } });
    const p = game.platforms.reduce((h, q) => (q.y < h.y ? q : h));
    const z = 30;
    Object.assign(e, { x: side > 0 ? p.x1 - 20 : p.x0 + 20, z, alt: game.groundY(z) - p.y });
    Object.assign(a, { x: side > 0 ? p.x0 + 20 : p.x1 - 20, z, alt: 0, state: 'idle' });
    let jumped = false;
    for (let i = 0; i < 2000 && !jumped; i++) { a.vx = 0; jumped = a.chaseSurface(e, DT); }
    assert.ok(jumped, 'never jumped');
    assert.equal(a.state, 'air');
    assert.equal(a.vx, side * 120, 'sideways speed at the jump');
  }
});

test('a throw is never answered with a readied substitution; a strike sometimes is', () => {
  let subs = 0;
  for (const id of ['seoinage', 'jab']) {
    const { game, a, e } = load();
    a.move = game.MOVES.find(m => m.id === id);
    Object.assign(a, { x: 400, facing: 1, state: 'attack' });
    for (let i = 0; i < 400; i++) {
      e.clearMove();
      Object.assign(e, { x: 420, z: 60, state: 'idle', subFrom: null, evade: 0, vx: 0 });
      a.warn(40, !!a.move.grab);
      if (a.move.grab) assert.equal(e.subFrom, null, 'a throw readied a substitution');
      else if (e.subFrom) subs++;
    }
  }
  assert.ok(subs > 10, 'a strike readied ' + subs + ' substitutions in 400 warnings');
});

test('a hurt fighter on the floor does not walk under a ledge to a heart lying on top of it', () => {
  const { game, a, e } = load({ platforms: { value: true }, items: { value: true } });
  const p = game.platforms[0];
  const z = 20;
  const it = game.spawnItem('heart', (p.x0 + p.x1) / 2, z, game.groundY(z) - p.y);
  it.rest = true;
  const x0 = p.x1 + 60;
  Object.assign(e, { x: x0 + 400, z, state: 'hit', dur: 999 });
  Object.assign(a, { x: x0, z, state: 'idle', hp: 50, cool: 999, target: e, retarget: 999 });
  for (let t = 0; t < 2; t += DT) { a.retarget = 999; a.cool = 999; a.update(DT); }
  assert.ok(a.x > x0 + 50, `ledge ${p.x0.toFixed(0)}-${p.x1.toFixed(0)}, heart at ${it.x.toFixed(0)}: walked from ${x0.toFixed(0)} to ${a.x.toFixed(0)}`);
  assert.ok(game.items.includes(it), 'the heart is still on the ledge');
});
