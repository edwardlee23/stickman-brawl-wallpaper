// The win banner, and the wait before the next round that it shows for, count real time, like
// the slow-motion finish, so they last 4.5 real seconds at any Speed (issue #472). They ran on
// game time, so at 25% the banner stayed 18 s and at 300% it was gone in 1.5 s. A paused
// wallpaper holds them, and Reduce motion changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const FRAME = 1000 / 60;

function load(search) {
  let next = null;
  const { game, window } = loadMain({ search, globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } } });
  return { game, we: window.wallpaperPropertyListener, frame: now => next(now) };
}

// Holds every standing fighter in a long flinch, so nobody attacks during the test
function hold(game) {
  for (const f of game.fighters) if (f.alive) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0 });
}

// Ends a round of two at the given Speed (in %) and returns the real seconds until the next
// round starts. pausedFor: real seconds the wallpaper is paused just after the knockout.
function bannerTime({ speed = 100, reduce = false, slowmo = false, pausedFor = 0 } = {}) {
  const w = load('?count=2&reducemotion=' + (reduce ? 1 : 0));
  w.we.applyUserProperties({ gamespeed: { value: speed }, slowmofinish: { value: slowmo } });
  assert.equal(w.game.cfg.speed, speed / 100);
  let t = FRAME;
  hold(w.game); w.frame(t);
  const first = w.game.fighters[0];
  const f = w.game.fighters[1];
  f.hp = 0; f.ko(0, -40);
  hold(w.game); w.frame(t += FRAME);
  assert.equal(w.game.fighters[0], first, 'the round ended at once');
  const ko = t;
  if (pausedFor) {
    w.we.setPaused(true);
    for (let i = 0; i < pausedFor * 60; i++) w.frame(t += FRAME);
    assert.equal(w.game.fighters[0], first, 'a new round started while paused');
    w.we.setPaused(false);
  }
  for (let i = 0; i < 60 * 30 && w.game.fighters[0] === first; i++) { hold(w.game); w.frame(t += FRAME); }
  assert.notEqual(w.game.fighters[0], first, 'no new round within 30 s');
  return (t - ko) / 1000 - pausedFor;
}

for (const speed of [25, 100, 300]) {
  test(`the win banner lasts 4.5 real seconds at ${speed}% speed (#472)`, () => {
    const s = bannerTime({ speed });
    assert.ok(Math.abs(s - 4.5) < 0.05, `the banner lasted ${s.toFixed(2)} s`);
  });
}

test('the win banner lasts 4.5 real seconds with the slow-motion finish and Reduce motion (#472)', () => {
  for (const o of [{ slowmo: true }, { reduce: true }, { reduce: true, slowmo: true, speed: 25 }]) {
    const s = bannerTime(o);
    assert.ok(Math.abs(s - 4.5) < 0.05, `${JSON.stringify(o)}: the banner lasted ${s.toFixed(2)} s`);
  }
});

test('a paused wallpaper holds the win banner (#472)', () => {
  const s = bannerTime({ speed: 300, pausedFor: 10 });
  assert.ok(Math.abs(s - 4.5) < 0.05, `the banner lasted ${s.toFixed(2)} s of unpaused time`);
});
