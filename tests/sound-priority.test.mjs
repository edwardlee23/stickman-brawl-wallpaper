// Knockout and win sounds have priority over minor sounds (issue #473): when the
// 6-voice cap is reached they take the voice of the oldest minor sound, and they are
// exempt from the 40 ms gap between two sounds of one kind, so in a crowded fight
// no knockout or round end is silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const param = v => ({
  value: v,
  setValueAtTime(x) { this.value = x; return this; },
  linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; },
  setTargetAtTime() { return this; },
});
function node(extra = {}) {
  const base = { connected: true, connect(n) { base.to = n; return n; }, disconnect() { base.connected = false; }, start() {}, stop() {}, ...extra };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}
class FakeAudioContext {
  static instances = [];
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000;
    this.destination = node(); this.panners = [];
    FakeAudioContext.instances.push(this);
  }
  createDynamicsCompressor() { return node({ threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node({ frequency: param(440), detune: param(0) }); }
  createBufferSource() { return node({ playbackRate: param(1) }); }
  createBiquadFilter() { return node({ frequency: param(350), Q: param(1) }); }
  createStereoPanner() { const p = node({ pan: param(0) }); this.panners.push(p); return p; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}
function load(search, seed = 1) {
  FakeAudioContext.instances = [];
  const { game } = loadMain({ search, seed, window: { AudioContext: FakeAudioContext } });
  game.cfg.sound = true;
  return { game, ac: () => FakeAudioContext.instances[0] };
}

test('a knockout at the voice cap takes the voice of the oldest minor sound', () => {
  const { game, ac } = load('?count=2');
  for (const k of ['hit', 'hitBig', 'block', 'whiff', 'boom', 'wall']) assert.equal(game.sfx(k, 100), true, k);
  assert.equal(game.sfx('step', 100), false, 'a minor sound still waits for a free voice');
  assert.equal(game.sfx('ko', 100), true, 'the knockout is dropped at the cap');
  assert.equal(ac().panners[0].connected, false, 'the oldest minor sound keeps playing');
  assert.equal(ac().panners[1].connected, true);
});

test('knockout and win sounds are exempt from the 40 ms same-kind gap', () => {
  const { game } = load('?count=2');
  assert.equal(game.sfx('ko', 100), true);
  assert.equal(game.sfx('ko', 300), true, 'a second knockout in the same instant is silent');
  assert.equal(game.sfx('win', 100), true);
  assert.equal(game.sfx('win', 100), true);
});

test('with 16 fighters, every knockout and every round end plays its sound', () => {
  const DT = 1 / 60;
  for (const seed of [1, 2]) {
    const { game, ac } = load('?count=16&mode=ffa', seed);
    game.sfx('step', 0);                 // Makes the context before the fight starts
    for (let t = 0; t < 120; t += DT) { game.update(DT); ac().currentTime += DT; }
    assert.ok(game.stats.ko > 20, `seed ${seed}: only ${game.stats.ko} knockouts`);
    assert.equal(game.stats.sfx.ko || 0, game.stats.ko, `seed ${seed}: knockouts without a sound`);
    assert.equal(game.stats.sfx.win || 0, game.stats.rounds, `seed ${seed}: round ends without a sound`);
  }
});
