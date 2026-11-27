// Runs main.js in a sandbox with a stubbed canvas and window, and pins the limits of earlier
// fixes that could be undone with every other test green (issue #427): the guard of a fighter
// left waiting after a Ladder DRAW (#313), strike depth (#263, #393), the height and path
// limits of warn() (#382), the back shin in hitTest (#320), the staff's reach (#355), the
// lightning hit radius (#181), the item pickup depth (#182), the retarget time (#319) and the
// stereo pan (#66). Each test checks just inside and just outside its limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, lcg } from './load-main.mjs';

// main.js also exposes, as window.__in, the internals these tests read or call
const EXPOSE = 'window.__in = { hitTest, MOVE_BY, STAFF_MOVE, STAFF_STRIKES, staffTip, fk, get worldW() { return worldW; } };';

const DT = 1 / 60;

// An audio node whose params are plain values, enough for sfx() to build a sound
function node(extra = {}) {
  const param = v => ({ value: v, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; } });
  const base = { connect: n => n, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(base, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? (o[k] = param(0)) : undefined) });
}
class FakeAudioContext {
  static last = null;
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000;
    this.destination = node(); this.panners = [];
    FakeAudioContext.last = this;
  }
  createDynamicsCompressor() { return node(); }
  suspend() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
  createGain() { return node(); }
  createOscillator() { return node(); }
  createBufferSource() { return node(); }
  createBiquadFilter() { return node(); }
  createStereoPanner() { const p = node({ pan: { value: 0 } }); this.panners.push(p); return p; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}

// Loads the wallpaper with a seeded Math.random (an LCG), or context.__rnd when a test sets it
function load({ props = {}, count = 2, seed = 427, sound = false } = {}) {
  const next = lcg(seed);
  let context = null;
  const { game, window, context: c } = loadMain({
    search: '?count=' + count + '&mode=ffa' + (sound ? '&sound=1' : ''),
    window: sound ? { AudioContext: FakeAudioContext } : {},
    random: () => context?.__rnd ?? next(),
    expose: EXPOSE, properties: props,
  });
  context = c; context.__rnd = null;
  return { game, inn: window.__in, context };
}

