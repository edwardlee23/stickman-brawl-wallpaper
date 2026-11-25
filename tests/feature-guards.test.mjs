// Runs main.js in a sandbox with a recording canvas, to check rules of the recent
// optional features that no other test notices breaking (issue #132): item drops,
// seeking, staff damage, the boomerang's return and dropping on a knockout; the King,
// Ladder and Survival round rules; name tags; and Click to blast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 1280 x 720 at figure size 100%: one world unit is 720 / 540 screen pixels
const S = 720 / 540;

// Loads the wallpaper. calls records every canvas method called and every property set,
// as [name, ...args] and ['=' + name, value]; random(fn) replaces Math.random in the sandbox.
function load(search = '?count=2&mode=ffa') {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return grad; },
    set: (_, k, v) => { calls.push(['=' + String(k), v]); return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const sandboxMath = vm.runInContext('Math', context);
  const realRandom = sandboxMath.random;
  const random = fn => { sandboxMath.random = fn ?? realRandom; };
  const game = window.__stickmanBrawl;
  const we = window.wallpaperPropertyListener;
  // A click at a world point, as a browser reports it: in CSS pixels of the window
  let clock = 0;
  const click = (x, y, o = {}) => {
    clock += 10000;
    for (const fn of listeners.pointerdown ?? []) fn({ clientX: x * S, clientY: y * S, button: 0, timeStamp: clock, ...o });
  };
  return { game, we, calls, random, click };
}
const run = (game, secs, until = () => false) => {
  for (let t = 0; t < secs && !until(); t += 1 / 60) game.update(1 / 60);
};
// Puts the fighters on one line at the given x, standing idle and facing each other
function place(game, ...xs) {
  game.fighters.forEach((f, i) => {
    Object.assign(f, { x: xs[i], z: 50, alt: 0, va: 0, vx: 0, vz: 0, facing: xs[i] < xs[1 - i] ? 1 : -1, state: 'idle', st: 0 });
    f.W = f.joints();
  });
  return game.fighters;
}
// The fillStyle set last before the canvas call at index i
function fillBefore(calls, i) {
  for (let j = i - 1; j >= 0; j--) if (calls[j][0] === '=fillStyle') return calls[j][1];
}
const snap = f => JSON.stringify({ x: f.x, z: f.z, alt: f.alt, vx: f.vx, va: f.va, state: f.state, hp: f.hp });

// ---------- Items ----------

test('items: the gap before each drop is at most 15 s, even when the random draw is at its top', () => {
  const { game, random } = load();
  random(() => 0.999);
  game.cfg.items = true;
  for (const f of game.fighters) f.hp = 1e9;
  const drops = [];
  for (let t = 0; t < 40 && drops.length < 2; t += 1 / 60) {
    game.update(1 / 60);
    // Take each item away as it drops, so the next drop is never held back by the limit of two
    if (game.items.length) { drops.push(t); game.items.length = 0; }
  }
  assert.equal(drops.length, 2, 'two drops: ' + drops);
  const gaps = [drops[0], drops[1] - drops[0]];
  for (const g of gaps) assert.ok(g > 14.5 && g <= 15.05, 'gaps ' + gaps);
});

test('items: an idle fighter with no enemy near walks toward an item 200 away', () => {
  const { game, random } = load();
  random(() => 0.5);
  game.cfg.items = true;
  const [a, e] = place(game, 600, 100);
  a.cool = e.cool = 99;
  game.spawnItem('staff', 800, 50, 0);
  run(game, 1);
  assert.ok(a.x > 650, 'walked toward the item, away from the enemy: x ' + a.x);
});

test('items: a staff strike does about 1.5 times the damage of the bare strike', () => {
  const hurt = (staff) => {
    const { game, random } = load();
    random(() => 0.5);
    game.cfg.items = true;
    const jab = game.MOVES.find(m => m.id === 'jab');
    const [a, e] = place(game, 300, 330);
    if (staff) a.held = { kind: 'staff', n: 3 };
    const m = game.withStaff(a, jab);
    assert.equal(!!m.staff, staff);
    const lo = Math.max(jab.range[0], m.range[0]), hi = Math.min(jab.range[1], m.range[1]);
    place(game, 300, 300 + (lo + hi) / 2);
    Object.assign(a, { cool: 99 });
    Object.assign(e, { state: 'hit', st: 0, dur: 99, hp: 100, cool: 99 });
    // A strike to the head hurts 1.35 times as much; count it as a body hit
    let zone = null;
    const takeHit = e.takeHit;
    e.takeHit = function (att, mv, z, ...rest) { zone = z; return takeHit.call(this, att, mv, z, ...rest); };
    a.startMove(m);
    run(game, 1, () => a.state !== 'attack');
    return (100 - e.hp) / (zone === 'head' ? 1.35 : zone === 'leg' ? 0.8 : 1);
  };
  const bare = hurt(false), staffed = hurt(true);
  assert.ok(bare > 0, 'the bare jab hits');
  const r = staffed / bare;
  assert.ok(r > 1.4 && r < 1.6, 'staff / bare damage ' + r);
});

