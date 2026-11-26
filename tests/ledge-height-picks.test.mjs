// Runs main.js in a sandbox with floating platforms on and checks how pickMove measures heights
// on ledges. A dive from the floor jumps only about 148 high, so it is not picked against a
// target on a ledge higher than that, where it always missed (issue #339). Heights are measured
// from the surface each fighter stands on, so two fighters on one ledge are level whatever
// their depths and the move mix does not change with the depth gap (issue #350).
// Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

function load(seed) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = seed >>> 0;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  return window.__stickmanBrawl;
}
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);
const middle = game => game.platforms.reduce((q, r) => (r.y < q.y ? r : q));   // The middle ledge is the highest
const left = game => game.platforms.reduce((q, r) => (r.x0 < q.x0 ? r : q));

// a on the floor 150 left of the ledge's middle; e flinching on the ledge at the same depth z
function floorToLedge(game, p, z) {
  const [a, e] = game.fighters, mid = (p.x0 + p.x1) / 2;
  Object.assign(a, { x: mid - 150, z, alt: 0, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: mid, z, alt: game.groundY(z) - p.y, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  return [a, e];
}
function divePicks(game, a, e) {
  let n = 0;
  for (let i = 0; i < 2000; i++) if (game.pickMove(a, e, 150).id === 'dive') n++;
  return n;
}

test('the dive is not picked from the floor against a target on a ledge above its jump (#339)', () => {
  for (const z of [40, 60, 90]) {
    const game = load(z);
    const [a, e] = floorToLedge(game, middle(game), z);
    assert.ok(e.alt >= 165, `z ${z}: target alt ${e.alt}`);
    assert.equal(divePicks(game, a, e), 0, `z ${z}: dive picks against a target ${e.alt.toFixed(0)} up`);
  }
});

test('such a dive would miss, and one at a ledge in reach is still picked and hits (#339)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const out = [];
    for (const [pick, z] of [[middle, 40], [left, 20]]) {
      const game = load(seed);
      const [a, e] = floorToLedge(game, pick(game), z);
      const picks = divePicks(game, a, e);
      a.startMove(byId(game, 'dive'));
      for (let t = 0; t < 3 && a.state === 'attack'; t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
      out.push({ alt: e.alt, picks, hits: game.stats.hits.dive || 0 });
    }
    assert.equal(out[0].hits, 0, `seed ${seed}: a dive at a target ${out[0].alt.toFixed(0)} up hit`);
    assert.ok(out[1].picks > 0, `seed ${seed}: no dive picked at a target ${out[1].alt.toFixed(0)} up`);
    assert.equal(out[1].hits, 1, `seed ${seed}: dive at a target ${out[1].alt.toFixed(0)} up`);
  }
});

// Both on the left ledge, a at depth 0 and e dz deeper, 20 in front of a. Counts picks by kind.
function sameLedgeMix(dz) {
  const game = load(7);
  const p = left(game), [a, e] = game.fighters, x = (p.x0 + p.x1) / 2 - 10;
  Object.assign(a, { x, z: 0, alt: game.groundY(0) - p.y, va: 0, vx: 0, vz: 0, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: x + 20, z: dz, alt: game.groundY(dz) - p.y, va: 0, vx: 0, vz: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: a });
  assert.ok(!a.aloft() && !e.aloft(), 'both stand on the ledge');
  const mix = { moves: 0, sameAlt: 0, antiAir: 0 };
  for (let i = 0; i < 20000; i++) {
    const m = game.pickMove(a, e);
    if (!m.type) mix.moves++;
    else if (m.sameAlt) mix.sameAlt++;
    else if (m.antiAir) mix.antiAir++;
  }
  return mix;
}

test('two fighters on one ledge get the same move mix at a 60 depth gap as at none (#350)', () => {
  const flat = sameLedgeMix(0), deep = sameLedgeMix(60);
  for (const k of Object.keys(flat)) {
    assert.ok(flat[k] > 500, `${k}: only ${flat[k]} picks at no depth gap`);
    assert.ok(Math.abs(deep[k] - flat[k]) < flat[k] * 0.15, `${k}: ${flat[k]} picks at no depth gap, ${deep[k]} at 60`);
  }
});
