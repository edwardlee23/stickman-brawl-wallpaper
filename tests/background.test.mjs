// Drawn background themes (issue #91): each theme renders with a stub canvas,
// its offscreen cache is rebuilt on resize, Day and night follows the clock,
// and Plain draws exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMain } from './load-main.mjs';

// A 2D context that logs every method call as [name, ...args] and every property set
// as ['=name', value]; methods return the same recorder, so gradients log their stops too.
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : (...args) => {
      // As a browser does, refuse to draw a canvas with no pixels
      if (k === 'drawImage' && args[0] && (args[0].width === 0 || args[0].height === 0)) {
        throw new Error('InvalidStateError: The image argument is a canvas element with a width or height of 0.');
      }
      log.push([k, ...args]); return self;
    }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  return self;
}

// Loads the wallpaper with a recording screen context. With offscreen on, the page can
// make canvases, and each one made is returned in offscreen with its own log.
function load({ offscreen = true, width = 1280, height = 720 } = {}) {
  const screen = [];
  const made = [];
  const listeners = {};
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  const document = {};
  if (offscreen) {
    document.createElement = tag => {
      assert.equal(tag, 'canvas');
      const c = { log: [], width: 0, height: 0, style: {} };
      c.getContext = () => recorder(c.log);
      made.push(c);
      return c;
    };
  }
  let next = null;
  const { window } = loadMain({
    search: '?count=2', width, height, canvas, document, random: null,
    window: { addEventListener: (k, f) => { listeners[k] = f; } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; }, Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN },
  });
  let t = 0;
  return {
    window, screen, made, listeners,
    game: window.__stickmanBrawl,
    we: window.wallpaperPropertyListener,
    frame: () => { t += 16; screen.length = 0; next(t); },
  };
}

const THEMES = ['plain', 'dojo', 'rooftop', 'comic', 'daynight'];

test('the Background setting offers every theme, and Plain is the default', () => {
  const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));
  const p = project.general.properties.backgroundtheme;
  assert.ok(p, 'no backgroundtheme setting');
  assert.equal(p.order, 32);
  assert.equal(p.type, 'combo');
  assert.equal(p.value, 'plain');
  assert.deepEqual(p.options.map(o => o.value), THEMES);
});

for (const theme of THEMES.slice(1)) {
  test(`the ${theme} theme draws from an offscreen cache, built once and kept between frames`, () => {
    const w = load();
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    w.frame();
    w.frame();
    const caches = w.made.filter(c => c.log.length);
    assert.equal(caches.length, 1, 'one offscreen canvas holds the background');
    const [cache] = caches;
    assert.equal(cache.width, 1280);
    assert.equal(cache.height, 720);
    assert.ok(cache.log.some(([k]) => k === 'fillRect'), 'the theme painted nothing');
    assert.equal(w.game.bg.builds, 1, 'the cache was rebuilt without a resize');
    assert.ok(w.screen.some(([k, img]) => k === 'drawImage' && img === cache), 'the cache was not drawn');
  });

  test(`the ${theme} theme draws straight to the screen where no offscreen canvas can be made`, () => {
    const w = load({ offscreen: false });
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    assert.doesNotThrow(() => { w.frame(); w.frame(); });
    assert.ok(w.screen.filter(([k]) => k === 'fillRect').length > 3, 'the theme painted nothing');
  });
}

test('a resize rebuilds the background cache at the new size', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' } });
  w.frame();
  assert.equal(w.game.bg.builds, 1);
  w.window.innerWidth = 1600; w.window.innerHeight = 900;
  w.listeners.resize();
  w.frame();
  assert.equal(w.game.bg.builds, 2);
  const cache = w.made.find(c => c.log.length);
  assert.equal(cache.width, 1600);
  assert.equal(cache.height, 900);
});

test('changing the theme rebuilds the cache', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' } });
  w.frame();
  w.we.applyUserProperties({ backgroundtheme: { value: 'comic' } });
  w.frame();
  assert.equal(w.game.bg.builds, 2);
});

// The sky's gradient stops the cache was last painted with
function skyStops(w) {
  const log = w.made.find(c => c.log.length).log;
  const i = log.map(([k]) => k).lastIndexOf('createLinearGradient');
  const stops = [];
  for (let j = i + 1; j < log.length && log[j][0] === 'addColorStop'; j++) stops.push(log[j][2]);
  return stops;
}

test('Day and night picks the night sky at 23:00 and the day sky at 12:00', () => {
  const w = load();
  const { bg } = w.game;
  assert.equal(bg.skyPhase(new Date(2026, 0, 1, 23, 0)), 'night');
  assert.equal(bg.skyPhase(new Date(2026, 0, 1, 12, 0)), 'day');
  assert.equal(bg.skyPhase(new Date(2026, 0, 1, 6, 0)), 'dawn');
  assert.equal(bg.skyPhase(new Date(2026, 0, 1, 19, 0)), 'dusk');

  w.we.applyUserProperties({ backgroundtheme: { value: 'daynight' } });
  bg.now = () => new Date(2026, 0, 1, 23, 0);
  w.frame();
  assert.deepEqual(skyStops(w), [...bg.SKY.night]);
  bg.now = () => new Date(2026, 0, 1, 12, 0);
  w.frame();
  assert.deepEqual(skyStops(w), [...bg.SKY.day]);
  assert.notDeepEqual([...bg.SKY.day], [...bg.SKY.night]);
});

