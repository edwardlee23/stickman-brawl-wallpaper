// Runs main.js in a sandbox with a recording canvas and a fake AudioContext, to pin the
// details a viewer sees or hears that no other test noticed breaking (issue #227): every
// sound effect call site, the music glow on the lines, the gap in the free-for-all score,
// Click to blast's falloff, radius and crack, and the drawing rules for a hit flash, a frozen
// fighter, a knocked-out body, the shield's side, health bars and the name tag color.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, source as SRC } from './load-main.mjs';

// 1280 x 720 at figure size 100%: one world unit is 720 / 540 screen pixels
const S = 720 / 540;

// ---------- Sandbox ----------

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
  const base = { connect(n) { return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}
// A fake AudioContext whose clock jumps 10 s at every read, so no sound is held back by the
// per-kind gap or the voice limit. Each sound that starts makes one stereo panner, so the
// panner records the line of main.js that called sfx(): the frame below sfx() itself.
function fakeAudio(sites) {
  return class {
    constructor() { this.t = 0; this.state = 'running'; this.sampleRate = 48000; this.destination = node(); }
    get currentTime() { return (this.t += 10); }
    createDynamicsCompressor() { return node(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return node({ gain: param(1) }); }
    createOscillator() { return node({ frequency: param(440) }); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node({ frequency: param(350), Q: param(1) }); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createStereoPanner() {
      const frames = new Error().stack.split('\n').filter(l => l.includes('wallpaper/main.js'));
      const m = /main\.js:(\d+)/.exec(frames[1] ?? '');
      if (m) sites.add(Number(m[1]));
      return node({ pan: param(0) });
    }
  };
}

// Loads the wallpaper with a seeded Math.random (an LCG). calls records every canvas method
// called and every property set, as [name, ...args] and ['=' + name, value]; measureText gives
// 8 px per character. sites collects the main.js lines that played a sound.
function load(search = '?count=2&mode=ffa', seed = 1) {
  const calls = [], sites = new Set(), audio = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return k === 'measureText' ? { width: String(a[0]).length * 8 } : grad; },
    set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; },
  });
  const listeners = {};
  const { window } = loadMain({
    search, seed, ctx,
    window: { AudioContext: fakeAudio(sites),
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      wallpaperRegisterAudioListener(cb) { audio.push(cb); } },
  });
  const game = window.__stickmanBrawl;
  const we = window.wallpaperPropertyListener;
  let clock = 0;
  // A click at a world point, as a browser reports it: in CSS pixels of the window
  const click = (x, y) => {
    clock += 10000;
    for (const fn of listeners.pointerdown ?? []) fn({ clientX: x * S, clientY: y * S, button: 0, timeStamp: clock });
  };
  const draw = () => { calls.length = 0; game.render(); return calls; };
  return { game, we, calls, sites, audio, click, draw };
}
const run = (game, secs) => { for (let t = 0; t < secs; t += 1 / 60) game.update(1 / 60); };
// Puts the fighters on one line at the given x, standing idle and facing each other; the
// first is drawn first (it stands further back)
function place(game, ...xs) {
  game.fighters.forEach((f, i) => {
    Object.assign(f, { x: xs[i], z: 40 + i * 20, alt: 0, va: 0, vx: 0, vz: 0, facing: xs[i] < xs[1 - i] ? 1 : -1, state: 'idle', st: 0 });
    f.W = f.joints();
  });
  return game.fighters;
}
const hsl = f => `hsl(${f.hue},80%,66%)`;
// The bodies drawn, in order: drawSkeleton sets the stroke color and then the 3.2 px line
// width; alphas are the two globalAlpha values it sets next (back limbs, then the rest).
function bodies(calls) {
  const out = [];
  calls.forEach((c, i) => {
    if (c[0] !== '=lineWidth' || c[1] !== 3.2) return;
    let col;
    for (let j = i - 1; j >= 0; j--) if (calls[j][0] === '=strokeStyle') { col = calls[j][1]; break; }
    const alphas = calls.slice(i).filter(c => c[0] === '=globalAlpha').slice(0, 2).map(c => c[1]);
    out.push({ col, alphas });
  });
  return out;
}

// ---------- Sound ----------

