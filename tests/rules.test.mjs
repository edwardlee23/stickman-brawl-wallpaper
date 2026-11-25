// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// "Round rules" variants (issue #89): King, Ladder and Survival, and that
// Normal leaves rounds as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(search = '?count=6&mode=ffa') {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window;
}

// Sets the round rules through the settings panel, which starts a new round
function withRules(rules, search) {
  const window = load(search);
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: rules } });
  return window.__stickmanBrawl;
}

// Knocks f out without a ragdoll, which checkRound does not need
const knockOut = f => { f.hp = 0; f.state = 'ko'; };
// Knocks f out with a ragdoll, for a fight that runs on
const ragdoll = f => { f.hp = 0; f.W = f.joints(); f.ko(0, 0); };

// Ends the round with only the given fighters standing, then lets the next one start
function endRound(game, winners) {
  for (const f of game.fighters) if (!winners.includes(f)) knockOut(f);
  game.checkRound(0);
  game.checkRound(5);
}

test('the round rules default to Normal', () => {
  const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));
  const p = project.general.properties.roundrules;
  assert.equal(p.order, 6);
  assert.equal(p.value, 'normal');
  assert.equal(load().__stickmanBrawl.cfg.rules, 'normal');
});

test('Normal: every fighter starts at full health and fights', () => {
  const game = withRules('normal');
  for (let r = 0; r < 3; r++) {
    for (const f of game.fighters) {
      assert.equal(f.maxHp, 100);
      assert.equal(f.hp, 100);
      assert.ok(!f.king);
      assert.notEqual(f.state, 'wait');
    }
    const [w] = game.fighters;
    w.hp = 40;
    endRound(game, [w]);
  }
});

test('King: one fighter has double health and every other fighter targets it', () => {
  const game = withRules('king');
  for (let r = 0; r < 5; r++) {
    const kings = game.fighters.filter(f => f.maxHp === 200);
    assert.equal(kings.length, 1, 'exactly one king');
    const [king] = kings;
    assert.ok(king.king);
    assert.equal(king.hp, 200);
    for (const f of game.fighters) if (f !== king) {
      assert.equal(f.maxHp, 100);
      for (let i = 0; i < 20; i++) assert.equal(game.pickTarget(f), king);
    }
    // Once the king is out, the others go back to picking whoever is near
    knockOut(king);
    const [a] = game.fighters.filter(f => f !== king);
    assert.ok(game.pickTarget(a) && game.pickTarget(a) !== king);
    game.newRound();
  }
});

test('King is ignored in teams mode', () => {
  const game = withRules('king', '?count=6&mode=teams');
  for (const f of game.fighters) assert.equal(f.maxHp, 100);
});

test('Ladder: at most two fighters fight, and the next one steps in at a knockout', () => {
  const game = withRules('ladder');
  const fighting = () => game.fighters.filter(f => f.alive && f.state !== 'wait');
  assert.equal(fighting().length, 2);
  assert.equal(game.fighters.filter(f => f.state === 'wait').length, 4);
  for (let t = 0; t < 2; t += 1 / 60) {
    game.update(1 / 60);
    assert.ok(fighting().length <= 2);
  }
  // The two fighters target each other, never someone waiting
  const [a, b] = fighting();
  assert.equal(game.pickTarget(a), b);
  assert.equal(game.pickTarget(b), a);
  const before = new Set(game.fighters.filter(f => f.state === 'wait'));
  ragdoll(a);
  game.update(1 / 60);
  const now = fighting();
  assert.equal(now.length, 2, 'the next waiting fighter entered');
  assert.ok(now.includes(b), 'the winner stays');
  assert.ok(before.has(now.find(f => f !== b)));
  assert.equal(game.fighters.filter(f => f.state === 'wait').length, 3);
  // Waiting fighters cannot be hit
  for (const f of game.fighters) if (f.state === 'wait') assert.equal(f.hittable, false);
});

test('Ladder: the round goes on until one fighter is left', () => {
  const game = withRules('ladder', '?count=4&mode=ffa');
  const rounds = game.stats.rounds;
  for (let k = 0; k < 2; k++) {
    const [a] = game.fighters.filter(f => f.alive && f.state !== 'wait');
    ragdoll(a);
    game.update(1 / 60);
    assert.equal(game.stats.rounds, rounds, 'not over while fighters wait');
  }
  ragdoll(game.fighters.filter(f => f.alive && f.state !== 'wait')[0]);
  game.update(1 / 60);
  assert.equal(game.stats.rounds, rounds + 1);
});

test('Ladder: each bout gets the full time before the round times out', () => {
  const game = withRules('ladder');
  for (let t = 0; t < 2; t += 1 / 60) game.update(1 / 60);
  ragdoll(game.fighters.find(f => f.alive && f.state !== 'wait'));
  game.update(1 / 60);
  const list = game.fighters;
  game.checkRound(149);
  assert.equal(game.fighters, list, 'the round goes on');
});

test('Survival: a winner keeps its health, the knocked-out return at full', () => {
  const game = withRules('survival');
  const w = game.fighters[2];
  w.hp = 40;
  endRound(game, [w]);
  assert.equal(game.fighters[2].hp, 40);
  for (const f of game.fighters) if (f.id !== 2) assert.equal(f.hp, 100);
  // Below 15% the winner is restored too
  game.fighters[2].hp = 10;
  endRound(game, [game.fighters[2]]);
  assert.equal(game.fighters[2].hp, 100);
});

test('Survival: a round that times out or is reset restores everyone', () => {
  const game = withRules('survival');
  game.fighters[0].hp = 40;
  game.fighters[1].hp = 60;
  game.checkRound(151);
  for (const f of game.fighters) assert.equal(f.hp, 100);
});
