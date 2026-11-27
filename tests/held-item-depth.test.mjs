// Runs main.js in a sandbox with a recording canvas, to check that a held item is drawn with
// its holder in depth order (issue #251): a staff or boomerang held by a fighter at the back is
// covered by a fighter standing in front of it, and drawn over its own holder's body
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper; calls records every canvas method call, and every property set as
// ['set', name, value]
function load(search) {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return grad; },
    set: (_, k, v) => { calls.push(['set', k, v]); return true; },
  });
  return { game: loadMain({ search, ctx }).game, calls };
}
const TEAM_COLOR = ['#ff6b6b', '#4dabf7'];
const ITEM_COLOR = { staff: '#a0703f', boomerang: '#d9a066' };   // WOOD, BOOMERANG_COL

// Draws one frame with the red fighter at depth zRed holding kind, the blue one at zBlue, side
// by side; gives the call index of the item's stroke color and of each body's strokes
function frame(kind, zRed, zBlue) {
  const { game, calls } = load('?count=2&mode=teams');
  const [red, blue] = [0, 1].map(t => game.fighters.find(f => f.team === t));
  Object.assign(red, { x: 470, z: zRed, held: kind === 'staff' ? { kind, n: 3 } : { kind } });
  Object.assign(blue, { x: 480, z: zBlue });
  for (const f of game.fighters) f.W = f.joints();
  calls.length = 0; game.render();
  const sets = col => calls.map((c, i) => c[0] === 'set' && c[1] === 'strokeStyle' && c[2] === col ? i : -1).filter(i => i >= 0);
  const item = sets(ITEM_COLOR[kind]);
  assert.equal(item.length, 1, 'the item is drawn once');
  return { item: item[0], red: sets(TEAM_COLOR[0]), blue: sets(TEAM_COLOR[1]) };
}

for (const kind of ['staff', 'boomerang']) {
  test(`a ${kind} held at the back is drawn before the fighter in front of it`, () => {
    const { item, red, blue } = frame(kind, 10, 90);
    assert.ok(red.length && blue.length, 'both bodies drawn');
    assert.ok(Math.max(...red) < item, 'the item is drawn over its own holder');
    assert.ok(item < Math.min(...blue), `the item (call ${item}) is drawn after the front fighter's body (calls ${Math.min(...blue)} to ${Math.max(...blue)})`);
  });

  test(`a ${kind} held at the front is drawn over the fighter behind it`, () => {
    const { item, red, blue } = frame(kind, 90, 10);
    assert.ok(Math.max(...blue) < Math.min(...red), 'the back fighter is drawn first');
    assert.ok(Math.max(...red) < item, 'the item is drawn over its own holder');
  });
}
