// Pins smaller fight rules that a one-string change to main.js could break with
// every other test still green (issue #187): AI targeting weights, the
// free-for-all score order, hit stop length, move reach, sound loudness, music
// bass from both channels, shot depth, fireball impact, teammate depth spread
// and the overlap check for fighters in the air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
// A copy of main.js that also exposes hitStop, impact, quake and the running hit stop
const END_ANCHOR = 'requestAnimationFrame(frame);\n})();';
assert.ok(source.includes(END_ANCHOR), 'anchor not found in main.js');
const exposed = source.replace(END_ANCHOR,
  'requestAnimationFrame(frame);\nwindow.__in = { hitStop, impact, quake, get freeze() { return freeze; } };\n})();');

// An AudioParam that remembers the highest value it is ramped or set to
const param = v => ({
  value: v, peak: 0,
  setValueAtTime(x) { this.value = x; this.peak = Math.max(this.peak, x); return this; },
  linearRampToValueAtTime(x) { this.peak = Math.max(this.peak, x); return this; },
  exponentialRampToValueAtTime() { return this; },
  setTargetAtTime() { return this; },
});
function node(extra = {}) {
  const base = { connect(n) { return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined) });
}
class FakeAudioContext {
  constructor() { FakeAudioContext.last = this; this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000; this.destination = node(); this.gains = []; }
  createDynamicsCompressor() { return node(); }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { const g = node({ gain: param(1) }); this.gains.push(g); return g; }
  createOscillator() { return node(); }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node(); }
  createStereoPanner() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

// Loads the wallpaper with a seeded Math.random (mulberry32, see #161). Returns its debug
// hook, the exposed internals, the settings listener, the audio listeners, and a function
// that draws one frame and returns the text it drew.
function load(search, { seed = 187, audio = false } = {}) {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  let drawn = [];
  const state = {};
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'fillText' ? t => drawn.push(t)
      : k === 'measureText' ? t => ({ width: String(t).length * 8 })
      : k in state ? state[k] : stub,
    set: (_, k, v) => { state[k] = v; return true; },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  const listeners = [];
  let next = null, now = 0;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {},
    wallpaperRegisterAudioListener: cb => listeners.push(cb) };
  if (audio) window.AudioContext = FakeAudioContext;
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math: Object.assign(Object.create(Math), { random }),
    Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(exposed, window);
  return {
    game: window.__stickmanBrawl, inner: window.__in, we: window.wallpaperPropertyListener, listeners,
    draw: () => { drawn = []; next(now += 16); return drawn; },
  };
}

// Holds a fighter in a long flinch at a place, so it neither moves nor attacks
function hold(f, o) {
  Object.assign(f, { alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 100, cool: 99, target: null, ...o });
  f.W = f.joints();
}

test('an opponent who cannot be hit is picked less often than a farther one who can', () => {
  const { game } = load('?count=3&mode=ffa');
  const [me, A, B] = game.fighters;
  hold(me, { x: 100, z: 50 });
  // A is 60 px closer but invisible: without the 80 penalty it would be picked every time
  hold(A, { x: 200, z: 50, invis: true });
  hold(B, { x: 260, z: 50 });
  let b = 0;
  for (let i = 0; i < 2000; i++) if (game.pickTarget(me) === B) b++;
  assert.ok(b > 2000 * 0.7, `picked the one who can be hit ${b} times out of 2000`);
});

test('a fighter keeps its current target over an equally good one about half the time', () => {
  const { game } = load('?count=3&mode=ffa');
  const [me, A, B] = game.fighters;
  hold(me, { x: 100, z: 50 });
  // A, the current target, is 20 px farther: the -20 bonus for keeping it evens them out
  hold(A, { x: 220, z: 50 });
  hold(B, { x: 200, z: 50 });
  me.target = A;
  let a = 0;
  for (let i = 0; i < 2000; i++) if (game.pickTarget(me) === A) a++;
  assert.ok(a > 2000 * 0.35, `kept the current target ${a} times out of 2000`);
});

test('the free-for-all score lists only fighters with wins, most wins first, ties by number', () => {
  const { game, we, draw } = load('?count=4&mode=ffa');
  we.applyUserProperties({ showscore: { value: true } });
  const line = () => draw().filter(t => /×/.test(t));
  game.score.wins.splice(0, 4, 0, 3, 0, 1);
  assert.deepEqual(line(), ['#2 ×3', '#4 ×1']);
  game.score.wins.splice(0, 4, 2, 0, 2, 0);
  assert.deepEqual(line(), ['#1 ×2', '#3 ×2']);
});

test('a smaller hit inside a running hit stop does not shorten it', () => {
  const { inner } = load('?count=2');
  inner.hitStop(0.09);
  inner.hitStop(0.035);
  assert.equal(inner.freeze, 0.09);
});

test('a big impact stops the fight for 0.09 s and a small one for 0.035 s', () => {
  const big = load('?count=2'), small = load('?count=2');
  big.inner.impact(300, 300, true);
  small.inner.impact(300, 300, false);
  assert.equal(big.inner.freeze, 0.09);
  assert.equal(small.inner.freeze, 0.035);
});

