// Steady loud music with no beats must speed fighters up and favor specials too, as the
// README says, and right-channel bass must count as bass (issue #176).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const audio = [];
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {},
    wallpaperRegisterAudioListener(cb) { audio.push(cb); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  // A fixed "random" number, so every draw is the same from run to run
  context.rnd = 0.5;
  vm.runInContext('Math.random = () => rnd', context);
  const game = window.__stickmanBrawl;
  const set = p => window.wallpaperPropertyListener.applyUserProperties(p);
  return { game, audio, set, context };
}

const feed = (audio, a, n) => { for (let i = 0; i < n; i++) for (const cb of audio) cb(a); };
// Every bin at the same level: loud, but bass never stands out from its running average
const steady = Array(128).fill(0.6);
// About ten seconds of it: the beat set off by the first frame has long died away
const loud = (audio) => feed(audio, steady, 300);

// The wait a fighter takes after a move before it may start the next one
function delay(game) {
  const f = game.fighters[0];
  f.move = null; f.endMove();
  return f.cool;
}
// How much of that wait one idle step of 0.1 s uses up
function tempo(game) {
  const f = game.fighters[0];
  f.state = 'idle'; f.vy = 0; f.y = 0; f.cool = 100;
  f.updIdle(0.1);
  return 100 - f.cool;
}
// pickMove draws one random number: sweep it evenly over [0, 1) instead of sampling
function specialShare(game, context) {
  const [a, t] = game.fighters;
  const steps = 2000;
  let n = 0;
  for (let i = 0; i < steps; i++) { context.rnd = (i + 0.5) / steps; if (game.pickMove(a, t).type) n++; }
  context.rnd = 0.5;
  return n / steps;
}

test('steady loud music without beats shortens the wait, runs it out faster and favors specials', () => {
  const { game, audio, set, context } = load();
  set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  const calm = { delay: delay(game), tempo: tempo(game), special: specialShare(game, context) };
  loud(audio);
  assert.equal(game.music.beat, 0, 'no beat left');
  assert.ok(game.music.level > 0.9, `level ${game.music.level}`);
  const d = delay(game), t = tempo(game), s = specialShare(game, context);
  assert.ok(d < calm.delay * 0.7, `delay ${d} loud, ${calm.delay} calm`);
  assert.ok(t > calm.tempo * 1.5, `tempo ${t} loud, ${calm.tempo} calm`);
  assert.ok(s > calm.special * 1.2, `special share ${s} loud, ${calm.special} calm`);
});

test('loud music has no effect at strength 0 or with React to music off', () => {
  for (const props of [{ audioreactive: { value: true }, audiostrength: { value: 0 } },
    { audioreactive: { value: false }, audiostrength: { value: 100 } }]) {
    const { game, audio, set, context } = load();
    set(props);
    const calm = { delay: delay(game), tempo: tempo(game), special: specialShare(game, context) };
    loud(audio);
    assert.equal(delay(game), calm.delay);
    assert.equal(tempo(game), calm.tempo);
    assert.equal(specialShare(game, context), calm.special);
  }
});

test('bass on the right channel alone sets off a beat', () => {
  const { game, audio, set } = load();
  set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  feed(audio, Array(128).fill(0), 30);
  feed(audio, Array.from({ length: 128 }, (_, i) => (i >= 64 && i < 70 ? 0.9 : 0)), 2);
  assert.ok(game.music.beat > 0.5, `beat state ${game.music.beat}`);
});
