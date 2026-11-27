// Runs main.js in a sandbox with a recording canvas, to check that a name tag stays inside
// the screen next to either side wall, standing or at the top of a jump (issue #248)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// A Latin character is 5 px wide here and a CJK one 8.25, as in 700 9px sans-serif
const textW = t => Array.from(String(t)).reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 5 : 8.25), 0);
// Loads the wallpaper; every fillText is recorded with the textAlign it was drawn with
function load(search = '?count=2&mode=ffa') {
  const texts = [];
  const state = { textAlign: 'start' };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return t => ({ width: textW(t) });
      if (k === 'fillText') return (t, x, y) => { texts.push({ t, x, y, align: state.textAlign }); };
      return () => grad;
    },
    set: (_, k, v) => { state[k] = v; return true; },
  });
  const { game, window } = loadMain({ search, ctx });
  return { game, we: window.wallpaperPropertyListener, texts };
}
const worldW = 1280 / (720 / 540);

// Where the tag of the first fighter is drawn, as [left, right], with that fighter at x and,
// when peak is set, at the highest altitude it reaches
function tagSpan(x, peak, name) {
  const { game, we, texts } = load();
  we.applyUserProperties({ fighternames: { value: name + ',Bo' } });
  const [f] = game.fighters;
  f.x = x;
  // maxAlt(z): the health bar tops out about 108 above the feet, 110 below the screen top
  if (peak) Object.assign(f, { state: 'air', alt: game.groundY(f.z) - 110, va: 0 });
  for (const g of game.fighters) g.W = g.joints();
  texts.length = 0; game.render();
  const tag = texts.find(o => o.t === name);
  assert.ok(tag, 'no tag drawn');
  const w = textW(name);
  const left = tag.align === 'center' ? tag.x - w / 2 : tag.align === 'right' || tag.align === 'end' ? tag.x - w : tag.x;
  return { left, right: left + w, f };
}

for (const name of ['Alexander', '火柴人格鬥火柴人格鬥火柴']) {
  for (const [where, x] of [['left', 14], ['right', worldW - 14]]) {
    for (const peak of [false, true]) {
      test(`the tag of ${name} by the ${where} wall ${peak ? 'at a jump peak' : 'standing'} stays on screen`, () => {
        const { left, right } = tagSpan(x, peak, name);
        assert.ok(left >= 0 && right <= worldW, `tag spans ${left.toFixed(1)} to ${right.toFixed(1)} of ${worldW}`);
      });
    }
  }
}

test('at a jump peak by the right wall the tag does not cover the health bar', () => {
  const { left, right, f } = tagSpan(worldW - 14, true, 'Alexander');
  const hx = f.W.head.x;
  assert.ok(right <= hx - 13 || left >= hx + 13, `tag ${left.toFixed(1)} to ${right.toFixed(1)} over the bar at ${hx - 13} to ${hx + 13}`);
});

// Where the tag of the first fighter is drawn with that fighter at x and its tag height hy
// (the head, or 30 above the hip if lower), as [left, right] and the baseline y
function tagAtHeight(x, hy, name = 'Alexander') {
  const { game, we, texts } = load();
  we.applyUserProperties({ fighternames: { value: name + ',Bo' } });
  const [f] = game.fighters;
  Object.assign(f, { x, state: 'air', alt: game.groundY(f.z) - 110, va: 0 });
  const hyOf = () => { f.W = f.joints(); return Math.min(f.W.head.y, f.W.hip.y - 30); };
  // The joints move up one for one with the altitude
  f.alt += hyOf() - hy;
  assert.ok(Math.abs(hyOf() - hy) < 1e-6, 'could not set the tag height');
  for (const g of game.fighters.slice(1)) g.W = g.joints();
  texts.length = 0; game.render();
  const tag = texts.find(o => o.t === name);
  assert.ok(tag, 'no tag drawn');
  const w = textW(name);
  const left = tag.align === 'center' ? tag.x - w / 2 : tag.align === 'right' || tag.align === 'end' ? tag.x - w : tag.x;
  return { left, right: left + w, y: tag.y, hx: f.W.head.x, w };
}

// Issue #321: between 30 and 60 from the right wall the tag fits neither right of the bar nor
// centred over it, and must go left of the bar
for (const gap of [30, 40, 60]) {
  test(`at a jump peak ${gap} from the right wall the tag stays on screen, left of the health bar`, () => {
    const { left, right, y, hx, w } = tagAtHeight(worldW - gap, -10);
    assert.ok(left >= 0 && right <= worldW, `tag spans ${left.toFixed(1)} to ${right.toFixed(1)} of ${worldW}`);
    assert.ok(right <= hx - 13 || left >= hx + 13, `tag ${left.toFixed(1)} to ${right.toFixed(1)} over the bar at ${hx - 13} to ${hx + 13}`);
    assert.ok(Math.abs(left - (hx - 16 - w)) < 1e-6, `tag starts at ${left}, not 16 left of the head at ${hx}`);
    assert.equal(y, 9);
  });
}

test('away from the walls the tag goes right of the bar at a jump peak, its 9 px text on screen', () => {
  for (const hy of [-10, 10, 28]) {
    const { left, y, hx } = tagAtHeight(480, hy);
    assert.ok(Math.abs(left - (hx + 16)) < 1e-6, `at hy ${hy} the tag starts at ${left}, not 16 right of the head at ${hx}`);
    assert.ok(Math.abs(y - Math.max(hy - 12, 9)) < 1e-6, `at hy ${hy} the tag baseline is at ${y}`);
  }
});

test('from a tag height of 29 the tag sits 20 above it, centred and still on screen', () => {
  for (const hy of [29, 30, 31, 33, 60]) {
    const { left, right, y, hx } = tagAtHeight(480, hy);
    assert.ok(Math.abs(y - (hy - 20)) < 1e-6, `at hy ${hy} the tag baseline is at ${y}`);
    assert.ok(y - 9 >= 0, `at hy ${hy} the tag top is at ${y - 9}`);
    assert.ok(Math.abs((left + right) / 2 - hx) < 1e-6, `at hy ${hy} the tag is not centred on the head`);
  }
});
