// Runs main.js in a sandbox with a recording canvas and a stubbed window, then pins the item
// and round setup rules that could break with every other test green (issue #271): one heart
// for one fighter, the boomerang's warning, the staff's push, the walk to an item at another
// depth, pickup while blocking, item gravity, the throw pose, heart sparks, the item bob and
// the boomerang spin; the teams pairing, starting facings, Ladder's waiting rows, its step-in
// cooldown and its targeting. The teams score by team is in score.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('wallpaper/main.js', 'utf8');
const BOOMERANG_COL = '#d9a066', HEART_COL = '#ff6b8a';

// Loads the wallpaper. random is a fixed Math.random (0.99 turns off random jumps and dashes),
// or a seed for an LCG. calls records every canvas method called and every property set, as
// [name, ...args] and ['=' + name, value].
function load({ search = '?count=2&mode=ffa', random, seed = 1, props = {}, items = true } = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return k === 'measureText' ? { width: 8 } : { addColorStop() {} }; },
    set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  if (random) vm.runInContext('Math.random = () => ' + random + ';', context);
  else vm.runInContext(`{ let s = ${seed}; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }`, context);
  vm.runInContext(SRC, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  game.cfg.items = items;
  return { game, calls };
}
const run = (game, secs, until = () => false) => {
  for (let t = 0; t < secs && !until(); t += 1 / 60) game.update(1 / 60);
};
// Two fighters on one line: a idle, e held still in a hit it does not recover from
function duel(game, gap, dz = 0) {
  const [a, e] = game.fighters;
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, vz: 0, facing: 1, state: 'idle', cool: 99, retarget: 99, target: e, hp: 100 });
  Object.assign(e, { x: 400 + gap, z: 50 + dz, alt: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  return [a, e];
}
// The first call named name after the sequence of property sets in seq, from index from
const after = (calls, seq, name, from = 0) => {
  for (let i = from; i + seq.length < calls.length; i++) {
    if (!seq.every(([k, v], j) => calls[i + j][0] === '=' + k && calls[i + j][1] === v)) continue;
    const c = calls.slice(i + seq.length).find(c => c[0] === name);
    if (c) return c;
  }
  return null;
};

// ---------- Items ----------

test('one heart heals one fighter when two touch it in the same step (#271)', () => {
  const { game } = load();
  const [a, b] = game.fighters;
  for (const [f, x] of [[a, 400], [b, 403]]) {
    Object.assign(f, { x, z: 50, alt: 0, vx: 0, state: 'hit', st: 0, dur: 99, hp: 40, cool: 99 });
    f.W = f.joints();
  }
  game.spawnItem('heart', 401, 50, 0);
  game.update(1 / 60);
  assert.deepEqual([a.hp, b.hp].sort((x, y) => x - y), [40, 70]);
});

test('a heart that reaches the winner during the win banner heals nothing (#314)', () => {
  const { game } = load({ props: { roundrules: { value: 'survival' } } });
  const [a, e] = duel(game, 300);
  Object.assign(a, { state: 'hit', st: 0, dur: 99, hp: 40 });
  a.W = a.joints();
  e.ko(0, 0);
  game.update(1 / 60);
  assert.ok(game.winnerText.endsWith('WINS!'), 'the round was not decided');
  // A heart lands on the winner's hip while the banner is up
  a.W = a.joints();
  const heart = game.spawnItem('heart', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.ok(game.items.includes(heart), 'the heart was picked up');
  assert.equal(a.hp, 40);
  // Survival carries the winner's health, untouched by the heart, into the next round
  const prev = game.fighters;
  run(game, 6, () => game.fighters !== prev);
  assert.notEqual(game.fighters, prev, 'no new round');
  assert.equal(game.fighters[0].hp, 40);
});

test('a thrown boomerang warns its target, who mostly reacts (#271)', () => {
  let reacted = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const { game } = load({ seed });
    for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
    const [a, e] = duel(game, 200);
    Object.assign(e, { state: 'idle', cool: 99, retarget: 99 });
    a.held = { kind: 'boomerang' }; a.cool = 0;
    run(game, 1, () => game.shots.some(s => s.kind === 'boomerang'));
    assert.ok(game.shots.some(s => s.kind === 'boomerang'), 'not thrown with seed ' + seed);
    if (e.state !== 'idle' || e.evade > 0) reacted++;
  }
  // A warned fighter blocks or sidesteps on 37% of its draws; unwarned, it never reacts
  assert.ok(reacted >= N * 0.2, 'the target reacted ' + reacted + ' of ' + N + ' times');
});

test('a staff strike pushes 1.4 times as far as the bare strike (#271)', () => {
  const { game } = load();
  const f = game.fighters[0];
  f.held = { kind: 'staff', n: 3 };
  for (const id of ['jab', 'cross', 'hook', 'uppercut']) {
    const m = game.MOVES.find(m => m.id === id);
    const s = game.withStaff(f, m);
    assert.ok(s.staff, id + ' did not become a staff strike');
    assert.ok(Math.abs(s.push - m.push * 1.4) < 1e-9, id + ' pushes ' + s.push + ', bare ' + m.push);
  }
});

test('a hurt fighter walks to an item at another depth, front to back too (#271)', () => {
  const { game } = load({ random: 0.99 });
  const [a] = duel(game, 600);
  a.hp = 50;
  game.spawnItem('heart', 460, 100, 0);
  run(game, 1);
  assert.ok(a.z > 70, 'stayed at depth ' + a.z.toFixed(1) + ' with the heart at 100');
});

test('a blocking fighter picks up an item it stands on (#271)', () => {
  const { game } = load();
  const [a] = duel(game, 400);
  Object.assign(a, { state: 'block', st: 0, dur: 99, hp: 50 });
  a.W = a.joints();
  const heart = game.spawnItem('heart', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.ok(!game.items.includes(heart), 'the heart is still there');
  assert.equal(a.hp, 80);
});

test('a dropped item falls at 700 a second squared (#271)', () => {
  const { game } = load();
  duel(game, 400);
  const it = game.spawnItem('staff', 200, 50, 100);
  run(game, 0.3);
  // 100 - 700 * 0.3^2 / 2 = 68.5, a little less with the step
  assert.ok(it.alt > 60 && it.alt < 72, 'at alt ' + it.alt.toFixed(1) + ' after 0.3 s');
});

test('a fighter draws its hand back to throw a boomerang (#271)', () => {
  const { game } = load({ random: 0.99 });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a] = duel(game, 200);
  a.held = { kind: 'boomerang' }; a.cool = 0;
  let aF = Infinity;
  run(game, 1, () => {
    if (a.move && a.move.id === 'boomerang' && !a.md.t0) aF = Math.min(aF, a.pose.aF);
    return game.shots.some(s => s.kind === 'boomerang');
  });
  // The throwing pose holds the front arm back at -0.3; the guard holds it forward at 0.95
  assert.ok(aF < 0.2, 'the front arm went back only to ' + aF.toFixed(2));
});

test('a heart picked up gives off pink sparks (#271)', () => {
  const { game, calls } = load();
  const [a] = duel(game, 400);
  Object.assign(a, { state: 'hit', st: 0, dur: 99, hp: 50 });
  a.W = a.joints();
  game.spawnItem('heart', a.W.hip.x, a.z, 0);
  game.update(1 / 60);
  assert.equal(a.hp, 80);
  calls.length = 0;
  game.render();
  assert.ok(calls.some(c => c[0] === '=strokeStyle' && c[1] === HEART_COL), 'no pink sparks drawn');
});

test('an item at rest bobs up and down (#271)', () => {
  const { game, calls } = load();
  duel(game, 400);
  const it = game.spawnItem('heart', 200, 50, 0);
  const top = t => {
    it.t = t; calls.length = 0; game.render();
    const c = after(calls, [['fillStyle', HEART_COL], ['strokeStyle', '#ffffff']], 'moveTo');
    assert.ok(c, 'the heart was not drawn');
    return c[2];
  };
  // Its lift is |sin(3 t)| * 3: none at t = 0, nearly 3 at t = 0.5
  assert.ok(top(0) - top(0.5) > 2.5, 'the heart does not bob');
});

test('a thrown boomerang spins as it flies (#271)', () => {
  const { game, calls } = load({ random: 0.99 });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a] = duel(game, 200);
  a.held = { kind: 'boomerang' }; a.cool = 0;
  run(game, 1, () => game.shots.some(s => s.kind === 'boomerang'));
  const s = game.shots.find(s => s.kind === 'boomerang');
  assert.ok(s, 'not thrown');
  const arm = () => {
    calls.length = 0; game.render();
    const c = after(calls, [['strokeStyle', BOOMERANG_COL], ['lineWidth', 3], ['lineCap', 'round']], 'moveTo');
    assert.ok(c, 'the flying boomerang was not drawn');
    return Math.atan2(c[2] - s.y, c[1] - s.x);
  };
  const a0 = arm();
  s.age += 0.05;
  // It turns 20 radians a second, so 1 radian in 0.05 s
  const d = arm() - a0, turn = Math.atan2(Math.sin(d), Math.cos(d));
  assert.ok(Math.abs(turn - 1) < 0.01, 'turned ' + turn.toFixed(3) + ' in 0.05 s');
});

