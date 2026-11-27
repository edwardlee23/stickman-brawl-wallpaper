// Pins the life a standing fighter shows between blows: a slow breath, a taunt while its target
// lies on the floor, and a victory pose that varies from round to round. All of it is drawn
// over the game pose or picked without Math.random, so a seed gives the same fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

const load = (opts = {}) => loadMain({ ctx: stubContext(), ...opts }).game;
// Two fighters 300 apart, the first standing still and facing the second
function pair() {
  const game = load();
  const [a, b] = game.fighters;
  Object.assign(a, { state: 'idle', alt: 0, vx: 0, x: 300, cool: 99, retarget: 99, target: b });
  Object.assign(b, { x: 600, z: a.z });
  return { game, a, b };
}

test('breathing and taunts draw nothing from Math.random: a seed gives the same fight without them', () => {
  const run = patch => {
    let n = 0;
    const rnd = lcg(11);
    const game = load({ search: '?count=4&mode=ffa', patch, random: () => { n++; return rnd(); } });
    let rounds = 0;
    for (let i = 0; i < 3600; i++) { game.update(1 / 60); if (i % 2) game.render(); rounds = game.stats.rounds; }
    const taunts = game.fighters.reduce((s, f) => s + f.flair.n, 0);
    return { n, rounds, taunts, at: JSON.stringify(game.fighters.map(f => [f.state, f.x.toFixed(6), f.hp.toFixed(6)])) };
  };
  const none = src => src
    .replace('  addFlair(p) {', '$&return;')
    .replace('  taunting() {', '$&return false;')
    .replace('VICTORIES[victoryOf(this)](tp, this.time);', 'VICTORIES[0](tp, this.time);');
  const plain = run(none), full = run();
  assert.ok(plain.rounds >= 1, 'no round ended');
  assert.ok(full.taunts >= 1, 'no taunt made');
  assert.deepEqual({ ...full, taunts: 0 }, plain);
});

test('a fighter standing still breathes: its drawn chest rises and falls, its game pose does not', () => {
  const { a } = pair();
  const lean = [], game = [];
  for (const t of [0, 0.65, 1.3, 1.95]) {
    a.time = t;
    lean.push(a.lookPose().t - a.look.d.t);
    game.push(a.pose.t);
  }
  assert.ok(Math.max(...lean) - Math.min(...lean) > 0.04, 'lean ' + lean.map(v => v.toFixed(3)));
  assert.equal(new Set(game).size, 1);
});

test('a fighter walking at 60 or more takes no breath', () => {
  const { a } = pair();
  a.vx = 60;
  for (const t of [0, 0.65, 1.3]) { a.time = t; assert.equal(a.lookPose().t, a.pose.t + a.look.d.t); }
});

test('a fighter waiting for its target to get up taunts, drawn only, and stops when it is up', () => {
  const { game, a, b } = pair();
  b.state = 'down'; b.st = 0; b.downDur = 99;
  assert.equal(a.taunting(), true);
  for (let i = 0; i < 30; i++) a.stepLook(1 / 60);
  assert.equal(a.flair.w, 1);
  const T = {};
  game.TAUNTS[a.flair.k](T, a.time);
  const drawn = a.lookPose();
  for (const k of Object.keys(T)) assert.ok(Math.abs(drawn[k] - T[k] - a.look.d[k]) < 1e-9, k + ' drawn at ' + drawn[k]);
  const W = a.joints();
  a.flair.w = 0;
  assert.deepEqual(JSON.stringify(a.joints()), JSON.stringify(W), 'the taunt moved the game joints');
  a.flair.w = 1;
  b.state = 'idle';
  assert.equal(a.taunting(), false);
  for (let i = 0; i < 30; i++) a.stepLook(1 / 60);
  assert.equal(a.flair.w, 0);
});

test('a fighter on the move, or whose target is still standing, does not taunt', () => {
  const { a, b } = pair();
  assert.equal(a.taunting(), false, 'target standing');
  b.state = 'down';
  a.vx = 80;
  assert.equal(a.taunting(), false, 'walking');
  a.vx = 0; a.state = 'attack';
  assert.equal(a.taunting(), false, 'attacking');
});

test('each taunt starts with a kind of its own, and every kind comes up', () => {
  const { game, a, b } = pair();
  const kinds = new Set();
  for (let i = 0; i < 12; i++) {
    b.state = 'down';
    a.stepLook(0.02);
    kinds.add(a.flair.k);
    b.state = 'idle';
    for (let j = 0; j < 20; j++) a.stepLook(0.02);
    assert.equal(a.flair.w, 0);
  }
  assert.equal(a.flair.n, 12);
  assert.equal(kinds.size, game.TAUNTS.length);
});

test('winners strike each of the victory poses over the rounds', () => {
  const { game } = pair();
  const kinds = new Set();
  for (let r = 0; r < 12; r++) { game.stats.rounds = r; for (const f of game.fighters) kinds.add(game.victoryOf(f)); }
  assert.equal(kinds.size, game.VICTORIES.length);
});
