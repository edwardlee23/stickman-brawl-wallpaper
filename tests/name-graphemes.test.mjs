// Runs main.js in a sandbox, to check that a name is cut to 12 user-visible characters
// (grapheme clusters), so an emoji joined from several code points is never split and a flag
// counts once (issue #252)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  const { game, window } = loadMain({ search: '?count=3&mode=ffa' });
  return { game, we: window.wallpaperPropertyListener };
}
const nameFor = value => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value } });
  return game.nameOf(game.fighters[0]);
};

const ZWJ = String.fromCodePoint(0x200d);
// Man, woman, girl, boy joined into one family emoji: 7 code points, one character
const FAMILY = [0x1f468, 0x1f469, 0x1f467, 0x1f466].map(c => String.fromCodePoint(c)).join(ZWJ);
// A flag is two regional indicator letters: one character
const flag = cc => String.fromCodePoint(...Array.from(cc, c => 0x1f1e6 + c.charCodeAt(0) - 65));
const FLAGS = ['TW', 'JP', 'US', 'GB', 'FR'].map(flag).join('');

test('a family emoji at the end of a name is kept whole', () => {
  assert.equal(nameFor('Dragon' + FAMILY), 'Dragon' + FAMILY);
});

test('five flags count as five characters, so an 8-character name is not cut', () => {
  assert.equal(nameFor('Go' + FLAGS + 'x'), 'Go' + FLAGS + 'x');
});

test('a name of 13 flags is cut to 12 whole flags', () => {
  const thirteen = FLAGS + FLAGS + flag('DE') + flag('IT') + flag('KR');
  assert.equal(nameFor(thirteen), FLAGS + FLAGS + flag('DE') + flag('IT'));
});

test('a family emoji past the 12th character is dropped whole, not in part', () => {
  assert.equal(nameFor('abcdefghijkl' + FAMILY), 'abcdefghijkl');
  assert.equal(nameFor('abcdefghijk' + FAMILY + 'z'), 'abcdefghijk' + FAMILY);
});
