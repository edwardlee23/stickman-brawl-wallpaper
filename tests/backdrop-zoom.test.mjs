// The slow-motion finish zooms the drawn backdrop with the world (issue #219), so the
// floor line painted in a theme stays on the world floor's back edge while the view zooms,
// and with "Reduce flashing and screen shake" on the backdrop does not move.
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

// Loads the wallpaper at 1280 x 720 with a recording screen and offscreen canvases. Math.random
// returns 0.5, so screen shake (rand(-s, s)) moves nothing and only the zoom is measured.
function load(reduce) {
  const screen = [];
  const canvas = { getContext: () => recorder(screen), style: {}, width: 0, height: 0 };
  const document = {
    getElementById: () => canvas, body: { style: {} },
    createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); return c; },
  };
  const M = Object.create(Math); M.random = () => 0.5;
  let next = null;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: () => {} };
  Object.assign(window, {
    window, document,
    location: { search: `?count=2&reducemotion=${reduce ? 1 : 0}` },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: M, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(source, window);
  return { screen, game: window.__stickmanBrawl, we: window.wallpaperPropertyListener, frame: t => { screen.length = 0; next(t); } };
}

function hold(game) {
  for (const f of game.fighters) if (f.alive) Object.assign(f, { state: 'hit', st: 0, dur: 999, alt: 0, va: 0 });
}

// The last setTransform before log index i, as [scale, dy]
function transformBefore(log, i) {
  for (let j = i - 1; j >= 0; j--) if (log[j][0] === 'setTransform') return [log[j][1], log[j][6]];
  return [1, 0];
}

// For the last frame: the screen y of the backdrop's painted floor line, and of the world
// floor's back edge. floorY is the floor line in backdrop pixels, taken from the unzoomed frame.
function floors(w, floorY) {
  const s = w.screen;
  const bi = s.findIndex(([k, img]) => k === 'drawImage' && img === w.game.bg.canvas);
  assert.ok(bi >= 0, 'the backdrop was not drawn');
  const [bz, by] = transformBefore(s, bi);
  // The world floor band: fillRect(-20, floorTop - 6, ...) right after the world transform
  const fi = s.findIndex((e, i) => i > bi && e[0] === 'fillRect' && e[1] === -20);
  const [wz, wy] = transformBefore(s, fi);
  const floorTop = s[fi][2] + 6;
  return { backdrop: floorY * bz + by, world: floorTop * wz + wy, zoom: wz, floorTop, base: wz };
}

function knockout(reduce) {
  const w = load(reduce);
  w.we.applyUserProperties({ backgroundtheme: { value: 'dojo' }, slowmofinish: { value: true } });
  let t = 1000 / 60;
  hold(w.game); w.frame(t);
  const f0 = floors(w, 0);
  const S = f0.base, floorY = f0.floorTop * S;   // Unzoomed: the backdrop's floor line in pixels
  assert.equal(floors(w, floorY).backdrop, floors(w, floorY).world, 'unzoomed, the floors already differ');
  const f = w.game.fighters[1];
  f.hp = 0; f.ko(0, -40);
  hold(w.game); w.frame(t += 1000 / 60);
  return { w, S, floorY };
}

test('during the slow-motion zoom the backdrop floor line stays on the world floor (#219)', () => {
  const { w, S, floorY } = knockout(false);
  let most = 1;
  for (let i = 0, tt = 1000 / 30; i < 90; i++) {
    hold(w.game); w.frame(tt += 1000 / 60);
    const f = floors(w, floorY);
    most = Math.max(most, f.zoom / S);
    assert.ok(Math.abs(f.backdrop - f.world) < 0.5,
      `at zoom ${(f.zoom / S).toFixed(3)} the world floor is at y=${f.world.toFixed(1)}, the backdrop's at y=${f.backdrop.toFixed(1)}`);
  }
  assert.ok(most > 1.3, `the view only zoomed to ${most.toFixed(3)}x`);
});

test('the zoomed backdrop still covers the whole screen (#219)', () => {
  const { w } = knockout(false);
  for (let i = 0, tt = 1000 / 30; i < 90; i++) {
    hold(w.game); w.frame(tt += 1000 / 60);
    const s = w.screen;
    const bi = s.findIndex(([k, img]) => k === 'drawImage' && img === w.game.bg.canvas);
    const [z] = transformBefore(s, bi);
    const tr = s.slice(0, bi).filter(([k]) => k === 'setTransform').pop() || ['setTransform', 1, 0, 0, 1, 0, 0];
    const [, , , , , x, y] = tr;
    const [, , dx, dy, dw, dh] = s[bi];
    assert.ok(x + dx * z <= 1e-6 && y + dy * z <= 1e-6, 'the top left corner shows');
    assert.ok(x + (dx + dw) * z >= 1280 - 1e-6 && y + (dy + dh) * z >= 720 - 1e-6, 'the bottom right corner shows');
  }
});

test('with "Reduce flashing and screen shake" on, the backdrop does not move during the finish (#219)', () => {
  const { w } = knockout(true);
  for (let i = 0, tt = 1000 / 30; i < 90; i++) {
    hold(w.game); w.frame(tt += 1000 / 60);
    const s = w.screen;
    const bi = s.findIndex(([k, img]) => k === 'drawImage' && img === w.game.bg.canvas);
    const tr = s.slice(0, bi).filter(([k]) => k === 'setTransform').pop();
    assert.deepEqual(tr.slice(1), [1, 0, 0, 1, 0, 0]);
    assert.deepEqual(s[bi].slice(2), [0, 0, 1280, 720]);
  }
});
