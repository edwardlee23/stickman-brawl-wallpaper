// Loads main.js with query strings a browser user might type and checks that
// the settings stay within the ranges the Wallpaper Engine panel allows
// (issue #11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

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
    Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return window.__stickmanBrawl;
}

test('values that are not numbers or known modes keep the defaults', () => {
  const game = load('?count=abc&speed=abc&mode=xyz');
  assert.equal(game.cfg.count, 6);
  assert.equal(game.cfg.speed, 1);
  assert.equal(game.cfg.mode, 'ffa');
  assert.equal(game.fighters.length, 6);
});

test('numbers outside the panel ranges are clamped to them', () => {
  for (const [query, count, speed] of [
    ['?count=99&speed=20', 16, 3],
    ['?count=1&speed=0', 2, 0.25],
    ['?count=-5&speed=-1', 2, 0.25],
  ]) {
    const game = load(query);
    assert.equal(game.cfg.count, count, `${query} count`);
    assert.equal(game.cfg.speed, speed, `${query} speed`);
  }
});

test('valid values are used as given', () => {
  const game = load('?count=8&speed=2.5&mode=teams');
  assert.equal(game.cfg.count, 8);
  assert.equal(game.cfg.speed, 2.5);
  assert.equal(game.cfg.mode, 'teams');
});
