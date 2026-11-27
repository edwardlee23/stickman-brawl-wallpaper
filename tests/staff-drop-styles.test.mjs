// With Items on and every striking style off, the staff cannot be used (#124), so no staff
// may drop: one would lie on the floor for the rest of the round and hold one of the two item
// slots, so two of them would stop every other drop (issue #340).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper in a sandbox with a stub canvas and a seeded Math.random
function load(seed, search = '?count=4&mode=ffa') {
  const ctx = new Proxy({}, {
    get: (_, k) => () => (k === 'measureText' ? { width: 8 } : { addColorStop() {} }),
    set: () => true,
  });
  return loadMain({ search, ctx, seed, properties: {} }).game;
}

test('with every striking style off, no staff drops, and the other items keep dropping (#340)', () => {
  for (const seed of [1, 2, 3]) {
    const game = load(seed);
    game.cfg.items = true;
    for (const s of ['boxing', 'muaythai', 'taekwondo']) game.cfg.styles[s] = false;
    assert.ok(Object.values(game.cfg.styles).some(Boolean), 'another style is still on');
    // Each drop is recorded and taken off the field, so both item slots stay free
    const drops = [];
    for (let t = 0; t < 300; t += 1 / 60) {
      game.update(1 / 60);
      for (const it of game.items) drops.push(it.kind);
      game.items.length = 0;
    }
    assert.ok(drops.length >= 10, 'seed ' + seed + ': only ' + drops.length + ' drops in 300 s');
    assert.ok(!drops.includes('staff'), 'seed ' + seed + ': a staff dropped: ' + drops.join(', '));
  }
});

test('with a striking style on, staffs still drop (#340)', () => {
  const game = load(1);
  game.cfg.items = true;
  const drops = [];
  for (let t = 0; t < 300; t += 1 / 60) {
    game.update(1 / 60);
    for (const it of game.items) drops.push(it.kind);
    game.items.length = 0;
  }
  assert.ok(drops.includes('staff'), 'no staff in ' + drops.join(', '));
});
