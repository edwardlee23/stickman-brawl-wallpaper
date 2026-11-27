// scripts/record-settings.mjs starts a clip at an event (#466) and, with --check, replays each
// GIF and lists what its shows field names that did not happen. The browser side runs in the
// recorder; these checks cover the parts that decide what to wait for and what is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEvent, shortfall, parseArgs } from '../scripts/record-settings.mjs';

const seenIn = (ev, win) => new Function('window', 'return (' + ev.test + ')()')(win);
const page = items => ({ __stickmanBrawl: { items }, __fighters: () => [] });

test('an item shot that names a kind waits for that kind, not for the first drop (#466)', () => {
  const ev = startEvent({ item: { kind: 'boomerang', lead: 0.3 } });
  assert.equal(ev.lead, 0.3);
  assert.equal(seenIn(ev, page([{ kind: 'staff' }])), false);
  assert.equal(seenIn(ev, page([{ kind: 'staff' }, { kind: 'boomerang' }])), true);
});

test('an item shot given in seconds still waits for the first drop of any kind', () => {
  const ev = startEvent({ item: 0.5 });
  assert.equal(ev.lead, 0.5);
  assert.equal(seenIn(ev, page([])), false);
  assert.equal(seenIn(ev, page([{ kind: 'heart' }])), true);
  assert.equal(startEvent({ skip: 2 }), null);
  assert.equal(startEvent({ ko: 1 }).lead, 1);
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

test('--check takes the same picture names as a recording', () => {
  assert.deepEqual(parseArgs(['--check', 'items']).check, true);
  assert.deepEqual(parseArgs(['--check', 'items']).shots.map(s => s.name), ['items']);
  assert.deepEqual(parseArgs(['items']).check, false);
  assert.throws(() => parseArgs(['--check', 'nothing']), /No picture named nothing/);
});
