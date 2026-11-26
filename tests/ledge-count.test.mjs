// Checks the rule for how many floating ledges there are (issue #177): the middle ledge
// needs a world at least 700 wide, so a narrow world gets two, whether it is narrow
// from a large figure size or from the screen's shape, and the README says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function ledges([w, h], scale) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: w, innerHeight: h, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const props = { platforms: { value: true } };
  if (scale) props.figurescale = { value: scale };
  window.wallpaperPropertyListener.applyUserProperties(props);
  return window.__stickmanBrawl.platforms.length;
}

test('a wide screen at 100% has three ledges', () => {
  assert.equal(ledges([1920, 1080]), 3);
  // Issue #320: worlds between 700 and 900 wide keep the middle ledge
  assert.equal(ledges([1680, 1050]), 3);   // 16:10, world 864 wide
  assert.equal(ledges([1920, 1080], 120), 3);   // world 800 wide
});

test('a narrow world has two ledges, from the screen shape or from a large figure size', () => {
  assert.equal(ledges([1280, 1024]), 2);   // 5:4, world 675 wide
  assert.equal(ledges([1080, 1920]), 2);   // portrait
  assert.equal(ledges([1920, 1080], 200), 2);   // largest figure size
});

test('the README says a narrow screen gets two ledges, not only a large figure size', () => {
  const readme = readFileSync('README.md', 'utf8');
  const para = readme.slice(readme.indexOf('"Floating platforms"')).split('\n\n')[0];
  assert.match(para, /narrow/);
  assert.match(para, /portrait/);
});
