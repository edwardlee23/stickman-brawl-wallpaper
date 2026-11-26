// Runs main.js in a sandbox with a stubbed canvas, window and AudioContext, and pins rules that
// could change with every other test still green (issue #355): music beats, wall-run reach, how
// high a target counts as in the air, ledge hits, ragdolls on ledges, the sound gap and limiter,
// shot hit pads, ice, the staff and boomerang, item pickup, crowd push, afterimages, the
// round-end burst, Ladder's bout facing and the shot ground crack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// An AudioParam and an audio node that accept every call
const param = v => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
  exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; } });
function node(extra = {}) {
  const base = { connect(n) { return n; }, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined) });
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000; this.destination = node(); this.compressors = []; FakeAudioContext.last = this; }
  createDynamicsCompressor() { const c = node({ threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }); this.compressors.push(c); return c; }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { return node({ frequency: param(440) }); }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node({ frequency: param(350), Q: param(1) }); }
  createStereoPanner() { return node({ pan: param(0) }); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

// Math.random returns context.rnd, 0.99 by default: no random jumps, dashes or blocks
function load(query = '?count=2&mode=ffa') {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const audio = [];
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {},
    AudioContext: FakeAudioContext, wallpaperRegisterAudioListener(cb) { audio.push(cb); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: query },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.rnd = 0.99;
  vm.runInContext('Math.random = () => rnd;', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const set = p => window.wallpaperPropertyListener.applyUserProperties(p);
  // An internal the wallpaper exposes for tests, by name
  const run = name => game[name];
  // Sets the platforms to the given ones, in place of those of the setting
  const ledges = list => { game.platforms.length = 0; game.platforms.push(...list); };
  return { game, audio, set, run, ledges, context };
}
// Flinching in place: a fighter in the hit state neither walks nor attacks
const hold = (f, o) => { Object.assign(f, { va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, maxHp: 1000, cool: 999 }, o); f.W = f.joints(); };

// ---------- Music ----------
const frame = bass => Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? bass : 0));
function musicOn() {
  const g = load();
  g.set({ audioreactive: { value: true }, audiostrength: { value: 100 } });
  return g;
}

test('a bass pulse every third frame gives a beat at most every sixth frame (#355)', () => {
  const { game, audio } = musicOn();
  let beats = 0;
  for (let i = 0; i < 90; i++) { audio[0](frame(i % 3 === 0 ? 0.9 : 0)); if (game.music.beat === 1) beats++; }
  assert.equal(beats, 15, '15 beats in 3 s of pulses, not ' + beats);
});

test('bass at 0.2 over a 0.12 average is no beat; at 0.3 it is (#355)', () => {
  for (const [peak, beat] of [[0.2, false], [0.3, true]]) {
    const { game, audio } = musicOn();
    for (let i = 0; i < 200; i++) audio[0](frame(0.12));
    assert.equal(game.music.beat, 0, 'steady bass under 0.15 is no beat');
    audio[0](frame(peak));
    assert.equal(game.music.beat === 1, beat, 'bass ' + peak + ' over an average of ' + game.music.avg.toFixed(3));
  }
});

// ---------- Move choice ----------
// pickMove draws one random number: sweep it evenly over [0, 1) instead of sampling
function picks(context, game, a, t, keep, steps = 2000) {
  let n = 0;
  for (let i = 0; i < steps; i++) { context.rnd = (i + 0.5) / steps; if (keep(game.pickMove(a, t))) n++; }
  context.rnd = 0.99;
  return n;
}

test('a fighter 250 from a wall can pick the wall run (#355)', () => {
  const { game, context } = load();
  const [a, e] = game.fighters;
  Object.assign(e, { x: 600, alt: 0 });
  Object.assign(a, { x: 250, alt: 0 });
  assert.ok(picks(context, game, a, e, m => m.needWall) > 0, 'no wall run picked at x 250');
});

test('a fighter in a jump counts a target 120 up as in the air, measured from the floor under it, not from its jump (#355)', () => {
  const { game, context } = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 500, alt: 100 });
  Object.assign(e, { x: 700, alt: 0 });
  const low = picks(context, game, a, e, m => m.antiAir);
  e.alt = 120;
  const high = picks(context, game, a, e, m => m.antiAir);
  assert.ok(high > low * 1.3, 'anti-air picks ' + high + ' with the target 120 up, ' + low + ' with it on the floor');
});

