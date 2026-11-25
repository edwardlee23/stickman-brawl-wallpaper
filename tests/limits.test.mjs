// Loads main.js in a sandbox and checks small limits that keep the picture
// right (issue #131): the fighter count from the query string is a whole
// number, panel colors outside 0..1 are clamped, and a strike that grazes the
// head counts as a head hit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

function load(query = '?count=2') {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: query },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('Math.random = () => 0.5;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener };
}

test('a fractional ?count= is rounded to a whole number of fighters', () => {
  for (const [query, n] of [['?count=7.6', 8], ['?count=7.4', 7], ['?count=2.5', 3]]) {
    const { game } = load(query);
    assert.equal(game.cfg.count, n, query);
    assert.equal(game.fighters.length, n, query + ' fighters');
  }
});

test('panel colors outside 0..1 are clamped', () => {
  const { game, we } = load();
  we.applyUserProperties({ backgroundcolor: { value: '1.5 -0.2 0.5' }, linecolor: { value: '2 0 -1' } });
  assert.equal(game.cfg.bg, 'rgb(255,0,128)');
  assert.equal(game.cfg.line, 'rgb(255,0,0)');
});

test('a strike passing just over the head counts as a head hit', () => {
  const { game } = load();
  const [a, e] = game.fighters;
  Object.assign(e, { x: 500, z: a.z, alt: 0, state: 'idle' });
  e.W = e.joints();
  // 10 units above the center of the 8-unit head: outside the head, inside the 3-unit margin
  const P = { x: e.W.head.x, y: e.W.head.y - 10 };
  const r = a.sweepHit(P, P);
  assert.ok(r, 'no hit');
  assert.equal(r[0], e);
  assert.equal(r[1], 'head');
});
