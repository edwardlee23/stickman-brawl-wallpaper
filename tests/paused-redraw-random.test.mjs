// A setting changed while paused redraws the frame (issue #307). That redraw must draw the
// same picture and leave Math.random alone (issue #501): aura wisps, barrage ghost fists, the
// beam's end glow, flames and knockout focus lines used to take new random places on every
// redraw, and every drawn frame advanced the fight's random sequence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

// A 2D context that logs every method call as [name, ...args]
function recorder(log) {
  const self = new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'measureText' ? t => ({ width: String(t).length * 8 }) : (...args) => { log.push([k, ...args]); return self; }),
    set: () => true,
  });
  return self;
}

test('two paused redraws draw the same calls and make no Math.random calls (#501)', () => {
  const screen = [];
  let draws = 0, counting = false;
  const seeded = lcg(1);
  const { game, window } = loadMain({
    random: () => { if (counting) draws++; return seeded(); },
    search: '?count=2&reducemotion=0',
    canvas: { getContext: () => recorder(screen), style: {}, width: 0, height: 0 },
    document: { createElement: () => { const c = { log: [], width: 0, height: 0, style: {} }; c.getContext = () => recorder(c.log); return c; } },
    globals: { performance: { now: () => 0 } },
  });
  game.update(1 / 60);
  const [a, b] = game.fighters;
  a.ghost = true;
  b.aura = 1;
  b.move = { ...game.MOVES.find(m => m.type === 'beam') ?? { id: 'beam', type: 'beam' } };
  b.md = { ph: 'fire', w: 3, O: { x: b.x, y: b.y - 60 }, E: { x: b.x + 300, y: b.y - 60 } };
  game.fx.push({ type: 'flame', x: 400, y: 500, t: 0.1, dur: 0.7 });
  game.fx.push({ type: 'focus', x: 640, y: 360, t: 0.05, dur: 0.28 });
  window.wallpaperPropertyListener.setPaused(true);
  const frames = [];
  for (let k = 0; k < 2; k++) {
    screen.length = 0;
    counting = true;
    game.render();
    counting = false;
    frames.push(JSON.stringify(screen));
  }
  assert.ok(screen.length > 100, 'the redraw drew only ' + screen.length + ' calls');
  assert.equal(draws, 0, 'the two redraws made ' + draws + ' Math.random calls');
  assert.equal(frames[0], frames[1], 'the second paused redraw drew different calls');
});
