// Runs main.js in a sandbox with a stubbed canvas, window and Wallpaper Engine audio
// listener, then checks that "React to music" follows the music (issue #84).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadMain } from './load-main.mjs';

function load() {
  const audio = [];
  const { game, window, context } = loadMain({ window: { wallpaperRegisterAudioListener(cb) { audio.push(cb); } } });
  // A fixed "random" number, so a fighter's next-move delay is the same every time it is drawn
  context.rnd = 0.5;
  vm.runInContext('Math.random = () => rnd', context);
  const set = p => window.wallpaperPropertyListener.applyUserProperties(p);
  return { game, audio, set, context };
}

// One Wallpaper Engine audio frame: 64 left bins then 64 right, low to high frequency
const frame = (bass, rest = 0) => Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? bass : rest));
const feed = (audio, a, n) => { for (let i = 0; i < n; i++) for (const cb of audio) cb(a); };
// The wait a fighter takes after a move before it may start the next one
function delay(game) {
  const f = game.fighters[0];
  f.move = null; f.endMove();
  return f.cool;
}

test('the wallpaper registers an audio listener when Wallpaper Engine offers one', () => {
  const { audio } = load();
  assert.equal(audio.length, 1);
});

test('with React to music on, loud bass raises the beat and shortens move delays; silence undoes it', () => {
  const { game, audio, set } = load();
  const base = delay(game);
  set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  assert.equal(delay(game), base, 'no music yet, no change');
  feed(audio, frame(0), 30);
  feed(audio, frame(0.9, 0.3), 4);
  assert.ok(game.music.beat > 0.5, `beat state ${game.music.beat}`);
  assert.ok(game.music.level > 0, `level ${game.music.level}`);
  const loud = delay(game);
  assert.ok(loud < base * 0.7, `delay ${loud} with music, ${base} without`);
  feed(audio, frame(0), 150);   // About five seconds of silence at Wallpaper Engine's 30 frames a second
  assert.equal(game.music.beat, 0);
  assert.equal(game.music.level, 0);
  assert.equal(delay(game), base, 'silence brings the delay back');
});

test('a beat makes specials more likely to be picked', () => {
  const { game, audio, set, context } = load();
  set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  const [a, t] = game.fighters;
  // pickMove draws one random number: sweep it evenly over [0, 1) instead of sampling
  const specialShare = () => {
    const steps = 2000;
    let n = 0;
    for (let i = 0; i < steps; i++) { context.rnd = (i + 0.5) / steps; if (game.pickMove(a, t).type) n++; }
    context.rnd = 0.5;
    return n / steps;
  };
  const calm = specialShare();
  feed(audio, frame(0), 30);
  feed(audio, frame(0.9), 2);
  const beat = specialShare();
  assert.ok(beat > calm * 1.2, `special share ${beat} on a beat, ${calm} without`);
});

test('with React to music off, audio frames change nothing', () => {
  const { game, audio } = load();
  const base = delay(game);
  feed(audio, frame(0), 30);
  feed(audio, frame(0.9, 0.3), 10);
  assert.equal(game.music.beat, 0);
  assert.equal(game.music.level, 0);
  assert.equal(delay(game), base);
});

test('the line glow pulses on a beat only when flashing is allowed', () => {
  const { game, audio, set } = load();
  set({ audioreactive: { value: true }, audiostrength: { value: 100 }, reducemotion: { value: false } });
  feed(audio, frame(0), 30);
  feed(audio, frame(0.9), 2);
  assert.ok(game.music.glow() > 0, 'a beat adds glow');
  set({ reducemotion: { value: true } });
  assert.equal(game.music.glow(), 0, 'Reduce flashing and screen shake keeps the lines plain');
});

test('project.json turns on audio processing and keeps React to music off by default', () => {
  const project = JSON.parse(readFileSync(new URL('../wallpaper/project.json', import.meta.url), 'utf8'));
  assert.equal(project.general.supportsaudioprocessing, true);
  const p = project.general.properties;
  assert.equal(p.audioreactive.type, 'bool');
  assert.equal(p.audioreactive.value, false);
  assert.equal(p.audioreactive.order, 26);
  assert.equal(p.audiostrength.order, 27);
  assert.equal(p.audiostrength.condition, 'audioreactive.value');
});
