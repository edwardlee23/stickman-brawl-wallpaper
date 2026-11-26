// Screen shake moves the drawn backdrop with the world (issue #254), as the slow-motion zoom
// already does (#219), so a theme's painted floor does not slide under the fighters on a
// slam, a click blast or a big hit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// A 2D context that logs every method call as [name, ...args]
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? t => ({ width: String(t).length * 8 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: () => true,
  });
  return self;
}

// Loads the wallpaper at 1280 x 720 with a recording screen, offscreen canvases and a seeded
// Math.random (an LCG, as the other tests seed it), so the shake offsets are the same each run
function load() {
  const screen = [];
  const listeners = {};
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  const document = {
    getElementById: () => canvas, body: { style: {} },
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); return c; },
  };
  let next = null;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } };
  Object.assign(window, {
    window, document, URLSearchParams,
    location: { search: '?count=2' },
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
  });
  const context = vm.createContext(window);
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(source, context);
  let t = 0;
  return {
    screen, game: window.__stickmanBrawl, we: window.wallpaperPropertyListener,
    frame: () => { t += 1000 / 60; screen.length = 0; next(t); },
    click: (x, y) => { for (const f of listeners.pointerdown ?? []) f({ clientX: x, clientY: y, button: 0, timeStamp: 1000 }); },
  };
}

// The last setTransform before log index i
function transformBefore(log, i) {
  for (let j = i - 1; j >= 0; j--) if (log[j][0] === 'setTransform') return log[j].slice(1);
  return [1, 0, 0, 1, 0, 0];
}

// This frame's backdrop and world transforms: the backdrop's drawImage, and the world floor
// band, fillRect(-20, floorTop - 6, ...), drawn right after the world transform
function transforms(screen, game) {
  const bi = screen.findIndex(([k, img]) => k === 'drawImage' && img === game.bg.canvas);
  assert.ok(bi >= 0, 'the backdrop was not drawn');
  const fi = screen.findIndex((e, i) => i > bi && e[0] === 'fillRect' && e[1] === -20);
  assert.ok(fi > bi, 'the world floor band was not drawn');
  return { backdrop: transformBefore(screen, bi), world: transformBefore(screen, fi) };
}

// Checks each frame that the backdrop is offset exactly as the world is, at the world's zoom;
// returns the largest offset seen
function follow(w, frames) {
  const S = 720 / 540;
  let most = 0;
  for (let i = 0; i < frames; i++) {
    w.frame();
    const { backdrop: b, world: v } = transforms(w.screen, w.game);
    assert.ok(Math.abs(b[4] - v[4]) < 1e-9 && Math.abs(b[5] - v[5]) < 1e-9,
      `frame ${i}: the world is offset by (${v[4].toFixed(2)}, ${v[5].toFixed(2)}), the backdrop by (${b[4].toFixed(2)}, ${b[5].toFixed(2)})`);
    assert.ok(Math.abs(b[0] * S - v[0]) < 1e-9, `frame ${i}: the backdrop is drawn at scale ${b[0]}, the world at ${v[0] / S}`);
    most = Math.max(most, Math.abs(v[4]), Math.abs(v[5]));
  }
  return most;
}

test('the themed backdrop shakes with the world after a click blast (#254)', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' }, reducemotion: { value: false }, clickblast: { value: true } });
  w.frame();
  w.click(640, 300);
  const most = follow(w, 20);
  assert.ok(most > 1, `the screen only shook by ${most.toFixed(2)} px`);
});

test('the themed backdrop shakes with the world during the slow-motion zoom (#254)', () => {
  const w = load();
  w.we.applyUserProperties({ backgroundtheme: { value: 'rooftop' }, reducemotion: { value: false }, clickblast: { value: true }, slowmofinish: { value: true } });
  w.frame();
  const f = w.game.fighters[1];
  f.hp = 0; f.ko(0, -40);
  w.frame();
  w.click(640, 300);
  const most = follow(w, 20);
  assert.ok(most > 1, `the screen only shook by ${most.toFixed(2)} px`);
});
