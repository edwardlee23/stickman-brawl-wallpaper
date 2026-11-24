# Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synthesized, comic-style sound effects with an on/off setting (off by default) and a volume setting.

**Architecture:** A new `// ---------- Sound ----------` section in `wallpaper/main.js` builds every sound from Web Audio nodes (noise buffers, oscillators, filters) on demand. One `sfx(kind, x, strength)` entry point gates on the setting, caps voices and throttles repeats; existing effect functions and fighter methods call it.

**Tech Stack:** Plain browser JavaScript, Web Audio API, `node:test` with a `vm` sandbox and a fake `AudioContext`.

**Spec:** `docs/superpowers/specs/2026-11-24-sound-effects-design.md`

## Global Constraints

- No runtime dependency, no build step, no network load at runtime.
- `wallpaper/` keeps exactly `index.html`, `main.js`, `preview.jpg`, `project.json`.
- Settings: `soundeffects` (bool, default `false`), `soundvolume` (slider 0–100, default 50).
- Labels: `ui_soundeffects` = "Sound effects" / 音效 / 音效; `ui_soundvolume` = "Volume" / 音效音量 / 音效音量 (`en-us` / `zh-cht` / `zh-chs`).
- At most 6 sounds at once (`MAX_VOICES = 6`); the same kind at most once per 0.04 s (`SFX_GAP = 0.04`).
- Query string: `?sound=1` turns sound on (same `0|false|off` parsing as `reducemotion`); `?volume=` is clamped to 0–100, default 50.
- Docs, comments, commit messages in English; Conventional Commits.
- `main.js` must still load where no `AudioContext` exists (the existing tests run that way).

## Review Focus

- Sound off (default): no `AudioContext` is ever constructed, even as fights run. Test in Task 1.
- A browser without `AudioContext`: `sfx` returns `false` and nothing throws. Test in Task 1.
- Volume 0 with sound on: the master gain is 0 (no leaked full-volume first sound). Test in Task 2.
- Sound turned off while a context exists: later `sfx` calls play nothing. Test in Task 2.
- Wallpaper paused before any sound played: `setPaused` does not create a context or throw. Test in Task 2.

---

### Task 1: Sound engine

**Files:**
- Modify: `wallpaper/main.js` (add `sound: false`, `volume: 0.5` to `cfg`; add a `// ---------- Sound ----------` section after `// ---------- Effects ----------` helpers; expose on `window.__stickmanBrawl`)
- Create: `tests/sound.test.mjs`

**Interfaces:**
- Produces:
  - `cfg.sound: boolean` (default `false`), `cfg.volume: number` 0–1 (default `0.5`).
  - `sfx(kind: string, x?: number, strength = 1): boolean` — `true` if a sound started. Kinds: `'hit'`, `'hitBig'`, `'block'`, `'whiff'`, `'boom'`, `'wall'`, `'ko'`, `'charge'`, `'fire'`, `'step'`, `'win'`. `x` in world pixels pans the sound (`pan = clamp(x / worldW * 2 - 1, -1, 1) * 0.6`; `x` undefined pans centre).
  - `soundSetVolume(): void` — sets the master gain from `cfg.volume` if a context exists.
  - `soundSetPaused(v: boolean): void` — `suspend()` / `resume()` the context if one exists.
  - `stats.sfx: { [kind]: number }` — counts of sounds that started.
  - `window.__stickmanBrawl.sfx`, `.soundSetVolume`, `.soundSetPaused`.

- [ ] **Step 1: Write the failing tests** in `tests/sound.test.mjs`

A `load(query, { audio = true } = {})` helper copies `fighter.test.mjs`'s sandbox and, when `audio`, puts a `FakeAudioContext` class on the stub `window`. The fake records `FakeAudioContext.instances`, has a settable `currentTime` (starts 0), `state = 'running'`, `sampleRate = 48000`, `destination`, `suspend()`/`resume()` that push `'suspend'`/`'resume'` into `this.calls`, and `create*` methods (`Gain`, `Oscillator`, `BufferSource`, `BiquadFilter`, `StereoPanner`, `Buffer`) returning nodes whose every property is an `AudioParam`-like object (`value`, `setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `setTargetAtTime`) plus `connect`, `start`, `stop`; `createBuffer(c, n)` returns `{ getChannelData: () => new Float32Array(n) }`. `createGain` nodes are kept in `this.gains` so the first one is the master.

