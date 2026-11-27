// Pins what the livelier motion (#457), the combos (#458) and the ledge color can lose with every
// other test green (issue #467): the drawn joints f.V, their refresh on a resize, the
// follow-through, the lag from the parent joint, and the rules that let a strike chain on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg, mulberry32 } from './load-main.mjs';

const DT = 1 / 60;

// A 2D context that logs every method call as [name, ...args] and every property set as
// ['=name', value]
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? () => ({ width: 40 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}
// The wallpaper with a recording screen, its listeners and its animation frame
function drawn(query = '?count=2') {
  const screen = [], listeners = {};
  let next = null;
  const { window } = loadMain({
    search: query, random: mulberry32(1),
    canvas: { getContext: () => recorder(screen), style: {}, width: 0, height: 0 },
    document: { createElement: () => { const c = { width: 0, height: 0, style: {} }; c.getContext = () => recorder([]); return c; } },
    window: { addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  const game = window.__stickmanBrawl;
  return { game, window, screen, listeners, frame: t => { screen.length = 0; next(t); }, render: () => { screen.length = 0; game.render(); } };
}
// f's drawn joints set apart from its game joints, as the spring and lag can carry them
function moveView(f, dx) {
  f.V = Object.fromEntries(Object.entries(f.W).map(([k, p]) => [k, { x: p.x + dx, y: p.y }]));
  return f.V;
}

// ---------- The drawn joints ----------
test('a fighter is drawn at its drawn joints f.V, not its game joints', () => {
  const w = drawn();
  w.game.update(DT);
  const f = w.game.fighters[0], V = moveView(f, 120);
  w.render();
  const at = J => w.screen.some(e => e[0] === 'arc' && e[1] === J.head.x && e[2] === J.head.y && e[3] === w.game.L.head);
  assert.ok(at(V), 'no head drawn at f.V');
  assert.ok(!at(f.W), 'a head drawn at f.W');
});

test('an aura rises from the drawn joints f.V', () => {
  const w = drawn();
  w.game.update(DT);
  const f = w.game.fighters[0];
  f.aura = 1;
  const V = moveView(f, 200), xs = Object.values(V).map(p => p.x);
  w.render();
  const starts = [];
  for (let i = 0; i < w.screen.length; i++) {
    if (JSON.stringify(w.screen[i]) !== '["=globalCompositeOperation","lighter"]') continue;
    for (let j = i; j < w.screen.length && w.screen[j][0] !== 'restore'; j++) if (w.screen[j][0] === 'moveTo') starts.push(w.screen[j][1]);
  }
  assert.ok(starts.length >= 12, 'no aura drawn');
  for (const x of starts) assert.ok(x >= Math.min(...xs) - 9 && x <= Math.max(...xs) + 9, 'an aura wisp starts at ' + x + ', away from f.V');
});

test('a held staff is drawn in the hand of the drawn joints f.V', () => {
  const w = drawn();
  w.game.update(DT);
  const f = w.game.fighters[0];
  f.held = { kind: 'staff', n: 3 }; f.move = null;
  const V = moveView(f, 120), H = V.hF, T = w.game.staffTip(V, 'hF');
  w.render();
  const i = w.screen.findIndex(e => e[0] === 'moveTo' && Math.abs(e[1] - (H.x - (T.x - H.x) * 0.35)) < 1e-9 && Math.abs(e[2] - (H.y - (T.y - H.y) * 0.35)) < 1e-9);
  assert.ok(i > 0, 'no staff drawn from the hand of f.V');
  assert.deepEqual(w.screen[i + 1], ['lineTo', T.x, T.y]);
});

test('a resize takes the drawn joints f.V again, as it takes f.W (#388)', () => {
  const w = drawn();
  w.frame(16);
  const f = w.game.fighters[0];
  f.x = 900;
  w.window.innerWidth = 640;
  for (const g of w.listeners.resize) g();
  assert.ok(f.x < 640, 'the resize did not move the fighter');
  const want = f.viewJoints();
  for (const k in want) {
    assert.ok(Math.abs(f.V[k].x - want[k].x) < 1e-9 && Math.abs(f.V[k].y - want[k].y) < 1e-9, k + ' drawn at ' + f.V[k].x + ', not ' + want[k].x);
  }
});

// ---------- The follow-through and the lag ----------
test('half way through the follow-through, the pose is half way from A to F', () => {
  const { game } = loadMain({ random: lcg(3) });
  const { MOVES, GUARD, FOLLOW } = game;
  const [a, e] = game.fighters;
  const easeOut = u => 1 - (1 - u) * (1 - u);
  for (const m of MOVES) {
    Object.assign(e, { x: 3000, state: 'hit', st: 0, dur: 999, hp: 1e3 });
    Object.assign(a, { x: 600, z: 60, alt: 0, va: 0, vx: 0, state: 'idle', facing: 1, cool: 99, rot: 0 });
    a.target = e; a.startMove(m);
    a.st = m.wind + m.act + m.rec * FOLLOW * 0.5; a.updAttack(0);
    for (const k of Object.keys(GUARD)) {
      const want = m.A[k] + (m.F[k] - m.A[k]) * easeOut(0.5);
      assert.ok(Math.abs(a.pose[k] - want) < 1e-6, m.id + ': ' + k + ' ' + a.pose[k] + ' vs ' + want);
    }
  }
});

test('a joint swung on a still body makes the head and hands hanging from it lag', () => {
  const { game } = loadMain({ random: lcg(11) });
  const f = game.fighters[0];
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, x: 600, z: 60, facing: 1 });
  f.resetLook();
  for (let i = 0; i < 10; i++) f.stepLook(DT);
  const most = { head: 0, hF: 0, hB: 0 };
  for (let i = 0; i < 30; i++) {
    for (const k of Object.keys(f.pose)) f.pose[k] += Math.sin(i * 0.5) * 0.15;
    f.stepLook(DT);
    for (const k in most) most[k] = Math.max(most[k], Math.hypot(f.look.lag[k].x, f.look.lag[k].y));
  }
  for (const k in most) assert.ok(most[k] > 0.5, k + ' lagged only ' + most[k] + ' px');
});

// ---------- Combos ----------
const jab = game => game.MOVES.find(m => m.id === 'jab');
// As in combo.test.mjs: a strikes first, unwarned, from the middle of m's reach at e, which
// stands reeling
function combo(seed, m = 'jab') {
  const { game } = loadMain({ seed });
  const [a, e] = game.fighters;
  const mv = game.MOVES.find(x => x.id === m), r = mv.range;
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 300 + (r[0] + r[1]) / 2, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, e, m: mv };
}
// Runs a's attack; each(frame info) is called after every step, with landed true on the step
// its strike lands. Returns the ids of the strikes thrown in a row.
function run(game, a, each = () => {}) {
  const ids = [a.move.id];
  let cur = a.move, was = a.hitDone;
  for (let t = 0; t < 3 && a.state === 'attack'; t += DT) {
    const st = a.st;
    game.update(DT);
    if (a.state === 'attack' && a.move !== cur) { ids.push(a.move.id); each({ switched: true, st, prev: cur }); cur = a.move; was = a.hitDone; continue; }
    each({ landed: a.hitDone && !was });
    was = a.hitDone;
  }
  return ids;
}

test('a strike that lands as the last of COMBO_MAX chains no further', () => {
  let chained = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const before of [1, 2]) {
      const { game, a, m } = combo(seed);
      a.combo = game.COMBO_MAX - before;
      a.startMove(m, true, true);
      let chain = false;
      run(game, a, s => { if (s.landed && a.chain) chain = true; });
      if (before === 1) assert.ok(!chain, 'seed ' + seed + ': strike ' + (game.COMBO_MAX + 1) + ' set up');
      else if (chain) chained++;
    }
  }
  assert.ok(chained >= 10, 'a strike before the last chained in ' + chained + ' of 40 seeds');
});

