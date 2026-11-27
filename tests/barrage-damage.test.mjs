// The barrage takes its damage from its SUPER table entry (issue #247): dmg is the
// damage of each rapid punch and finDmg that of the launching finisher, so changing
// either in the table changes the damage the barrage deals. Math.random is stubbed, so
// each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // 0.99: no random jumps, dashes, blocks or launches
  return loadMain({ random: 0.99 }).game;
}

const DT = 1 / 60;

// Runs one barrage at a target 30 px away with the table values given, and returns the
// hp the target lost to the punches and to the finisher (the hit that launches it)
function barrageDamage(table) {
  const game = load();
  const [a, e] = game.fighters;
  const barrage = game.SUPER.find(m => m.id === 'barrage');
  Object.assign(barrage, table);
  Object.assign(a, { x: 300, facing: 1, z: 50, alt: 0, va: 0, vx: 0, vz: 0, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 330, facing: -1, z: 50, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 99, hp: 1e6, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  const lost = { punches: 0, finisher: 0 };
  const takeHit = e.takeHit.bind(e);
  e.takeHit = (src, m, zone, pt, o = {}) => {
    const hp = e.hp, r = takeHit(src, m, zone, pt, o);
    if (m === barrage) lost[o.launch ? 'finisher' : 'punches'] += hp - e.hp;
    return r;
  };
  a.startMove(barrage);
  for (let t = 0; t < 2 && a.state === 'attack'; t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
  return lost;
}

test('the barrage table gives each punch 1.4 and the finisher 9', () => {
  const barrage = load().SUPER.find(m => m.id === 'barrage');
  assert.equal(barrage.dmg, 1.4);
  assert.equal(barrage.finDmg, 9);
});

test('the hp the barrage punches take follows dmg in its SUPER table entry', () => {
  const low = barrageDamage({ dmg: 1.4 }), high = barrageDamage({ dmg: 14 });
  assert.ok(low.punches > 0, 'the punches hit');
  assert.ok(Math.abs(high.punches / low.punches - 10) < 0.01, `10x the table dmg gives 10x the damage (${low.punches} -> ${high.punches})`);
  assert.equal(high.finisher, low.finisher, 'the finisher does not follow dmg');
});

test('the hp the barrage finisher takes follows finDmg in its SUPER table entry', () => {
  const low = barrageDamage({ finDmg: 9 }), high = barrageDamage({ finDmg: 90 });
  assert.ok(low.finisher > 0, 'the finisher hit');
  assert.ok(Math.abs(high.finisher / low.finisher - 10) < 0.01, `10x the table finDmg gives 10x the damage (${low.finisher} -> ${high.finisher})`);
  assert.equal(high.punches, low.punches, 'the punches do not follow finDmg');
});
