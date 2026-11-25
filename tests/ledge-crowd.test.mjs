// Runs main.js in a sandbox with a stubbed canvas and window, then checks two rules for
// fighters standing on a floating platform (issue #213): two of them on one ledge are
// pushed apart the way they are on the floor, and a shuriken or boomerang hit on one
// standing on a ledge launches it no more often than on the floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=3&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  // A seeded generator (an LCG), so every run is the same
  vm.runInContext('{ let s = 1; Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: true } });
  const game = window.__stickmanBrawl;
  const p = game.platforms[0], z = 60, x = (p.x0 + p.x1) / 2;
  return { game, p, z, x, ledge: game.groundY(z) - p.y };
}
// Flinching in place: a fighter in the hit state neither walks nor attacks
const hold = (f, o) => { Object.assign(f, { va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 }, o); f.W = f.joints(); };

for (const where of ['floor', 'ledge']) {
  test('two fighters standing 4 px apart on the ' + where + ' are pushed 16 px apart', () => {
    const { game, z, x, ledge } = load();
    const [a, b, c] = game.fighters;
    const alt = where === 'ledge' ? ledge : 0;
    hold(c, { x: 1200, z: 120, alt: 0 });
    hold(a, { x, z, alt, target: c });
    hold(b, { x: x + 4, z, alt, target: c });
    for (let i = 0; i < 60; i++) {
      for (const f of [a, b, c]) Object.assign(f, { st: 0, vx: 0, va: 0, vz: 0, z: f === c ? 120 : z, alt: f === c ? 0 : alt });
      game.update(1 / 60);
    }
    assert.ok(Math.abs(b.x - a.x) > 15.9, 'gap ' + Math.abs(b.x - a.x).toFixed(2) + ' on the ' + where);
  });
}

// Throws the given number of shuriken at a fighter and counts the hits that launch it
function launches(where, n = 300) {
  const { game, z, x, ledge } = load();
  const [a, e, c] = game.fighters;
  hold(a, { x: 1200, z: 120, alt: 0 });
  hold(c, { x: 1150, z: 0, alt: 0 });
  let out = 0, hits = 0;
  e.takeHit = (_by, _m, _zone, _pt, o) => { hits++; if (o.launch) out++; };
  for (let i = 0; i < n; i++) {
    const alt = where === 'floor' ? 0 : where === 'ledge' ? ledge : ledge + 60;
    hold(e, { x, z, alt, target: a });
    const s = e.W.sh;
    game.shots.length = 0;
    game.shots.push({ x: s.x - 6, y: s.y + 4, vx: 600, vy: 0, z, owner: a, m: game.MOVES[0], life: 3, kind: 'star', col: '#fff', dmg: 2 });
    game.update(1 / 60);
  }
  assert.equal(hits, n, 'every shuriken hit');
  return out;
}

test('a shuriken hit on a fighter standing on a ledge launches it as often as on the floor', () => {
  const floor = launches('floor'), ledge = launches('ledge');
  assert.ok(floor > 30 && floor < 120, 'floor launches ' + floor + ' of 300');
  assert.ok(ledge > 30 && ledge < 120, 'ledge launches ' + ledge + ' of 300');
});

test('a shuriken hit on a fighter in the air above a ledge always launches it', () => {
  assert.equal(launches('air', 50), 50);
});
