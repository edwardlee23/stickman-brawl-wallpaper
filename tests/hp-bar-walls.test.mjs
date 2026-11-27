// Runs main.js in a sandbox with a recording canvas, to check that a fighter's health bar
// stays inside the side walls, so its fill shows the health left (issue #352)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper with a context that keeps the styles set on it and logs each fillRect
// and each fillText with the textAlign it was drawn with; a character is 5 px wide
function load() {
  const rects = [], texts = [], state = {};
  const ctx = new Proxy(state, {
    get: (s, k) => {
      if (k in s) return s[k];
      if (k === 'measureText') return t => ({ width: String(t).length * 5 });
      return (...a) => {
        if (k === 'fillRect') rects.push(a);
        if (k === 'fillText') texts.push({ t: a[0], x: a[1], align: s.textAlign });
        return { addColorStop() {} };
      };
    },
    set: (s, k, v) => { s[k] = v; return true; },
  });
  const { game, window } = loadMain({ ctx });
  return { game, we: window.wallpaperPropertyListener, rects, texts };
}
const worldW = 1280 / (720 / 540);

// The two rects of the first fighter's bar, its head put at headX, with 15% health left
function barAt(headX) {
  const { game, rects } = load();
  const [a, b] = game.fighters;
  Object.assign(a, { x: headX < worldW / 2 ? 14 : worldW - 14, z: 50, alt: 0 });
  Object.assign(b, { x: worldW / 2, z: 50, alt: 0 });
  for (const f of game.fighters) f.W = f.joints();
  a.W.head.x = headX;
  a.hp = a.maxHp * 0.15;
  rects.length = 0;
  game.render();
  // A bar is two 2.5 px tall rects; the other fighter's starts near the middle of the screen
  const bar = rects.filter(r => r[3] === 2.5 && Math.abs(r[0] - headX) < 40);
  assert.equal(bar.length, 2, 'the fighter has a two-part bar');
  return bar;
}

for (const [where, headX] of [['left', 8], ['right', worldW - 8]]) {
  test(`a fighter lying at the ${where} wall shows its health bar inside the walls (#352)`, () => {
    const [back, fill] = barAt(headX);
    assert.ok(back[0] >= 0 && back[0] + back[2] <= worldW, `bar spans ${back[0]} to ${back[0] + back[2]} of ${worldW}`);
    assert.equal(back[2], 26);
    assert.equal(fill[0], back[0], 'the fill starts where the bar does');
    assert.ok(Math.abs(fill[2] - 26 * 0.15) < 1e-9, `fill is ${fill[2]} px wide`);
  });
}

// At a jump peak the tag goes beside the bar; with the bar moved in from a wall the tag must
// still clear it, not sit over it
for (const [where, headX] of [['left', 8], ['right', worldW - 8]]) {
  test(`at a jump peak with the head at the ${where} wall the name tag does not cover the moved-in bar (#352)`, () => {
    const { game, we, rects, texts } = load();
    we.applyUserProperties({ fighternames: { value: 'Alexander,Bo' } });
    const [a] = game.fighters;
    Object.assign(a, { x: headX < worldW / 2 ? 14 : worldW - 14, state: 'air', alt: game.groundY(a.z) - 110, va: 0 });
    for (const f of game.fighters) f.W = f.joints();
    a.W.head.x = headX;
    rects.length = 0; texts.length = 0;
    game.render();
    const back = rects.find(r => r[3] === 2.5 && Math.abs(r[0] - headX) < 40);
    const tag = texts.find(o => o.t === 'Alexander');
    assert.ok(back && tag, 'bar and tag drawn');
    assert.equal(tag.align, 'left', 'the tag is beside the bar');
    const left = tag.x, right = tag.x + 45;
    assert.ok(left >= 0 && right <= worldW, `tag spans ${left} to ${right} of ${worldW}`);
    assert.ok(right <= back[0] || left >= back[0] + 26, `tag ${left} to ${right} over the bar at ${back[0]} to ${back[0] + 26}`);
  });
}
