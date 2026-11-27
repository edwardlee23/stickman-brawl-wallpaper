// A paused redraw after a setting starts a new round, or a first frame drawn while paused,
// shows the new fighters standing (issue #351). newRound() makes fighters that no step has
// posed yet, so they have no joints and drawFighter skipped them: only the floor showed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper at 1280 x 720 with a screen context that logs every call as
// [name, ...args], and a seeded Math.random (an LCG, as the other tests seed it)
function load() {
  const screen = [];
  const ctx = new Proxy({}, { get: (_, k) => (...args) => { screen.push([k, ...args]); return { addColorStop() {} }; }, set: () => true });
  let next = null, t = 0;
  const { game, window } = loadMain({ search: '?count=2', ctx,
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } } });
  return {
    game, we: window.wallpaperPropertyListener,
    // Runs n frames and returns the calls the last one made
    frames: n => { for (let i = 0; i < n; i++) { screen.length = 0; next(t += 1000 / 60); } return screen.slice(); },
    // How many fighters the logged frame drew a head for, upright above its hip
    standing: log => game.fighters.filter(f => f.W && f.W.head.y < f.W.hip.y &&
      log.some(([k, x, y]) => k === 'arc' && x === f.W.head.x && y === f.W.head.y)).length,
  };
}

for (const p of [
  { fightercount: { value: 4 } },
  { figurescale: { value: 150 } },
  { roundrules: { value: 'king' } },
  { gamemode: { value: 'teams' } },
]) {
  const name = Object.keys(p)[0];
  test(`a new round from ${name} while paused draws its fighters standing (#351)`, () => {
    const w = load();
    w.frames(5);
    w.we.setPaused(true);
    w.we.applyUserProperties(p);
    const log = w.frames(1);
    const n = w.game.fighters.length;
    assert.ok(n >= 2);
    assert.equal(w.standing(log), n, 'not every fighter of the new round was drawn standing');
    // Drawing them does not start the fight
    const snap = () => JSON.stringify(w.game.fighters.map(f => [f.x, f.z, f.alt, f.time, f.st, f.state, f.hp]));
    const placed = snap();
    w.frames(30);
    assert.equal(snap(), placed);
    w.we.setPaused(false);
    assert.equal(w.standing(w.frames(1)), n);
  });
}

test('a wallpaper paused before its first frame draws its fighters standing (#351)', () => {
  const w = load();
  w.we.setPaused(true);
  const log = w.frames(1);
  assert.equal(w.game.fighters.length, 2);
  assert.equal(w.standing(log), 2, 'the first paused frame did not draw both fighters standing');
});