test('a kick is picked from as far as it lands, less at most 8 px', () => {
  // The farthest distance each kick lands from, found by trying each distance
  for (const id of ['teep', 'roundhouse', 'lowkick', 'sidekick', 'backkick', 'knee']) {
    const { game } = load('?count=2&mode=ffa');
    const top = game.MOVES.find(m => m.id === id).range[1];
    let far = -1;
    for (let d = Math.floor(top) - 4; d < top + 20; d++) {
      const { game } = load('?count=2&mode=ffa');
      const [a, e] = game.fighters;
      hold(a, { x: 300, z: 50, facing: 1, state: 'idle', target: e });
      hold(e, { x: 300 + d, z: 50, facing: -1, target: a });
      a.startMove(game.MOVES.find(m => m.id === id));
      for (let i = 0; i < 200 && a.state === 'attack'; i++) game.update(1 / 60);
      if (e.hp < 100) far = d;
    }
    assert.ok(far > 0, `${id} never landed near the top of its range ${top.toFixed(1)}`);
    assert.ok(top >= far - 8, `${id} lands from ${far} px but is picked only up to ${top.toFixed(1)}`);
  }
});

test('sound loudness is clamped to 0.3 to 1.6, and a bigger quake booms louder', () => {
  const peaks = (fn) => {
    const r = load('?count=2', { audio: true });
    r.game.cfg.sound = true;
    fn(r);
    // The master gain is set, not ramped, so this is the loudest envelope the sound has
    return Math.max(...FakeAudioContext.last.gains.map(g => g.gain.peak));
  };
  const hit = s => peaks(({ game }) => game.sfx('hit', 100, s));
  assert.equal(hit(50), hit(1.6), 'a strength above 1.6 is played at 1.6');
  assert.equal(hit(0.01), hit(0.3), 'a strength below 0.3 is played at 0.3');
  assert.ok(hit(1.6) > hit(1), 'a strength inside the range is used');
  const boom = r => peaks(({ inner }) => inner.quake(300, 300, r));
  assert.ok(boom(160) > boom(60), `a 160 px quake booms at ${boom(160)}, a 60 px one at ${boom(60)}`);
});

test('bass in the right channel alone makes a music beat', () => {
  const { game, we, listeners } = load('?count=2&mode=ffa');
  we.applyUserProperties({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  const feed = (a, n) => { for (let i = 0; i < n; i++) for (const cb of listeners) cb(a); };
  feed(new Array(128).fill(0), 30);
  // 64 left bins then 64 right, low to high: only the right channel's low bins play
  feed(Array.from({ length: 128 }, (_, i) => (i >= 64 && i < 70 ? 0.9 : 0)), 4);
  assert.ok(game.music.beat > 0.5, `beat ${game.music.beat}`);
});

// Fires a fireball from a at e's chest, at depth z, and runs the fight until it ends
function fireball(dz) {
  const { game } = load('?count=2&mode=ffa');
  const [a, e] = game.fighters;
  hold(a, { x: 200, z: 50, facing: 1 });
  hold(e, { x: 400, z: 50, facing: -1 });
  const c = { x: (e.W.sh.x + e.W.hip.x) / 2, y: (e.W.sh.y + e.W.hip.y) / 2 };
  const m = game.MAGIC.find(m => m.id === 'fireball');
  game.shots.push({ x: c.x - 80, y: c.y, vx: 430, vy: 0, z: 50 + dz, owner: a, m, life: 3, kind: 'fire', dmg: 10, col: '#fff' });
  game.fx.length = 0;
  for (let i = 0; i < 30 && game.shots.length; i++) { hold(e, { x: 400, z: 50, facing: -1, hp: e.hp }); game.update(1 / 60); }
  return { e, game };
}

test('a shot passes a fighter more than 16 px away in depth', () => {
  assert.ok(fireball(0).e.hp < 100, 'a fireball at the same depth missed');
  assert.equal(fireball(40).e.hp, 100, 'a fireball 40 px deeper hit');
});

test('a fireball hit is a big impact, with focus lines', () => {
  const { e, game } = fireball(0);
  assert.ok(e.hp < 100, 'the fireball missed');
  assert.ok(game.fx.some(o => o.type === 'focus'), 'no focus lines');
});

test('teammates bunched together spread front to back', () => {
  const { game } = load('?count=4&mode=teams');
  // Fighters 0 and 2 are red, 1 and 3 blue
  const [a, c, b, d] = game.fighters;
  hold(a, { x: 300, z: 60 });
  hold(b, { x: 300, z: 60 });
  hold(c, { x: 700, z: 60 });
  hold(d, { x: 850, z: 60 });
  game.update(1 / 60);
  assert.notEqual(a.z, b.z);
});

test('fighters in the air are not pushed apart from those on the ground', () => {
  for (const up of [0, 1]) {
    const { game } = load('?count=2&mode=ffa');
    const [a, b] = game.fighters;
    hold(a, { x: 300, z: 50 });
    hold(b, { x: 300, z: 50 });
    game.fighters[up].alt = 60;
    game.update(1 / 60);
    assert.equal(a.x, b.x, `fighter ${up} in the air was pushed`);
  }
  const { game } = load('?count=2&mode=ffa');
  const [a, b] = game.fighters;
  hold(a, { x: 300, z: 50 });
  hold(b, { x: 300, z: 50 });
  game.update(1 / 60);
  assert.notEqual(a.x, b.x, 'fighters on the ground were not pushed apart');
});