test('items: a thrown boomerang turns and flies back within 1.2 s', () => {
  const { game, random } = load();
  random(() => 0.5);
  game.cfg.items = true;
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = false;
  const [a, e] = place(game, 300, 500);
  Object.assign(e, { state: 'hit', st: 0, dur: 99, cool: 99 });
  a.held = { kind: 'boomerang' };
  a.target = e; a.cool = 0;
  run(game, 1, () => game.shots.some(s => s.kind === 'boomerang'));
  const s = game.shots.find(s => s.kind === 'boomerang');
  assert.ok(s, 'thrown');
  e.invis = true;                      // Nothing in its path, so it flies its whole course
  const out = Math.sign(s.vx);
  let back = false;
  for (let t = 0; t < 1.2 && game.shots.includes(s); t += 1 / 60) {
    game.update(1 / 60);
    if (Math.sign(s.vx) === -out) back = true;
  }
  assert.ok(back, 'vx changed sign');
});

test('items: a knockout drops the item a fighter holds', () => {
  const { game } = load('?count=3&mode=ffa');
  game.cfg.items = true;
  const [a] = game.fighters;
  for (const f of game.fighters) f.W = f.joints();
  a.held = { kind: 'staff', n: 3 };
  a.hp = 0; a.ko(0, 0);
  game.update(1 / 60);
  assert.equal(a.held, null);
});

test('items: nothing drops during the win banner', () => {
  const { game, random } = load();
  random(() => 0.5);                   // The first drop is due at 11.5 s
  game.cfg.items = true;
  for (const f of game.fighters) f.hp = 1e9;
  run(game, 10);
  assert.equal(game.items.length, 0);
  const [, e] = game.fighters;
  e.hp = 0; e.W = e.joints(); e.ko(0, 0);
  for (let t = 0; t < 3; t += 1 / 60) {
    game.update(1 / 60);
    assert.equal(game.items.length, 0, 'dropped during the banner at ' + (10 + t).toFixed(2) + ' s');
  }
});

test('items: a held item is drawn on the fighter', () => {
  const { game, calls } = load();
  game.cfg.items = true;
  const [a] = place(game, 300, 700);
  const strokes = () => { calls.length = 0; game.render(); return calls.filter(c => c[0] === 'stroke').length; };
  const bare = strokes();
  a.held = { kind: 'staff', n: 3 };
  assert.ok(strokes() > bare, 'a staff draws more lines');
  a.held = { kind: 'boomerang' };
  assert.ok(strokes() > bare, 'a boomerang draws more lines');
});

// ---------- Round rules ----------

test('King: no fighter is king twice in a row over 10 rounds', () => {
  const { game, we, random } = load('?count=6&mode=ffa');
  random(() => 0);                     // pick() takes the first fighter it may
  we.applyUserProperties({ roundrules: { value: 'king' } });
  let last = null;
  for (let r = 0; r < 10; r++) {
    const k = game.fighters.find(f => f.king);
    assert.ok(k, 'a king');
    assert.notEqual(k.id, last, 'round ' + r + ': the same king again');
    last = k.id;
    game.newRound();
  }
});

test('King: the king wears a crown', () => {
  const { game, we, calls } = load('?count=3&mode=ffa');
  we.applyUserProperties({ roundrules: { value: 'king' } });
  for (const f of game.fighters) f.W = f.joints();
  calls.length = 0; game.render();
  assert.ok(calls.some(c => c[0] === '=fillStyle' && c[1] === '#ffd43b'), 'the gold crown is drawn');
  we.applyUserProperties({ roundrules: { value: 'normal' } });
  for (const f of game.fighters) f.W = f.joints();
  calls.length = 0; game.render();
  assert.ok(!calls.some(c => c[0] === '=fillStyle' && c[1] === '#ffd43b'), 'no crown under Normal');
});

test('Survival: a winner at 14% health is restored, one at 16% keeps it', () => {
  for (const [pct, kept] of [[14, false], [16, true]]) {
    const { game, we } = load('?count=3&mode=ffa');
    we.applyUserProperties({ roundrules: { value: 'survival' } });
    const w = game.fighters[1];
    w.hp = pct;
    for (const f of game.fighters) if (f !== w) { f.hp = 0; f.state = 'ko'; }
    game.checkRound(0);
    game.checkRound(5);
    assert.equal(game.fighters[1].hp, kept ? pct : 100, pct + '%');
  }
});

test('Ladder: the waiting fighters stand at the sides and the two fighting in the middle', () => {
  const { game, we } = load('?count=6&mode=ffa');
  we.applyUserProperties({ roundrules: { value: 'ladder' } });
  const worldW = 1280 / S;
  for (const f of game.fighters) {
    if (f.state === 'wait') assert.ok(f.x < 100 || f.x > worldW - 100, 'waiting at a side: x ' + f.x);
    else assert.ok(f.x > worldW * 0.3 && f.x < worldW * 0.7, 'fighting in the middle: x ' + f.x);
  }
});

