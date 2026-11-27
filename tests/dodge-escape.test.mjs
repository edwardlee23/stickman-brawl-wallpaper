// Runs main.js in a sandbox with a stubbed canvas and window, then counts how often a fighter
// that dodges an attack is hit by it anyway (issue #416): a dodge must escape beams, blasts,
// fireballs, ice shards, shuriken and the shadow clones, as it escapes a strike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DT = 1 / 60;

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  context.__seed = 416;
  vm.runInContext('Math.random = () => (__seed = (Math.imul(__seed, 1664525) + 1013904223) >>> 0) / 4294967296', context);
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ platforms: { value: false }, items: { value: false } });
  const game = window.__stickmanBrawl;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = true;
  return { game, context };
}

// Until 200 dodges are seen (at most 4000 attacks), the attacker a starts the move at the
// idle enemy e in front of it, both on the floor at the same depth, and the
// fight is stepped until the attack and its shots are over. Returns how many of the
// dodges were hit anyway.
function hitAfterDodge(id, near) {
  let game, context, a, e, m;
  const held = { alt: 0, va: 0, vx: 0, vz: 0, st: 0, dur: 0, hp: 1000, cool: 99, retarget: 99, hover: false,
    dash: 0, evade: 0, juggle: 0, rot: 0, rotV: 0, subFrom: null, subT: 0, move: null, md: null,
    invis: false, alpha: 1, state: 'idle', nextMove: null };
  let dodges = 0, hit = 0;
  for (let n = 0; n < 4000 && dodges < 200; n++) {
    // A fresh fight every 200 attacks, before the round runs out of time and a new one starts
    if (n % 200 === 0) {
      ({ game, context } = load());
      [a, e] = game.fighters;
      m = [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(k => k.id === id);
    }
    game.shots.length = 0;
    // A strike from 6 px inside its reach, where it is made; the rest from the middle of their
    // range, 200 px away at most
    const gap = near ? m.range[1] - 6 : Math.min((m.range[0] + m.range[1]) / 2, 200);
    Object.assign(a, held, { x: 300, z: 60, facing: 1, target: e });
    Object.assign(e, held, { x: 300 + gap, z: 60, facing: -1, target: a });
    for (const f of game.fighters) f.W = f.joints();
    context.__seed = (n + 1) * 7919;
    a.startMove(m);
    let dodged = false, struck = false;
    for (let i = 0; i < 300; i++) {
      game.update(DT);
      if (!struck && !dodged && e.evade > 0) dodged = true;
      if (e.hp < 1000) struck = true;
      if (a.state !== 'attack') {
        if (!game.shots.length) break;
        // Its attack over, the attacker waits, so it makes no other attack (an air one, say)
        // while its shots fly on
        a.state = 'wait';
      }
    }
    if (dodged) { dodges++; if (struck) hit++; }
  }
  assert.ok(dodges >= 100, id + ': only ' + dodges + ' dodges seen');
  return { dodges, hit };
}

for (const id of ['beam', 'blast', 'fireball', 'ice', 'shuriken', 'clones']) {
  test('a dodge escapes the ' + id + ' at least 80% of the time (#416)', () => {
    const { dodges, hit } = hitAfterDodge(id, false);
    assert.ok(hit <= dodges * 0.2, id + ': hit after ' + hit + ' of ' + dodges + ' dodges');
  });
}

for (const id of ['jab', 'roundhouse']) {
  test('a dodge still escapes a ' + id + ' (#416)', () => {
    const { dodges, hit } = hitAfterDodge(id, true);
    assert.ok(hit <= dodges * 0.05, id + ': hit after ' + hit + ' of ' + dodges + ' dodges');
  });
}
