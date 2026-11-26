// A paused redraw after a setting starts a new round, or a first frame drawn while paused,
// shows the new fighters standing (issue #351). newRound() makes fighters that no step has
// posed yet, so they have no joints and drawFighter skipped them: only the floor showed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper at 1280 x 720 with a screen context that logs every call as
// [name, ...args], and a seeded Math.random (an LCG, as the other tests seed it)
function load() {
  const screen = [];
  const ctx = new Proxy({}, { get: (_, k) => (...args) => { screen.push([k, ...args]); return { addColorStop() {} }; }, set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  let next = null, t = 0;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, URLSearchParams,
    performance: { now: () => 0 },
    location: { search: '?count=2' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame: cb => { next = cb; },
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
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
