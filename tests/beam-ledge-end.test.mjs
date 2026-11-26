// Runs main.js in a sandbox with floating platforms on and checks that an energy beam fired
// near a ledge end does not carry its user past that end (issue #344). The beam's recoil and
// leftover walking speed used to push a user standing on a ledge past its end, where the
// beam's hover held it in mid-air until the move ended. Math.random is seeded, so each run is
// the same.
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

// a stands on a side ledge 6 in from its outer end, at depth 40, moving toward that end at
// speed vx, and fires a beam at e, which flinches on the floor beyond the ledge's inner end.
// Steps a alone through the whole move; returns each step where a was off the ledge's span
// while held in the air at or above the ledge's height.
function beamAtEnd(seed, side, vx) {
  const game = load(seed);
  const ps = [...game.platforms].sort((p, q) => p.x0 - q.x0);
  const p = side < 0 ? ps[0] : ps.at(-1);
  const z = 40, [a, e] = game.fighters;
  const ledge = game.groundY(z) - p.y;
  const x = side < 0 ? p.x0 + 6 : p.x1 - 6;
  Object.assign(a, { x, z, alt: ledge, va: 0, vx: side * Math.abs(vx), vz: 0, facing: -side, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: x - side * 300, z, alt: 0, va: 0, vx: 0, vz: 0, facing: side, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  a.startMove(byId(game, 'beam'));
  const bad = [];
  for (let t = 0; t < 4 && a.state === 'attack'; t += DT) {
    a.update(DT);
    if (!a.rag) a.W = a.joints();
    if ((a.x < p.x0 || a.x > p.x1) && a.alt >= ledge - 1) bad.push(`t ${t.toFixed(2)} x ${a.x.toFixed(1)} alt ${a.alt.toFixed(1)}`);
  }
  return { bad, ended: a.state !== 'attack' };
}

for (const [side, name] of [[-1, 'left'], [1, 'right']]) {
  for (const vx of [0, 130]) {
    test(`a beam fired at the outer end of the ${name} ledge, walking ${vx} toward it, does not carry its user past the end (#344)`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const r = beamAtEnd(seed, side, vx);
        assert.ok(r.ended, `seed ${seed}: the beam did not end`);
        assert.deepEqual(r.bad, [], `seed ${seed}: hovered past the ledge end`);
      }
    });
  }
}
