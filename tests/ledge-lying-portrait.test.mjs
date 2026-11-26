// Runs main.js in a sandbox on a portrait screen with floating platforms on and checks that a
// fighter knocked down onto a side ledge stays on it while lying (issue #384). The landing slide
// kept the body on the ledge, but keeping the lying body inside the side walls (issue #244)
// then pushed it off the ledge when the body pointed at the near wall: on a 720x1280 screen the
// gap between a side ledge and the wall is shorter than a lying body, so the fighter fell to the
// floor lying down. Math.random is seeded, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');
const DT = 1 / 60;

function load(seed, w, h) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: w, innerHeight: h, devicePixelRatio: 1, addEventListener() {} };
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

// Launches a onto the given side ledge at x, falling just above it, and runs the game until a
// gets up. Returns each step of its fall, down and getup states where a was below the ledge,
// or where a joint was within 4 of a side wall (issue #244).
function landOnLedge(w, h, side, u, facing, rot) {
  const game = load(1, w, h);
  const ps = [...game.platforms].sort((p, q) => p.x0 - q.x0);
  const p = side < 0 ? ps[0] : ps.at(-1);
  const z = 80, [a, e] = game.fighters;
  const ledge = game.groundY(z) - p.y;
  const x = p.x0 + 8 + (p.x1 - p.x0 - 16) * u;
  Object.assign(a, { x, z, alt: ledge + 2, va: -220, vx: side * 96, vz: 0, rot, rotV: 0, facing, state: 'launched', st: 0, hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: game.worldW / 2, z: 0, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  const bad = [];
  let lay = false;
  for (let i = 0; i < 180; i++) {
    game.update(DT);
    if (a.state === 'down') lay = true;
    if (lay && a.state !== 'down' && a.state !== 'getup') break;
    if (lay && a.alt < ledge - 0.5) bad.push(`${a.state} x ${a.x.toFixed(1)} alt ${a.alt.toFixed(1)}`);
    if (lay && Object.values(a.W).some(j => j.x < 3.9 || j.x > game.worldW - 3.9)) bad.push(`${a.state} x ${a.x.toFixed(1)} in the wall`);
  }
  return { lay, bad, ledge };
}

for (const [w, h] of [[720, 1280], [1080, 1920], [1280, 720]]) {
  for (const [side, name] of [[-1, 'left'], [1, 'right']]) {
    test(`at ${w}x${h}, a fighter knocked down onto the ${name} side ledge stays on it while lying (#384)`, () => {
      for (let k = 0; k <= 10; k++) for (const facing of [-1, 1]) for (const rot of [2.75, 3.55]) {
        const r = landOnLedge(w, h, side, k / 10, facing, rot);
        const tag = `spot ${k}/10, facing ${facing}, rot ${rot}`;
        assert.ok(r.lay, `${tag}: never lay down`);
        assert.deepEqual(r.bad.slice(0, 3), [], `${tag}: fell below the ledge (alt ${r.ledge.toFixed(1)}) or entered a wall`);
      }
    });
  }
}