test('Ladder: the waiting fighters cheer', () => {
  const { game, we } = load('?count=6&mode=ffa');
  we.applyUserProperties({ roundrules: { value: 'ladder' } });
  const f = game.fighters.find(f => f.state === 'wait');
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    game.update(1 / 60);
    lo = Math.min(lo, f.pose.aF); hi = Math.max(hi, f.pose.aF);
  }
  assert.equal(f.state, 'wait');
  assert.ok(hi - lo > 0.5, 'the arms move: ' + lo + '..' + hi);
});

// ---------- Name tags ----------

function tagged(setup) {
  const { game, we, calls } = load('?count=3&mode=ffa');
  we.applyUserProperties({ fighternames: { value: 'ann,bo,cy' } });
  for (const f of game.fighters) f.W = f.joints();
  setup?.(game, we);
  calls.length = 0; game.render();
  return { game, calls, tags: calls.map((c, i) => [c, i]).filter(([c]) => c[0] === 'fillText') };
}

test('name tags: none over a knocked-out body', () => {
  const { tags } = tagged(game => { const [a] = game.fighters; a.hp = 0; a.ko(0, 0); });
  assert.deepEqual(tags.map(([c]) => c[1]).sort(), ['bo', 'cy']);
});

test('name tags: none over a fighter hidden in smoke', () => {
  const { tags } = tagged(game => { game.fighters[0].invis = true; });
  assert.deepEqual(tags.map(([c]) => c[1]).sort(), ['bo', 'cy']);
});

test('name tags: a tag is drawn in its fighter\'s color', () => {
  const { game, calls, tags } = tagged((game, we) => we.applyUserProperties({ colorful: { value: true } }));
  assert.equal(tags.length, 3);
  for (const [c, i] of tags) {
    const f = game.fighters.find(f => game.nameOf(f) === c[1]);
    assert.equal(fillBefore(calls, i), `hsl(${f.hue},80%,66%)`, c[1]);
  }
});

// ---------- Click to blast ----------

function blastSetup() {
  const l = load();
  l.we.applyUserProperties({ clickblast: { value: true } });
  const [a, b] = place(l.game, 300, 700);
  return { ...l, a, b };
}

test('click to blast: nothing happens while the wallpaper is paused', () => {
  const { we, a, click } = blastSetup();
  we.setPaused(true);
  const before = snap(a), c = a.bodyPoint();
  click(c.x - 20, c.y);
  assert.equal(snap(a), before);
  we.setPaused(false);
  click(c.x - 20, c.y);
  assert.equal(a.state, 'launched', 'it works again once unpaused');
});

test('click to blast: a right or middle click does nothing', () => {
  const { a, click } = blastSetup();
  const before = snap(a), c = a.bodyPoint();
  click(c.x - 20, c.y, { button: 2 });
  click(c.x - 20, c.y, { button: 1 });
  assert.equal(snap(a), before);
});

test('click to blast: a fighter hidden in smoke or being thrown is not launched', () => {
  const { a, click } = blastSetup();
  const c = a.bodyPoint();
  a.invis = true;
  click(c.x - 20, c.y);
  assert.equal(a.state, 'idle', 'hidden in smoke');
  a.invis = false;
  a.th = { hx: a.x, hy: c.y, hx0: a.x, hy0: c.y, hx1: a.x + 100, hy1: c.y, arc: 40, dur: 0.6 };
  a.state = 'thrown';
  click(c.x - 20, c.y);
  assert.equal(a.state, 'thrown', 'being thrown');
});

test('click to blast: a launched fighter drops the move and the effects it was in', () => {
  const { game, a, click } = blastSetup();
  a.startMove(game.MOVES.find(m => m.id === 'jab'));
  Object.assign(a, { alpha: 0.4, aura: 1, ghost: true });
  assert.ok(a.md, 'mid move');
  const c = a.bodyPoint();
  click(c.x - 20, c.y);
  assert.equal(a.state, 'launched');
  assert.deepEqual([a.move, a.md, a.alpha, a.aura, a.ghost], [null, null, 1, 0, false]);
});

test('click to blast: it deals no damage', () => {
  const { a, click } = blastSetup();
  const c = a.bodyPoint();
  click(c.x, c.y + 10);
  assert.equal(a.state, 'launched');
  assert.equal(a.hp, 100);
});

test('click to blast: a fighter 200 away is untouched', () => {
  const { game, a, b, click } = blastSetup();
  place(game, 300, 500);
  const before = snap(b), c = a.bodyPoint();
  click(c.x, c.y);
  assert.equal(a.state, 'launched');
  assert.equal(snap(b), before);
});
