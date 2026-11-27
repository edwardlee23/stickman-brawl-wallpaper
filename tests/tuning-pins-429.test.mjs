// Pins fight timings and tuning numbers that could change with every other test green
// (issue #429): how long specials take to end or recover, how fast they move, how often a
// fighter jumps up to a ledge, footwork and blocking, grabs, Ladder step-ins, hit stops, the
// slow-motion zoom, music beats, items, crowd pushing, click blasts, resizes and effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
// A copy of main.js that also exposes, as window.__in, the internals these tests read or call
const END_ANCHOR = 'requestAnimationFrame(frame);\n})();';
assert.ok(source.includes(END_ANCHOR), 'anchor not found in main.js');
const exposed = source.replace(END_ANCHOR, 'requestAnimationFrame(frame);\nwindow.__in = { MOVE_BY, BOOMERANG, BLOCK, GUARD,' +
  ' music, musicListener, slowmoZoom, ladderStepIn,' +
  ' get freeze() { return freeze; }, set freeze(v) { freeze = v; }, set freezeGap(v) { freezeGap = v; },' +
  ' set slowmoT(v) { slowmoT = v; }, get worldW() { return worldW; } };\n})();');

// Loads the wallpaper with a seeded Math.random (an LCG), so every run is the same. Unless park
// is false, every fighter flinches on the floor at the far right, out of the way, until a test
// moves it.
function load({ props = {}, count = 2, seed = 429, park = true } = {}) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=' + count + '&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = seed;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(exposed, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties(props);
  const game = window.__stickmanBrawl;
  for (const [i, f] of game.fighters.entries()) {
    if (park) Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
    f.W = f.joints();
  }
  return { game, inn: window.__in, window, listeners, a: game.fighters[0], e: game.fighters[1] };
}
const DT = 1 / 60;
const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, what + ': ' + v.toFixed(3) + ', want ' + want + ' +- ' + tol);

// Starts special id for a, facing e 300 to its right, and returns a step function that runs one
// frame of a's update with fresh joints
function special(w, id) {
  const { inn, a, e } = w;
  Object.assign(a, { x: 300, z: 60, alt: 0, va: 0, vx: 0, facing: 1, state: 'idle', target: e, hp: 1000 });
  Object.assign(e, { x: 600, z: 60 });
  a.W = a.joints(); e.W = e.joints();
  a.startMove(inn.MOVE_BY[id], true);
  return () => { a.update(DT); a.W = a.joints(); };
}
// Seconds until a's move ends, stepping a at most limit seconds
function untilEnd(a, step, limit = 5) {
  let t = 0;
  while (a.state === 'attack' && t < limit) { step(); t += DT; }
  assert.notEqual(a.state, 'attack', 'the move did not end within ' + limit + ' s');
  return t;
}

test('a slam recovers in a crouch for 0.35 s after it lands', () => {
  const w = load(), step = special(w, 'slam');
  Object.assign(w.a.md, { ph: 'rec', t0: 0 });
  near(untilEnd(w.a, step), 0.35, 0.05, 'recovery');
});

test('a shuriken throw holds its follow-through for 0.3 s', () => {
  const w = load(), step = special(w, 'shuriken');
  Object.assign(w.a.md, { ph: 'throw', t0: 0 });
  near(untilEnd(w.a, step), 0.3, 0.05, 'follow-through');
});

// Runs a whole energy blast; returns the time of each shot and the move's length
function blast() {
  const w = load(), step = special(w, 'blast'), { a, game } = w;
  const times = [];
  let t = 0;
  game.shots.length = 0;
  while (a.state === 'attack' && t < 5) {
    step(); t += DT;
    while (times.length < game.shots.filter(s => s.owner === a).length) times.push(t);
  }
  assert.equal(times.length, 6, 'shots fired');
  return { times, t };
}

test('an energy blast fires a shot every 0.13 s', () => {
  const { times } = blast();
  for (let i = 1; i < times.length; i++) near(times[i] - times[i - 1], 0.13, 0.02, 'gap before shot ' + (i + 1));
});

