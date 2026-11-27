// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// optional pick-up items (issue #88): a heart heals, a staff lengthens three
// strikes, a boomerang flies out and back and can be blocked, and no item exists
// after a new round or ever spawns with the setting off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));

function load(random) {
  const listeners = {};
  // A fixed Math.random of 0.99 turns off the random jumps and dashes. Without one, a seeded
  // generator (an LCG) stands in, so a fighter's random jumps and dashes are the same on every
  // run and cannot carry it out of reach at random (issue #161).
  const { game, window } = loadMain({ random: random || undefined, window: { addEventListener: (k, f) => { listeners[k] = f; } } });
  return { game, we: window.wallpaperPropertyListener, window, listeners };
}

// Two fighters on one line: a attacks, e stands still and can be hit without reacting
function duel(game, gap, eState = 'hit') {
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', cool: 99, target: e });
  Object.assign(e, { x: 300 + gap, z: 50, alt: 0, facing: -1, state: eState, st: 0, dur: 99, hp: 100, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  return [a, e];
}
// Drops an item where the fighter's hip is, already on the floor, and runs one step
function handTo(game, f, kind) {
  game.spawnItem(kind, f.W.hip.x, f.z, 0);
  game.update(1 / 60);
}
const run = (game, secs, until = () => false) => {
  for (let t = 0; t < secs && !until(); t += 1 / 60) game.update(1 / 60);
};

test('the Items setting is a translated switch, off by default', () => {
  const p = project.general.properties.items;
  assert.equal(p.type, 'bool');
  assert.equal(p.value, false);
  assert.equal(p.order, 18);
  assert.equal(load().game.cfg.items, false);
});

test('a heart touching a fighter\'s hip restores 30% health, capped at full, and disappears', () => {
  const { game } = load();
  game.cfg.items = true;
  const [a] = duel(game, 400);
  a.hp = 50;
  handTo(game, a, 'heart');
  assert.ok(Math.abs(a.hp - 80) < 1e-9, 'healed by 30: ' + a.hp);
  assert.equal(game.items.length, 0);
  a.W = a.joints(); a.hp = 90;
  handTo(game, a, 'heart');
  assert.equal(a.hp, 100);
  assert.equal(game.items.length, 0);
});

test('a staff lengthens the next strike, and is gone after three strikes', () => {
  const strike = (staff) => {
    const { game } = load();
    game.cfg.items = true;
    const jab = game.MOVES.find(m => m.id === 'jab');
    const [a, e] = duel(game, jab.range[1] + 8);
    if (staff) handTo(game, a, 'staff');
    const m = staff ? game.withStaff(a, jab) : jab;
    a.startMove(m);
    run(game, 1, () => a.state !== 'attack');
    return { hurt: 100 - e.hp, range: m.range[1], game, a, e, m };
  };
  const bare = strike(false), staffed = strike(true);
  assert.equal(bare.hurt, 0, 'a bare jab does not reach');
  assert.ok(staffed.range > bare.range, 'the staff strike reaches farther');
  assert.ok(staffed.hurt > 0, 'the staff jab reaches the same target');
  // Two more strikes with the staff, then it is gone
  const { game, a, e } = staffed;
  assert.ok(a.held && a.held.kind === 'staff', 'still held after one strike');
  for (let i = 0; i < 2; i++) {
    Object.assign(a, { x: 300, state: 'idle', cool: 99 });
    Object.assign(e, { x: 330, state: 'hit', st: 0, dur: 99, alt: 0, va: 0, vx: 0, hp: 100 });
    a.W = a.joints(); e.W = e.joints();
    a.startMove(game.withStaff(a, game.MOVES.find(m => m.id === 'cross')));
    assert.ok(a.move.staff, 'strike ' + (i + 2) + ' uses the staff');
    run(game, 1, () => a.state !== 'attack');
    game.update(1 / 60);
  }
  assert.equal(a.held, null, 'the staff is gone after three strikes');
  assert.equal(game.withStaff(a, game.MOVES[0]).staff, undefined, 'and strikes are bare again');
});

test('a thrown boomerang hits a target in its path', () => {
  const { game } = load();
  game.cfg.items = true;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a, e] = duel(game, 200);
  handTo(game, a, 'boomerang');
  assert.equal(a.held.kind, 'boomerang');
  a.cool = 0;
  run(game, 3, () => e.hp < 100);
  assert.ok(e.hp < 100, 'the boomerang hit');
  assert.equal(game.stats.hits.boomerang, 1);
  assert.equal(a.held, null, 'thrown once');
});

test('a block stops a thrown boomerang', () => {
  const { game } = load();
  game.cfg.items = true;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a, e] = duel(game, 200, 'block');
  handTo(game, a, 'boomerang');
  a.cool = 0;
  run(game, 3, () => game.stats.blocked > 0);
  assert.equal(game.stats.blocked, 1, 'blocked');
  assert.ok(!game.stats.hits.boomerang, 'never hit');
  assert.ok(e.hp > 99, 'only chip damage: ' + e.hp);
  assert.ok(!game.shots.some(s => s.kind === 'boomerang'), 'the block stopped it');
});

