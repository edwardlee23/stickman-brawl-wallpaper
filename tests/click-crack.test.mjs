// Click to blast leaves a floor crack anywhere a theme paints floor (issue #257): the dojo,
// rooftop and day-and-night themes paint floor from the floor's back edge to the bottom of
// the screen, so a click low on the screen cracks the floor, not the wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// 1280 x 720 at figure size 100%: one world unit is 720 / 540 screen pixels, the world is
// 540 high and the floor's back edge (floorTop) is at 540 * 0.74 - 120 / 2
const S = 720 / 540, FLOOR_TOP = 540 * 0.74 - 60, DEPTH = 120;

function load(theme) {
  const listeners = {};
  // A seeded generator (an LCG) for Math.random, so every run is the same
  const { game } = loadMain({
    search: '?count=2', seed: 1,
    window: { addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } },
    properties: { backgroundtheme: { value: theme }, clickblast: { value: true } },
  });
  assert.equal(game.groundY(0), FLOOR_TOP);
  let t = 0;
  // Clicks at world y (x 480, mid-screen) a second apart, past the cooldown, and returns the
  // kind of crack each one left
  return ys => ys.map(y => {
    t += 1000;
    for (const fn of listeners.pointerdown ?? []) fn({ clientX: 480 * S, clientY: y * S, button: 0, timeStamp: t });
    const c = game.fx.filter(o => o.type === 'crack').pop();
    assert.ok(c && Math.abs(c.y - y) < 1e-9, `no crack at y ${y}`);
    return c.kind;
  });
}

const BAND = [FLOOR_TOP - 6, FLOOR_TOP + 60, FLOOR_TOP + DEPTH + 6];   // On the floor band
const BELOW = [FLOOR_TOP + DEPTH + 7, FLOOR_TOP + DEPTH + 20, 520, 539];  // Below it, to the screen's bottom
const ABOVE = [0, 200, FLOOR_TOP - 7];

for (const theme of ['dojo', 'rooftop', 'daynight']) {
  test(`with the ${theme} theme, a click anywhere from the floor's back edge down cracks the floor (#257)`, () => {
    const click = load(theme);
    assert.deepEqual(click([...BAND, ...BELOW]), [...BAND, ...BELOW].map(() => 'ground'));
    assert.deepEqual(click(ABOVE), ABOVE.map(() => 'wall'), 'a click above the floor cracks the wall');
  });
}

for (const theme of ['plain', 'comic']) {
  test(`with the ${theme} theme, which paints no floor, only the floor band cracks as floor (#257)`, () => {
    const click = load(theme);
    assert.deepEqual(click(BAND), BAND.map(() => 'ground'));
    assert.deepEqual(click([...BELOW, ...ABOVE]), [...BELOW, ...ABOVE].map(() => 'wall'));
  });
}
