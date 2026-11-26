// Ladder rules (issue #313): a double knockout that leaves one fighter waiting is a DRAW
// (issue #126), so that fighter must not step in and strike the glowing victory pose under
// the DRAW banner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=3&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator, so every run shuffles the ladder the same way
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: 'ladder' } });
  return game;
}

test('Ladder: the fighter left waiting after a double knockout does not celebrate the DRAW (#313)', () => {
  const game = load();
  const fighting = game.fighters.filter(f => f.alive && f.state !== 'wait');
  const waiting = game.fighters.filter(f => f.state === 'wait');
  assert.equal(fighting.length, 2);
  assert.equal(waiting.length, 1);
  const [c] = waiting;
  const rounds = game.stats.rounds;
  // Both go down in the same update()
  for (const f of fighting) { f.hp = 0; f.koPending = true; }
  game.update(1 / 60);
  assert.equal(game.stats.rounds, rounds + 1, 'the round did not end');
  assert.equal(game.winnerText, 'DRAW');
  assert.deepEqual([...game.score.wins], [0, 0, 0]);
  // The banner shows for 4.5 s; stop short of the next round
  for (let t = 0; t < 4.4; t += 1 / 60) {
    game.update(1 / 60);
    assert.equal(game.stats.rounds, rounds + 1, 'a new round started early');
    assert.equal(c.aura, 0, 'the waiting fighter glows at ' + c.aura.toFixed(2) + ' after ' + t.toFixed(2) + ' s');
    // VICTORY raises both arms overhead (aF 2.9, aB 3.0); GUARD holds them at 0.95 and 0.45
    assert.ok(c.pose.aF < 2 && c.pose.aB < 2, 'the waiting fighter raises its arms in victory: aF ' + c.pose.aF.toFixed(2) + ', aB ' + c.pose.aB.toFixed(2));
    assert.notEqual(c.state, 'idle', 'the waiting fighter stepped in with nobody to fight');
  }
});
