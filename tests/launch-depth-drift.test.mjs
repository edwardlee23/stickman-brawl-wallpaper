// Runs main.js in a sandbox and checks that a launched fighter's depth speed slows the way a
// flinching fighter's does, so a knockback does not carry it across the floor in depth for the
// whole flight (issue #502). Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load() {
  const { game } = loadMain({ random: 0.5 });
  const W = 1280 / (720 / 540);
  game.fighters.forEach((f, i) => Object.assign(f, { x: W / 2 + (i ? 200 : -200), z: 20, alt: 0, va: 0, vx: 0, vz: 0,
    facing: i ? -1 : 1, state: 'idle', hp: 1000, cool: 99, retarget: 99 }));
  for (const f of game.fighters) f.W = f.joints();
  return game.fighters[1];
}

test('a launched fighter drifts only a few depth units from its walking depth speed (#502)', () => {
  const e = load();
  e.vz = 45;   // the top walking depth speed
  e.launch(-300, 500);
  const z0 = e.z;
  for (let i = 0; i < 120 && e.state === 'launched'; i++) { e.update(DT); e.W = e.joints(); }
  assert.notEqual(e.state, 'launched', 'the fighter lands');
  assert.ok(Math.abs(e.z - z0) < 5, `depth drifted ${(e.z - z0).toFixed(1)} over the flight`);
  assert.equal(e.vz, 0, 'no depth speed is left on landing');
});