// The picture depends only on the time of day's phase, so the cache is built once per phase
// change, not each minute (issue #266)
test('Day and night repaints when the phase changes, not every frame or minute', () => {
  const w = load();
  const { bg } = w.game;
  w.we.applyUserProperties({ backgroundtheme: { value: 'daynight' } });
  for (let m = 0; m < 60; m++) {
    bg.now = () => new Date(2026, 0, 1, 12, m, 5);
    w.frame();
  }
  bg.now = () => new Date(2026, 0, 1, 17, 59, 59);
  w.frame();
  assert.equal(bg.builds, 1, 'repainted within the day phase');
  bg.now = () => new Date(2026, 0, 1, 18, 0, 0);
  w.frame();
  assert.equal(bg.builds, 2, 'did not repaint at dusk');
  bg.now = () => new Date(2026, 0, 1, 18, 30, 0);
  w.frame();
  assert.equal(bg.builds, 2, 'repainted within the dusk phase');
  bg.now = () => new Date(2026, 0, 1, 20, 30, 0);
  w.frame();
  assert.equal(bg.builds, 3, 'did not repaint at night');
});

test('Plain draws exactly as before: one fill in the background color, no cache', () => {
  for (const props of [{}, { backgroundtheme: { value: 'plain' } }]) {
    const w = load();
    w.we.applyUserProperties(props);
    w.frame();
    assert.equal(w.made.length, 0, 'Plain made an offscreen canvas');
    assert.ok(!w.screen.some(([k]) => k === 'drawImage'), 'Plain drew an image');
    const first = w.screen.findIndex(([k]) => k === 'fillRect');
    assert.deepEqual(w.screen[first], ['fillRect', 0, 0, 1280, 720]);
    const style = w.screen.slice(0, first).filter(([k]) => k === '=fillStyle').pop();
    assert.deepEqual(style, ['=fillStyle', '#111318']);
  }
});

test('the comic halftone staggers alternate rows of dots (#119)', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'comic' } });
  w.frame();
  const log = w.made.find(c => c.log.length).log;
  const firstX = y => Math.min(...log.filter(([k, , ay]) => k === 'arc' && ay === y).map(([, x]) => x));
  assert.ok(Number.isFinite(firstX(7)) && Number.isFinite(firstX(21)), 'no dots in the top rows');
  assert.notEqual(firstX(7), firstX(21), 'rows y=7 and y=21 start at the same x');
  assert.equal(firstX(7), firstX(35), 'every other row lines up');
});

test('at a 0 x 0 window a theme draws no empty cache and no frame throws (#127)', () => {
  for (const theme of THEMES.slice(1)) {
    const w = load({ width: 0, height: 0 });
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    for (let i = 0; i < 5; i++) assert.doesNotThrow(() => w.frame(), theme);
  }
});

// The fill styles heads were drawn with in the last frame: an arc, then a fill style, then a fill
function headFills(w) {
  const out = [];
  for (let i = 0; i + 2 < w.screen.length; i++) {
    const [a, b, c] = w.screen.slice(i, i + 3);
    if (a[0] === 'arc' && b[0] === '=fillStyle' && c[0] === 'fill') out.push(b[1]);
  }
  return out;
}

test('heads are filled with a color close to each theme\'s backdrop (#128)', () => {
  const want = { plain: '#111318', dojo: '#1a1510', rooftop: '#0b1020', comic: '#16141d' };
  for (const [theme, col] of Object.entries(want)) {
    const w = load();
    w.we.applyUserProperties({ backgroundtheme: { value: theme } });
    w.frame(); w.frame();
    const fills = headFills(w);
    assert.ok(fills.length >= 2, theme + ': no head was filled');
    for (const f of fills) assert.equal(f, col, theme);
  }
  // Day and night follows the sky of the hour
  for (const [hour, phase] of [[12, 'day'], [23, 'night']]) {
    const w = load();
    w.game.bg.now = () => new Date(2026, 0, 1, hour, 0);
    w.we.applyUserProperties({ backgroundtheme: { value: 'daynight' } });
    w.frame(); w.frame();
    for (const f of headFills(w)) assert.equal(f, w.game.bg.SKY[phase][1], phase);
  }
});

test('switching back to Plain releases the background cache (#129)', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' } });
  w.frame();
  const cache = w.made.find(c => c.log.length);
  assert.equal(cache.width, 1280);
  w.we.applyUserProperties({ backgroundtheme: { value: 'plain' } });
  w.frame();
  assert.equal(w.game.bg.canvas, null, 'the cache is still held');
  assert.deepEqual([cache.width, cache.height], [0, 0], 'its pixels are not freed');
  // A theme turned on again makes and paints a new cache
  w.we.applyUserProperties({ backgroundtheme: { value: 'comic' } });
  w.frame();
  assert.ok(w.game.bg.canvas && w.game.bg.canvas.width === 1280);
  assert.ok(w.screen.some(([k, img]) => k === 'drawImage' && img === w.game.bg.canvas));
});
