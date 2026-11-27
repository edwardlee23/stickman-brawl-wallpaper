// Runs main.js in a sandbox with a fake AudioContext and a canvas that records the colors it
// is given, then clicks a frozen fighter with "Click to blast" on (issue #354): the blast
// shatters the ice as a hit does, with ice sparks and the freeze sound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const S = 720 / 540;   // World to screen scale at 1280 x 720 and figure size 100%
const ICE = '#9fe8ff';

const param = v => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; } });
function node(extra = {}) {
  const base = { connect(n) { return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined) });
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000; this.destination = node(); }
  createDynamicsCompressor() { return node(); }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node(); }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node(); }
  createStereoPanner() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

function load() {
  const styles = [];
  const ctx = new Proxy({}, {
    get: () => () => ({ addColorStop() {} }),
    set: (o, k, v) => { if (k === 'strokeStyle' || k === 'fillStyle') styles.push(v); return true; },
  });
  const listeners = {};
  const { game, window } = loadMain({ ctx, window: { AudioContext: FakeAudioContext,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } } });
  game.cfg.sound = true;
  window.wallpaperPropertyListener.applyUserProperties({ clickblast: { value: true } });
  const [a, b] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', vx: 0, va: 0 });
  Object.assign(b, { x: 900, z: 50, alt: 0, facing: -1, state: 'idle', vx: 0, va: 0 });
  a.W = a.joints(); b.W = b.joints();
  const click = (x, y) => {
    for (const fn of listeners.pointerdown ?? []) fn({ clientX: x * S, clientY: y * S, button: 0, timeStamp: 0 });
  };
  // The ice-colored strokes and fills of one frame drawn after the click
  const iceDrawn = () => { styles.length = 0; game.render(); return styles.filter(c => c === ICE).length; };
  return { game, a, click, iceDrawn };
}

test('a click blast on a frozen fighter shatters the ice with ice sparks and the freeze sound (#354)', () => {
  const { game, a, click, iceDrawn } = load();
  Object.assign(a, { state: 'frozen', st: 0, dur: 1.5 });
  a.W = a.joints();
  const c = a.bodyPoint();
  click(c.x - 20, c.y);
  assert.equal(a.state, 'launched');
  assert.equal(game.stats.sfx.freeze, 1, 'the freeze sound plays once as the ice shatters');
  assert.ok(iceDrawn() >= 12, 'ice sparks are drawn where the ice shattered');
});

test('a click blast on a fighter that is not frozen makes no ice sparks or freeze sound (#354)', () => {
  const { game, a, click, iceDrawn } = load();
  const c = a.bodyPoint();
  click(c.x - 20, c.y);
  assert.equal(a.state, 'launched');
  assert.equal(game.stats.sfx.freeze ?? 0, 0);
  assert.equal(iceDrawn(), 0);
});