test('a combo strike is aimed at where a sliding target will be', () => {
  // A target pushed away fast as the strike lands slides out of the reach of a strike that
  // fits the distance it has now
  let set = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a, e, m } = combo(seed);
    a.startMove(m, true);
    let pushed = false;
    run(game, a, () => { if (a.chain && !pushed) { pushed = true; set++; e.vx = 250 * Math.sign(e.x - a.x); } });
    assert.equal(game.stats.whiff, 0, 'seed ' + seed + ': a chained strike missed the sliding target');
  }
  assert.ok(set >= 10, 'combos set up in ' + set + ' of 40 seeds');
});

test('only a target left reeling can be chained on', () => {
  let other = 0;
  for (const first of Object.keys(loadMain().game.COMBO_NEXT)) {
    for (let seed = 1; seed <= 20; seed++) {
      const { game, a, e, m } = combo(seed, first);
      a.startMove(m, true);
      run(game, a, s => {
        if (!s.landed || e.state === 'hit') return;
        other++;
        assert.equal(a.chain, null, 'seed ' + seed + ': ' + first + ' chains on a target ' + e.state);
      });
    }
  }
  assert.ok(other >= 20, 'only ' + other + ' strikes left their target in another state');
});

test('a strike that lands in mid-air chains no combo', () => {
  let aloft = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a, m } = combo(seed);
    a.alt = 20;
    a.startMove(m, true);
    run(game, a, s => {
      if (!s.landed || !a.aloft()) return;
      aloft++;
      assert.equal(a.chain, null, 'seed ' + seed + ': a combo chained in mid-air');
    });
  }
  assert.ok(aloft >= 20, 'only ' + aloft + ' strikes landed in mid-air');
});