```js
test('with sound off, sfx plays nothing and creates no AudioContext', () => {
  const { game, AC } = load('?count=2');
  assert.equal(game.sfx('hit', 100), false);
  assert.equal(AC.instances.length, 0);
});
test('without AudioContext, sfx returns false and does not throw', () => {
  const { game } = load('?count=2&sound=1', { audio: false });
  assert.equal(game.sfx('hit', 100), false);
});
test('the first sound creates one AudioContext and counts the kind', () => {
  const { game, AC } = load('?count=2&sound=1');
  assert.equal(game.sfx('hit', 100), true);
  game.sfx('block', 100);
  assert.equal(AC.instances.length, 1);
  assert.equal(game.stats.sfx.hit, 1);
  assert.equal(game.stats.sfx.block, 1);
});
test('every kind plays', () => {
  const { game, AC } = load('?count=2&sound=1');
  for (const k of ['hit','hitBig','block','whiff','boom','wall','ko','charge','fire','step','win']) {
    AC.instances[0] && (AC.instances[0].currentTime += 10);
    assert.equal(game.sfx(k, 100), true, k);
  }
});
test('the same kind plays at most once per 40 ms', () => {
  const { game, AC } = load('?count=2&sound=1');
  assert.equal(game.sfx('hit', 100), true);
  assert.equal(game.sfx('hit', 100), false);
  AC.instances[0].currentTime = 0.05;
  assert.equal(game.sfx('hit', 100), true);
});
test('at most 6 sounds play at once, and a slot frees once a sound ends', () => {
  const { game, AC } = load('?count=2&sound=1');
  const kinds = ['hit','hitBig','block','whiff','boom','wall','ko'];
  assert.deepEqual(kinds.map(k => game.sfx(k, 100)), [true,true,true,true,true,true,false]);
  AC.instances[0].currentTime = 5;
  assert.equal(game.sfx('ko', 100), true);
});
```

- [ ] **Step 2: Run** `node --test tests/sound.test.mjs` — Expected: FAIL (`game.sfx is not a function`).

- [ ] **Step 3: Implement the Sound section in `wallpaper/main.js`**

Context created lazily inside `sfx` via `window.AudioContext || window.webkitAudioContext`; none → return `false`. Master gain → `destination`, gain = `cfg.volume`. Voices: an array of end times; before starting, drop entries `<= currentTime`; if 6 remain, return `false`. Throttle with a per-kind last-start time. Each kind is a recipe `(ac, out, strength) => duration` in an `SFX` table, where `out` is that sound's `StereoPanner` connected to the master; recipes build from one shared white-noise `AudioBuffer` (0.5 s, made once) and oscillators with fast gain envelopes. Keep every sound under 0.6 s except `'win'` (three notes, about 0.5 s total), `strength` scales gain and pitch a little, and a small random detune keeps repeats from sounding identical. Starting values to tune by ear in Task 3:

| kind | sound |
|---|---|
| `hit` | noise through bandpass ~1.8 kHz, 60 ms + sine 160→70 Hz thump, 90 ms |
| `hitBig` | as `hit`, louder, bandpass ~1.2 kHz, thump 120→45 Hz, 180 ms |
| `block` | noise highpass ~2.5 kHz, 40 ms + triangle 900 Hz click, 30 ms |
| `whiff` | noise bandpass sweeping 600→2000 Hz, 150 ms, quiet (gain ~0.15) |
| `boom` | sine 90→35 Hz, 400 ms + lowpass noise ~400 Hz, 350 ms |
| `wall` | noise lowpass ~1.5 kHz, 300 ms + square 70 Hz through lowpass, 200 ms |
| `ko` | sine 110→30 Hz, 450 ms, loud |
| `charge` | sawtooth 200→800 Hz through lowpass, 500 ms, quiet |
| `fire` | noise bandpass 3000→500 Hz, 250 ms + sine 300→80 Hz, 200 ms |
| `step` | noise bandpass ~900 Hz, 25 ms, gain ~0.1 |
| `win` | triangle notes 523, 659, 784 Hz, 120 ms each, 130 ms apart |

- [ ] **Step 4: Run** `npm run check` — Expected: all tests PASS, including the existing ones.

- [ ] **Step 5: Commit** `feat: add a synthesized sound engine (#22)`

---

### Task 2: Settings, query string and pause

**Files:**
- Modify: `wallpaper/main.js` (query parsing block near `reducemotion`; `applyUserProperties`; `setPaused`; a `pointerdown` listener)
- Modify: `wallpaper/project.json` (two properties after `reducemotion`, orders 24 and 25; labels in all three languages)
- Modify: `tests/sound.test.mjs`, `tests/query.test.mjs`

**Interfaces:**
- Consumes: `cfg.sound`, `cfg.volume`, `sfx`, `soundSetVolume`, `soundSetPaused` from Task 1.
- Produces: `p.soundeffects.value: boolean`, `p.soundvolume.value: number` (0–100) read in `applyUserProperties`.

- [ ] **Step 1: Write the failing tests**

In `tests/query.test.mjs`:

