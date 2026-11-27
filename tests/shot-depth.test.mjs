// Runs main.js in a sandbox and checks how deep a thrown or fired shot reaches (issue #318):
// a star, ice shard, fireball or boomerang hits a fighter up to 16 depth units from its line
// and passes one farther away. Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper with Math.random fixed at 0.99: no random jumps, dashes or reactions
function load() {
  return loadMain({ random: 0.99 }).game;
}

// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, cool: 99, retarget: 99, target: null, ...o });
  f.W = f.joints();
}

// Each shot kind, the move that throws it and its name in a test title
const SHOTS = [['star', 'shuriken', 'a shuriken star'], ['ice', 'ice', 'an ice shard'], ['fire', 'fireball', 'a fireball'], ['boomerang', 'boomerang', 'a boomerang']];

// Sends a shot of the given kind from a at e's chest, on a line dz deeper than e, and
// returns the damage e took by the time the shot is gone
function shoot(kind, id, dz) {
  const game = load();
  const [a, e] = game.fighters;
  hold(a, { x: 200, z: 50, facing: 1, hp: 100 });
  hold(e, { x: 400, z: 50, facing: -1, hp: 100 });
  const c = { x: (e.W.sh.x + e.W.hip.x) / 2, y: (e.W.sh.y + e.W.hip.y) / 2 };
  const m = [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id) || { id };   // The boomerang move is not exposed
  const s = { x: c.x - 80, y: c.y, vx: 430, vy: 0, z: 50 + dz, owner: a, m, life: 3, kind, dmg: 10, col: '#fff' };
  if (kind === 'boomerang') Object.assign(s, { age: 0, v0x: s.vx, v0y: s.vy });
  game.shots.push(s);
  for (let i = 0; i < 30 && game.shots.includes(s); i++) {
    hold(a, { x: 200, z: 50, facing: 1, hp: a.hp });
    hold(e, { x: 400, z: 50, facing: -1, hp: e.hp });
    game.update(1 / 60);
  }
  return 100 - e.hp;
}

for (const [kind, id, name] of SHOTS) {
  test(name + ' hits a fighter 12 depth units from its line and passes one 20 away', () => {
    assert.ok(shoot(kind, id, 12) > 0, 'missed at dz 12');
    assert.ok(shoot(kind, id, -12) > 0, 'missed at dz -12');
    assert.equal(shoot(kind, id, 20), 0, 'hit at dz 20');
    assert.equal(shoot(kind, id, -20), 0, 'hit at dz -20');
  });
}
