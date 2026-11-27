// Runs main.js in a sandbox with floating platforms on and checks that the fireball, ice,
// shuriken, energy blast and boomerang are not used from a ledge when every shot would come down
// on that same ledge (issue #420), as #387 did for the beam. A shot coming down bursts on the
// first ledge top it meets, the shooter's own included (#217), so from the middle ledge at a
// target on the floor past the ledge's end most of them burst a few steps in front of the
// shooter. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;

function load(seed) {
  const { game } = loadMain({ seed, properties: { platforms: { value: true } } });
  game.cfg.items = true;
  return game;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id) || game.MOVE_BY[id];
const middle = game => game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge is the highest
const SHOTS = ['fireball', 'ice', 'shuriken', 'blast'];

// a stands on the middle ledge at x, at depth 40, facing e, which flinches on the floor tx past
// the ledge's end on side (1 right, -1 left). Returns null when e is out of the move's range;
// else how often a would use the move (pickMove's choices in 400 picks, or for the boomerang
// whether a holding one throws it), whether every shot of it burst on a's own ledge, and
// whether one hit e.
function shot(id, x, tx, side) {
  const game = load(1);
  const p = middle(game), z = 40, [a, e] = game.fighters, m = byId(game, id);
  const ex = side > 0 ? p.x1 + tx : p.x0 - tx, dist = Math.abs(ex - x);
  if (dist < m.range[0] || dist > m.range[1]) return null;
  const hold = () => Object.assign(e, { x: ex, z, alt: 0, va: 0, vx: 0, vz: 0, facing: -side, state: 'hit', st: 0, dur: 99, cool: 99, retarget: 99, target: a });
  Object.assign(a, { x, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, facing: side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  hold(); e.hp = 1000;
  // A quarter second for e to settle into its flinch, which shot aims at. a's own update is
  // skipped meanwhile, so it starts no move of its own; a boomerang throw is decided in
  // updateItems, on the last of these frames
  a.update = () => {};
  for (let i = 0; i < 15; i++) {
    hold();
    if (i === 14 && id === 'boomerang') Object.assign(a, { held: { kind: 'boomerang' }, cool: 0 });
    game.update(DT);
  }
  delete a.update;
  let picks = 0;
  if (id === 'boomerang') {
    picks = a.state === 'attack' && a.move === m ? 1 : 0;
    if (!picks) { a.held = null; a.startMove(m, true); }
  } else {
    for (let i = 0; i < 400; i++) if (game.pickMove(a, e).id === id) picks++;
    a.startMove(m);
  }
  const live = new Set(), ends = [];
  for (let t = 0; t < 5; t += DT) {
    hold(); a.cool = 99; a.retarget = 99;
    game.update(DT);
    for (const s of game.shots) if (s.owner === a) live.add(s);
    for (const s of live) if (!game.shots.includes(s)) { live.delete(s); ends.push({ x: s.x, y: s.y }); }
    if (a.state !== 'attack' && !live.size) break;
  }
  // Bursts within 4 of the ledge's ends are left out: there a shot a little flatter or steeper
  // than its aim, from its random spread, decides it, which pickMove cannot know
  const own = ends.length > 0 && ends.every(E => Math.abs(E.y - p.y) < 0.5 && E.x >= p.x0 + 4 && E.x <= p.x1 - 4);
  return { picks, own, hit: e.hp < 1000 };
}
function cases(id, each) {
  const p = middle(load(1));
  for (const side of [1, -1]) for (let x = p.x0 + 10; x <= p.x1 - 10; x += 20) {
    for (let tx = 40; tx <= 280; tx += 40) {
      const r = shot(id, x, tx, side);
      if (r) each(r, `side ${side} x ${x.toFixed(0)} target ${tx} out`);
    }
  }
}

for (const id of [...SHOTS, 'boomerang']) {
  test(`the ${id} is not used from a ledge when every shot would burst on that ledge (#420)`, () => {
    const bad = [];
    let ownCases = 0;
    cases(id, (r, at) => {
      if (r.own) ownCases++;
      if (r.own && r.picks) bad.push(`${at}: ${r.picks} picks`);
    });
    assert.ok(ownCases > 0, `no ${id} burst on its own ledge`);
    assert.deepEqual(bad, []);
  });

  test(`from the ledge the ${id} is still used at every floor target it hits (#420)`, () => {
    const dropped = [];
    let hits = 0;
    cases(id, (r, at) => {
      if (!r.hit) return;
      hits++;
      if (!r.picks) dropped.push(at);
    });
    assert.ok(hits > 0, `no ${id} hit`);
    assert.deepEqual(dropped, [], `${id} shots that hit but are no longer used`);
  });
}
