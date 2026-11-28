// Runs main.js in a sandbox with a stubbed canvas and window, then checks that the attack a
// teleport or a substitution follows up with goes through withStaff, as parries, meets and
// combos do (#504): with a staff in hand, a strike follow-up becomes a staff strike, which
// reaches farther and spends one of the staff's uses. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  const { game } = loadMain({ seed });
  game.cfg.items = true;
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 450, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.held = { kind: 'staff', n: 3 };
  return { game, a, e };
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// Steps a alone until its follow-up starts; returns that move
function followUp(a, from) {
  for (let t = 0; t < 1.5; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if (a.move && a.move.id !== from) return a.move;
  }
  return null;
}

for (const how of ['teleport', 'substitution']) {
  test('a ' + how + ' follow-up strike with a staff in hand is a staff strike (#504)', () => {
    let strikes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { game, a, e } = load(seed);
      if (how === 'teleport') a.startMove(byId(game, 'teleport'));
      else a.substitute(e);
      const m = followUp(a, how === 'teleport' ? 'teleport' : 'substitute');
      assert.ok(m, `seed ${seed}: no follow-up`);
      if (m.type) continue;           // a special or a ninjutsu move takes no staff
      strikes++;
      assert.ok(m.staff, `seed ${seed}: the follow-up ${m.id} is bare while a staff is held`);
      // It spends a use once it lands, as every staff strike does
      for (let t = 0; t < 1.5 && a.move === m; t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
      assert.ok(!a.held || a.held.n < 3, `seed ${seed}: ${m.id} spent no staff use`);
    }
    assert.ok(strikes > 0, 'some follow-ups were strikes');
  });
}