test('an energy blast ends 0.25 s after its last shot is due', () => {
  const { times, t } = blast();
  near(t - times[0], 6 * 0.13 + 0.25, 0.03, 'move length from the first shot');
});

test('a rapid-punch barrage with nothing in front of it lasts 1.3 s', () => {
  const w = load(), step = special(w, 'barrage');
  near(untilEnd(w.a, step), 1.3, 0.05, 'barrage length');
});

test("a barrage's finishing punch reaches 56 in front, no farther", () => {
  for (const [d, hit] of [[52, true], [70, false]]) {
    const w = load(), step = special(w, 'barrage'), { a, e } = w;
    Object.assign(a.md, { next: 99 });
    a.st = 0.96;
    e.x = a.x + d; e.W = e.joints();
    step();
    assert.equal(e.state === 'launched', hit, 'enemy ' + d + ' in front: ' + e.state);
  }
});

test('a teleport fades the fighter out over 0.12 s, not at once', () => {
  const w = load(), step = special(w, 'teleport'), { a } = w;
  for (let i = 0; i < 4; i++) step();
  near(a.alpha, 1 - 4 * DT / 0.12, 0.05, 'alpha after 4 frames');
  assert.equal(a.invis, false, 'gone after 4 frames');
});

test('shadow clones step out 40 to either side', () => {
  const w = load(), step = special(w, 'clones'), { a } = w;
  for (let i = 0; i < 4; i++) step();
  const [l, r] = a.md.clones;
  near(l.x - a.x, -40, 0.5, 'left clone offset');
  near(r.x - a.x, 40, 0.5, 'right clone offset');
});

test('shadow clones fade in over 0.15 s, not at once', () => {
  const w = load(), step = special(w, 'clones'), { a } = w;
  for (let i = 0; i < 4; i++) step();
  for (const c of a.md.clones) near(c.a, 4 * DT / 0.15, 0.05, 'clone alpha after 4 frames');
});

test('the rising uppercut carries the fighter forward at 150 as it leaves the ground', () => {
  const w = load(), step = special(w, 'rising'), { a } = w;
  for (let i = 0; i < 30 && a.md.ph === 0; i++) step();
  assert.equal(a.md.ph, 1, 'never left the ground');
  near(a.vx, 150, 1, 'forward speed');
});

test("a dive jumps forward at 0.6 of the distance to its target", () => {
  const w = load(), step = special(w, 'dive'), { a, e } = w;
  e.x = a.x + 200; e.W = e.joints();
  step();
  near(a.vx, 120, 1, 'forward speed 200 from the target');
});

test('under a higher ledge with its target on top, a fighter jumps up about 4 times a second', () => {
  const w = load({ props: { platforms: { value: true } } }), { game, a, e } = w;
  const p = game.platforms.reduce((h, q) => (q.y < h.y ? q : h));
  const z = 30;
  Object.assign(e, { x: (p.x0 + p.x1) / 2, z, alt: game.groundY(z) - p.y });
  const N = 3000;
  let jumps = 0;
  for (let i = 0; i < N; i++) {
    Object.assign(a, { x: (p.x0 + p.x1) / 2 + 20, z, alt: 0, va: 0, vx: 0, state: 'idle' });
    if (a.chaseSurface(e, DT)) jumps++;
  }
  near(jumps / N, 4 * DT, 0.02, 'share of frames with a jump');
});

