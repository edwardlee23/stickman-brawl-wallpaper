// Ladder picks the first bout with a fair shuffle (issue #311): over many rounds every
// fighter is one of the two who open the round about as often as any other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load(search) {
  // A seeded generator, so every run gives the same counts
  return loadMain({ search }).window;
}

test('Ladder at 6 fighters: each opens the first bout 33.3% +- 2% of 20,000 rounds', () => {
  const window = load('?count=6&mode=ffa');
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: 'ladder' } });
  const game = window.__stickmanBrawl;
  const rounds = 20000, opens = new Array(6).fill(0);
  for (let r = 0; r < rounds; r++) {
    game.newRound();
    const bout = game.fighters.filter(f => f.state !== 'wait');
    assert.equal(bout.length, 2);
    for (const f of bout) opens[f.id]++;
  }
  const share = opens.map(c => c / rounds);
  for (const [i, s] of share.entries()) {
    assert.ok(Math.abs(s - 1 / 3) <= 0.02, '#' + (i + 1) + ' opens ' + (s * 100).toFixed(1) + '% of rounds: ' + share.map(v => (v * 100).toFixed(1)).join(', '));
  }
});
