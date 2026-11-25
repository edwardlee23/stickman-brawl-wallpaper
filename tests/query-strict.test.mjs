// Loads main.js with query strings that Number() reads but a person would not
// call plain decimal numbers, and with spaces or capitals around switches and
// the mode, and checks how each is read (issue #175).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

function seededMath(seed) {
  const m = Object.create(Math);
  let s = seed >>> 0;
  m.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function load(query) {
  const ctx = new Proxy(function () {}, { get: () => ctx, set: () => true, apply: () => ctx });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search: query },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    Math: seededMath(175), Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return window.__stickmanBrawl.cfg;
}

test('hex, binary, octal and exponent numbers keep the defaults', () => {
  for (const query of ['?count=0x10', '?count=1e1', '?count=0b10', '?count=0o12', '?count=Infinity'])
    assert.equal(load(query).count, 6, query);
  for (const query of ['?speed=0b10', '?speed=0x2', '?speed=2e0'])
    assert.equal(load(query).speed, 1, query);
  for (const query of ['?volume=0o12', '?volume=0x10', '?volume=1e1'])
    assert.equal(load(query).volume, 0.5, query);
});

test('plain decimal numbers, signed or with a leading or trailing point, are read', () => {
  assert.equal(load('?count=%208%20').count, 8);
  assert.equal(load('?count=%2B8').count, 8);
  assert.equal(load('?count=9.').count, 9);
  assert.equal(load('?speed=.5').speed, 0.5);
  assert.equal(load('?speed=-1').speed, 0.25);
  assert.equal(load('?volume=%2025%20').volume, 0.25);
});

test('switches ignore spaces around the word', () => {
  assert.equal(load('?sound=%20yes').sound, true);
  assert.equal(load('?sound=on%20').sound, true);
  assert.equal(load('?reducemotion=%20no%20').reduceMotion, false);
});

test('mode ignores case and spaces around the word', () => {
  assert.equal(load('?mode=Teams').mode, 'teams');
  assert.equal(load('?mode=%20TEAMS%20').mode, 'teams');
  assert.equal(load('?mode=FFA&count=8').mode, 'ffa');
  assert.equal(load('?mode=team').mode, 'ffa');
});