test('under a higher ledge, a fighter walks to a spot 10 inside its end, not past it', () => {
  const w = load({ props: { platforms: { value: true } } }), { game, a, e } = w;
  const p = game.platforms.reduce((h, q) => (q.y < h.y ? q : h));
  const z = 30;
  // The target stands 1 from the ledge's right end; the fighter below stands 6 from it, so
  // the spot under the ledge (10 inside the end) is to its left and the target to its right
  Object.assign(e, { x: p.x1 - 1, z, alt: game.groundY(z) - p.y });
  let walked = 0;
  for (let i = 0; i < 50; i++) {
    Object.assign(a, { x: p.x1 - 6, z, alt: 0, va: 0, vx: 0, state: 'idle' });
    if (a.chaseSurface(e, DT)) continue;
    assert.ok(a.vx < 0, 'walked at ' + a.vx.toFixed(1));
    walked++;
  }
  assert.ok(walked > 30, 'walked ' + walked + ' of 50 times');
});

test('a fighter keeps 60 to 90 from a target it cannot hit', () => {
  for (const [d, sign] of [[45, -1], [75, 0], [105, 1]]) {
    const { a, e } = load();
    Object.assign(e, { x: 400 + d, state: 'down', st: 0, downDur: 999 });
    Object.assign(a, { x: 400, state: 'idle', cool: 999, target: e, retarget: 999, vx: 0 });
    a.updIdle(DT);
    assert.equal(Math.sign(Math.round(a.vx)), sign, d + ' from a downed target: walks at ' + a.vx.toFixed(1));
  }
});

test('a wall run takes 26 / pi footfalls a second', () => {
  const { a } = load();
  a.walk = 0;
  for (let i = 0; i < 60; i++) a.runStep(DT);
  near(a.walk, 26, 0.01, 'run cycle after 1 s');
});

test('a block raises the guard within about 0.1 s', () => {
  const { inn, a } = load();
  Object.assign(a, { state: 'block', st: 0, dur: 999 });
  a.pose = Object.assign({}, inn.GUARD);
  for (let i = 0; i < 6; i++) a.update(DT);
  for (const k of Object.keys(inn.BLOCK)) {
    const span = Math.abs(inn.BLOCK[k] - inn.GUARD[k]);
    assert.ok(Math.abs(a.pose[k] - inn.BLOCK[k]) <= span * 0.15 + 1e-9, k + ' at ' + a.pose[k].toFixed(3) + ', guard ' + inn.GUARD[k] + ', block ' + inn.BLOCK[k]);
  }
});

test('a blocked strike pushes the blocker back by 1.2 times its push plus 60', () => {
  const { inn, a, e } = load();
  const m = inn.MOVE_BY.jab;
  Object.assign(a, { x: 400, facing: 1 });
  Object.assign(e, { x: 430, facing: -1, state: 'block', st: 0, dur: 999, vx: 0 });
  e.takeHit(a, m, 'body', e.bodyPoint());
  near(e.vx, (m.push || 30) * 1.2 + 60, 1e-9, 'push-back');
});

test('a grab catches only from 35% of its active time, once the arms reach out', () => {
  const { game, a, e } = load();
  for (const m of game.MOVES.filter(q => q.grab)) {
    Object.assign(a, { x: 400, z: 60, alt: 0, facing: 1, state: 'idle', vx: 0 });
    Object.assign(e, { x: 410, z: 60, alt: 0, state: 'hit', st: 0, dur: 999, vx: 0, va: 0 });
    a.W = a.joints(); e.W = e.joints();
    a.startMove(m, true);
    let t = 0;
    while (!a.hitDone && a.state === 'attack' && t < 3) {
      a.update(DT); a.W = a.joints(); t += DT;
      Object.assign(e, { x: a.x + 10, z: 60, alt: 0, state: 'hit', st: 0, dur: 999 }); e.W = e.joints();
      a.checkHit();
    }
    assert.ok(a.hitDone, m.id + ' never caught');
    assert.ok(t >= m.wind + m.act * 0.35 - 1e-9, m.id + ' caught at ' + t.toFixed(3) + ' s, before ' + (m.wind + m.act * 0.35).toFixed(3));
    a.clearMove(); e.clearMove();
  }
});

