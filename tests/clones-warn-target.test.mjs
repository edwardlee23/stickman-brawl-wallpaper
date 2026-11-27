// Runs main.js in a sandbox with a stubbed canvas and window, then checks that only the
// target of the shadow clones reacts to them (issue #415): the clones strike only their
// target, so a bystander between the caster and the target has nothing to dodge, vanish
// from or substitute for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

test('a bystander between the caster and the target never reacts to the shadow clones', () => {
  // A seeded generator (an LCG), so every run is the same (issue #161)
  const { game } = loadMain({ search: '?count=3&mode=ffa' });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  const [a, t, b] = game.fighters;
  const clones = game.NINJA.find(m => m.id === 'clones');
  const reacted = f => f.state !== 'idle' || f.evade > 0 || !!f.subFrom;
  const held = { alt: 0, va: 0, vx: 0, vz: 0, cool: 99, retarget: 99, hp: 1000, evade: 0, subFrom: null,
    state: 'idle', st: 0, move: null, md: null, invis: false };
  let bystander = 0, target = 0;
  for (let n = 0; n < 300; n++) {
    Object.assign(a, held, { x: 300, z: 50, facing: 1, target: t });
    Object.assign(t, held, { x: 460, z: 50, facing: -1, target: a });
    Object.assign(b, held, { x: 380, z: 52, facing: -1, target: t });
    for (const f of game.fighters) f.W = f.joints();
    a.startMove(clones);
    // The clones warn as they leave the split for the rush
    for (let i = 0; i < 60 && a.md.ph === 'split'; i++) a.update(1 / 60);
    assert.equal(a.md.ph, 'rush', 'the clones began their rush');
    if (reacted(b)) bystander++;
    if (reacted(t)) target++;
    a.endMove();
  }
  assert.equal(bystander, 0, 'the bystander reacted to ' + bystander + ' of 300 casts');
  assert.ok(target > 0, 'the target never reacted to the shadow clones');
});
