// Runs main.js in a sandbox with a stubbed canvas and window, to pin ragdoll and hit box
// rules that no other test notices breaking (issue #320): a body slid back on screen by a
// resize stays put (issue #45), a body at rest keeps its head on the floor's edge rather than
// in it (issue #265), bodies bounce off the floor and the ceiling, and every part of the hit
// box, the back thigh and the padded head included, can be struck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const DT = 1 / 60;
const HEAD = 8;   // L.head

function load([w, h] = [1280, 720]) {
  const listeners = {};
  const { game, window } = loadMain({
    search: '?count=4&mode=ffa', width: w, height: h,
    window: {
      addEventListener: (t, f) => (listeners[t] ||= []).push(f),
      resize(w, h) { this.innerWidth = w; this.innerHeight = h; for (const f of listeners.resize) f(); },
    },
  });
  // Everyone stays out of the way, flinching on the floor, so no blow or round end disturbs the test
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 300 + i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
    f.W = f.joints();
  }
  return { game, a: game.fighters[0], e: game.fighters[1], window };
}
const run = (game, s, each) => { for (let t = 0; t < s; t += DT) { game.update(DT); if (each) each(); } };

test('a body slid back on screen by a resize keeps still there (issue #45)', () => {
  const { game, a, window } = load();
  Object.assign(a, { x: 940 }); a.W = a.joints();
  a.ko(300, -100);
  run(game, 6);
  window.resize(640, 720);
  const moving = Object.entries(a.rag.pts).filter(([, o]) => Math.abs(o.x - o.px) > 0.01);
  assert.deepEqual(moving.map(([k, o]) => `${k} ${(o.x - o.px).toFixed(2)}`), [], 'points given a speed by the slide');
  const hip = a.rag.pts.hip, x0 = hip.x;
  let far = 0;
  run(game, 1, () => { far = Math.max(far, Math.abs(hip.x - x0)); });
  assert.ok(far < 2, `the hip moved ${far.toFixed(1)} in the second after the resize`);
});

test('a body at rest on the floor keeps its head centre a head radius above it (issue #265)', () => {
  for (const [vx, vy] of [[0, 0], [300, -250], [-300, -250], [0, -600]]) {
    const { game, a } = load();
    Object.assign(a, { x: 480 }); a.W = a.joints();
    a.ko(vx, vy);
    const gy = game.groundY(a.z);
    let low = -Infinity;
    run(game, 6, () => { low = Math.max(low, a.rag.pts.head.y); });
    const at = `knocked out at ${vx}, ${vy}`;
    assert.ok(low <= gy - HEAD + 1e-6, `${at}: head centre came within ${(gy - low).toFixed(2)} of the floor`);
    // The head ends on the floor's edge, so the test sees the margin at work
    assert.ok(gy - a.rag.pts.head.y < HEAD + 1, `${at}: head rests ${(gy - a.rag.pts.head.y).toFixed(2)} above the floor`);
  }
});

// Takes the bones out of a knocked-out body, so each point flies on its own and a bounce is
// not hidden by the pull of the bones on it; then sets every point at height y moving at vy
function loosePoints(game, a, y, vy) {
  Object.assign(a, { x: 480 }); a.W = a.joints();
  a.ko(0, 0);
  a.rag.bones = [];
  const P = Object.values(a.rag.pts);
  P.forEach((o, i) => { o.x = 380 + i * 20; o.px = o.x; o.y = y; o.py = y - vy / 120; });
  return P;
}

test('a body falling onto the floor bounces up off it', () => {
  const { game, a } = load();
  const gy = game.groundY(a.z);
  const P = loosePoints(game, a, gy - 60, 600);
  // Each point's highest height above the floor after it first touched it
  const touched = P.map(() => false), rise = P.map(() => 0);
  run(game, 1, () => P.forEach((o, i) => {
    const h = gy - o.y - (o === a.rag.pts.head ? HEAD : 1.5);
    if (h < 1e-6) touched[i] = true;
    else if (touched[i]) rise[i] = Math.max(rise[i], h);
  }));
  assert.ok(touched.every(Boolean), 'a point never reached the floor');
  for (const r of rise) assert.ok(r > 5, `a point bounced only ${r.toFixed(2)} off the floor`);
});

test('a body flying into the ceiling bounces down off it', () => {
  const { game, a } = load();
  const P = loosePoints(game, a, 60, -1200);
  // Each point's speed down in the first step after it touched the ceiling
  const down = P.map(() => null);
  for (let i = 0; i < 60; i++) {
    game.update(1 / 120);
    P.forEach((o, j) => {
      const m = o === a.rag.pts.head ? HEAD : 4;
      if (down[j] === null && o.y <= m + 1e-6 && o.py < o.y - 1e-6) down[j] = (o.y - o.py) * 120;
    });
  }
  assert.ok(down.every(v => v !== null), 'a point never bounced off the ceiling');
  for (const v of down) assert.ok(v > 200, `a point left the ceiling at ${v.toFixed(1)} a second`);
});

// A made-up skeleton far from everyone else, for striking one part of the hit box at a time
function skeleton() {
  const p = (x, y) => ({ x, y });
  return { head: p(700, 240), sh: p(700, 260), hip: p(700, 300), eB: p(700, 260), hB: p(700, 260), eF: p(700, 260), hF: p(700, 260),
    kF: p(670, 330), fF: p(670, 370), kB: p(730, 330), fB: p(730, 370) };
}
// Strikes the made-up skeleton at one point; returns the zone hit, or null
function striker() {
  const { a, e } = load();
  Object.assign(e, { state: 'hit', z: a.z });
  e.W = skeleton();
  assert.ok(e.hittable);
  return (P, pad = 0) => {
    const r = a.sweepHit(P, P, pad);
    if (r) assert.equal(r[0], e, 'struck someone else');
    return r ? r[1] : null;
  };
}

test('a strike through only the back thigh hits a leg', () => {
  const hit = striker();
  // Midway down the back thigh, more than 20 from every other part
  assert.equal(hit({ x: 715, y: 315 }), 'leg');
  // The front thigh, mirrored, too
  assert.equal(hit({ x: 685, y: 315 }), 'leg');
});

test('a padded strike hits the head from as far as its pad reaches', () => {
  const hit = striker();
  // Above the head, 14.5 from its centre: inside L.head + 3 + 4, outside L.head + 3
  const P = { x: 700, y: 240 - 14.5 };
  assert.equal(hit(P, 4), 'head');
  assert.equal(hit(P, 0), null);
});