// ---------- Round setup ----------

test('in teams, each red fighter starts 60 left of the blue one it pairs with (#271)', () => {
  const { game } = load({ search: '?count=6&mode=teams', items: false });
  const f = game.fighters;
  for (let k = 0; k < 3; k++) {
    assert.equal(f[2 * k].team, 0); assert.equal(f[2 * k + 1].team, 1);
    assert.ok(Math.abs(f[2 * k + 1].x - f[2 * k].x - 60) < 1e-9, 'pair ' + k + ' is ' + (f[2 * k + 1].x - f[2 * k].x) + ' apart');
  }
});

test('free-for-all fighters start facing the middle (#271)', () => {
  const { game } = load({ search: '?count=6&mode=ffa', items: false });
  const mid = 960 / 2;
  for (const f of game.fighters) assert.equal(f.facing, f.x < mid ? 1 : -1, 'fighter ' + f.id + ' at x ' + f.x.toFixed(0));
});

// Six fighters under Ladder rules; returns the two in the bout and the four waiting
function ladder(seed = 1) {
  const { game } = load({ search: '?count=6&mode=ffa', seed, items: false, props: { roundrules: { value: 'ladder' } } });
  const bout = game.fighters.filter(f => f.state !== 'wait'), waiting = game.fighters.filter(f => f.state === 'wait');
  assert.equal(bout.length, 2); assert.equal(waiting.length, 4);
  return { game, bout, waiting };
}

