// A setting changed while paused redraws the frame (issue #307). That redraw must not pick
// a new random screen shake offset (issue #424): shake only decays in a running step, so
// every paused redraw would otherwise move the picture by a new random amount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// A 2D context that logs every method call as [name, ...args]
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? t => ({ width: String(t).length * 8 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: () => true,
  });
  return self;
}

// Loads the wallpaper at 1280 x 720 with a recording screen and a seeded Math.random
function load() {
  const screen = [];
  const listeners = {};
  let next = null;
  const { window } = loadMain({
    search: '?count=2&reducemotion=0',
    canvas: { getContext: () => recorder(screen), style: {}, width: 0, height: 0 },
    document: { createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); return c; } },
    window: { addEventListener: (k, f) => { (listeners[k] ??= []).push(f); } },
    globals: { performance: { now: () => 0 }, requestAnimationFrame: cb => { next = cb; } },
  });
  let t = 0;
  return {
    screen, we: window.wallpaperPropertyListener,
    frame: () => { t += 1000 / 60; screen.length = 0; next(t); },
    click: (x, y) => { for (const f of listeners.pointerdown ?? []) f({ clientX: x, clientY: y, button: 0, timeStamp: 1000 }); },
  };
}

// The world transform of the frame just drawn: the last setTransform before the world floor
// band, fillRect(-20, floorTop - 6, ...), which render() draws right after it
function worldTransform(screen) {
  const fi = screen.findIndex(e => e[0] === 'fillRect' && e[1] === -20);
  assert.ok(fi >= 0, 'the world floor band was not drawn');
  for (let j = fi - 1; j >= 0; j--) if (screen[j][0] === 'setTransform') return screen[j].slice(1);
  assert.fail('no world transform was set');
}

test('a redraw while paused draws with no screen shake offset (#424)', () => {
  const w = load();
  w.we.applyUserProperties({ reducemotion: { value: false }, clickblast: { value: true } });
  w.frame();
  w.click(300, 300);
  w.frame();
  const shaken = worldTransform(w.screen);
  assert.ok(Math.abs(shaken[4]) + Math.abs(shaken[5]) > 0.5, 'the click blast did not shake the screen');
  w.we.setPaused(true);
  for (const on of [false, true, false]) {
    w.we.applyUserProperties({ showhealth: { value: on } });
    w.frame();
    const [, , , , x, y] = worldTransform(w.screen);
    assert.equal(x, 0, 'paused redraw is translated by ' + x + ' px across');
    assert.equal(y, 0, 'paused redraw is translated by ' + y + ' px down');
  }
});