// ---------- Ledges ----------
test('a shot crossing two ledges stops at the first it comes down on, whatever their order (#355)', () => {
  const { run, ledges } = load();
  for (const order of [[400, 500], [500, 400]]) {
    ledges(order.map(y => ({ x0: 0, x1: 400, y })));
    const hit = run('ledgeHit')({ x: 100, y: 300 }, { x: 200, y: 600 });
    assert.equal(hit.y, 400, 'listed ' + order + ': stopped at ' + hit.y);
    assert.ok(Math.abs(hit.x - 100 / 3 - 100) < 1e-9, 'at x ' + hit.x);
  }
});

test('a ragdoll point landing on a ledge keeps 30% of its fall as a bounce and 75% of its slide (#355)', () => {
  const { run, ledges } = load();
  ledges([{ x0: 0, x1: 400, y: 500 }]);
  const o = { x: 100, y: 503, px: 98, py: 495, sy: 495 };
  run('ragPlatform')(o, 'hip');
  assert.equal(o.y, 498.5, 'put on the top');
  assert.ok(Math.abs((o.y - o.py) - -0.3 * 8) < 1e-9, 'bounce ' + (o.y - o.py));
  assert.ok(Math.abs((o.x - o.px) - 0.75 * 2) < 1e-9, 'slide ' + (o.x - o.px));
});

test('a bone across a ledge corner is pushed all the way off it, with the corner on the bone (#355)', () => {
  const { run, ledges } = load();
  ledges([{ x0: 100, x1: 300, y: 400 }]);
  const A = { x: 110, y: 398, px: 110, py: 398 }, B = { x: 90, y: 420, px: 90, py: 420 };
  run('ragCorners')({ pts: { a: A, b: B }, bones: [['a', 'b']] });
  const y = A.y + (B.y - A.y) * (100 - A.x) / (B.x - A.x);
  assert.ok(Math.abs(y - 398.5) < 0.01, 'the bone crosses the end at ' + y.toFixed(2) + ', the top is 398.5');
});

// ---------- Sound ----------
test('the same sound does not play again within 40 ms, and does after (#355)', () => {
  const { game } = load();
  game.cfg.sound = true;
  assert.equal(game.sfx('hit', 100), true);
  const ac = FakeAudioContext.last;
  ac.currentTime = 0.02;
  assert.equal(game.sfx('hit', 100), false, 'again after 20 ms');
  ac.currentTime = 0.041;
  assert.equal(game.sfx('hit', 100), true, 'again after 41 ms');
});

test('the limiter after the master starts at -10 dB (#355)', () => {
  const { game } = load();
  game.cfg.sound = true;
  game.sfx('hit', 100);
  assert.equal(FakeAudioContext.last.compressors[0].threshold.value, -10);
});

// ---------- Shots ----------
// Fires a shot of the kind sideways past e's head, gap px above its edge; returns takeHit's options or null
function shotPastHead(kind, gap) {
  const { game, run } = load();
  const [a, e] = game.fighters;
  hold(a, { x: 200, z: 50, alt: 0 });
  hold(e, { x: 600, z: 50, alt: 0 });
  let got = null;
  e.takeHit = (_by, _m, _zone, _pt, o) => { got = o; };
  const h = e.W.head, r = run('L').head;
  game.shots.push({ x: h.x - 5, y: h.y - r - gap, vx: 600, vy: 0, z: 50, owner: a, m: game.MOVES[0], life: 3, kind, col: '#fff', dmg: 5 });
  run('updateShots')(1 / 60);
  return got;
}

test('a head is hit within 3 px of its edge, not 4.5 (#355)', () => {
  const { game, run } = load();
  const e = game.fighters[1];
  hold(e, { x: 600, z: 50, alt: 0 });
  const h = e.W.head, r = run('L').head, hitTest = run('hitTest');
  assert.equal(hitTest({ x: h.x, y: h.y - r - 2 }, { x: h.x, y: h.y - r - 2 }, e.W), 'head');
  assert.equal(hitTest({ x: h.x, y: h.y - r - 4.5 }, { x: h.x, y: h.y - r - 4.5 }, e.W), null);
});

test('a fireball passing 8.5 px over a head hits it; an ice shard there misses (#355)', () => {
  assert.ok(shotPastHead('fire', 8.5), 'the fireball missed');
  assert.equal(shotPastHead('ice', 8.5), null, 'the ice shard hit');
  assert.ok(shotPastHead('ice', 6.5), 'the ice shard missed 6.5 px over');
});

