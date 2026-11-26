// Runs main.js in a sandbox and checks rules of the special moves that could break with
// every other test green (issue #181): the wall-run leap kick lands, thrown and blasted
// shots aim at a target in the air, the beam's depth and the lightning's radius are
// limited, the slam's damage falls off with distance, the dive spikes an airborne target
// down and rebounds, the dive and slam turn downward early, the shadow clones need the
// target's height and the barrage holds its target in place. Math.random is stubbed, so
// each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper with Math.random fixed at 0.99: no random jumps, dashes or reactions
function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  // a attacks from the left; e stands still in hitstun, so it neither moves nor blocks
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 450, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return { game, a, e };
}
const DT = 1 / 60;
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const place = (f, o) => { Object.assign(f, o); f.W = f.joints(); };
// Steps fighter a alone, so e keeps the state the test gave it
function run(a, stop, seconds = 3) {
  for (let t = 0; t < seconds && !stop(); t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
}
const hits = (game, id) => game.stats.hits[id] || 0;

test('a wall-run leap kick that reaches its target hits it', () => {
  const { game, a, e } = load();
  place(e, { x: 600 });
  a.startMove(byId(game, 'wallrun'));
  Object.assign(a.md, { ph: 'leap', dir: -1, t0: a.st, prev: null });
  place(a, { x: 400, hover: true, va: 0, vx: 700, alt: 40, rot: 0 });
  run(a, () => a.state !== 'attack', 1.5);
  assert.equal(hits(game, 'wallrun'), 1, 'the leap kick hit');
  assert.ok(e.hp < 1000, 'hp ' + e.hp);
});

test('a thrown spell aims up at a target in the air', () => {
  const { game, a, e } = load();
  a.move = byId(game, 'fireball');
  place(e, { x: 600, alt: 200, hover: true });
  const H = a.W.hF, c = { x: (e.W.sh.x + e.W.hip.x) / 2, y: (e.W.sh.y + e.W.hip.y) / 2 };
  const s = a.castShot(H, 'fire', 430, 0);
  const want = Math.atan2(c.y - H.y, Math.abs(c.x - H.x) + 1);
  assert.ok(want < -0.3, 'the target is well above: ' + want);
  assert.ok(Math.abs(Math.atan2(s.vy, s.vx) - want) < 1e-6, 'aimed at ' + Math.atan2(s.vy, s.vx) + ', target at ' + want);
  // An offset turns the shot from that aim
  const s2 = a.castShot(H, 'fire', 430, 0, 0.2);
  assert.ok(Math.abs(Math.atan2(s2.vy, s2.vx) - want - 0.2) < 1e-6, 'offset aim ' + Math.atan2(s2.vy, s2.vx));
});

test('an energy blast aims up at a target in the air', () => {
  const { game, a, e } = load();
  place(e, { x: 600, alt: 200, hover: true });
  a.startMove(byId(game, 'blast'));
  run(a, () => game.shots.length > 0, 1);
  assert.ok(game.shots.length > 0, 'a blast was fired');
  const s = game.shots[0];
  assert.ok(s.vy < -150, 'the blast flies up: vy ' + s.vy);
});

// It reaches 22 deep (issue #318): a mutation to 16 or 30 fails at 20 or 24
for (const [dz, hit] of [[10, true], [20, true], [24, false], [40, false]]) {
  test('an energy beam ' + (hit ? 'hits' : 'misses') + ' a target ' + dz + ' away in depth', () => {
    const { game, a, e } = load();
    place(a, { z: 30 });
    place(e, { x: 600, z: 30 + dz });
    a.startMove(byId(game, 'beam'));
    run(a, () => a.state !== 'attack', 3);
    assert.equal(hits(game, 'beam') > 0, hit, 'beam hits ' + hits(game, 'beam'));
  });
}

for (const [off, hit] of [[10, true], [60, false]]) {
  test('a lightning bolt ' + (hit ? 'hits' : 'misses') + ' a target ' + off + ' px from where it falls', () => {
    const { game, a, e } = load();
    place(e, { x: 600 });
    a.startMove(byId(game, 'lightning'));
    run(a, () => a.md.ph === 'mark', 1);
    assert.equal(a.md.ph, 'mark');
    a.md.x = e.x + off;
    run(a, () => a.state !== 'attack', 2);
    assert.equal(hits(game, 'lightning') > 0, hit, 'lightning hits ' + hits(game, 'lightning'));
  });
}

test('a slam shockwave does less damage the farther the target is from the impact', () => {
  const loss = d => {
    const { game, a, e } = load();
    place(e, { x: 300 + d, facing: 1 });
    a.startMove(byId(game, 'slam'));
    Object.assign(a.md, { ph: 'down', jumped: true });
    place(a, { alt: 3, va: -1300, hover: true });
    run(a, () => a.md.ph !== 'down', 0.5);
    assert.equal(hits(game, 'slam'), 1, 'the shockwave hit at ' + d);
    return 1000 - e.hp;
  };
  const near = loss(20), far = loss(130);
  assert.ok(Math.abs(far / near - (1 - 130 / 200) / (1 - 20 / 200)) < 0.01, 'near ' + near + ', far ' + far);
});

// a dives at e from above, until the kick hits
function dive(e0) {
  const { game, a, e } = load();
  place(e, Object.assign({ x: 420 }, e0));
  a.startMove(byId(game, 'dive'));
  Object.assign(a.md, { ph: 'dive', a: 0.8, jumped: true, prev: null });
  place(a, { x: 300, alt: (e0.alt || 0) + 120, hover: true, vx: 600, va: -600 });
  run(a, () => hits(game, 'dive') > 0, 1);
  assert.equal(hits(game, 'dive'), 1, 'the dive hit');
  return { a, e };
}

test('a dive spikes a target in the air down, and launches one on the floor up', () => {
  assert.ok(dive({ alt: 120, hover: true }).e.va < 0, 'the airborne target is sent down');
  assert.ok(dive({}).e.va > 0, 'the target on the floor is sent up');
});

test('a dive that hits rebounds up and back from the target', () => {
  const { a, e } = dive({});
  assert.ok(a.va > 300, 'rebound va ' + a.va);
  assert.ok(a.vx * Math.sign(e.x - a.x) < 0, 'rebound vx ' + a.vx + ' away from the target');
});

test('a dive turns downward once it is 230 above the floor, even while still rising fast', () => {
  const { game, a } = load();
  a.startMove(byId(game, 'dive'));
  Object.assign(a.md, { jumped: true });
  place(a, { alt: 240, va: 500 });
  a.u_dive(DT);
  assert.equal(a.md.ph, 'dive');
});

test('a slam started in the air drops after 0.12 s instead of waiting to fall', () => {
  const { game, a } = load();
  place(a, { alt: 150, va: 0, state: 'air' });
  a.startMove(byId(game, 'slam'));
  run(a, () => a.st > 0.15, 1);
  assert.ok(a.st < 0.25, 'st ' + a.st);
  assert.equal(a.md.ph, 'down');
});

for (const [alt, hit] of [[0, true], [100, false]]) {
  test('shadow clones ' + (hit ? 'hit a target on their level' : 'miss a target 100 above'), () => {
    const { game, a, e } = load();
    place(e, { alt, hover: alt > 0 });
    a.startMove(byId(game, 'clones'));
    run(a, () => a.state !== 'attack', 2);
    assert.equal(hits(game, 'clones') > 0, hit, 'clone hits ' + hits(game, 'clones'));
  });
}

test('each barrage punch holds the target in place instead of pushing it away', () => {
  const { game, a, e } = load();
  place(e, { x: 330 });
  a.startMove(byId(game, 'barrage'));
  run(a, () => hits(game, 'barrage') > 0, 1);
  assert.equal(hits(game, 'barrage'), 1);
  assert.equal(e.state, 'hit');
  assert.ok(Math.abs(e.vx) <= 20, 'pushed at vx ' + e.vx);
  assert.ok(Math.abs(e.dur - 0.22) < 1e-9, 'stunned for ' + e.dur);
});
