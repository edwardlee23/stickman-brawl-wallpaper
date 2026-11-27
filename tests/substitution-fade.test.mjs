// Runs main.js in a sandbox with a stubbed canvas and window, then checks that a fighter
// that substitutes is not drawn at full opacity in its new spot for the step of the hit:
// it fades in from there (issue #310).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // A seeded generator (an LCG), so every run is the same
  return loadMain({ seed: 310 }).game;
}

test('a substitution starts hidden and fades in, with no full-opacity frame (#310)', () => {
  const game = load();
  // The victim updates first, so the attacker's jab lands after the victim's own update
  // that step, as a hit from a fighter later in the list or from a shot does
  const [e, a] = game.fighters;
  const z = 60, dt = 1 / 60;
  Object.assign(e, { x: 660, z, alt: 0, va: 0, vx: 0, facing: -1, state: 'idle', cool: 99, target: a });
  Object.assign(a, { x: 630, z, alt: 0, va: 0, vx: 0, facing: 1, state: 'idle', cool: 99, target: e });
  a.W = a.joints(); e.W = e.joints();
  e.subFrom = a; e.subT = 5;
  a.startMove(game.MOVES.find(m => m.id === 'jab'));
  let steps = 0;
  while (!(e.move && e.move.type === 'substitute') && steps < 120) { game.update(dt); steps++; }
  assert.equal(e.move && e.move.type, 'substitute', 'the jab never set off the substitution');
  // The step that drops the log: render() draws the fighter at this alpha, health bar too
  assert.ok(e.alpha < 0.2, 'alpha ' + e.alpha + ' in the step that drops the log');
  // The fade-in goes on from there
  game.update(dt);
  assert.equal(e.move.type, 'substitute');
  assert.ok(e.alpha > 0 && e.alpha < 0.2, 'alpha ' + e.alpha + ' one step later');
  for (let i = 0; i < 6; i++) game.update(dt);
  assert.ok(e.alpha === 1 || e.move.type === 'substitute' && e.alpha > 0.5, 'alpha ' + e.alpha + ' after the fade-in');
});
