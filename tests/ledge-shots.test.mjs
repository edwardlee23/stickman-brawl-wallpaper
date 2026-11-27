// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a floating
// platform stops shots and beams that come down onto it, while those from below pass up
// through it, as fighters jump up through a ledge (issue #217). Every shot kind is checked:
// the energy blast, fireball, ice shard, shuriken and boomerang, and the energy beam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same
  return loadMain({ search: '?count=3&mode=ffa', properties: { platforms: { value: true } } }).game;
}

const still = { z: 50, alt: 0, vx: 0, vz: 0, va: 0, facing: 1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99 };
// The low left ledge, and every fighter held still on the floor away from it
function setup() {
  const game = load();
  const p = game.platforms.reduce((a, b) => (b.x0 < a.x0 ? b : a));
  game.fighters.forEach((f, i) => Object.assign(f, still, { x: p.x1 + 300 + i * 40 }));
  for (const f of game.fighters) f.W = f.joints();
  return { game, p };
}

const KINDS = [undefined, 'fire', 'ice', 'star', 'boomerang'];
// A shot of the given kind over the middle of the ledge, at dy from its top, flying at vy
function fire(game, p, kind, dy, vy) {
  const owner = game.fighters[0];
  const s = { x: (p.x0 + p.x1) / 2, y: p.y + dy, vx: 20, vy, z: 50, owner, m: game.MAGIC[0], life: 3, col: '#fff', kind, dmg: 4 };
  if (kind === 'boomerang') Object.assign(s, { age: 0, v0x: s.vx, v0y: s.vy });
  game.shots.push(s);
  return s;
}

for (const kind of KINDS) {
  const name = kind || 'blast';
  test(name + ': a shot coming down stops at the ledge top', () => {
    const { game, p } = setup();
    const s = fire(game, p, kind, -30, 400);
    let maxY = s.y;
    for (let t = 0; t < 1 && game.shots.includes(s); t += 1 / 60) { game.update(1 / 60); maxY = Math.max(maxY, s.y); }
    assert.ok(!game.shots.includes(s), 'the shot ended');
    assert.ok(maxY <= p.y + 0.5, 'the shot reached y ' + maxY.toFixed(1) + ', past the ledge top at ' + p.y);
  });
  test(name + ': a shot from below passes up through the ledge', () => {
    const { game, p } = setup();
    const s = fire(game, p, kind, 15, -400);
    for (let t = 0; t < 0.25; t += 1 / 60) game.update(1 / 60);
    assert.ok(game.shots.includes(s), 'the shot still flies');
    assert.ok(s.y < p.y - 20, 'the shot is above the ledge, at y ' + s.y.toFixed(1));
  });
}

// a beams at e: a stands at ax on the ledge (onLedge) or the floor, e at ex on the other.
// Returns the lowest point the beam reached and the target.
function beam(onLedge, ax, ex) {
  const { game, p } = setup();
  const [a, e] = game.fighters, ledgeAlt = game.groundY(50) - p.y;
  Object.assign(a, { x: p.x0 + ax, alt: onLedge ? ledgeAlt : 0, state: 'idle', cool: 0, target: e });
  Object.assign(e, { x: p.x0 + ex, alt: onLedge ? 0 : ledgeAlt, facing: -1 });
  for (const g of game.fighters) g.W = g.joints();
  a.startMove(game.SUPER.find(m => m.id === 'beam'));
  let endY = -Infinity, fired = false;
  for (let t = 0; t < 2 && a.move; t += 1 / 60) {
    for (const g of game.fighters) g.W = g.joints();
    a.update(1 / 60);
    if (a.md && a.md.E && a.md.ph === 'fire') { fired = true; endY = Math.max(endY, a.md.E.y); }
  }
  assert.ok(fired, 'the beam fired');
  return { p, e, endY };
}

test('beam: fired down from a ledge, it stops at the ledge and spares a target on the floor', () => {
  const { p, e, endY } = beam(true, 70, 240);
  assert.ok(endY <= p.y + 0.5, 'the beam reached y ' + endY.toFixed(1) + ', past the ledge top at ' + p.y);
  assert.equal(e.hp, 1000, 'the target on the floor beyond the ledge is not hit');
});

test('beam: fired up from under a ledge, it passes through and hits a target on the ledge', () => {
  const { p, e, endY } = beam(false, 20, 190);
  assert.ok(endY < p.y, 'the beam ends above the ledge, at y ' + endY.toFixed(1));
  assert.ok(e.hp < 1000, 'the target on the ledge is hit');
});
