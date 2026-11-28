// Chips of wall and floor (#488) come to rest on the surface under them and stay with the wall
// they came off (issue #500), and the drawing of a chip is pinned (issue #507): drawn at its floor
// once landed, kept inside the walls, and turning with its spin until it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Loads the wallpaper with a context that records every translate and rotate, and the debug
// hook; quake and debris are exposed as game.__in
function load(opts = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, k) => (...args) => { calls.push([k, ...args]); return { addColorStop() {} }; },
    set: () => true,
  });
  const listeners = {};
  const l = loadMain({
    ctx, expose: 'window.__in = { quake, debris };',
    window: { addEventListener: (k, f) => { listeners[k] = f; } }, ...opts,
  });
  const resize = (w, h) => { l.window.innerWidth = w; l.window.innerHeight = h; listeners.resize(); };
  return { ...l, game: l.window.__stickmanBrawl, fn: l.window.__in, calls, resize };
}
const debrisOf = game => Array.from(game.fx).filter(o => o.type === 'debris');

// Draws one frame with the debris o at its time t and returns each chip's drawn [x, y, angle],
// read from the translate and rotate before each chip's square
function drawn(l, o, t) {
  for (const q of Array.from(l.game.fx)) if (q !== o) q.t = q.dur;   // Nothing else drawn
  o.t = t;
  l.calls.length = 0;
  l.game.render();
  const out = [];
  const C = l.calls;
  for (let i = 0; i + 2 < C.length; i++) {
    if (C[i][0] !== 'translate' || C[i + 1][0] !== 'rotate' || C[i + 2][0] !== 'fillRect') continue;
    const b = o.bits[out.length];
    if (!b || C[i + 2][3] !== b.s) continue;
    out.push([C[i][1], C[i][2], C[i + 1][1]]);
  }
  assert.equal(out.length, o.bits.length, 'not every chip drawn');
  return out;
}

test('a slam near the end of a ledge drops the chips that fly past its end to the floor (#500)', () => {
  const l = load({ properties: { platforms: { value: true } } });
  const { game } = l;
  game.update(1 / 60);
  const p = game.platforms[0];
  const [a, b] = game.fighters;
  b.x = game.worldW - 100;
  a.state = 'launched'; a.z = 40; a.x = p.x1 - 12; a.vx = 0; a.vz = 0; a.va = -700; a.rotV = 0;
  a.alt = game.groundY(a.z) - p.y + 6;
  const fy = game.groundY(a.z);
  for (let i = 0; i < 10 && !debrisOf(game).length; i++) game.update(1 / 60);
  const [o] = debrisOf(game);
  assert.ok(o, 'no debris from the slam');
  assert.ok(Math.abs(o.y + 2 - p.y) < 1e-6, 'the slam was not on the ledge');
  const t = 0.89;
  const pts = drawn(l, o, t);
  let past = 0;
  pts.forEach(([x, y], i) => {
    if (o.bits[i].tl > t) return;
    const on = game.platforms.find(q => x >= q.x0 && x <= q.x1 && Math.abs(y - q.y) < 1e-6);
    if (x > p.x1) { past++; assert.ok(!on || on !== p, 'a chip past the ledge end at x ' + x.toFixed(1) + ' drawn on the ledge'); }
    assert.ok(on || Math.abs(y - fy) < 1e-6, 'chip ' + i + ' at x ' + x.toFixed(1) + ' rests at y ' + y.toFixed(1) + ', on no surface (floor ' + fy + ')');
  });
  assert.ok(past > 0, 'no chip flew past the ledge end');
});

test('chips off the right wall move with the wall on a resize, as its crack does (#500)', () => {
  const l = load({ search: '?count=2', globals: { performance: { now: () => 0 } } });
  const { game } = l;
  game.update(1 / 60);
  const [a] = game.fighters;
  a.launch(900, 0, true); a.x = game.worldW - 20; a.alt = 40;
  for (let i = 0; i < 10 && a.state !== 'splat'; i++) game.update(1 / 60);
  assert.equal(a.state, 'splat');
  const oldW = game.worldW;
  const [o] = debrisOf(game);
  assert.equal(o.x, oldW);
  l.resize(1920, 720);
  assert.ok(game.worldW > oldW + 100);
  assert.equal(o.x, game.worldW, 'debris at x ' + o.x + ', the wall is at ' + game.worldW);
});

test('a landed chip is drawn at its floor, not past it (#507)', () => {
  const l = load();
  const { game } = l;
  game.update(1 / 60);
  const y = game.groundY(30);
  l.fn.quake(400, y, 120);
  const [o] = debrisOf(game);
  const t = 0.89;
  drawn(l, o, t).forEach(([, dy], i) => {
    const b = o.bits[i];
    const at = Math.min(t, b.tl);
    assert.ok(Math.abs(dy - (o.y + b.vy * at + 450 * at * at)) < 1e-6, 'chip ' + i + ' drawn at y ' + dy.toFixed(2));
    if (b.tl <= t) assert.ok(Math.abs(dy - y) < 1e-6, 'landed chip ' + i + ' drawn at y ' + dy.toFixed(2) + ', the floor is at ' + y);
  });
});

test('a chip flung at a wall is drawn at the wall, not past it (#507)', () => {
  const l = load();
  const { game } = l;
  game.update(1 / 60);
  l.fn.quake(4, game.groundY(30), 120);
  const [o] = debrisOf(game);
  let held = 0;
  drawn(l, o, 0.5).forEach(([x], i) => {
    assert.ok(x >= 0 && x <= game.worldW, 'chip ' + i + ' drawn at x ' + x.toFixed(1));
    if (o.x + o.bits[i].vx * Math.min(0.5, o.bits[i].tl) < 0) { held++; assert.equal(x, 0); }
  });
  assert.ok(held > 0, 'no chip reached the wall');
});

test('a chip turns with its spin until it lands, then stays still (#507)', () => {
  const l = load();
  const { game } = l;
  game.update(1 / 60);
  l.fn.quake(400, game.groundY(30), 120);
  const [o] = debrisOf(game);
  for (const t of [0.1, 0.89]) {
    drawn(l, o, t).forEach(([, , ang], i) => {
      const b = o.bits[i];
      assert.ok(Math.abs(ang - b.spin * Math.min(t, b.tl)) < 1e-9, 'chip ' + i + ' at t ' + t + ' turned ' + ang);
    });
  }
  assert.ok(o.bits.some(b => Math.abs(b.spin) > 1), 'no chip spins');
});