test('a combo does not chain on to a target out of depth or height', () => {
  // Steps until the combo is set up, then moves the target as told and lets it chain on
  function chainsOn(seed, move) {
    const { game, a, e, m } = combo(seed);
    a.startMove(m, true);
    for (let t = 0; t < 1 && !a.chain && a.state === 'attack'; t += DT) game.update(DT);
    if (!a.chain) return null;
    move(e, a);
    a.st = m.wind + m.act + m.rec * game.FOLLOW; a.updAttack(0);
    return a.move !== m;
  }
  let near = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ok = chainsOn(seed, () => {});
    if (!ok) continue;
    near++;
    assert.equal(chainsOn(seed, (e, a) => { e.z = a.z + 20; }), false, 'seed ' + seed + ': chained on a target 20 deep away');
    assert.equal(chainsOn(seed, (e, a) => { e.alt = a.alt + 40; }), false, 'seed ' + seed + ': chained on a target 40 above');
  }
  assert.ok(near >= 10, 'chained in only ' + near + ' of 40 seeds');
});

test('a combo strike starts only once the follow-through is over', () => {
  let switched = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { game, a, m } = combo(seed);
    a.startMove(m, true);
    run(game, a, s => {
      if (!s.switched) return;
      switched++;
      const p = s.prev, end = p.wind + p.act + p.rec * game.FOLLOW;
      assert.ok(s.st + DT >= end - 1e-9, 'seed ' + seed + ': ' + p.id + ' chained at ' + (s.st + DT).toFixed(3) + ', before ' + end.toFixed(3));
    });
  }
  assert.ok(switched >= 10, 'only ' + switched + ' chained strikes');
});

// ---------- Ledges ----------
test('ledges are drawn in the Line color', () => {
  const w = drawn();
  w.window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true }, linecolor: { value: '1 0 0' } });
  w.frame(16);
  const line = w.game.cfg.line, p = w.game.platforms[0];
  assert.notEqual(line, '#ececec');
  const top = w.screen.findIndex(e => e[0] === 'fillRect' && Math.abs(e[1] - p.x0) < 1e-9 && Math.abs(e[2] - p.y) < 1e-9 && e[4] === 2.5);
  assert.ok(top > 0, 'no ledge drawn');
  assert.deepEqual(w.screen.slice(0, top).filter(e => e[0] === '=fillStyle').pop(), ['=fillStyle', line]);
});
