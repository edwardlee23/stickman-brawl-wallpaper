// Pins the cosmetic effects borrowed from hand-drawn stick-figure fights: dust kicked up from the
// floor, chips of wall and floor, the smear of a fast strike, line weight that thins toward the
// hands and feet, and speed lines behind a dash. None of them may touch Math.random, so a seed
// gives the same fight with them as without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain, stubContext, lcg } from './load-main.mjs';

// Loads the wallpaper; calls records every canvas property set as ['=' + name, value] and every
// method called as [name, ...args]
function load(opts = {}) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, k) => (...args) => { calls.push([k, ...args]); return { addColorStop() {} }; },
    set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; },
  });
  const l = loadMain({ ctx, ...opts });
  return { ...l, calls };
}
const fxOf = (game, type) => Array.from(game.fx).filter(o => o.type === type);
const strike = (game, id) => game.MOVES.find(m => m.id === id);

test('the effects draw nothing from Math.random: a seed gives the same fight without them', () => {
  const run = patch => {
    let n = 0;
    const rnd = lcg(7);
    const { game } = loadMain({ search: '?count=4&mode=ffa', patch, ctx: stubContext(), random: () => { n++; return rnd(); } });
    for (let i = 0; i < 1800; i++) { game.update(1 / 60); if (i % 2) game.render(); }
    return { n, at: JSON.stringify(game.fighters.map(f => [f.state, f.x.toFixed(6), f.hp.toFixed(6)])) };
  };
  const none = src => src
    .replace('function dust(x, y, n, dir = 0, size = 1) {', '$&return;')
    .replace('function debris(x, y, n, dir, fy) {', '$&return;')
    .replace('function updSmear(f) {', '$&return;');
  const plain = run(none), full = run();
  assert.ok(plain.n > 1000, 'the fight drew ' + plain.n + ' numbers');
  assert.deepEqual(full, plain);
});

test('a landing kicks up dust at the feet', () => {
  const { game } = load();
  const [a] = game.fighters;
  a.state = 'air'; a.alt = 30; a.va = -400;
  const before = fxOf(game, 'dust').length;
  for (let i = 0; i < 20 && a.state === 'air'; i++) game.update(1 / 60);
  assert.notEqual(a.state, 'air');
  assert.ok(fxOf(game, 'dust').length > before, 'no dust on landing');
});

test('a wall splat flings chips off the wall that come to rest on the floor', () => {
  const { game } = load();
  const [a] = game.fighters;
  a.launch(-900, 0, true); a.x = 20; a.alt = 40;
  for (let i = 0; i < 10 && a.state !== 'splat'; i++) game.update(1 / 60);
  assert.equal(a.state, 'splat');
  const [d] = fxOf(game, 'debris');
  assert.ok(d, 'no debris');
  assert.equal(d.x, 0);
  const fy = game.groundY(a.z);
  for (const b of d.bits) {
    assert.ok(b.vx > 0, 'a chip flies into the wall');
    assert.ok(Math.abs(d.y + b.vy * b.tl + 450 * b.tl * b.tl - fy) < 1e-6, 'a chip stops off the floor');
  }
});

test('a strike leaves a smear only through its active time', () => {
  const { game } = load();
  const [a, b] = game.fighters;
  b.x = a.x + 400;
  const m = strike(game, 'roundhouse');
  a.startMove(m);
  const seen = [];
  while (a.state === 'attack') {
    game.update(1 / 120);
    seen.push([a.st, a.smear.length]);
  }
  const act = seen.filter(([t]) => t >= m.wind + 1e-9 && t < m.wind + m.act - 1e-9);
  assert.ok(act.length > 2 && act.slice(1).every(([, n]) => n > 0), 'no smear in the active time');
  assert.ok(seen.filter(([t]) => t < m.wind || t > m.wind + m.act + 0.01).every(([, n]) => n === 0), 'a smear outside it');
  assert.ok(act.every(([, n]) => n <= 4), 'more than 4 steps kept');
});

test('a grab leaves no smear', () => {
  const { game } = load();
  const [a, b] = game.fighters;
  b.x = a.x + 400;
  a.startMove(strike(game, 'osotogari'));
  for (let i = 0; i < 60 && a.state === 'attack'; i++) { game.update(1 / 120); assert.equal(a.smear.length, 0); }
});

test('limbs are drawn thinner than the torso, forearms and shins thinner than upper arms and thighs', () => {
  const { game, calls } = load();
  game.update(1 / 60);
  calls.length = 0;
  game.render();
  const start = calls.findIndex((c, i) => c[0] === '=lineWidth' && c[1] === 3.2 && calls[i - 1][0] === '=strokeStyle');
  assert.ok(start >= 0, 'no body');
  const widths = [];
  for (let i = start; i < calls.length && widths.length < 11; i++) if (calls[i][0] === '=lineWidth') widths.push(+calls[i][1].toFixed(4));
  // Back arm, back leg, torso and head, front leg, front arm
  assert.deepEqual(widths, [3.2, 2.88, 2.304, 2.88, 2.304, 3.2, 2.88, 2.304, 2.88, 2.304, widths[10]]);
});

test('a dash draws speed lines behind the fighter, except with Reduce motion on', () => {
  const lines = reduce => {
    const { game, calls } = load({ properties: { reducemotion: { value: reduce } } });
    const [a] = game.fighters;
    game.update(1 / 60);
    a.dash = 0.2; a.vx = a.facing * 520;
    calls.length = 0;
    game.render();
    return calls.filter((c, i) => c[0] === 'moveTo' && calls[i + 1]?.[0] === 'lineTo' && calls[i + 1][2] === c[2] &&
      Math.sign(calls[i + 1][1] - c[1]) === -a.facing && Math.abs(calls[i + 1][1] - c[1]) >= 25).length;
  };
  assert.ok(lines(false) >= 5, 'no speed lines');
  assert.equal(lines(true), 0);
});
