// Follows every sound to the speakers and runs "React to music" with the clock well past
// 3 s, so a broken audio graph, a music clock that never moves, or a changed analysis
// constant fails a test (issue #272).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadMain } from './load-main.mjs';

// An AudioParam that records its automation calls.
const param = v => ({
  value: v, calls: [],
  setValueAtTime(x, t) { this.value = x; this.calls.push(['set', x, t]); return this; },
  linearRampToValueAtTime(x, t) { this.calls.push(['linear', x, t]); return this; },
  exponentialRampToValueAtTime(x, t) { this.calls.push(['exp', x, t]); return this; },
  setTargetAtTime() { return this; },
});

// An audio node that records every node it is connected to.
function node(kind, extra = {}) {
  const base = { kind, outs: [], connect(n) { base.outs.push(n); return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
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
    this.sources = []; this.gains = []; this.panners = []; this.buffers = [];
    FakeAudioContext.last = this;
  }
  createDynamicsCompressor() { return node('compressor'); }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { const g = node('gain', { gain: param(1) }); this.gains.push(g); return g; }
  createOscillator() { const o = node('oscillator', { frequency: param(440) }); this.sources.push(o); return o; }
  createBufferSource() { const s = node('buffer', { playbackRate: param(1) }); this.sources.push(s); return s; }
  createBiquadFilter() { return node('filter', { frequency: param(350), Q: param(1) }); }
  createStereoPanner() { const p = node('panner', { pan: param(0) }); this.panners.push(p); return p; }
  createBuffer(c, n, rate) { const b = { channels: c, length: n, rate, getChannelData: () => new Float32Array(n) }; this.buffers.push(b); return b; }
}

// clock is the time performance.now() returns, in ms; tests move it by hand.
function load() {
  const audio = [];
  const clock = { now: 0 };
  const { game, window, context } = loadMain({ search: '?count=2&mode=ffa&sound=1',
    window: { AudioContext: FakeAudioContext, wallpaperRegisterAudioListener(cb) { audio.push(cb); } },
    globals: { performance: { now: () => clock.now } } });
  context.rnd = 0.5;
  vm.runInContext('Math.random = () => rnd', context);
  const set = p => window.wallpaperPropertyListener.applyUserProperties(p);
  return { game, audio, set, clock, context };
}

// Whether a path of connections leads from n to the context's destination
function reaches(n, dest, seen = new Set()) {
  if (n === dest) return true;
  if (!n || seen.has(n)) return false;
  seen.add(n);
  return (n.outs || []).some(o => reaches(o, dest, seen));
}

test('every oscillator and noise source of every sound is connected through to the speakers', () => {
  const { game } = load();
  const kinds = ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall', 'ko', 'charge', 'fire', 'step', 'zap', 'freeze', 'shield', 'toss', 'poof', 'win'];
  let ac = null;
  for (const k of kinds) {
    if (ac) { ac.currentTime += 10; ac.sources.length = 0; }
    assert.equal(game.sfx(k, 100), true, k);
    ac = FakeAudioContext.last;
    assert.ok(ac.sources.length > 0, `${k} makes no source`);
    for (const s of ac.sources) assert.ok(reaches(s, ac.destination), `a ${s.kind} of ${k} does not reach the speakers`);
  }
  // And through the panner made for that sound, into the master gain
  const pan = ac.panners.at(-1);
  assert.ok(pan.outs.includes(ac.gains[0]), 'the panner is not connected to the master gain');
});

test('a sound far outside the world still pans only 60% to one side', () => {
  const { game } = load();
  game.sfx('hit', -5000);
  const ac = FakeAudioContext.last;
  ac.currentTime += 10;
  game.sfx('hit', 50000);
  const [left, right] = ac.panners.map(p => p.pan.value);
  assert.ok(Math.abs(left + 0.6) < 1e-9, `far left pans ${left}`);
  assert.ok(Math.abs(right - 0.6) < 1e-9, `far right pans ${right}`);
});

test('each sound rises to its peak in 5 ms, so it starts with a click-free but sharp attack', () => {
  const { game } = load();
  game.sfx('hit', 100);
  const ac = FakeAudioContext.last;
  const envs = ac.gains.slice(1);                  // gains[0] is the master
  assert.ok(envs.length >= 2);
  for (const g of envs) {
    const ramp = g.gain.calls.find(c => c[0] === 'linear');
    assert.ok(ramp, 'no attack ramp');
    assert.ok(Math.abs(ramp[2] - 0.005) < 1e-9, `attack ends at ${ramp[2]} s`);
  }
});

test('the noise every hiss is cut from is half a second long, one channel', () => {
  const { game } = load();
  game.sfx('hit', 100);
  const ac = FakeAudioContext.last;
  assert.equal(ac.buffers.length, 1);
  assert.equal(ac.buffers[0].channels, 1);
  assert.equal(ac.buffers[0].length, ac.sampleRate * 0.5);
});

// ---------- React to music, with the clock well past 3 s ----------
const feed = (audio, a, n = 1) => { for (let i = 0; i < n; i++) for (const cb of audio) cb(a); };
// One frame with level v in the given low bins of each channel, 0 elsewhere
const bins = (v, lo, hi) => Array.from({ length: 128 }, (_, i) => (i % 64 >= lo && i % 64 < hi ? v : 0));
function delay(game) {
  const f = game.fighters[0];
  f.move = null; f.endMove();
  return f.cool;
}
function onAt(ms) {
  const env = load();
  env.clock.now = ms;
  env.set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  return env;
}

test('ten seconds after load, a beat still cuts the wait after a move to a third', () => {
  const { game, audio, clock } = onAt(10000);
  const base = delay(game);
  feed(audio, bins(0.9, 0, 6));
  assert.equal(game.music.beat, 1);
  const ratio = delay(game) / base;
  assert.ok(Math.abs(ratio - 1 / 3) < 1e-6, `wait is ${ratio} of normal`);
  clock.now += 2900;
  assert.ok(delay(game) < base, 'the beat is forgotten before 3 s without frames');
  clock.now += 200;
  assert.equal(delay(game), base, 'no frames for over 3 s leaves the beat in place');
  assert.equal(game.music.beat, 0);
});

test('bass counts from the six lowest bins of each channel', () => {
  const { game, audio } = onAt(10000);
  feed(audio, bins(0.9, 3, 6));
  assert.equal(game.music.beat, 1, 'bass in bins 3 to 5 is not a beat');
  const other = onAt(10000);
  feed(other.audio, bins(0.9, 6, 12));
  assert.equal(other.game.music.beat, 0, 'bins above the sixth count as bass');
});

test('levels above 1 count as 1', () => {
  const one = onAt(10000), big = onAt(10000);
  for (let i = 0; i < 20; i++) {
    feed(one.audio, bins(1, 0, 64));
    feed(big.audio, bins(7, 0, 64));
  }
  const pick = m => ({ level: m.level, avg: m.avg, beat: m.beat, hold: m.hold });
  assert.deepEqual(pick(big.game.music), pick(one.game.music));
});

test('the bass running average moves 5% of the way each frame', () => {
  const { game, audio } = onAt(10000);
  feed(audio, bins(0.4, 0, 6), 10);
  const want = 0.4 * (1 - 0.95 ** 10);
  assert.ok(Math.abs(game.music.avg - want) < 1e-9, `average ${game.music.avg}, want ${want}`);
});

test('a steady level drives the fight at 1.5 times its value, and the glow ignores it', () => {
  const { game, clock, set } = onAt(10000);
  set({ reducemotion: { value: false } });
  const base = delay(game);
  Object.assign(game.music, { level: 0.4, beat: 0, t: clock.now });
  const ratio = delay(game) / base;
  assert.ok(Math.abs(ratio - 1 / (1 + 2 * 0.6)) < 1e-6, `wait is ${ratio} of normal`);
  assert.equal(game.music.glow(), 0, 'the glow follows the level, not beats only');
  game.music.beat = 0.5;
  assert.ok(Math.abs(game.music.glow() - 0.5) < 1e-9, `glow ${game.music.glow()} on a half beat`);
});
