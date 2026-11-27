// A slam's rise ends on the way down (va < 0). At large figure sizes the side ledges sit at the
// jump ceiling, so a slam started under one lands on it with va 0 at the top of its jump; a
// small screen can land the jump on the floor before the rise's 0.25 s. Either way va never goes
// below 0 and the fighter stood in the wind-up pose for seconds (issue #460, as #245 was for the
// plain jump). A landed rise must go on to the drop and quake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

// Starts a slam with the slammer at (x, z) on the floor and a blocking target beside it, and
// returns the time until the slam leaves its 'up' phase (Infinity after 1 s) and the slammer
function slamUpTime(opts, x, z) {
  const game = loadMain({ seed: 460, ...opts }).game;
  const [a, e] = game.fighters;
  Object.assign(e, { x: x + 2, z, alt: 0, va: 0, vx: 0, vz: 0, state: 'block', st: 0, dur: 999, cool: 999, hp: 1000, target: a, retarget: 999 });
  Object.assign(a, { x, z, alt: 0, va: 0, vx: 0, vz: 0, state: 'idle', st: 0, cool: 999, hp: 1000, facing: 1, target: e, retarget: 999 });
  a.W = a.joints(); e.W = e.joints();
  a.startMove(game.SUPER.find(m => m.type === 'slam'));
  for (let t = 0; t < 1; t += DT) {
    game.update(DT);
    if (a.state !== 'attack' || !a.md || a.md.ph !== 'up') return { t, a };
  }
  return { t: Infinity, a };
}

for (const scale of [174, 200]) {
  test(`a slam started under a side ledge at figure size ${scale}% drops within 1 s`, () => {
    const props = { platforms: { value: true }, figurescale: { value: scale } };
    const game = loadMain({ seed: 460, properties: props }).game;
    const p = game.platforms[0];
    assert.ok(Math.abs(p.y - 110) < 1e-9, 'the side ledge is not at the jump ceiling, but at ' + p.y);
    const { t, a } = slamUpTime({ properties: props }, (p.x0 + p.x1) / 2, 60);
    assert.ok(t < 1, `the slam is still in its wind-up after 1 s, at altitude ${a.alt} with va ${a.va}`);
  });
}

test('a slam whose jump lands on the floor before its rise ends drops within 1 s', () => {
  const { t, a } = slamUpTime({ width: 540, height: 960, properties: { figurescale: { value: 200 } } }, 270, 0);
  assert.ok(t < 1, `the slam is still in its wind-up after 1 s, at altitude ${a.alt} with va ${a.va}`);
});
