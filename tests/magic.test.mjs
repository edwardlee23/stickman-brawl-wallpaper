// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// Magic style's spells (issue #24): fireball, lightning strike, ice shard and
// shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  // Attacker on the left facing right, target 200 to its right facing it.
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', target: e });
  Object.assign(e, { x: 500, z: 50, alt: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  return { game, a, e, window };
}
const spell = (game, id) => game.MAGIC.find(m => m.id === id);

// Runs the whole world, every fighter and projectile, for the given seconds.
function run(game, sec, step = 1 / 60) {
  for (let t = 0; t < sec; t += step) game.update(step);
}

test('every spell belongs to the magic style and has its own update function', () => {
  const { game, a } = load();
  assert.deepEqual([...game.MAGIC.map(m => m.id)].sort(), ['fireball', 'ice', 'lightning', 'shield']);
  for (const m of game.MAGIC) {
    assert.equal(m.style, 'magic', m.id);
    assert.equal(typeof a['u_' + m.type], 'function', m.id);
  }
});

test('with only magic on, fighters pick spells, and never the shield, which is cast in reaction', () => {
  const { game, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'magic';
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(game.pickMove(a, e).id);
  assert.deepEqual([...seen].sort(), ['fireball', 'ice', 'lightning']);
});

test('with magic off, no spell is picked', () => {
  const { game, a, e } = load();
  game.cfg.styles.magic = false;
  for (let i = 0; i < 300; i++) assert.notEqual(game.pickMove(a, e).style, 'magic');
});

test('a fireball flies to the target and launches it', () => {
  const { game, a, e } = load();
  Object.assign(e, { state: 'hit', st: 0, dur: 99 });   // Cannot block, dodge or jump
  a.startMove(spell(game, 'fireball'));
  run(game, 1.5);
  assert.ok(game.stats.hits.fireball >= 1, 'fireball never hit');
  assert.ok(game.stats.launches >= 1, 'target was not launched');
  assert.ok(e.hp < 1000, `hp ${e.hp}`);
});

test('an ice shard freezes the target, which holds still until it thaws', () => {
  const { game, a, e } = load();
  Object.assign(e, { state: 'hit', st: 0, dur: 99 });
  a.startMove(spell(game, 'ice'));
  let frozen = false;
  for (let t = 0; t < 1 && !frozen; t += 1 / 60) {
    game.update(1 / 60);
    frozen = e.state === 'frozen';
  }
  assert.ok(frozen, `target state ${e.state}`);
  assert.ok(e.hittable, 'a frozen fighter can still be hit');
  const x = e.x, pose = { ...e.pose };
  e.update(0.3);
  assert.equal(e.state, 'frozen');
  assert.equal(e.x, x, 'moved while frozen');
  assert.deepEqual({ ...e.pose }, pose, 'changed pose while frozen');
  e.update(1.5);
  assert.notEqual(e.state, 'frozen', 'never thawed');
});

test('a hit on a frozen fighter shatters the ice', () => {
  const { game, a, e } = load();
  e.takeHit(a, spell(game, 'ice'), 'body', { x: 0, y: 0 }, { dmg: 1, freeze: 1.1 });
  assert.equal(e.state, 'frozen');
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', { x: 0, y: 0 });
  assert.notEqual(e.state, 'frozen');
});

test('a second ice shard shatters the ice instead of freezing again', () => {
  const { game, a, e } = load();
  const ice = spell(game, 'ice');
  e.takeHit(a, ice, 'body', { x: 0, y: 0 }, { dmg: 1, freeze: 1.1 });
  e.takeHit(a, ice, 'body', { x: 0, y: 0 }, { dmg: 1, freeze: 1.1 });
  assert.notEqual(e.state, 'frozen');
});

test('lightning strikes where it marked, even through a block', () => {
  const { game, a, e } = load();
  a.startMove(spell(game, 'lightning'));
  a.update(0.2);                         // Marks the target's spot
  e.state = 'block'; e.st = 0; e.dur = 99;
  for (let t = 0; t < 1; t += 1 / 60) { a.W = a.joints(); a.update(1 / 60); }
  assert.ok(game.stats.hits.lightning >= 1, 'lightning never hit');
  assert.ok(e.hp < 1000 - 5, `hp ${e.hp}`);
});

test('lightning misses a fighter who left the marked spot', () => {
  const { game, a, e } = load();
  a.startMove(spell(game, 'lightning'));
  a.update(0.2);
  e.x = 800;
  for (let t = 0; t < 1; t += 1 / 60) { a.W = a.joints(); a.update(1 / 60); }
  assert.equal(game.stats.hits.lightning, undefined);
  assert.equal(e.hp, 1000);
});

test('a shield stops one hit from the front, then breaks', () => {
  const { game, a, e } = load();
  const jab = game.MOVES.find(m => m.id === 'jab');
  e.startMove(spell(game, 'shield'), true);
  e.update(0.05);
  e.takeHit(a, jab, 'body', { x: 0, y: 0 });
  assert.equal(e.hp, 1000, 'shielded hit did damage');
  assert.equal(game.stats.shielded, 1);
  e.update(0.3);
  e.takeHit(a, jab, 'body', { x: 0, y: 0 });
  assert.ok(e.hp < 1000, 'second hit was also stopped');
});

test('a shield does not stop a hit from behind', () => {
  const { game, a, e } = load();
  e.startMove(spell(game, 'shield'), true);
  e.update(0.05);
  e.facing = 1;   // Back turned to the attacker; set after update, which turns the caster toward its target
  e.takeHit(a, game.MOVES.find(m => m.id === 'jab'), 'body', { x: 0, y: 0 });
  assert.ok(e.hp < 1000);
});

test('a fighter about to be hit may raise a shield, only while magic is on', () => {
  const { game, a, e } = load();
  a.move = game.MOVES.find(m => m.id === 'jab');
  let shields = 0;
  for (let i = 0; i < 400; i++) {
    Object.assign(e, { state: 'idle', move: null, md: null });
    a.warn(200, false);
    if (e.move && e.move.id === 'shield') shields++;
  }
  assert.ok(shields > 0, 'never raised a shield');
  game.cfg.styles.magic = false;
  for (let i = 0; i < 400; i++) {
    Object.assign(e, { state: 'idle', move: null, md: null });
    a.warn(200, false);
    assert.ok(!e.move || e.move.id !== 'shield', 'raised a shield with magic off');
  }
});

test('a shield faces the attacker it was raised against, not its own target (issue #32)', () => {
  const { game, a, e } = load();
  const jab = game.MOVES.find(m => m.id === 'jab');
  a.move = jab;
  for (let i = 0; i < 400 && !(e.move && e.move.id === 'shield'); i++) {
    Object.assign(e, { state: 'idle', move: null, md: null, facing: 1, evade: 0, subFrom: null });
    a.warn(250, false);
  }
  assert.equal(e.move && e.move.id, 'shield', 'never raised a shield');
  e.target = { alive: true, x: 900, z: 50 };   // Its own target stands on the other side
  e.update(0.05);
  assert.equal(e.facing, -1, 'shield turned away from the attacker');
  e.takeHit(a, jab, 'body', { x: 0, y: 0 });
  assert.equal(e.hp, 1000, 'the hit it was raised against landed');
});

test('a shield or block raised against a far fireball lasts until the fireball can arrive (issue #38)', () => {
  const reactions = { shield: e => e.shieldUp(), block: e => e.state === 'block' };
  for (const [name, up] of Object.entries(reactions)) {
    const { game, a, e } = load();
    const fireball = spell(game, 'fireball'), gap = 600;
    a.move = fireball;
    e.x = a.x + gap;
    for (let i = 0; i < 400 && !up(e); i++) {
      Object.assign(e, { state: 'idle', move: null, md: null, facing: -1, evade: 0, vx: 0, subFrom: null });
      a.warn(9999, false);
    }
    assert.ok(up(e), `never raised a ${name}`);
    // The fireball leaves the hand at the warning and needs gap / speed seconds to arrive
    for (let t = 0; t < gap / fireball.speed - 0.05; t += 1 / 60) e.update(1 / 60);
    assert.ok(up(e), `${name} was down before the fireball could arrive`);
  }
});
