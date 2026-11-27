// Checks that every pose key is one some pose moves (issue #179): a key that stays at
// its GUARD value in every pose is interpolated every frame for nothing, and a change
// to how fk applies it would leave every other test green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

const src = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');

function load() {
  return loadMain({ search: '?count=6&mode=ffa' }).game;
}

const KEYS = JSON.parse(src.match(/const KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

test('a fighter\'s pose holds exactly the interpolated keys', () => {
  const game = load();
  assert.deepEqual(Object.keys(game.fighters[0].pose).sort(), [...KEYS].sort());
});

test('every pose key moves away from its guard value during a fight', () => {
  const game = load();
  const start = { ...game.fighters[0].pose }, moved = new Set();
  for (let t = 0; t < 30 && moved.size < KEYS.length; t += 1 / 60) {
    game.update(1 / 60);
    for (const f of game.fighters) for (const k of KEYS) if (Math.abs(f.pose[k] - start[k]) > 1e-6) moved.add(k);
  }
  assert.deepEqual(KEYS.filter(k => !moved.has(k)), [], 'keys no pose ever changes');
});

test('fk reads only the pose keys', () => {
  const body = src.match(/function fk\(p\) \{[\s\S]*?\n\}/)[0];
  for (const [, k] of body.matchAll(/\bp\.(\w+)/g)) assert.ok(KEYS.includes(k), 'fk reads p.' + k + ', which is not in KEYS');
});
