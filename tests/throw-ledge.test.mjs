// Runs main.js in a sandbox with a stubbed canvas and window, then checks that an
// over-the-shoulder throw made on a floating platform (issue #165) lands the victim on
// that platform when it comes down over it, and on the surface below when it comes down
// past the platform's end, with the hip never passing down through a platform top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

function load() {
  // Seeded, so the damage and lying time a throw rolls are the same every run
  const { game } = loadMain({ search: '?count=4&mode=ffa', seed: 165, properties: { platforms: { value: true } } });
  // Everyone else stays out of the way, flinching on the floor at the far right
  for (const [i, f] of game.fighters.entries()) {
    Object.assign(f, { x: 900 - i * 5, z: 60, alt: 0, va: 0, vx: 0, state: 'hit', st: 0, dur: 999, hp: 1000, cool: 999 });
  }
  return { game, a: game.fighters[0], e: game.fighters[1] };
}

// Thrower a at x facing dir on platform p, victim 22 in front of it; throws with move id
// and steps the victim for 1.3 s. Returns the victim and the hip positions of every step.
function throwOn(game, a, e, p, x, dir, id) {
  const z = 60, alt = game.groundY(z) - p.y;
  Object.assign(a, { x, z, alt, va: 0, vx: 0, vz: 0, facing: dir, state: 'attack', hp: 1000, rot: 0 });
  Object.assign(e, { x: x + dir * 22, z, alt, va: 0, vx: 0, vz: 0, facing: -dir, state: 'idle', hp: 1000, rot: 0 });
  a.pose = { ...e.pose }; a.W = a.joints(); e.W = e.joints();
  a.move = game.MOVES.find(m => m.id === id);
  a.applyGrab(e);
  assert.equal(e.state, 'thrown');
  const hips = [];
  for (let t = 0; t < 1.3; t += 1 / 60) {
    const th = e.th;
    e.update(1 / 60);
    if (th) hips.push({ x: th.hx, y: th.hy });
  }
  return hips;
}

// A hip inside a platform's span and below its top, having been above it: the body went through
function assertNotThrough(game, hips, what) {
  for (const p of game.platforms) {
    let above = false;
    for (const h of hips) {
      const inSpan = h.x >= p.x0 && h.x <= p.x1;
      if (inSpan && h.y <= p.y) above = true;
      assert.ok(!(above && inSpan && h.y > p.y), `${what}: hip at (${h.x.toFixed(1)}, ${h.y.toFixed(1)}) inside the platform ${p.x0.toFixed(0)}-${p.x1.toFixed(0)} below its top ${p.y.toFixed(1)}`);
    }
  }
}

for (const id of ['seoinage', 'suplex']) {
  test(`a ${id} on a platform that comes down over it lands the victim on the platform`, () => {
    const { game, a, e } = load();
    const p = game.platforms[0];
    const hips = throwOn(game, a, e, p, p.x1 - 65, 1, id);
    assert.ok(e.x >= p.x0 && e.x <= p.x1, `victim x ${e.x} is over the platform ${p.x0}-${p.x1}`);
    assert.equal(e.state, 'down');
    assert.ok(Math.abs(e.alt - (game.groundY(e.z) - p.y)) < 1e-6, `victim alt ${e.alt}, platform alt ${game.groundY(e.z) - p.y}`);
    assert.ok(Math.abs(hips.at(-1).y - (p.y - 5)) < 1e-6, `the hip ends at ${hips.at(-1).y}, just above the top ${p.y}`);
    assertNotThrough(game, hips, id);
  });

  test(`a ${id} on a platform that comes down past its end lands the victim on the floor`, () => {
    const { game, a, e } = load();
    const p = game.platforms[0];
    const hips = throwOn(game, a, e, p, p.x1 - 17, -1, id);
    assert.ok(e.x > p.x1, `victim x ${e.x} is past the platform's end ${p.x1}`);
    assert.equal(e.state, 'down');
    assert.equal(e.alt, 0, 'on the floor');
    assert.ok(Math.abs(hips.at(-1).y - (game.groundY(e.z) - 5)) < 1e-6, 'the hip ends just above the floor');
    assertNotThrough(game, hips, id);
  });
}

for (const dir of [1, -1]) {
  test(`a throw whose hip comes down over the platform but whose body would lie past its end stays on it (facing ${dir})`, () => {
    const { game, a, e } = load();
    const p = game.platforms[0];
    // The hip lands 68 behind the thrower and the body lies 44 further out, past the end
    const x = dir > 0 ? p.x0 + 90 : p.x1 - 90;
    const hips = throwOn(game, a, e, p, x, dir, 'seoinage');
    assert.equal(e.state, 'down');
    assert.ok(e.x >= p.x0 && e.x <= p.x1, `victim x ${e.x} is on the platform ${p.x0}-${p.x1}`);
    assert.ok(Math.abs(e.alt - (game.groundY(e.z) - p.y)) < 1e-6, `victim alt ${e.alt}`);
    assertNotThrough(game, hips, `facing ${dir}`);
  });
}

test('a throw from anywhere on a platform never passes the hip through a platform top', () => {
  const { game, a, e } = load();
  for (const p of game.platforms) {
    for (const dir of [1, -1]) {
      for (let x = p.x0; x <= p.x1; x += 3) {
        const hips = throwOn(game, a, e, p, x, dir, 'seoinage'), at = `thrower at x ${x.toFixed(0)} facing ${dir}`;
        for (const q of game.platforms) {
          for (const h of hips) {
            assert.ok(!(h.x >= q.x0 && h.x <= q.x1 && h.y > q.y && h.y < q.y + 40),
              `${at}: hip at (${h.x.toFixed(1)}, ${h.y.toFixed(1)}) just under the top ${q.y.toFixed(1)} of ${q.x0.toFixed(0)}-${q.x1.toFixed(0)}`);
          }
        }
        // The hip lands on the top under it at or below the thrower's feet, or on the floor
        const hx = hips.at(-1).x;
        const want = game.platforms.filter(q => hx >= q.x0 && hx <= q.x1 && q.y >= p.y - 0.5)
          .reduce((h, q) => Math.max(h, game.groundY(e.z) - q.y), 0);
        assert.equal(e.state, 'down', at);
        assert.ok(Math.abs(e.alt - want) < 1e-6, `${at}: hip at x ${hx.toFixed(0)} alt ${e.alt}, surface alt ${want}`);
        if (want > 0) assert.ok(game.platforms.some(q => e.x >= q.x0 && e.x <= q.x1 && Math.abs(game.groundY(e.z) - q.y - want) < 1e-6), `${at}: the body lies on the platform`);
      }
    }
  }
});

test('a throw on the floor still lands on the floor', () => {
  const { game, a, e } = load();
  Object.assign(a, { x: 600, z: 60, alt: 0, facing: 1, state: 'attack', hp: 1000, rot: 0 });
  Object.assign(e, { x: 622, z: 60, alt: 0, facing: -1, state: 'idle', hp: 1000, rot: 0 });
  a.pose = { ...e.pose }; a.W = a.joints(); e.W = e.joints();
  a.move = game.MOVES.find(m => m.id === 'seoinage');
  a.applyGrab(e);
  for (let t = 0; t < 1.3; t += 1 / 60) e.update(1 / 60);
  assert.equal(e.state, 'down');
  assert.equal(e.alt, 0);
});
