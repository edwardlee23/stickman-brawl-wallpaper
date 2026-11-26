// Runs main.js in a sandbox with a fake AudioContext, then checks two ways a frozen fighter
// leaves the ice (issue #389): a throw shatters it with the freeze sound, as a hit does
// (#354), and an ice shard that freezes a tumbling fighter keeps its spin, as a launching
// hit does (#347).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DT = 1 / 60;

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
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, AudioContext: FakeAudioContext,
    addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  game.cfg.sound = true;
  const [a, b] = game.fighters;
  Object.assign(a, { x: 400, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', st: 0, hp: 1000, target: b });
  Object.assign(b, { x: 418, z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', st: 0, hp: 1000, target: a });
  a.W = a.joints(); b.W = b.joints();
  const move = id => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
  return { game, a, b, move };
}

// The gap at the start of each throw: a double-leg takedown lunges far, and nothing here keeps
// the bodies apart, so it starts farther off to catch the target instead of passing it
const GAP = { seoinage: 18, osotogari: 18, doubleleg: 45, suplex: 18 };
for (const id of Object.keys(GAP)) {
  test(`the throw ${id} on a frozen fighter shatters the ice with the freeze sound (#389)`, () => {
    const { game, a, b, move } = load();
    Object.assign(b, { x: a.x + GAP[id], state: 'frozen', st: 0, dur: 1.5 });
    b.W = b.joints();
    a.startMove(move(id));
    for (let i = 0; i < 60 && b.state === 'frozen'; i++) { a.update(DT); a.checkHit(); }
    assert.notEqual(b.state, 'frozen', 'the throw never caught the frozen fighter');
    assert.ok(b.hp < 1000, 'the throw did no damage');
    assert.equal(game.stats.sfx.freeze ?? 0, 1, 'the freeze sound plays once as the ice shatters');
  });
}

test('a throw on a fighter that is not frozen makes no freeze sound (#389)', () => {
  const { game, a, b, move } = load();
  Object.assign(b, { state: 'hit', st: 0, dur: 99 });
  a.startMove(move('seoinage'));
  for (let i = 0; i < 60 && b.state === 'hit'; i++) { a.update(DT); a.checkHit(); }
  assert.equal(b.state, 'thrown');
  assert.equal(game.stats.sfx.freeze ?? 0, 0);
});

test('an ice shard that freezes a tumbling fighter keeps its spin (#389)', () => {
  const { a, b, move } = load();
  b.launch(300, 500);
  for (let i = 0; i < 12; i++) b.update(DT);
  assert.equal(b.state, 'launched');
  const rot = b.rot;
  assert.ok(Math.abs(rot) > 0.5, 'no spin to keep: rot ' + rot);
  b.takeHit(a, move('ice'), 'body', b.bodyPoint(), { dmg: 4, freeze: 1.1 });
  assert.equal(b.state, 'frozen');
  assert.equal(b.rot, rot);
  // and breaks out of the ice upright, not tilted for good
  for (let i = 0; i < 120 && b.state === 'frozen'; i++) b.update(DT);
  assert.notEqual(b.state, 'frozen', 'the ice never broke');
  assert.equal(b.rot, 0);
});
