// Runs main.js in a sandbox and checks the timers and turns that keep a fighter moving
// (issue #225): a getup ends, every special's end timer ends it, a strong strike launches a
// standing fighter and any strike launches one in the air, a dodge's slide stops, the hit
// flash fades, an idle fighter faces its target, a shot that reaches the floor bursts there,
// effects expire, and a raised shield keeps turning toward its attacker. Each of these could
// break with every other test green. Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper with Math.random fixed (0.99 by default: no random jumps, dashes or
// reactions). a stands on the left facing right; e stands 150 to its right in hitstun, so it
// neither moves, blocks nor attacks.
function load(random = 0.99) {
  const { game } = loadMain({ random });
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 450, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, e };
}
const DT = 1 / 60;
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
// Steps fighter f alone until stop() holds or the seconds run out; returns the seconds taken
function run(f, stop, seconds) {
  let t = 0;
  for (; t < seconds && !stop(); t += DT) { f.update(DT); if (!f.rag) f.W = f.joints(); }
  return t;
}

test('a fighter that gets up is back in idle within a second', () => {
  const { a } = load();
  Object.assign(a, { state: 'getup', st: 0, fallSign: 1 });
  run(a, () => a.state !== 'getup', 1);
  assert.equal(a.state, 'idle', 'still getting up after 1 s');
});

// The end timer of each special: blast, barrage, rising, shuriken, fireball, ice, lightning
// and shield (its raised and its lowering phases). Each normally ends in 0.5 to 1.3 s.
for (const id of ['blast', 'barrage', 'rising', 'shuriken', 'fireball', 'ice', 'lightning', 'shield']) {
  test(`a fighter's ${id} ends on its own within 2.5 s`, () => {
    const { game, a } = load();
    a.startMove(byId(game, id), true);
    run(a, () => a.state !== 'attack', 2.5);
    assert.notEqual(a.state, 'attack', id + ' still running after 2.5 s');
    assert.equal(a.move, null);
  });
}

test("a fighter's boomerang throw ends on its own within 1.5 s of starting", () => {
  const { game, a, e } = load();
  game.cfg.items = true;
  Object.assign(a, { cool: 0, held: { kind: 'boomerang' } });
  e.x = 550; e.W = e.joints();
  let t0 = null;
  for (let t = 0; t < 5; t += DT) {
    game.update(DT);
    if (t0 === null && a.move && a.move.id === 'boomerang') t0 = t;
    if (t0 !== null && t - t0 > 1.5) break;
  }
  assert.notEqual(t0, null, 'never threw the boomerang');
  assert.ok(!(a.move && a.move.id === 'boomerang'), 'still in the boomerang throw 1.5 s after starting it');
});

test('a back kick launches a standing fighter, and a jab launches one in the air', () => {
  const { game, a, e } = load();
  const pt = { x: e.x, y: 300 };
  e.state = 'idle';
  e.takeHit(a, byId(game, 'backkick'), 'body', pt);
  assert.equal(e.state, 'launched', 'a back kick left a standing fighter on its feet');
  Object.assign(e, { state: 'air', alt: 80, va: 0, hp: 1000 });
  e.takeHit(a, byId(game, 'jab'), 'body', pt);
  assert.equal(e.state, 'launched', 'a jab did not launch a fighter in the air');
});

test("a dodge's slide stops: evade runs out and the fighter stays near where it dodged", () => {
  const { a } = load();
  // Dodged back from e, which stands 150 to its right
  Object.assign(a, { evade: 0.3, vx: -200, cool: 99 });
  const x0 = a.x;
  run(a, () => false, 2);
  assert.ok(a.evade <= 0, 'evade still ' + a.evade + ' after 2 s');
  assert.ok(Math.abs(a.x - x0) < 150, 'slid from x ' + x0 + ' to ' + a.x.toFixed(0));
});

test('the white hit flash fades within a fraction of a second', () => {
  const { game, a, e } = load();
  e.takeHit(a, byId(game, 'jab'), 'body', { x: e.x, y: 300 });
  assert.ok(e.flash > 0, 'a hit did not flash');
  run(e, () => false, 0.3);
  assert.ok(e.flash <= 0, 'still flashing after 0.3 s: ' + e.flash);
});

test('an idle fighter turns to face a target behind it', () => {
  const { a, e } = load();
  Object.assign(a, { facing: -1 });   // e stands to its right
  run(a, () => false, 0.1);
  assert.equal(a.facing, 1, 'kept its back to its target');
});

test('a shot that reaches the floor bursts there', () => {
  const { game, a } = load();
  const gy = game.groundY(50);
  const s = { x: 600, y: gy - 30, vx: 0, vy: 300, z: 50, owner: a, m: byId(game, 'blast'), life: 3, col: '#fff' };
  game.shots.push(s);
  let maxY = s.y;
  for (let t = 0; t < 1 && game.shots.includes(s); t += DT) { game.update(DT); maxY = Math.max(maxY, s.y); }
  assert.ok(!game.shots.includes(s), 'the shot went on below the floor');
  assert.ok(maxY < gy + 20, 'the shot reached y ' + maxY.toFixed(0) + ', the floor is at ' + gy.toFixed(0));
});

test('an effect is removed once its time is up', () => {
  const { game } = load();
  const f = { type: 'ring', x: 600, y: 300, r0: 6, r1: 40, dur: 0.25, w: 2.5, col: '#fff', t: 0 };
  game.fx.push(f);
  for (let t = 0; t < 1; t += DT) game.update(DT);
  assert.ok(!game.fx.includes(f), 'the effect was kept past its duration');
});

test('a raised shield turns to its attacker when the attacker moves to its other side (issue #32)', () => {
  const { game, a, e } = load(0.4);   // 0.4 answers a warning with a shield
  game.cfg.styles.magic = true;
  const jab = byId(game, 'jab');
  a.move = jab;
  Object.assign(e, { state: 'idle', move: null, md: null, x: 500, facing: 1, evade: 0, subFrom: null });
  a.warn(250, false);
  assert.equal(e.move && e.move.id, 'shield', 'never raised a shield');
  assert.equal(e.facing, -1);
  // The attacker steps round to e's right; e's own target stands far to its left
  a.x = 700; a.W = a.joints();
  e.target = { alive: true, x: 100, z: 50 };
  e.update(0.05);
  assert.equal(e.facing, 1, 'the shield kept facing where the attacker was');
});