test('items drop every 8 to 15 s, at most two at once, and none exist after newRound', () => {
  const { game } = load();
  game.cfg.items = true;
  for (const f of game.fighters) f.hp = 1e9;
  const seen = new Set();
  let most = 0;
  for (let t = 0; t < 60; t += 1 / 60) {
    game.update(1 / 60);
    for (const it of game.items) seen.add(it);
    most = Math.max(most, game.items.length);
    if (t < 7.9) assert.equal(game.items.length, 0, 'nothing before 8 s');
  }
  assert.ok(seen.size >= 2, 'items dropped: ' + seen.size);
  assert.ok(most <= 2, 'at most two at once: ' + most);
  for (const f of game.fighters) f.held = { kind: 'staff', n: 3 };
  game.spawnItem('heart', 400, 50);
  game.newRound();
  assert.equal(game.items.length, 0);
  assert.ok(game.fighters.every(f => !f.held));
});

test('no item ever spawns with the setting off, and turning it off clears the field', () => {
  const { game, we } = load();
  for (const f of game.fighters) f.hp = 1e9;
  for (let t = 0; t < 60; t += 1 / 60) {
    game.update(1 / 60);
    assert.equal(game.items.length, 0);
  }
  we.applyUserProperties({ items: { value: true } });
  assert.equal(game.cfg.items, true);
  game.spawnItem('heart', 400, 50);
  game.fighters[0].held = { kind: 'boomerang' };
  we.applyUserProperties({ items: { value: false } });
  assert.equal(game.items.length, 0);
  assert.equal(game.fighters[0].held, null);
});

test('a heart heals 30% of full health, so a King with double health is healed by 60 and never lowered', () => {
  const { game } = load();
  game.cfg.items = true;
  const [a] = duel(game, 400);
  a.maxHp = 200; a.hp = 120;
  handTo(game, a, 'heart');
  assert.ok(Math.abs(a.hp - 180) < 1e-9, 'healed to ' + a.hp);
  a.W = a.joints(); a.hp = 190;
  handTo(game, a, 'heart');
  assert.equal(a.hp, 200);
});