// Every sfx() call in main.js, the definition aside, as { line, call }
const SFX_CALLS = SRC.split('\n').flatMap((l, i) => {
  if (/function sfx\(/.test(l)) return [];
  return [...l.matchAll(/\bsfx\(/g)].map(m => {
    let d = 0, e = m.index + 3;
    for (; e < l.length; e++) if (l[e] === '(') d++; else if (l[e] === ')' && !--d) break;
    return { line: i + 1, call: l.slice(m.index, e + 1) };
  });
});
// The sound calls the effects were designed with (docs/superpowers/specs/2026-11-24-sound-effects-design.md),
// one entry per call site
const DESIGNED = [
  "sfx('wall', x)", "sfx(big ? 'hitBig' : 'hit', x)", "sfx('boom', x, r / 110)",
  "sfx('freeze', this.x, 0.5)", "sfx('step', this.x, 0.4)", "sfx('whiff', this.x)",
  "sfx('charge', this.x)", "sfx('fire', this.x, 1.5)", "sfx('fire', H.x, 0.5)",
  "sfx('toss', this.x)", "sfx('poof', this.x)", "sfx('whiff', this.x)",
  "sfx('poof', this.x, 0.7)", "sfx('poof', this.x)", "sfx('poof', this.x)",
  "sfx('charge', this.x, 0.6)", "sfx('fire', this.x)", "sfx('freeze', this.x, 0.7)",
  "sfx('zap', md.x, 1.3)", "sfx('shield', this.x, 0.6)", "sfx('hit', H.x)",
  "sfx('shield', H.x, 0.4)", "sfx('shield', H.x)", "sfx('block', H.x)",
  "sfx('freeze', H.x)", "sfx('ko', this.x)", "sfx('win', worldW / 2)",
  "sfx('toss', this.x)", "sfx('shield', it.x, 0.4)",
];

test('sound: main.js still makes every sound call it was designed with', () => {
  assert.deepEqual(SFX_CALLS.map(c => c.call).sort(), [...DESIGNED].sort());
});

// Fights with every style, items and platforms on until every call site in main.js has
// played, trying more seeds if one fight misses a rare site
test('sound: every sfx() call site in main.js plays in an eight-fighter fight', () => {
  const sites = new Set();
  for (let seed = 1; seed <= 4 && SFX_CALLS.some(c => !sites.has(c.line)); seed++) {
    const l = load('?count=8&mode=ffa', seed);
    l.we.applyUserProperties({ soundeffects: { value: true }, items: { value: true }, platforms: { value: true } });
    for (let t = 0; t < 300 && SFX_CALLS.some(c => !l.sites.has(c.line)); t += 10) run(l.game, 10);
    for (const n of l.sites) sites.add(n);
  }
  const missing = SFX_CALLS.filter(c => !sites.has(c.line)).map(c => c.line + ': ' + c.call);
  assert.deepEqual(missing, [], 'sound call sites that never played');
});

// ---------- Music glow ----------

// One Wallpaper Engine audio frame: 64 left bins then 64 right, low to high frequency
const frame = (bass, rest = 0) => Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? bass : rest));

test('music glow: on a beat the figures\' lines glow in their own color', () => {
  const { game, we, audio, draw } = load();
  we.applyUserProperties({ audioreactive: { value: true }, audiostrength: { value: 100 }, reducemotion: { value: false } });
  const [a, b] = place(game, 300, 700);
  for (let i = 0; i < 30; i++) for (const cb of audio) cb(frame(0));
  for (let i = 0; i < 2; i++) for (const cb of audio) cb(frame(0.9));
  const glow = game.music.glow();
  assert.ok(glow > 0, 'a beat adds glow');
  const calls = draw();
  for (const f of [a, b]) {
    const i = calls.findIndex((c, i) => c[0] === '=shadowColor' && c[1] === hsl(f) && calls[i + 1]?.[0] === '=shadowBlur');
    assert.ok(i >= 0, 'a glow in the color of ' + hsl(f));
    assert.ok(Math.abs(calls[i + 1][1] - 10 * glow) < 1e-9, 'blur ' + calls[i + 1][1] + ' for glow ' + glow);
  }
});

// ---------- Score ----------

test('score: the free-for-all entries are kept apart by a two-space gap', () => {
  const { game, we, draw } = load('?count=6&mode=ffa');
  we.applyUserProperties({ showscore: { value: true } });
  game.score.wins.splice(0, 6, 2, 0, 4, 0, 0, 0);
  const text = draw().filter(c => c[0] === 'fillText');
  const first = text.find(c => c[1] === '#3 ×4'), second = text.find(c => c[1] === '#1 ×2');
  assert.ok(first && second, JSON.stringify(text.map(c => c[1])));
  assert.equal(first[2], 14);
  assert.equal(second[2], 14 + 8 * '#3 ×4'.length + 8 * 2, 'two spaces of 8 px between the entries');
});

// ---------- Click to blast ----------

function blast(dx, dy) {
  const l = load();
  l.we.applyUserProperties({ clickblast: { value: true } });
  const [a, b] = place(l.game, 300, 700);
  const c = a.bodyPoint();
  l.click(c.x + dx, c.y + dy);
  return { ...l, a, b };
}

test('click to blast: a fighter is launched harder the closer the click is', () => {
  const near = blast(-20, 0).a, far = blast(-120, 0).a;
  assert.equal(near.state, 'launched'); assert.equal(far.state, 'launched');
  assert.ok(near.vx > far.vx + 50, `sideways ${near.vx} near, ${far.vx} far`);
  assert.ok(near.va > far.va + 30, `upward ${near.va} near, ${far.va} far`);
});