test('an ice shard freezes for 1.1 s (#355)', () => {
  assert.equal(shotPastHead('ice', 0).freeze, 1.1);
});

test('a shot reaching the floor cracks it (#355)', () => {
  const { game, run } = load();
  const a = game.fighters[0];
  game.fx.length = 0;
  const gy = game.groundY(50);
  game.shots.push({ x: 900, y: gy - 2, vx: 0, vy: 600, z: 50, owner: a, m: game.MOVES[0], life: 3, kind: 'star', col: '#fff', dmg: 2 });
  run('updateShots')(1 / 60);
  assert.equal(game.shots.length, 0);
  assert.ok(game.fx.some(o => o.type === 'crack' && o.kind === 'ground' && o.y === gy), 'no ground crack at the floor');
});

test('shots still in flight when a round is decided burst where they are (#355)', () => {
  const { game } = load();
  const [a, e] = game.fighters;
  e.state = 'ko';
  game.fx.length = 0;
  game.shots.push({ x: 321, y: 222, vx: 600, vy: 0, z: 50, owner: e, m: game.MOVES[0], life: 3, kind: 'star', col: '#abc', dmg: 2 });
  game.checkRound(1 / 60);
  assert.equal(game.shots.length, 0);
  assert.ok(game.fx.some(o => o.type === 'ring' && o.x === 321 && o.y === 222), 'no burst where the shot was');
  assert.ok(a.alive);
});

// ---------- Items ----------
function withItems() {
  const g = load();
  g.game.cfg.items = true;
  const [a, e] = g.game.fighters;
  hold(e, { x: 600, z: 50, alt: 0, target: a });
  Object.assign(a, { x: 400, z: 50, alt: 0, vx: 0, va: 0, state: 'idle', cool: 0, target: e, hp: 100 });
  a.W = a.joints();
  return { ...g, a, e };
}

test('the staff reaches at most 8 px past its tip (#355)', () => {
  const { run } = load();
  for (const id of run('STAFF_STRIKES')) {
    const b = run('MOVE_BY')[id], s = run('STAFF_MOVE')[id], tip = run('staffTip'), fk = run('fk');
    const far = Math.max(tip(fk(b.A), b.hit).x, tip(fk(b.W), b.hit).x) + b.lunge * 0.7;
    assert.ok(s.range[1] <= far + 8 + 1e-9, id + ' reaches ' + s.range[1].toFixed(1) + ', its tip ' + far.toFixed(1));
  }
});

test('a staff stays in hand through its last strike and goes after it (#355)', () => {
  const { a, run } = withItems();
  hold(a, { held: { kind: 'staff', n: 0 }, move: run('STAFF_MOVE').jab, state: 'attack' });
  run('updateItems')(0);
  assert.ok(a.held, 'the staff vanished as its last strike started');
  a.move = null; a.state = 'idle';
  run('updateItems')(0);
  assert.equal(a.held, null);
});

test('a boomerang is thrown only from the ground at a hittable target (#355)', () => {
  for (const [what, set, thrown] of [['standing', () => {}, true],
    ['in the air', ({ a }) => { a.alt = 40; }, false],
    ['at an unhittable target', ({ e }) => { e.invis = true; }, false]]) {
    const g = withItems();
    g.a.held = { kind: 'boomerang' };
    set(g);
    g.run('updateItems')(0);
    assert.equal(g.a.state === 'attack' && g.a.move.id === 'boomerang', thrown, what);
  }
});

test('a boomerang leaves the hand by 0.2 s and the thrower recovers within 0.35 s after (#355)', () => {
  const { game, a, run } = withItems();
  Object.assign(a, { held: { kind: 'boomerang' }, retarget: 99, cool: 99 });
  a.startMove(run('MOVE_BY').boomerang, true);
  let start = null, thrown = null, end = null;
  for (let t = 0; t < 3 && end === null; t += 1 / 60) {
    game.update(1 / 60);
    if (start === null && a.state === 'attack') start = t;
    if (start !== null && thrown === null && game.shots.some(s => s.kind === 'boomerang')) thrown = t;
    if (thrown !== null && a.state !== 'attack') end = t;
  }
  assert.ok(start !== null && thrown !== null && end !== null, 'thrown ' + thrown + ', ended ' + end);
  assert.ok(thrown - start < 0.2, 'thrown ' + (thrown - start).toFixed(2) + ' s after the start');
  assert.ok(end - thrown < 0.35, 'recovered ' + (end - thrown).toFixed(2) + ' s after the throw');
});