test('Ladder waiting fighters stand 24 apart from the edge, facing the middle (#271)', () => {
  const { waiting } = ladder();
  const left = waiting.filter(f => f.x < 480).sort((a, b) => a.x - b.x);
  const right = waiting.filter(f => f.x > 480).sort((a, b) => b.x - a.x);
  // At 960 wide a row has room to spare, so it starts 30 from the edge at the full spacing
  assert.deepEqual(Array.from(left, f => Math.round(f.x)), [30, 54]);
  assert.deepEqual(Array.from(right, f => Math.round(960 - f.x)), [30, 54]);
  for (const f of left) assert.equal(f.facing, 1);
  for (const f of right) assert.equal(f.facing, -1);
});

test('a Ladder fighter stepping in waits under a second before its first move (#271)', () => {
  const { game, bout } = ladder();
  bout[0].W = bout[0].joints();
  bout[0].ko(0, 0);
  game.update(1 / 60);
  const next = game.fighters.filter(f => f.alive && f.state !== 'wait' && f !== bout[1]);
  assert.equal(next.length, 1, 'nobody stepped in');
  assert.ok(next[0].cool <= 0.8 && next[0].cool > 0.2, 'waits ' + next[0].cool.toFixed(2) + ' s');
});

test('Ladder bout fighters never target a waiting fighter (#271)', () => {
  const { game, bout } = ladder();
  // Even one fighting right beside the waiting row, far from its opponent
  bout[0].x = 70; bout[1].x = 700;
  for (let i = 0; i < 100; i++) {
    assert.equal(game.pickTarget(bout[0]), bout[1]);
    assert.equal(game.pickTarget(bout[1]), bout[0]);
  }
});