test('click to blast: a click below a fighter throws it higher than one beside it', () => {
  const below = blast(0, 40).a, side = blast(-40, 0).a;
  assert.ok(below.va > side.va * 2, `upward ${below.va} from below, ${side.va} from the side`);
});

test('click to blast: it reaches 150 units, not further', () => {
  assert.equal(blast(-130, 0).a.state, 'launched', '130 away is inside the blast');
  assert.equal(blast(-170, 0).a.state, 'idle', '170 away is outside it');
});

test('click to blast: a knocked-out body beyond the radius is not moved', () => {
  const l = load();
  l.we.applyUserProperties({ clickblast: { value: true } });
  const [a] = place(l.game, 300, 700);
  a.hp = 0; a.ko(0, 0);
  run(l.game, 3);
  const hip = a.rag.pts.hip, before = JSON.stringify(a.rag.pts);
  l.click(hip.x + 300, hip.y);
  assert.equal(JSON.stringify(a.rag.pts), before);
});

test('click to blast: the click leaves a floor crack on the floor and a wall crack above it', () => {
  const l = load();
  l.we.applyUserProperties({ clickblast: { value: true } });
  place(l.game, 300, 700);
  const cracks = () => Array.from(l.game.fx.filter(o => o.type === 'crack'));
  l.click(500, l.game.groundY(50));
  assert.deepEqual(cracks().map(o => o.kind), ['ground']);
  l.click(500, 100);
  assert.deepEqual(cracks().map(o => [o.kind, Math.round(o.y)]), [['ground', Math.round(l.game.groundY(50))], ['wall', 100]]);
});

// ---------- Drawing ----------

test('drawing: a fighter just hit flashes white', () => {
  const { game, draw } = load();
  const [a, b] = place(game, 300, 700);
  a.flash = 0.1;
  assert.deepEqual(bodies(draw()).map(o => o.col), ['#ffffff', hsl(b)]);
});

test('drawing: a frozen fighter is drawn in ice blue', () => {
  const { game, draw } = load();
  const [a, b] = place(game, 300, 700);
  a.state = 'frozen';
  assert.deepEqual(bodies(draw()).map(o => o.col), ['#9fe8ff', hsl(b)]);
});

test('drawing: a knocked-out body is drawn at half brightness', () => {
  const { game, draw } = load();
  const [a, b] = place(game, 300, 700);
  a.hp = 0; a.ko(0, 0);
  a.alpha = 1; b.alpha = 1;
  const [ko, up] = bodies(draw());
  assert.equal(ko.col, hsl(a));
  assert.deepEqual(ko.alphas.map(v => +v.toFixed(4)), [0.275, 0.5]);
  assert.deepEqual(up.alphas.map(v => +v.toFixed(4)), [0.55, 1]);
});

test('drawing: the shield arc is on the side the fighter faces', () => {
  for (const facing of [1, -1]) {
    const { game, draw } = load();
    const [a] = place(game, 500, 700);
    a.facing = facing; a.W = a.joints();
    a.move = { type: 'shield' }; a.md = { ph: 'up' };
    const arc = draw().find(c => c[0] === 'arc' && c[3] === 34);
    assert.ok(arc, 'a shield is drawn');
    const cx = (a.W.sh.x + a.W.hip.x) / 2;
    if (facing > 0) assert.deepEqual([arc[1] - cx, arc[4], arc[5]], [-6, -1, 1]);
    else assert.deepEqual([arc[1] - cx, arc[4], arc[5]], [6, Math.PI - 1, Math.PI + 1]);
  }
});

test('drawing: no health bar over a fighter hidden in smoke', () => {
  const { game, draw } = load();
  const [a, b] = place(game, 300, 700);
  // A bar is a 26 x 2.5 back and, at full health, a fill of the same size
  const bars = () => draw().filter(c => c[0] === 'fillRect' && c[3] === 26 && c[4] === 2.5);
  assert.equal(bars().length, 4, 'one bar each while both are seen');
  a.invis = true;
  const left = bars();
  assert.equal(left.length, 2);
  for (const c of left) assert.equal(c[1], b.W.head.x - 13);
});

test('name tags: with Colorful fighters off, a tag is drawn in the line color', () => {
  const { game, we, draw } = load('?count=3&mode=ffa');
  we.applyUserProperties({ fighternames: { value: 'ann,bo,cy' }, colorful: { value: false } });
  for (const f of game.fighters) f.W = f.joints();
  const calls = draw();
  const tags = calls.map((c, i) => [c, i]).filter(([c]) => c[0] === 'fillText' && ['ann', 'bo', 'cy'].includes(c[1]));
  assert.equal(tags.length, 3);
  for (const [, i] of tags) {
    let col; for (let j = i - 1; j >= 0; j--) if (calls[j][0] === '=fillStyle') { col = calls[j][1]; break; }
    assert.equal(col, game.cfg.line);
  }
});