test('a fighter walking to an item behind it turns back to its target to start a move (#109)', () => {
  for (const id of ['dive', 'slam', 'jab']) {
    const { game } = load(0.99);
    game.cfg.items = true;
    const [a, e] = game.fighters;
    const m = [...game.MOVES, ...game.SUPER].find(m => m.id === id);
    const gap = id === 'jab' ? m.range[1] - 2 : Math.min(300, m.range[1] - 20);
    Object.assign(a, { x: 500, z: 50, alt: 0, vx: 0, facing: 1, state: 'idle', cool: 0, retarget: 99, target: e, hp: 50, nextMove: m });
    Object.assign(e, { x: 500 + gap, z: 50, alt: 0, vx: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 100, cool: 99, target: a });
    a.W = a.joints(); e.W = e.joints();
    game.spawnItem('heart', 380, 50, 0);
    // Nothing else is near, so the heart behind a draws it while the move starts
    run(game, 0.5, () => a.state === 'attack');
    assert.equal(a.state, 'attack', id + ' started');
    assert.equal(a.move.id, id);
    assert.equal(a.facing, 1, id + ' faces its target');
    if (id !== 'jab') {
      run(game, 0.2, () => a.alt > 0 && a.vx !== 0);
      assert.equal(Math.sign(a.vx), Math.sign(e.x - a.x), id + ' jumps toward its target: vx ' + a.vx);
    }
  }
});

test('with boxing off, a staff strike keeps the style of the kick it replaces (#124)', () => {
  const { game } = load();
  game.cfg.items = true;
  game.cfg.styles.boxing = false;
  const [a] = duel(game, 400);
  a.held = { kind: 'staff', n: 3 };
  for (const m of game.MOVES.filter(m => !m.grab && game.cfg.styles[m.style])) {
    const s = game.withStaff(a, m);
    assert.ok(s.staff, m.id + ' became a staff strike');
    assert.equal(s.style, m.style, m.id + ' turned into a ' + s.style + ' move');
    a.held = null;
    assert.equal(game.withStaff(a, s), m, 'with the staff gone, ' + m.id + ' is bare again');
    a.held = { kind: 'staff', n: 3 };
  }
});

test('with every striking style off, a fighter neither picks up nor keeps a staff (#124)', () => {
  const { game } = load(0.99);
  game.cfg.items = true;
  for (const s of ['boxing', 'muaythai', 'taekwondo']) game.cfg.styles[s] = false;
  const [a] = duel(game, 400);
  // It does not walk to a staff nearby
  a.cool = 99; a.state = 'idle';
  game.spawnItem('staff', a.x - 100, a.z, 0);
  run(game, 1);
  assert.ok(a.x > 290, 'walked to the staff: x ' + a.x);
  // Nor pick up one at its feet
  game.items.length = 0;
  a.W = a.joints();
  handTo(game, a, 'staff');
  assert.ok(!a.held, 'picked up a staff it cannot use');
  assert.equal(game.items.length, 1, 'the staff stays on the floor');
  // And one it already holds is dropped
  a.held = { kind: 'staff', n: 3 };
  game.update(1 / 60);
  assert.ok(!a.held, 'kept a staff it cannot use');
  // A grappling move stays bare
  const throwMove = game.MOVES.find(m => m.grab);
  a.held = { kind: 'staff', n: 3 };
  assert.equal(game.withStaff(a, throwMove), throwMove);
});

test('a narrower window brings every item back on screen, where it can be picked up (#117)', () => {
  const { game, window, listeners } = load();
  game.cfg.items = true;
  const [a] = duel(game, 400);
  a.hp = 50;
  game.spawnItem('staff', 920, 50, 0);
  game.spawnItem('heart', 920, 50, 0);
  window.innerWidth = 640;
  listeners.resize();
  const worldW = window.innerWidth / (game.cfg.scale * window.innerHeight / 540);
  for (const it of game.items) {
    assert.ok(it.x >= 40 && it.x <= worldW - 40, it.kind + ' at x ' + it.x + ' is off a world ' + worldW + ' wide');
  }
  // A fighter standing on the heart picks it up
  const heart = game.items.find(it => it.kind === 'heart');
  Object.assign(a, { x: heart.x, z: heart.z, state: 'idle', cool: 99 });
  a.W = a.joints();
  game.update(1 / 60);
  assert.ok(!game.items.includes(heart), 'the heart was not picked up');
  assert.ok(a.hp > 50, 'the heart did not heal');
});
