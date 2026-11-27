// Checks the rule for how many floating ledges there are (issue #177): the middle ledge
// needs a world at least 700 wide, so a narrow world gets two, whether it is narrow
// from a large figure size or from the screen's shape, and the README says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

function ledges([w, h], scale) {
  const props = { platforms: { value: true } };
  if (scale) props.figurescale = { value: scale };
  return loadMain({ width: w, height: h, properties: props }).game.platforms.length;
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
