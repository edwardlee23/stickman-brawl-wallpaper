// Runs main.js in a sandbox and checks fight rules that no other test pinned
// down (issue #131): warnings from throws and strikes, AI move choice, hit
// rules of specials, launches and landings, wall runs, smoke escapes and the
// slam's shockwave. Math.random is stubbed in every test, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper. Math.random returns rng(), which a test may replace
// (0.99 by default: no random jumps, dashes or reactions to a warning).
function load(count = 2) {
  const box = { rng: () => 0.99 };
  const { game, window } = loadMain({ search: `?count=${count}&mode=ffa`, random: () => box.rng() });
  const fighters = game.fighters;
  // Every fighter stands on the floor at the same depth, far apart, with plenty of health
  fighters.forEach((f, i) => Object.assign(f, { x: 100 + i * 200, z: 50, alt: 0, va: 0, vx: 0, vz: 0,
    state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of fighters) f.W = f.joints();
  return { game, box, window, fighters, a: fighters[0], e: fighters[1] };
}
const DT = 1 / 60;
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const place = (f, o) => { Object.assign(f, o); f.W = f.joints(); };
// Steps one fighter alone, so every other fighter keeps the state the test gave it
function run(f, stop, seconds = 3) {
  for (let t = 0; t < seconds && !stop(); t += DT) { f.update(DT); if (!f.rag) f.W = f.joints(); }
}

// ---- Warnings ----

for (const id of ['shuriken', 'fireball']) {
  test(`a ${id} throw warns the target, which can block it (issue #38)`, () => {
    const { game, box, a, e } = load();
    box.rng = () => 0.1;   // A warned fighter blocks
    place(a, { x: 300, facing: 1, target: e });
    place(e, { x: 450, facing: -1 });
    a.startMove(byId(game, id));
    run(a, () => e.state !== 'idle' || a.state !== 'attack', 1);
    assert.equal(e.state, 'block');
  });
}

test('a strike warns an opponent in front, which turns to block it', () => {
  const { game, box, a, e } = load();
  box.rng = () => 0.1;
  const jab = byId(game, 'jab');
  place(a, { x: 300, facing: 1 });
  place(e, { x: 300 + jab.range[1], facing: 1 });   // Its back to the attacker
  a.startMove(jab);
  assert.equal(e.state, 'block');
  assert.equal(e.facing, -1, 'the blocker faces the attacker');
});

test('a strike does not warn an opponent behind the attacker', () => {
  const { game, box, a, e } = load();
  box.rng = () => 0.1;
  place(a, { x: 300, facing: 1 });
  place(e, { x: 280, facing: 1 });
  a.startMove(byId(game, 'jab'));
  assert.equal(e.state, 'idle');
});

test('a surprise strike (after a teleport or substitution) gives no warning', () => {
  const { game, box, a, e } = load();
  box.rng = () => 0.1;
  const jab = byId(game, 'jab');
  place(a, { x: 300, facing: 1 });
  place(e, { x: 300 + jab.range[1], facing: -1 });
  a.startMove(jab, true);
  assert.equal(e.state, 'idle');
});

// ---- AI ----

test('a move re-picked for a distance always reaches it (issue #35)', () => {
  const { game, box, a, e } = load();
  const reaches = (m, d) => d >= m.range[0] && d <= m.range[1];
  for (const d of [12, 30, 50, 70, 100, 150, 300, 600]) {
    for (let i = 0; i < 200; i++) {
      box.rng = () => (i + 0.5) / 200;
      const m = game.pickMove(a, e, d);
      assert.ok(reaches(m, d), `${m.id} (${m.range}) picked for ${d} px`);
    }
  }
});

// Share of each move id when Math.random sweeps evenly over [0, 1)
function shares(game, box, me, t) {
  const n = 20000, out = {};
  for (let i = 0; i < n; i++) {
    box.rng = () => (i + 0.5) / n;
    const id = game.pickMove(me, t).id;
    out[id] = (out[id] || 0) + 1 / n;
  }
  return out;
}

test('against an airborne target the AI favors anti-air specials over martial arts', () => {
  const { game, box, a, e } = load();
  a.x = 480;
  e.alt = 0;
  const ground = shares(game, box, a, e);
  e.alt = 100;
  const air = shares(game, box, a, e);
  // Weights relative to a special that is not anti-air: martial arts drop to 0.15, anti-air specials triple
  const rel = (s, id) => s[id] / s.teleport;
  assert.ok(ground.teleport > 0 && air.teleport > 0, 'teleport is picked');
  assert.ok(Math.abs(rel(air, 'jab') / rel(ground, 'jab') - 0.15) < 0.02, `jab ${rel(air, 'jab') / rel(ground, 'jab')}`);
  assert.ok(Math.abs(rel(air, 'beam') / rel(ground, 'beam') - 3) < 0.2, `beam ${rel(air, 'beam') / rel(ground, 'beam')}`);
});

test('the AI does not throw a punch at a target high in the air', () => {
  for (const [alt, attacks] of [[0, true], [100, false]]) {
    const { game, a, e } = load();
    const jab = byId(game, 'jab');
    place(a, { x: 300, facing: 1, cool: 0, target: e, nextMove: jab });
    place(e, { x: 300 + (jab.range[0] + jab.range[1]) / 2, alt, state: 'hit', st: 0, dur: 99 });
    a.update(DT);
    assert.equal(a.state === 'attack', attacks, `target at altitude ${alt}: ${a.state}`);
  }
});

test('a fighter far from its target dashes toward it', () => {
  const { game, box, a, e } = load();
  box.rng = () => 0.01;   // Below the dash chance, above the jump chance
  place(a, { x: 200, facing: 1, cool: 99, target: e, nextMove: byId(game, 'jab') });
  place(e, { x: 600 });
  a.update(DT);
  assert.equal(a.vx, 520, 'dash speed');
  assert.ok(a.dash > 0, 'dashing');
});

// ---- Hit rules of specials ----

test('rapid punches hit only a target at the same depth, and end with a launching finisher', () => {
  for (const [dz, hits] of [[40, false], [0, true]]) {
    const { game, a, e } = load();
    place(a, { x: 300, facing: 1, target: e });
    place(e, { x: 330, z: 50 + dz });
    a.startMove(byId(game, 'barrage'));
    run(a, () => a.state !== 'attack', 2);
    assert.equal(e.hp < 1000, hits, `depth gap ${dz}: health ${e.hp}`);
    if (hits) assert.equal(e.state, 'launched', 'the finisher launches');
  }
});

test('a rising uppercut hits its target once', () => {
  const { game, a, e } = load();
  place(a, { x: 300, facing: 1, target: e });
  place(e, { x: 320 });
  a.startMove(byId(game, 'rising'));
  run(a, () => a.state !== 'attack', 2);
  assert.equal(game.stats.hits.rising, 1);
});

test('a beam aims up at a target in the air and hits it once', () => {
  const { game, a, e } = load();
  place(a, { x: 300, facing: 1, target: e });
  place(e, { x: 500, alt: 150, state: 'hit', st: 0, dur: 99 });
  a.startMove(byId(game, 'beam'));
  run(a, () => a.state !== 'attack', 3);
  assert.equal(game.stats.hits.beam, 1);
});

test('a block that runs out of health knocks the blocker out', () => {
  const { game, a, e } = load();
  place(a, { x: 300, facing: 1 });
  place(e, { x: 320, facing: -1, state: 'block', st: 0, dur: 9, hp: 0.1 });
  e.takeHit(a, byId(game, 'jab'), 'body', e.bodyPoint());
  assert.equal(e.state, 'ko');
});

test('a held hit in the air keeps a falling fighter up for a moment', () => {
  const { game, a, e } = load();
  place(e, { x: 320, alt: 100, va: -300, state: 'air' });
  e.takeHit(a, byId(game, 'jab'), 'body', e.bodyPoint(), { dmg: 1, hold: true });
  assert.equal(e.state, 'hit');
  assert.equal(e.va, 90);
});

test('a fighter frozen while rising stops rising', () => {
  const { game, a, e } = load();
  place(e, { x: 320, alt: 100, va: 300, state: 'air' });
  e.takeHit(a, byId(game, 'jab'), 'body', e.bodyPoint(), { dmg: 1, freeze: 1.1 });
  assert.equal(e.state, 'frozen');
  assert.ok(e.va <= 0, `va ${e.va}`);
});

test('a substitution readied against a fighter that is knocked out does not take the hit', () => {
  const { game, a, e } = load();
  place(e, { x: 320, subFrom: a, subT: 9 });
  a.state = 'ko';
  const r = e.takeHit({ facing: 1, owner: a }, byId(game, 'shuriken'), 'body', e.bodyPoint(), { dmg: 1, hold: true });
  assert.notEqual(r, 'sub');
  assert.equal(e.state, 'hit');
});

test('a clone strike that knocks the target out lands no more hits on the body', () => {
  const { game, a, e } = load();
  place(a, { x: 300, facing: 1, target: e });
  place(e, { x: 400, facing: -1, hp: 1 });
  const ko = game.stats.ko;
  a.startMove(byId(game, 'clones'));
  run(a, () => a.state !== 'attack' || e.state === 'ko', 2);
  run(a, () => a.state !== 'attack', 0.1);
  assert.equal(e.state, 'ko');
  assert.equal(game.stats.ko - ko, 1, 'knockouts');
});

test('a grab does not catch an opponent behind the grabber', () => {
  for (const [dx, caught] of [[20, true], [-20, false]]) {
    const { game, a, e } = load();
    const m = byId(game, 'seoinage');
    place(a, { x: 300, facing: 1 });
    place(e, { x: 300 + dx, facing: -1 });
    Object.assign(a, { move: m, state: 'attack', st: m.wind + m.act * 0.5, hitDone: false });
    a.checkHit();
    assert.equal(e.state === 'thrown', caught, `opponent at ${dx}: ${e.state}`);
  }
});

test("a slam's shockwave reaches 150 px along the floor and misses fighters high in the air", () => {
  const { game, fighters: [a, far, high, near] } = load(4);
  place(a, { x: 400, facing: 1 });
  place(far, { x: 570 });
  place(high, { x: 500, alt: 60, state: 'air' });
  place(near, { x: 300 });
  a.startMove(byId(game, 'slam'));
  Object.assign(a.md, { ph: 'down' });
  a.alt = 0;
  a.u_slam(DT);
  assert.equal(far.hp, 1000, '170 px away');
  assert.equal(high.hp, 1000, '60 up');
  assert.ok(near.hp < 1000, '100 px away');
});

test('a teleport or a lightning call at a knocked-out target ends at once', () => {
  for (const id of ['teleport', 'lightning']) {
    const { game, a, e } = load();
    place(a, { x: 300, facing: 1, target: e });
    a.startMove(byId(game, id));
    e.state = 'ko';
    a.st = 0.2;
    a['u_' + id](DT);
    assert.notEqual(a.state, 'attack', id);
  }
});

test('lightning strikes where a running target will be', () => {
  const { game, a, e } = load();
  place(a, { x: 300, facing: 1, target: e });
  place(e, { x: 500, vx: 200 });
  a.startMove(byId(game, 'lightning'));
  a.st = 0.2;
  a.u_lightning(DT);
  assert.equal(a.md.ph, 'mark');
  assert.equal(a.md.x, 550);
});

// ---- Launches and landings ----

test('a launched fighter that reaches the top of the screen falls back', () => {
  const { e } = load();
  Object.assign(e, { state: 'launched', alt: 5000, va: 500, vx: 0 });
  e.updLaunched(DT);
  assert.ok(e.va < 0, `va ${e.va}`);
});

test('a launched fighter hitting the floor fast bounces; slowly, it lands lying down beside the spot', () => {
  const { e } = load();
  Object.assign(e, { x: 480, state: 'launched', alt: 1, va: -600, vx: 0, rot: 0 });
  e.updLaunched(DT);
  assert.equal(e.state, 'launched');
  assert.ok(e.va > 0, `bounced with va ${e.va}`);
  Object.assign(e, { x: 480, alt: 1, va: -100, vx: 0, rot: 0, facing: 1 });
  e.updLaunched(DT);
  assert.equal(e.state, 'down');
  assert.equal(Math.abs(e.x - 480), 44, 'the body lies beside where it landed');
});

test('a launched fighter coming down onto the middle of a ledge lands on it', () => {
  const { game, window, e } = load();
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  const p = game.platforms[0];
  assert.ok(p, 'a ledge');
  const top = game.groundY(50) - p.y;
  Object.assign(e, { x: (p.x0 + p.x1) / 2, z: 50, state: 'launched', alt: top + 3, va: -100, vx: 0, rot: 0 });
  run(e, () => e.state !== 'launched', 1);
  assert.equal(e.state, 'down');
  assert.ok(Math.abs(e.alt - top) < 1, `lies at altitude ${e.alt}, the ledge top is ${top}`);
});

test('a fighter knocked down falls backward when it faces the attacker, forward when not', () => {
  const { e } = load();
  e.facing = 1;
  e.knockDown(-1, 0.3);
  assert.equal(e.fallSign, -1, 'facing the attacker');
  e.knockDown(1, 0.3);
  assert.equal(e.fallSign, 1, 'its back to the attacker');
});

test('a knocked-out body flung upward stays below the top of the screen', () => {
  const { e } = load();
  e.ko(0, -3000);
  let top = Infinity;
  run(e, () => { for (const o of Object.values(e.rag.pts)) top = Math.min(top, o.y); return false; }, 2);
  assert.ok(top >= 4 - 1e-9, `reached y ${top}`);
});

// ---- Wall run ----

// Puts a in the leap of a wall run: in the air, flying at the given speed
function leap(game, a, o) {
  a.startMove(byId(game, 'wallrun'));
  Object.assign(a.md, { ph: 'leap', dir: -1, t0: -0.3, prev: null });
  Object.assign(a, { hover: true, va: 0, alt: 150, rot: 0 }, o);
  a.W = a.joints();
}

test('a wall-run leap steers toward its target', () => {
  const { game, a, e } = load();
  place(e, { x: 600 });
  a.target = e;
  leap(game, a, { x: 100, facing: 1, vx: 700 });
  run(a, () => false, 10 * DT);
  assert.ok(a.va < -50, `va ${a.va}`);
});

test('a wall-run leap ends when it hits the other wall', () => {
  const { game, a, e } = load();
  place(e, { x: 600 });
  a.target = e;
  leap(game, a, { x: 14, facing: -1, vx: -700 });
  a.u_wallrun(DT);
  assert.notEqual(a.state, 'attack');
});

test('a wall run turns into the leap at the top of the screen', () => {
  const { game, a, e } = load();
  a.target = e;
  a.startMove(byId(game, 'wallrun'));
  Object.assign(a.md, { ph: 'climb', dir: -1, t0: 0, dur: 10 });
  Object.assign(a, { x: 14, hover: true, va: 440, alt: 5000 });
  a.u_wallrun(DT);
  assert.equal(a.md.ph, 'leap');
});

// ---- Smoke escape ----

test('a smoke escape reappears away from the attacker, facing it; at a wall it goes the other way', () => {
  for (const [x, from, away] of [[500, 300, 1], [20, 300, 1]]) {
    const { game, box, e } = load();
    box.rng = () => 0.5;
    place(e, { x, facing: 1 });
    e.startMove(byId(game, 'smoke'), true);
    e.md.from = from;
    run(e, () => e.state !== 'attack', 2);
    assert.ok((e.x - x) * away >= 60, `from ${x} to ${e.x}`);
    assert.equal(e.facing, Math.sign(from - e.x), 'faces the attacker');
  }
});
