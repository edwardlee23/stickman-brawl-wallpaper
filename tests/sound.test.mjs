// Runs main.js in a sandbox with a fake AudioContext and checks when sound
// effects play: only with sound on, at most 6 at once, and the same kind at
// most once per 40 ms (issue #22).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

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
  const base = { connect(n) { base.to = n; return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
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
    this.compressors = [];
    FakeAudioContext.instances.push(this);
  }
  createDynamicsCompressor() {
    const c = node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) });
    this.compressors.push(c);
    return c;
  }
  suspend() { this.calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.calls.push('resume'); this.state = 'running'; return Promise.resolve(); }
  createGain() { const g = node({ gain: param(1) }); this.gains.push(g); return g; }
  createOscillator() { return node({ frequency: param(440), detune: param(0) }); }
  createBufferSource() { return node({ playbackRate: param(1) }); }
  createBiquadFilter() { return node({ frequency: param(350), Q: param(1) }); }
  createStereoPanner() { const p = node({ pan: param(0) }); (this.panners ??= []).push(p); return p; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

function load(query, { audio = true, sound } = {}) {
  FakeAudioContext.instances = [];
  const { game, window } = loadMain({ search: query, window: audio ? { AudioContext: FakeAudioContext } : {} });
  if (sound !== undefined) game.cfg.sound = sound;
  const [a, e] = game.fighters;
  e.W = e.joints();
  return { game, a, e, window, AC: FakeAudioContext };
}

const KINDS = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'ko', 'charge', 'fire', 'step', 'zap', 'freeze', 'shield', 'toss', 'poof', 'win'];

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
  const kinds = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'charge'];
  assert.deepEqual(kinds.map(k => game.sfx(k, 100)), [true, true, true, true, true, true, false]);
  AC.instances[0].currentTime = 5;
  assert.equal(game.sfx('charge', 100), true);
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

test('turning sound off suspends the context, and unpausing does not resume it', () => {
  const { game, window, AC } = load('?count=2&sound=1');
  game.sfx('hit', 100);
  const ac = AC.instances[0];
  window.wallpaperPropertyListener.applyUserProperties({ soundeffects: { value: false } });
  assert.equal(ac.state, 'suspended');
  window.wallpaperPropertyListener.setPaused(true);
  window.wallpaperPropertyListener.setPaused(false);
  assert.equal(ac.state, 'suspended');
  window.wallpaperPropertyListener.applyUserProperties({ soundeffects: { value: true } });
  assert.equal(ac.state, 'running');
});

test('the mix goes through a limiter before the speakers, so overlapping sounds do not clip', () => {
  const { game, AC } = load('?count=2&sound=1');
  game.sfx('hit', 100);
  const ac = AC.instances[0];
  assert.equal(ac.compressors.length, 1);
  assert.equal(ac.gains[0].to, ac.compressors[0]);
  assert.equal(ac.compressors[0].to, ac.destination);
});

test('a hit, a block, a whiff and a knockout each play their sound', () => {
  const { game, a, e, AC } = load('?count=2&sound=1');
  const tick = () => { if (AC.instances[0]) AC.instances[0].currentTime += 10; };
  const m = game.MOVES.find(x => x.id === 'jab');
  e.state = 'idle'; e.hp = 1000; e.alt = 0;
  e.takeHit(a, m, 'body', { x: 100, y: 100 }); tick();
  assert.equal((game.stats.sfx.hit || 0) + (game.stats.sfx.hitBig || 0), 1);
  e.state = 'block'; e.facing = -a.facing;
  e.takeHit(a, m, 'body', { x: 100, y: 100 }); tick();
  assert.equal(game.stats.sfx.block, 1);
  a.move = m; a.hitDone = false; a.endMove(); tick();
  assert.equal(game.stats.sfx.whiff, 1);
  e.ko(0, -40);
  assert.equal(game.stats.sfx.ko, 1);
});

test('a round end plays the win sting once', () => {
  const { game, AC } = load('?count=2&sound=1');
  game.fighters[1].state = 'ko';
  game.checkRound(0.016);
  AC.instances[0].currentTime += 10;
  game.checkRound(0.016);
  assert.equal(game.stats.sfx.win, 1);
});

test('nothing is queued while the browser keeps audio suspended before a click (issue #33)', () => {
  const { game, window, AC } = load('?count=2&sound=1');
  // A browser starts a context made before any click suspended, with its clock stopped.
  window.AudioContext = class extends AC { constructor() { super(); this.state = 'suspended'; } };
  for (const k of KINDS) assert.equal(game.sfx(k, 100), false, `${k} queued while suspended`);
  const ac = AC.instances[0];
  assert.ok(ac, 'no context made, so a click cannot resume it');
  assert.deepEqual({ ...game.stats.sfx }, {});
  window.wallpaperPropertyListener.setPaused(false);   // What the click handler does
  assert.equal(ac.state, 'running');
  assert.equal(game.sfx('hit', 100), true, 'no sound after the click');
});

test('a sound at the left edge pans 60% left and one at the right edge 60% right', () => {
  const { game, AC } = load('?count=2', { sound: true });
  const worldW = 1280 / (720 / 540);
  assert.equal(game.sfx('hit', 0), true);
  AC.instances[0].currentTime += 10;
  assert.equal(game.sfx('hit', worldW), true);
  const [left, right] = AC.instances[0].panners.map(p => p.pan.value);
  // Only part of the way, so no sound is heard in one ear alone
  assert.ok(Math.abs(left + 0.6) < 1e-9, `left edge pans ${left}`);
  assert.ok(Math.abs(right - 0.6) < 1e-9, `right edge pans ${right}`);
});
