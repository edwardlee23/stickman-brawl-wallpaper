// Runs main.js in a sandbox with a recording canvas, to check that head decorations follow
// how the drawn head is turned (issue #250): head gear points the way drawFacing() points,
// so a back kick or shoulder throw does not put it on the back of the head, and the crown
// sits on top of the head along the neck, not over the neck of an upside-down king
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper; calls records every canvas method call, and every property set as
// ['set', name, value]
function load(search) {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return grad; },
    set: (_, k, v) => { calls.push(['set', k, v]); return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return { game: window.__stickmanBrawl, we: window.wallpaperPropertyListener, calls };
}
const R = 8;   // L.head

// Every straight segment drawn: a moveTo and the lineTo after it
function segments(calls) {
  const out = [];
  for (let i = 0; i + 1 < calls.length; i++) {
    if (calls[i][0] === 'moveTo' && calls[i + 1][0] === 'lineTo') out.push([calls[i].slice(1), calls[i + 1].slice(1)]);
  }
  return out;
}

// The front-pointing segment of each kind of gear, in the head's frame: u is along the neck,
// p across it; start is the segment start along u, len its length across p, in head radii
const FRONT = {
  headband: { start: 0.4, len: 2 },   // The band, from the back of the head to the front
  mask: { start: 0.4, len: 1 },       // The upper eye slit, from the middle to the front
  cap: { start: 0.3, len: 2.9 },      // The band and brim, from the back to the brim tip
};

// Which way, across the neck, the gear of fighter i points: +1 or -1 in the head's p
function gearSide(i, spin) {
  const { game, we, calls } = load('?count=4&mode=ffa');
  we.applyUserProperties({ headgear: { value: true } });
  const f = game.fighters[i];
  const kind = game.gearOf(f);
  f.spin = spin;
  for (const g of game.fighters) g.W = g.joints();
  calls.length = 0; game.render();
  const J = f.W, h = J.head;
  const d = Math.hypot(h.x - J.sh.x, h.y - J.sh.y), ux = (h.x - J.sh.x) / d, uy = (h.y - J.sh.y) / d;
  const px = -uy, py = ux;
  const { start, len } = FRONT[kind];
  const hits = segments(calls).filter(([a, b]) => {
    const au = (a[0] - h.x) * ux + (a[1] - h.y) * uy;
    const across = (b[0] - a[0]) * px + (b[1] - a[1]) * py;
    const along = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy;
    return Math.abs(au - start * R) < 1e-6 && Math.abs(Math.abs(across) - len * R) < 1e-6 && Math.abs(along) < 1e-6;
  });
  assert.equal(hits.length, 1, kind + ': found ' + hits.length + ' front segments');
  const [a, b] = hits[0];
  return { kind, side: Math.sign((b[0] - a[0]) * px + (b[1] - a[1]) * py), face: f.drawFacing(), f };
}

for (const i of [0, 1, 2]) {
  for (const spin of [false, true]) {
    test(`head gear of fighter ${i + 1} points the way the body faces, ${spin ? 'spinning' : 'not spinning'}`, () => {
      const { kind, side, face, f } = gearSide(i, spin);
      assert.equal(face, spin ? -f.facing : f.facing);
      // p is the face direction for facing +1, as v = p * facing in drawHeadgear
      assert.equal(side, face, kind + ' points ' + side + ', the body ' + face);
    });
  }
}

// The crown's seven corners as drawn for the king, with its joints given by pose
function crown(pose) {
  const { game, we, calls } = load('?count=6&mode=ffa');
  we.applyUserProperties({ roundrules: { value: 'king' } });
  game.newRound();
  const k = game.fighters.find(f => f.king);
  assert.ok(k, 'no king');
  for (const g of game.fighters) g.W = g.joints();
  k.W = pose(k.W);
  calls.length = 0; game.render();
  const at = calls.findIndex(c => c[0] === 'set' && c[1] === 'fillStyle' && c[2] === '#ffd43b');
  assert.ok(at >= 0, 'no crown drawn');
  const pts = calls.slice(at).filter(c => c[0] === 'lineTo').slice(0, 7).map(c => ({ x: c[1], y: c[2] }));
  return { pts, J: k.W };
}
const mean = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('an upright king wears the crown where it always did, on top of the head', () => {
  const { pts, J } = crown(J => J);
  const x = J.head.x, y = J.head.y - R - 1;
  const want = [[-7, 0], [-7, -7], [-3.5, -3], [0, -8], [3.5, -3], [7, -7], [7, 0]];
  // An upright head is not quite straight above the shoulders, so allow for a slight tilt
  pts.forEach((p, n) => assert.ok(Math.hypot(p.x - (x + want[n][0]), p.y - (y + want[n][1])) < 2.5, 'corner ' + n + ' at ' + p.x + ',' + p.y));
});

test('while the king is upside down, the crown is beyond the head, away from the shoulders', () => {
  // The pose mirrored about the hip, so the head is below the shoulders
  const { pts, J } = crown(J => {
    const out = {};
    for (const [n, p] of Object.entries(J)) out[n] = { x: p.x, y: 2 * J.hip.y - p.y };
    return out;
  });
  assert.ok(J.head.y > J.sh.y, 'the head is below the shoulders');
  const c = mean(pts);
  assert.ok(dist(c, J.sh) > dist(J.head, J.sh), `crown centre ${c.x.toFixed(1)},${c.y.toFixed(1)} is not beyond the head at ${J.head.x.toFixed(1)},${J.head.y.toFixed(1)}`);
});