```js
test('sound is off by default, and the query string turns it on with a clamped volume', () => {
  assert.equal(load('').cfg.sound, false);
  assert.equal(load('').cfg.volume, 0.5);
  assert.equal(load('?sound=1').cfg.sound, true);
  assert.equal(load('?sound=off').cfg.sound, false);
  assert.equal(load('?volume=250').cfg.volume, 1);
  assert.equal(load('?volume=-3').cfg.volume, 0);
  assert.equal(load('?volume=abc').cfg.volume, 0.5);
});
```

In `tests/sound.test.mjs`:

```js
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
```

The existing `project.test.mjs` checks then cover labels and that both settings are read.

- [ ] **Step 2: Run** `npm run check` — Expected: the new tests FAIL.

- [ ] **Step 3: Implement**
  - Query: `cfg.sound` from `q.get('sound')` like `reducemotion`; `cfg.volume = qNum('volume', 0, 100, 50) / 100`.
  - `applyUserProperties`: `p.soundeffects` → `cfg.sound`; `p.soundvolume` → `cfg.volume = value / 100`, then `soundSetVolume()`. Use `!== undefined` checks so `0` and `false` apply.
  - `setPaused(v)`: keep `paused = v`, add `soundSetPaused(v)`.
  - `window.addEventListener('pointerdown', ...)` resumes a suspended context unless `paused` (plain browsers block audio until a gesture).
  - `project.json`: `"soundeffects" : { "order" : 24, "text" : "ui_soundeffects", "type" : "bool", "value" : false }`, `"soundvolume" : { "order" : 25, "text" : "ui_soundvolume", "type" : "slider", "min" : 0, "max" : 100, "value" : 50, "condition" : "soundeffects.value" }`, plus the labels in Global Constraints.

- [ ] **Step 4: Run** `npm run check` — Expected: all PASS.

- [ ] **Step 5: Commit** `feat: add sound effect and volume settings (#22)`

---

### Task 3: Hook sounds into the fight and tune them

**Files:**
- Modify: `wallpaper/main.js` (call sites below)
- Modify: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `sfx(kind, x, strength)` from Task 1.

Call sites:

| where | call |
|---|---|
| `impact(x, y, big)` | `sfx(big ? 'hitBig' : 'hit', x)` |
| `takeHit` block branch, by `stats.blocked++` | `sfx('block', H.x)` |
| `endMove`, by `stats.whiff++` | `sfx('whiff', this.x)` |
| `quake(x, y, r)` | `sfx('boom', x, r / 110)` |
| `crack` when `kind === 'wall'` | `sfx('wall', x)` |
| `ko(vx, vy)`, by `stats.ko++` | `sfx('ko', this.x)` |
| `u_beam` charge phase, once per move (`md.chargeSfx` flag) | `sfx('charge', this.x)` |
| `u_beam` charge→fire transition | `sfx('fire', this.x, 1.5)` |
| `u_blast`, by `shots.push` | `sfx('fire', H.x, 0.5)` |
| `u_wallrun` run and climb phases, each time `Math.floor(this.walk / Math.PI)` changes | `sfx('step', this.x, 0.4)` |
| `checkRound`, where `roundOver` turns true | `sfx('win', worldW / 2)` |

- [ ] **Step 1: Write the failing tests**

```js
test('a hit, a block, a whiff and a knockout each play their sound', () => {
  const { game, a, e, AC } = load('?count=2&sound=1');
  const tick = () => { AC.instances[0] && (AC.instances[0].currentTime += 10); };
  const m = game.MOVES.find(x => x.id === 'jab');
  e.state = 'idle'; e.hp = 1000;
  e.takeHit(a, m, 'body', { x: 100, y: 100 }); tick();
  assert.equal(game.stats.sfx.hit, 1);
  e.state = 'block'; e.facing = -a.facing;
  e.takeHit(a, m, 'body', { x: 100, y: 100 }); tick();
  assert.equal(game.stats.sfx.block, 1);
  a.move = m; a.hitDone = false; a.endMove(); tick();
  assert.equal(game.stats.sfx.whiff, 1);
  e.ko(0, -40);
  assert.equal(game.stats.sfx.ko, 1);
});
```

- [ ] **Step 2: Run** `node --test tests/sound.test.mjs` — Expected: FAIL (`stats.sfx.hit` undefined).

- [ ] **Step 3: Add the call sites** in the table.

- [ ] **Step 4: Run** `npm run check` — Expected: all PASS.

- [ ] **Step 5: Tune by ear.** Open `wallpaper/index.html?sound=1&count=8` in a browser, click once, and listen for several rounds; adjust the `SFX` recipes so nothing is harsh, clipping or tiring, and 8+ fighters do not turn into noise. Re-run `npm run check`.

- [ ] **Step 6: Commit** `feat: play sound effects for hits, specials, knockouts and round ends (#22)`