test('under Ladder rules a fighter stepping in waits 0.3 to 0.8 s before attacking', () => {
  const { game, inn } = load({ props: { roundrules: { value: 'ladder' } }, count: 4, park: false });
  const bout = game.fighters.filter(f => f.state !== 'wait');
  const waiting = game.fighters.filter(f => f.state === 'wait');
  assert.ok(waiting.length >= 1, 'nobody waiting');
  for (const f of waiting) f.cool = 0;
  bout[0].state = 'ko';
  inn.ladderStepIn();
  const stepped = waiting.filter(f => f.state !== 'wait');
  assert.equal(stepped.length, 1, 'stepped in');
  assert.ok(stepped[0].cool >= 0.3 && stepped[0].cool <= 0.8, 'waits ' + stepped[0].cool.toFixed(3) + ' s');
});

test('a fighter splatted on a wall starts a 0.07 s hit stop', () => {
  const { inn, a } = load();
  Object.assign(a, { x: 20, alt: 60, state: 'launched', st: 0, vx: -600, va: 0, juggle: 0 });
  inn.freeze = 0; inn.freezeGap = 0;
  a.updLaunched(DT);
  assert.equal(a.state, 'splat');
  near(inn.freeze, 0.07, 1e-9, 'hit stop');
});

test('the slow-motion zoom is all the way in 0.2 s after the knockout', () => {
  const { game, inn } = load();
  game.cfg.reduceMotion = false;
  inn.slowmoT = 0.2;
  near(inn.slowmoZoom().z, 1.4, 1e-9, 'zoom at 0.2 s');
  inn.slowmoT = 0.1;
  near(inn.slowmoZoom().z, 1.2, 1e-9, 'zoom at 0.1 s');
});

test('a bass beat counts from a bass level of 0.15', () => {
  for (const [bass, beat] of [[0.18, true], [0.12, false]]) {
    const { game, inn } = load();
    game.cfg.audio = true;
    const a = new Array(128).fill(0);
    for (let i = 0; i < 128; i++) if (i % 64 < 6) a[i] = bass;
    inn.musicListener(a);
    assert.equal(inn.music.beat === 1, beat, 'bass ' + bass + ': beat ' + inn.music.beat);
  }
});

test('after a move a fighter waits 0.15 to 0.7 s', () => {
  const { inn, a } = load();
  let hi = 0, lo = Infinity;
  for (let i = 0; i < 400; i++) {
    a.startMove(inn.MOVE_BY.jab, true);
    a.endMove();
    hi = Math.max(hi, a.cool); lo = Math.min(lo, a.cool);
  }
  assert.ok(lo >= 0.15 && lo < 0.2, 'shortest wait ' + lo.toFixed(3));
  assert.ok(hi <= 0.7 && hi > 0.65, 'longest wait ' + hi.toFixed(3));
});

test('a thrown boomerang flies out 300 before it turns back', () => {
  const { game, inn, a, e } = load({ props: { items: { value: true } } });
  Object.assign(a, { x: 200, z: 60, facing: 1, state: 'idle', target: e, held: { kind: 'boomerang' } });
  Object.assign(e, { x: 900, z: 60 });
  a.W = a.joints(); e.W = e.joints();
  game.shots.length = 0;
  a.startMove(inn.BOOMERANG, true);
  let s = null, x0 = 0, far = 0;
  for (let i = 0; i < 300; i++) {
    a.update(DT); a.W = a.joints();
    if (!s && game.shots.length) { s = game.shots[0]; x0 = s.x; }
    if (s) { game.updateShots(DT); far = Math.max(far, s.x - x0); if (!game.shots.includes(s)) break; }
  }
  assert.ok(s, 'never thrown');
  near(far, 300, 20, 'farthest out');
});

test('a fighter in the air picks a new target once its target is knocked out', () => {
  const { a, e, game } = load({ count: 3 });
  const c = game.fighters[2];
  Object.assign(a, { x: 400, alt: 150, va: 0, state: 'air', cool: 999, dash: 0, target: e });
  Object.assign(c, { x: 500 });
  e.state = 'ko';
  a.updAir(DT);
  assert.equal(a.target, c);
});