const held = { vx: 0, vz: 0, va: 0, cool: 999, retarget: 999, hp: 1000 };
const still = { ...held, state: 'hit', st: 0, dur: 999 };
const special = (game, id) => [...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const reacted = b => b.state !== 'idle' || b.evade > 0 || !!b.subFrom;

// ---------- #313 ----------
test('Ladder: a fighter knocked out of its cheer at the peak stands in guard under the DRAW (#313)', () => {
  const { game } = load({ props: { roundrules: { value: 'ladder' } }, count: 3, seed: 1 });
  const fighting = game.fighters.filter(f => f.alive && f.state !== 'wait');
  const [c] = game.fighters.filter(f => f.state === 'wait');
  assert.equal(fighting.length, 2);
  // The cheer is 0.5 + 0.5 sin(time * 5 + id): set its time so the next update is at the peak
  for (const f of fighting) Object.assign(f, still);
  c.time = (Math.PI / 2 - c.id) / 5 + 2 * Math.PI;
  game.update(DT);
  assert.ok(c.pose.aF > 2.5 && c.pose.aB > 2.5, 'the cheer is not at its peak: aF ' + c.pose.aF.toFixed(2));
  for (const f of fighting) { f.hp = 0; f.koPending = true; }
  game.update(DT);
  assert.equal(game.winnerText, 'DRAW');
  for (let t = 0; t < 4.4; t += DT) {
    game.update(DT);
    // VICTORY raises both arms overhead (aF 2.9, aB 3.0); GUARD holds them at 0.95 and 0.45
    assert.ok(c.pose.aF < 2 && c.pose.aB < 2, 'arms up after ' + t.toFixed(2) + ' s: aF ' + c.pose.aF.toFixed(2) + ', aB ' + c.pose.aB.toFixed(2));
  }
});

// ---------- #263, #393 ----------
// a idle on the floor at x 400 facing e at x 430, who flinches (so it does not react)
function face(o = {}) {
  const l = load(o);
  const [a, e] = l.game.fighters;
  Object.assign(e, still, { x: 430, z: 60, alt: 0, facing: -1 });
  Object.assign(a, held, { x: 400, z: 60, alt: 0, facing: 1, state: 'idle', target: e });
  e.W = e.joints(); a.W = a.joints();
  return { ...l, a, e };
}

test('a strike hits an enemy 16 deep, not 17 deep (#263, #393)', () => {
  for (const [dz, hit] of [[16, true], [17, false]]) {
    const { a, e } = face();
    e.z = 60 + dz;
    e.W = e.joints();
    const c = e.bodyPoint();
    assert.equal(!!a.sweepHit({ x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }), hit, 'depth gap ' + dz);
  }
});

// ---------- #382 ----------
// a on the floor at x 400 casts shadow clones at b, an idle enemy at x 450, bAlt up (the clones
// warn only their target, #415). Returns b once the move has run its course or b reacted.
function clones(bAlt) {
  const { game, context } = load({ count: 3 });
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  const [a, t, b] = game.fighters;
  Object.assign(a, held, { x: 400, z: 50, alt: 0, facing: 1, state: 'idle', target: b });
  Object.assign(t, still, { x: 700, z: 50, alt: 0, facing: -1, target: a });
  Object.assign(b, held, { x: 450, z: 50, alt: bAlt, facing: -1, state: 'idle', target: a });
  context.__rnd = 0.3;   // warn() rolls a dodge
  const m = special(game, 'clones');
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(m);
  for (let k = 0; k < 90 && a.move === m && !reacted(b); k++) {
    for (const f of game.fighters) f.W = f.joints();
    a.update(DT);
  }
  return b;
}

test('an enemy 44 above shadow clones dodges them; one 46 above does not (#382)', () => {
  assert.ok(reacted(clones(44)), 'the enemy 44 up did not dodge');
  assert.ok(!reacted(clones(46)), 'the enemy 46 up dodged clones that cannot reach it');
});

test('an enemy whose body is 24 from a shot\'s line blocks; one 26 from it does not (#382)', () => {
  for (const [d, blocks] of [[24, true], [26, false]]) {
    const { game, context, a, e } = face();
    Object.assign(e, { state: 'idle', x: 600 });
    e.W = e.joints();
    a.move = special(game, 'fireball');
    context.__rnd = 0.1;   // warn() rolls a block
    // A flat line d above the head, the part of the body nearest to it
    const y = e.W.head.y - d;
    a.warn(1000, false, false, [{ O: { x: e.x - 200, y }, E: { x: e.x + 200, y } }]);
    assert.equal(reacted(e), blocks, 'line ' + d + ' above the head: ' + e.state);
  }
});

// ---------- #320 ----------
test('a strike at the back shin hits the leg; 4.6 off it, it misses (#320)', () => {
  const { game, inn } = load();
  const [f] = game.fighters;
  Object.assign(f, { x: 400, z: 60, alt: 0, state: 'idle' });
  const W = f.joints(), k = W.kB, ft = W.fB;
  const P = { x: (k.x + ft.x) / 2, y: (k.y + ft.y) / 2 };
  assert.equal(inn.hitTest(P, P, W), 'leg', 'missed the back shin at its midpoint');
  // Off the shin, square to it, on the side away from the front leg
  const len = Math.hypot(ft.x - k.x, ft.y - k.y), nx = -(ft.y - k.y) / len, ny = (ft.x - k.x) / len;
  const side = Math.sign((W.fF.x - P.x) * nx + (W.fF.y - P.y) * ny) || 1;
  for (const [off, zone] of [[4.4, 'leg'], [4.6, null]]) {
    const Q = { x: P.x - side * nx * off, y: P.y - side * ny * off };
    assert.equal(inn.hitTest(Q, Q, W), zone, off + ' off the back shin');
  }
});

// ---------- #355 ----------
test('a staff strike reaches 8 px past its tip, no less and no more (#355)', () => {
  const { inn } = load();
  for (const id of inn.STAFF_STRIKES) {
    const b = inn.MOVE_BY[id], s = inn.STAFF_MOVE[id];
    const far = Math.max(inn.staffTip(inn.fk(b.A), b.hit).x, inn.staffTip(inn.fk(b.W), b.hit).x) + b.lunge * 0.7;
    assert.ok(s.range[1] > far + 7.9 && s.range[1] < far + 8.1, id + ' reaches ' + s.range[1].toFixed(1) + ', its tip ' + far.toFixed(1));
  }
});

// ---------- #181 ----------
test('lightning hits an enemy 24 from where it falls, not one 25 away (#181)', () => {
  for (const [dx, hit] of [[24, true], [25, false]]) {
    const { game } = load({ count: 3 });
    const [a, t, f] = game.fighters;
    Object.assign(a, held, { x: 900, z: 50, alt: 0, facing: -1, state: 'idle', target: t });
    Object.assign(t, still, { x: 600, z: 50, alt: 0 });
    Object.assign(f, still, { x: 600 - dx, z: 50, alt: 0 });
    for (const g of game.fighters) g.W = g.joints();
    a.startMove(special(game, 'lightning'));
    for (let s = 0; s < 1 && a.move; s += DT) { for (const g of game.fighters) g.W = g.joints(); a.update(DT); }
    assert.ok(t.hp < 1000, 'lightning missed its target');
    assert.equal(f.hp < 1000, hit, 'enemy ' + dx + ' from the bolt');
  }
});

// ---------- #182 ----------
test('an item 16 deep away is picked up, one 17 deep away is not (#182)', () => {
  for (const [dz, picked] of [[16, true], [17, false]]) {
    const { game } = load();
    game.cfg.items = true;
    const [a, e] = game.fighters;
    Object.assign(a, still, { x: 400, z: 60, alt: 0, hp: 50 });
    Object.assign(e, still, { x: 800, z: 60, alt: 0 });
    a.W = a.joints(); e.W = e.joints();
    const heart = game.spawnItem('heart', a.W.hip.x, 60 - dz, 0);
    game.update(DT);
    assert.equal(!game.items.includes(heart), picked, 'heart ' + dz + ' deep away');
  }
});

// ---------- #319 ----------
test('an idle fighter picks its target again 1.2 to 3 s later, the whole span (#319)', () => {
  for (const [roll, lo, hi] of [[0, 1.2, 1.21], [0.9999, 2.99, 3]]) {
    const { context, game } = load();
    const [a, e] = game.fighters;
    Object.assign(a, held, { x: 400, z: 60, alt: 0, state: 'idle', target: e, retarget: 0 });
    Object.assign(e, still, { x: 600, z: 60, alt: 0 });
    a.W = a.joints(); e.W = e.joints();
    context.__rnd = roll;
    a.updIdle(DT);
    assert.ok(a.retarget >= lo && a.retarget <= hi, 'roll ' + roll + ': next pick in ' + a.retarget.toFixed(3) + ' s');
  }
});

// ---------- #66 ----------
test('a sound at mid-screen is centred, and one a quarter across pans 0.3 left (#66)', () => {
  const { game, inn } = load({ sound: true });
  const W = inn.worldW;
  game.sfx('hit', W / 2);
  const ac = FakeAudioContext.last;
  ac.currentTime += 10;
  game.sfx('hit', W / 4);
  const [mid, quarter] = ac.panners.map(p => p.pan.value);
  assert.ok(Math.abs(mid) < 1e-9, 'mid-screen pans ' + mid);
  assert.ok(Math.abs(quarter + 0.3) < 1e-9, 'a quarter across pans ' + quarter);
});
