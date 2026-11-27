// Background color with a theme on (issue #253): every theme paints over the whole
// backdrop, so the color shows only with Plain. The settings panel hides it while a
// theme is on, and changing it does not rebuild the theme's cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

const project = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8'));
const THEMES = project.general.properties.backgroundtheme.options.map(o => o.value);

// A 2D context that accepts every call and property set
function stubContext() {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : () => self),
    set: () => true,
  });
  return self;
}

function load() {
  const canvas = { getContext: stubContext, style: {}, width: 0, height: 0 };
  let next = null;
  const { window } = loadMain({
    search: '?count=2', canvas,
    document: { createElement: () => ({ getContext: stubContext, style: {}, width: 0, height: 0 }) },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
    random: null,
  });
  let t = 0;
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener, frame: () => { t += 16; next(t); } };
}

test('Background color is shown in the settings panel only while the theme is Plain', () => {
  const { condition } = project.general.properties.backgroundcolor;
  // Double quotes, as in Wallpaper Engine's docs for a combo condition (yourproperty.value == "example123")
  assert.equal(condition, 'backgroundtheme.value == "plain"');
  // Wallpaper Engine reads a condition as a JavaScript expression over the other settings
  const shown = new Function('backgroundtheme', 'return (' + condition + ');');
  for (const theme of THEMES) assert.equal(shown({ value: theme }), theme === 'plain', theme);
});

test('changing Background color does not rebuild a theme\'s cache', () => {
  for (const theme of THEMES.filter(t => t !== 'plain')) {
    const w = load();
    w.game.bg.now = () => new Date(2026, 0, 1, 12, 0);
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    w.frame();
    assert.equal(w.game.bg.builds, 1, theme);
    w.we.applyUserProperties({ backgroundcolor: { value: '1 0 0' } });
    w.frame();
    assert.equal(w.game.bg.builds, 1, theme + ': the cache was rebuilt for a color it does not show');
  }
});