test('a thrower keeps turning to its target while it throws (#355)', () => {
  const { game, a, run } = withItems();
  Object.assign(a, { held: { kind: 'boomerang' }, retarget: 99, cool: 99 });
  a.startMove(run('MOVE_BY').boomerang, true);
  game.update(1 / 60);
  assert.equal(a.move.id, 'boomerang');
  a.facing = -1;
  game.update(1 / 60);
  assert.equal(a.facing, 1);
});

test("a knocked-out thrower's boomerang does not fly back to the body (#355)", () => {
  const { a, run } = withItems();
  a.W = a.joints(); a.state = 'ko';
  const s = { x: 900, y: 300, vx: 0, vy: 0, v0x: 600, v0y: 0, age: 1.2, life: 2, owner: a, kind: 'boomerang' };
  run('steerBoomerang')(s, 1 / 60);
  assert.equal(s.life, 0);
});

test('an item above the head is not picked up; one at the hip is (#355)', () => {
  for (const [over, picked] of [[20, false], [-40, true]]) {
    const { game, a, run } = withItems();
    hold(a, { x: 400, z: 50, alt: 0 });
    const y = a.W.head.y - over, gy = game.groundY(50);
    const it = game.spawnItem('staff', a.W.hip.x, 50, gy - 6 - y);
    run('updateItems')(1e-6);
    assert.equal(!game.items.includes(it), picked, over + ' over the head');
  }
});

// ---------- Crowd push ----------
function pushed(o1, o2, { platforms = false } = {}) {
  const { game, set } = load();
  if (platforms) set({ platforms: { value: true } });
  const [a, b] = game.fighters;
  const p = game.platforms[0];
  const resolve = o => typeof o === 'function' ? o(game, p) : o;
  hold(a, resolve(o1)); hold(b, resolve(o2));
  game.update(1 / 60);
  return { a, b, game };
}

test('fighters 40 apart in depth are not pushed apart (#355)', () => {
  const { a, b } = pushed({ x: 500, z: 10, alt: 0 }, { x: 505, z: 50, alt: 0 });
  assert.ok(Math.abs(b.x - a.x - 5) < 0.01, 'gap ' + (b.x - a.x));
});

test('a fighter on a ledge is not pushed by one on the floor under it (#355)', () => {
  const { a, b } = pushed((g, p) => ({ x: (p.x0 + p.x1) / 2, z: 60, alt: g.groundY(60) - p.y }),
    (g, p) => ({ x: (p.x0 + p.x1) / 2 + 5, z: 60, alt: 0 }), { platforms: true });
  assert.ok(Math.abs(b.x - a.x - 5) < 0.01, 'gap ' + (b.x - a.x));
});

test('fighters at the same x are pushed apart, and never through a wall (#355)', () => {
  const same = pushed({ x: 500, z: 50, alt: 0 }, { x: 500, z: 50, alt: 0 });
  assert.ok(Math.abs(same.b.x - same.a.x) > 15.9, 'gap ' + (same.b.x - same.a.x));
  const left = pushed({ x: 16, z: 50, alt: 0 }, { x: 20, z: 50, alt: 0 });
  assert.ok(left.a.x >= 14, 'left wall: x ' + left.a.x);
  const W = left.game.worldW;
  const right = pushed({ x: W - 20, z: 50, alt: 0 }, { x: W - 16, z: 50, alt: 0 });
  assert.ok(right.b.x <= W - 14, 'right wall: x ' + right.b.x);
});

// ---------- Drawing state ----------
test('an invisible fighter leaves no afterimages (#355)', () => {
  for (const invis of [true, false]) {
    const { game } = load();
    const a = game.fighters[0];
    hold(a, { x: 500, z: 50, alt: 0 });
    for (let i = 0; i < 10; i++) { Object.assign(a, { trailOn: true, invis, st: 0 }); game.update(1 / 60); }
    assert.equal(a.trail.length > 0, !invis, invis ? 'invisible' : 'visible');
  }
});

test('Ladder bout fighters face each other from the start of the round (#355)', () => {
  const { game } = load('?count=4&mode=ffa');
  game.cfg.rules = 'ladder';
  game.newRound();
  const bout = game.fighters.filter(f => f.state !== 'wait').sort((p, q) => p.x - q.x);
  assert.equal(bout.length, 2);
  assert.deepEqual(Array.from(bout, f => f.facing), [1, -1]);
});
