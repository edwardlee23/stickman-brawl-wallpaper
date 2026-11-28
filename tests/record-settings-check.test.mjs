// scripts/record-settings.mjs starts a clip at an event (#466) and, with --check, replays each
// GIF and lists what its shows field names that did not happen. The browser side runs in the
// recorder; these checks cover the parts that decide what to wait for and what is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEvent, firstEvent, watchClip, shortfall, parseArgs } from '../scripts/record-settings.mjs';

// A stand-in for the page: each step drops the next of drops (an item kind, or null for none)
// and runs the fighters' updates
function page(drops, fighters = []) {
  const items = [], fx = [];
  return { __stickmanBrawl: { items, fx }, __fighters: () => fighters,
    __step() { const k = drops.shift(); if (k) items.push({ kind: k }); } };
}
const frameOf = (ev, drops) => firstEvent([ev, 10], page(drops));

test('an item shot that names a kind waits for that kind, not for the first drop (#466)', () => {
  const ev = startEvent({ item: { kind: 'boomerang', lead: 0.3 } });
  assert.deepEqual(ev, { name: 'boomerang item', lead: 0.3, kind: 'boomerang' });
  assert.equal(frameOf(ev, [null, 'staff', null, 'boomerang']), 3);
  assert.equal(frameOf(ev, ['staff', 'heart']), -1);
});

test('an item shot given in seconds still waits for the first drop of any kind', () => {
  const ev = startEvent({ item: 0.5 });
  assert.deepEqual(ev, { name: 'item', lead: 0.5 });
  assert.equal(frameOf(ev, [null, 'heart', 'boomerang']), 1);
  assert.equal(frameOf(ev, []), -1);
  assert.equal(startEvent({ skip: 2 }), null);
  const ko = startEvent({ ko: 1 });
  assert.deepEqual(ko, { name: 'ko', lead: 1, ko: true });
  const f = { alive: true };
  const win = page([]);
  win.__fighters = () => [f];
  const step = win.__step; let n = 0;
  win.__step = () => { step(); if (++n === 4) f.alive = false; };
  assert.equal(firstEvent([ko, 10], win), 3);
});

test('the check lists each event a clip names that did not happen (#466)', () => {
  const seen = { moves: ['fireball', 'ice'], fx: ['focus'], drops: ['staff'], pickups: ['staff'], launched: 0, ko: false };
  assert.deepEqual(shortfall({ moves: ['fireball', 'lightning', 'ice', 'shield'], fx: ['bolt'] }, seen),
    ['no lightning move', 'no shield move', 'no bolt fx']);
  assert.deepEqual(shortfall({ item: 'boomerang' }, seen), ['no boomerang drops', 'no boomerang picked up']);
  assert.deepEqual(shortfall({ launched: 1 }, seen), ['0 fighters launched by the clicks, not at least 1']);
  assert.deepEqual(shortfall({ ko: true }, seen), ['no knockout']);
  assert.deepEqual(shortfall({ moves: ['ice'], fx: ['focus'], item: 'staff' }, seen), []);
  assert.deepEqual(shortfall(undefined, seen), []);
});

test('the clip watcher notes what starts in the clip, not what was there before it', () => {
  const f = { alive: true, state: 'attack', move: { id: 'jab' }, held: null };
  const win = page([null, 'boomerang']);
  const step = win.__step; let n = 0;
  win.__step = () => {
    step(); n++;
    if (n === 1) { f.move = { id: 'fireball' }; win.__stickmanBrawl.fx.push({ type: 'flash' }); }
    if (n === 2) f.held = { kind: 'boomerang' };
  };
  win.__fighters = () => [f];
  win.__stickmanBrawl.fx.push({ type: 'focus' });
  assert.deepEqual(watchClip([3, []], win),
    { moves: ['fireball'], fx: ['flash'], drops: ['boomerang'], pickups: ['boomerang'], launched: 0, ko: false });
});

test('the clip watcher notes a knockout in the clip, not one before it (#508)', () => {
  // Down before the clip and still down: no knockout in the clip
  const down = { alive: false, state: 'down', move: null, held: null };
  const before = page([]);
  before.__fighters = () => [down];
  assert.equal(watchClip([3, []], before).ko, false);
  // Standing when the clip starts, knocked out in it
  const f = { alive: true, state: 'idle', move: null, held: null };
  const during = page([]);
  const step = during.__step; let n = 0;
  during.__step = () => { step(); if (++n === 2) f.alive = false; };
  during.__fighters = () => [down, f];
  assert.equal(watchClip([3, []], during).ko, true);
});

test('--check takes the same picture names as a recording', () => {
  assert.deepEqual(parseArgs(['--check', 'items']).check, true);
  assert.deepEqual(parseArgs(['--check', 'items']).shots.map(s => s.name), ['items']);
  assert.deepEqual(parseArgs(['items']).check, false);
  assert.throws(() => parseArgs(['--check', 'nothing']), /No picture named nothing/);
});
