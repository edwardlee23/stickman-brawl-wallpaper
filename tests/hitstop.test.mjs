// Runs main.js in a node:vm sandbox and checks that a hit stop pauses the fight
// for as long as asked, not for whole substeps (issue #122): the substep a hit
// stop ends in simulates the rest of its time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, source, mulberry32 } from './load-main.mjs';

// A copy of main.js that adds up, in window.__upd, the game time update() simulates,
// and exposes hitStop as window.__hitStop
const UPDATE_ANCHOR = 'function update(dt) {';
assert.ok(source.includes(UPDATE_ANCHOR), 'anchor not found in main.js');
const count = src => src.replace(UPDATE_ANCHOR, UPDATE_ANCHOR + ' window.__upd += dt;');

// Loads the wallpaper with a seeded Math.random and returns its debug hook, a
// function that runs one animation frame at the given time in ms, hitStop, and
// the game time simulated so far
function load(search, seed = 1) {
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  let next = null;
  const { window } = loadMain({
    search, ctx: stub, random: mulberry32(seed), window: { __upd: 0 },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
    patch: count, expose: 'window.__hitStop = hitStop;',
  });
  return { game: window.__stickmanBrawl, frame: now => next(now), hitStop: t => window.__hitStop(t), upd: () => window.__upd };
}

// Holds every fighter in a long flinch, so nobody attacks and no other hit stop starts
function hold(game) {
  for (const f of game.fighters) if (f.alive) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0, hp: 1e6 });
  game.shots.length = 0;
}

// Asks for a hit stop of `t` seconds and returns the game time it paused over
// `frames` frames at `fps` and 100% speed
function paused(t, fps, frames = 30) {
  const { game, frame, hitStop, upd } = load('?count=2');
  const ms = 1000 / fps;
  let now = ms;
  hold(game); frame(now);
  const u0 = upd();
  hitStop(t);
  for (let i = 0; i < frames; i++) { hold(game); frame(now += ms); }
  return frames / fps - (upd() - u0);
}

for (const [t, fps] of [[0.035, 60], [0.09, 60], [0.035, 30], [0.07, 144]]) {
  test(`a ${t} s hit stop at ${fps} fps pauses ${t} s of game time`, () => {
    const p = paused(t, fps);
    assert.ok(Math.abs(p - t) <= 0.002, `paused ${p.toFixed(4)} s instead of ${t} s`);
  });
}
