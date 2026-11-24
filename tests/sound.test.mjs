// Runs main.js in a sandbox with a fake AudioContext and checks when sound
// effects play: only with sound on, at most 6 at once, and the same kind at
// most once per 40 ms (issue #22).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// An AudioParam that accepts every automation call.
const param = v => ({
  value: v,
  setValueAtTime(x) { this.value = x; return this; },
  linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; },
  setTargetAtTime() { return this; },
});

// An audio node whose properties are AudioParams, plus connect, start and stop.
function node(extra = {}) {
  const base = { connect: n => n, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

class FakeAudioContext {
  static instances = [];
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 48000;
    this.destination = node();
    this.calls = [];
    this.gains = [];
    FakeAudioContext.instances.push(this);
  }
  suspend() { this.calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.calls.push('resume'); this.state = 'running'; return Promise.resolve(); }
  createGain() { const g = node({ gain: param(1) }); this.gains.push(g); return g; }
  createOscillator() { return node({ frequency: param(440), detune: param(0) }); }
  createBufferSource() { return node({ playbackRate: param(1) }); }
  createBiquadFilter() { return node({ frequency: param(350), Q: param(1) }); }
  createStereoPanner() { return node({ pan: param(0) }); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

function load(query, { audio = true, sound } = {}) {
  FakeAudioContext.instances = [];
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener() {},
  };
  if (audio) window.AudioContext = FakeAudioContext;
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: query },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  if (sound !== undefined) game.cfg.sound = sound;
  const [a, e] = game.fighters;
  e.W = e.joints();
  return { game, a, e, window, AC: FakeAudioContext };
}

const KINDS = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'ko', 'charge', 'fire', 'step', 'win'];

test('with sound off, sfx plays nothing and creates no AudioContext', () => {
  const { game, AC } = load('?count=2');
  assert.equal(game.sfx('hit', 100), false);
  assert.equal(AC.instances.length, 0);
});

test('without AudioContext, sfx returns false and does not throw', () => {
  const { game } = load('?count=2', { audio: false, sound: true });
  assert.equal(game.sfx('hit', 100), false);
});

test('the first sound creates one AudioContext and counts the kind', () => {
  const { game, AC } = load('?count=2', { sound: true });
  assert.equal(game.sfx('hit', 100), true);
  game.sfx('block', 100);
  assert.equal(AC.instances.length, 1);
  assert.equal(game.stats.sfx.hit, 1);
  assert.equal(game.stats.sfx.block, 1);
});

test('every kind plays', () => {
  const { game, AC } = load('?count=2', { sound: true });
  for (const k of KINDS) {
    if (AC.instances[0]) AC.instances[0].currentTime += 10;
    assert.equal(game.sfx(k, 100), true, k);
  }
});

test('the same kind plays at most once per 40 ms', () => {
  const { game, AC } = load('?count=2', { sound: true });
  assert.equal(game.sfx('hit', 100), true);
  assert.equal(game.sfx('hit', 100), false);
  AC.instances[0].currentTime = 0.05;
  assert.equal(game.sfx('hit', 100), true);
});

test('at most 6 sounds play at once, and a slot frees once a sound ends', () => {
  const { game, AC } = load('?count=2', { sound: true });
  const kinds = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'ko'];
  assert.deepEqual(kinds.map(k => game.sfx(k, 100)), [true, true, true, true, true, true, false]);
  AC.instances[0].currentTime = 5;
  assert.equal(game.sfx('ko', 100), true);
});

test('the panel turns sound on and sets the volume, including 0', () => {
  const { game, window, AC } = load('?count=2');
  window.wallpaperPropertyListener.applyUserProperties({ soundeffects: { value: true }, soundvolume: { value: 0 } });
  assert.equal(game.sfx('hit', 100), true);
  assert.equal(AC.instances[0].gains[0].gain.value, 0);
  window.wallpaperPropertyListener.applyUserProperties({ soundvolume: { value: 80 } });
  assert.equal(AC.instances[0].gains[0].gain.value, 0.8);
});

test('turning sound off stops later sounds', () => {
  const { game, window } = load('?count=2&sound=1');
  game.sfx('hit', 100);
  window.wallpaperPropertyListener.applyUserProperties({ soundeffects: { value: false } });
  assert.equal(game.sfx('ko', 100), false);
});

test('pausing suspends and resumes the context, and is safe before any sound', () => {
  const { game, window, AC } = load('?count=2&sound=1');
  window.wallpaperPropertyListener.setPaused(true);
  assert.equal(AC.instances.length, 0);
  game.sfx('hit', 100);
  window.wallpaperPropertyListener.setPaused(true);
  window.wallpaperPropertyListener.setPaused(false);
  assert.deepEqual(AC.instances[0].calls, ['suspend', 'resume']);
});