test('only a fighter standing, in the air, attacking, flinching or blocking picks up an item', () => {
  for (const [state, takes] of [['idle', true], ['frozen', false], ['down', false]]) {
    const { game, a } = load({ props: { items: { value: true } } });
    Object.assign(a, { x: 400, z: 60, alt: 0, state, st: 0, dur: 999, downDur: 999, hp: 50, maxHp: 100 });
    a.W = a.joints();
    game.items.length = 0;
    game.spawnItem('heart', a.W.hip.x, 60, 0);
    game.updateItems(DT);
    assert.equal(a.hp > 50, takes, state + ': hp ' + a.hp);
  }
});

test('a fighter more than 20 above the floor does not push one below it aside', () => {
  for (const [high, pushed] of [[0, true], [30, false]]) {
    const { game, a, e } = load();
    // The higher one comes first in the list: the pair is checked from its side
    Object.assign(a, { x: 400, z: 60, alt: high, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hover: true });
    Object.assign(e, { x: 405, z: 60, alt: high ? 15 : 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hover: true });
    game.update(DT);
    assert.equal(e.x - a.x > 6, pushed, 'alt ' + a.alt.toFixed(1) + ' over ' + e.alt.toFixed(1) + ': ' + (e.x - a.x).toFixed(2) + ' apart');
  }
});

test('a click blast pushes the points of a body harder the closer they are', () => {
  const { game, a, listeners } = load({ props: { clickblast: { value: true } } });
  Object.assign(a, { x: 400, z: 60, alt: 0 });
  a.W = a.joints();
  a.ko(0, 0);
  const pts = Object.values(a.rag.pts);
  for (const o of pts) { o.px = o.x; o.py = o.y; }
  const S = 720 / 540, x = a.rag.pts.hip.x + 60, y = a.rag.pts.hip.y;
  for (const f of listeners.pointerdown) f({ button: 0, clientX: x * S, clientY: y * S, timeStamp: 1e6 });
  const RAG_H = 1 / 120;
  const v = pts.map(o => [Math.hypot(o.x - x, o.y - y), Math.hypot((o.x - o.px) / RAG_H, (o.y - o.py) / RAG_H + 250)]).sort((p, q) => p[0] - q[0]);
  for (const [d, s] of v) near(s, 300 + 600 * (1 - d / 150), 1, 'push ' + d.toFixed(0) + ' from the click');
  assert.ok(v[0][1] - v[v.length - 1][1] > 100, 'nearest ' + v[0][1].toFixed(0) + ', farthest ' + v[v.length - 1][1].toFixed(0));
});

test("under Ladder rules a resize moves a thrown fighter's path with the screen", () => {
  const { game, window, listeners } = load({ props: { roundrules: { value: 'ladder' } }, count: 3, park: false });
  const f = game.fighters.find(q => q.state !== 'wait');
  const oldW = game.worldW;
  f.state = 'thrown'; f.st = 0;
  f.th = { hx0: 300, hx1: 600, hx: 450, hy0: 300, hy1: 380, hy: 340, arc: 60, dur: 0.6, lie: 20 };
  window.innerWidth = 640;
  for (const r of listeners.resize) r();
  const k = game.worldW / oldW;
  assert.ok(k < 0.9, 'the world did not get narrower');
  near(f.th.hx0, 300 * k, 1e-6, 'throw start');
  near(f.th.hx1, 600 * k, 1e-6, 'throw end');
  near(f.th.hx, 450 * k, 1e-6, 'hip now');
});

test('an effect is removed once its time is up', () => {
  const { game } = load();
  const o = { type: 'ring', x: 100, y: 100, r0: 2, r1: 40, dur: 0.3, w: 2, t: 0 };
  game.fx.push(o);
  for (let t = 0; t < 0.32; t += DT) game.update(DT);
  assert.ok(!game.fx.includes(o), 'still there at 0.32 s');
});
