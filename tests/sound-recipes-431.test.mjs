// Pins the sound recipes where a change left every other test green: each tone's stop time, the
// random start in the noise and the detune that make repeats differ, the limiter's ratio and the
// win jingle's notes (issue #431).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// An AudioParam that records its automation calls.
const param = v => ({
  value: v, calls: [],
  setValueAtTime(x, t) { this.value = x; this.calls.push(['set', x, t]); return this; },
  linearRampToValueAtTime(x, t) { this.calls.push(['linear', x, t]); return this; },
  exponentialRampToValueAtTime(x, t) { this.calls.push(['exp', x, t]); return this; },
  setTargetAtTime() { return this; },
});

// An audio node that records what it is connected to and when it starts and stops.
function node(kind, extra = {}) {
  const base = { kind, outs: [], starts: [], stops: [], connect(n) { base.outs.push(n); return n; }, disconnect() {},
    start(...a) { base.starts.push(a); }, stop(...a) { base.stops.push(a); }, ...extra };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

class FakeAudioContext {
  static last = null;
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000;
    this.destination = node('destination');
    this.oscillators = []; this.buffers = []; this.compressors = [];
    FakeAudioContext.last = this;
  }
  createDynamicsCompressor() { const c = node('compressor'); this.compressors.push(c); return c; }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { return node('gain', { gain: param(1) }); }
  createOscillator() { const o = node('oscillator', { frequency: param(440) }); this.oscillators.push(o); return o; }
  createBufferSource() { const s = node('buffer', { playbackRate: param(1) }); this.buffers.push(s); return s; }
  createBiquadFilter() { return node('filter', { frequency: param(350), Q: param(1) }); }
  createStereoPanner() { return node('panner', { pan: param(0) }); }
  createBuffer(c, n, rate) { return { channels: c, length: n, rate, getChannelData: () => new Float32Array(n) }; }
}

// Loads the wallpaper with sound on. Math.random is a seeded generator (mulberry32), so every
// run draws the same numbers and two draws differ.
function load() {
  FakeAudioContext.last = null;
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, AudioContext: FakeAudioContext };
  const context = vm.createContext({
    window, console, URLSearchParams, performance: { now: () => 0 },
    location: { search: '?count=2&mode=ffa&sound=1' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('{ let s = 7; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let r = Math.imul(s ^ (s >>> 15), 1 | s);' +
    ' r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

const KINDS = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'ko', 'charge', 'fire', 'step', 'zap', 'freeze', 'shield', 'toss', 'poof', 'win'];

// Plays one sound of the kind 10 s after the last, past every gap and voice limit, and returns
// the oscillators and noise sources it made
function play(game, kind) {
  const ac = FakeAudioContext.last;
  if (ac) ac.currentTime += 10;
  const o = ac ? ac.oscillators.length : 0, b = ac ? ac.buffers.length : 0;
  assert.equal(game.sfx(kind, 100), true, kind + ' did not play');
  const now = FakeAudioContext.last;
  return { t: now.currentTime, oscillators: now.oscillators.slice(o), buffers: now.buffers.slice(b) };
}

test('every tone of every sound plays to the end of its glide before it stops (#431)', () => {
  const game = load();
  for (const kind of KINDS) {
    const { oscillators } = play(game, kind);
    for (const o of oscillators) {
      const glide = o.frequency.calls.find(c => c[0] === 'exp');
      assert.ok(glide, 'a tone of ' + kind + ' with no glide');
      assert.equal(o.stops.length, 1, 'a tone of ' + kind + ' stopped ' + o.stops.length + ' times');
      assert.ok(o.stops[0][0] >= glide[2], 'a tone of ' + kind + ' stops at ' + o.stops[0][0] + ', before its end at ' + glide[2]);
    }
  }
});

test('two hits start at different places in the noise and are detuned differently, by 6% at most (#431)', () => {
  const game = load();
  const a = play(game, 'hit'), b = play(game, 'hit');
  const offset = p => { assert.equal(p.buffers.length, 1); return p.buffers[0].starts[0][1]; };
  const detune = p => { assert.equal(p.oscillators.length, 1); return p.oscillators[0].frequency.calls[0][1] / 160; };
  for (const p of [a, b]) {
    assert.ok(offset(p) >= 0 && offset(p) < 0.2, 'noise offset ' + offset(p));
    assert.ok(detune(p) >= 0.94 && detune(p) <= 1.06, 'detune ' + detune(p));
  }
  assert.notEqual(offset(a), offset(b), 'both hits start at the same place in the noise');
  assert.notEqual(detune(a), detune(b), 'both hits have the same pitch');
});

test('the limiter before the speakers has a ratio of 12 (#431)', () => {
  const game = load();
  play(game, 'hit');
  const ac = FakeAudioContext.last;
  assert.equal(ac.compressors.length, 1);
  const [lim] = ac.compressors;
  assert.equal(lim.ratio.value, 12);
  assert.ok(lim.outs.includes(ac.destination), 'the limiter does not feed the speakers');
});

test('the win jingle plays 523, 659 and 784 Hz in turn (#431)', () => {
  const game = load();
  const { t, oscillators } = play(game, 'win');
  assert.deepEqual(oscillators.map(o => o.frequency.calls[0][1]), [523, 659, 784]);
  oscillators.forEach((o, i) => assert.ok(Math.abs(o.starts[0][0] - (t + i * 0.13)) < 1e-9, 'note ' + i + ' starts at ' + o.starts[0][0]));
});
