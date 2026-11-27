// At large figure sizes the side ledges sit at the jump ceiling (issue #245). A fighter that
// topped out beside a ledge hangs there with va 0; drifting over the ledge must land it
// (platformBase's 'air' case, issue #433), since with va 0 and its feet on the top nothing
// else would: it is not above the surface, so gravity never starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DT = 1 / 60;
function load(props) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = 433;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties(props);
  return window.__stickmanBrawl;
}

test('a fighter hanging at the jump ceiling lands on a side ledge it drifts over (#433)', () => {
  const game = load({ platforms: { value: true }, figurescale: { value: 200 } });
  const [a, e] = game.fighters;
  const p = game.platforms[0];
  const z = 60, top = game.groundY(z) - 110;   // The jump ceiling: feet at FIG_TOP
  assert.ok(Math.abs(p.y - 110) < 1e-9, 'the side ledge is not at the jump ceiling, but at ' + p.y);
  Object.assign(e, { x: 900, z, alt: 0, va: 0, vx: 0, vz: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 99 });
  // Topped out just left of the ledge, moving right onto it; no air dash or double jump left
  Object.assign(a, { x: p.x0 - 1, z, alt: top, va: 0, vx: 120, vz: 0, state: 'air', st: 0, hp: 1000, cool: 99,
    hover: false, dashed: true, dj: true, facing: 1, target: e });
  a.W = a.joints(); e.W = e.joints();
  a.update(DT);
  assert.ok(a.x >= p.x0, 'it did not reach the ledge');
  assert.equal(a.state, 'idle', 'it hangs in the air over the ledge');
  assert.equal(a.va, 0);
  assert.ok(Math.abs(a.alt - top) < 1e-6, 'alt ' + a.alt + ', the ledge top is ' + top);
});
