// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// optional pick-up items (issue #88): a heart heals, a staff lengthens three
// strikes, a boomerang flies out and back and can be blocked, and no item exists
// after a new round or ever spawns with the setting off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));

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
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener };
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
