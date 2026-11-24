// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// Ninjutsu style's techniques (issue #25): shuriken, shadow clones, smoke
// escape and substitution.
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
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, e] = game.fighters;
  // Attacker on the left facing right, target 200 to its right facing it.
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', target: e });
  Object.assign(e, { x: 500, z: 50, alt: 0, facing: -1, state: 'idle', hp: 1000, cool: 99, target: a });
  a.W = a.joints(); e.W = e.joints();
  return { game, a, e, window };
}
const tech = (game, id) => game.NINJA.find(m => m.id === id);
const jab = game => game.MOVES.find(m => m.id === 'jab');

test('every technique belongs to the ninjutsu style and has its own update function', () => {
  const { game, a } = load();
  assert.deepEqual([...game.NINJA.map(m => m.id)].sort(), ['clones', 'shuriken', 'smoke', 'substitute']);
  for (const m of game.NINJA) {
    assert.equal(m.style, 'ninjutsu', m.id);
    assert.equal(typeof a['u_' + m.type], 'function', m.id);
  }
});

test('with only ninjutsu on, fighters attack with shuriken and clones, never the reactive techniques', () => {
  const { game, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'ninjutsu';
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(game.pickMove(a, e).id);
  assert.deepEqual([...seen].sort(), ['clones', 'shuriken']);
});

test('shuriken are thrown as a fan of three stars that hit the target', () => {
  const { game, a, e } = load();
  Object.assign(e, { state: 'hit', st: 0, dur: 99 });   // Cannot block, dodge or jump
  a.startMove(tech(game, 'shuriken'));
  let first = 0;   // Stars in flight on the step the first throw leaves the hand
  for (let t = 0; t < 1.5; t += 1 / 60) {
    game.update(1 / 60);
    if (!first) first = game.shots.filter(s => s.kind === 'star').length;
  }
  assert.equal(first, 3);
  assert.ok(game.stats.hits.shuriken >= 1, 'no star hit');
  assert.ok(e.hp < 1000);
});

test('shadow clones appear, all strike the target, then vanish', () => {
  const { game, a, e } = load();
  Object.assign(e, { state: 'hit', st: 0, dur: 99 });
  a.x = 440;
  a.startMove(tech(game, 'clones'));
  let clones = 0;
  for (let t = 0; t < 1.5 && a.move; t += 1 / 60) {
    a.W = a.joints(); e.W = e.joints();
    a.update(1 / 60);
    if (a.md && a.md.clones) clones = Math.max(clones, a.md.clones.length);
  }
  assert.equal(clones, 2);
  assert.equal(game.stats.hits.clones, 3, 'two clone hits and the real one');
  assert.equal(e.state, 'launched');
  assert.equal(a.move, null, 'move never ended');
});

test('a fighter about to be hit may vanish in smoke and reappear away, only while ninjutsu is on', () => {
  const { game, a, e } = load();
  a.move = jab(game);
  let vanished = 0;
  for (let i = 0; i < 400; i++) {
    Object.assign(e, { state: 'idle', move: null, md: null, x: 500, invis: false });
    a.warn(250, false);
    if (e.move && e.move.id === 'smoke') {
      vanished++;
      e.update(0.05);
      assert.equal(e.hittable, false, 'hittable inside the smoke');
      e.update(0.4);
      assert.equal(e.invis, false, 'never reappeared');
      assert.ok(Math.abs(e.x - 500) >= 60, `moved only to ${e.x}`);
    }
  }
  assert.ok(vanished > 0, 'never vanished');
  game.cfg.styles.ninjutsu = false;
  for (let i = 0; i < 400; i++) {
    Object.assign(e, { state: 'idle', move: null, md: null });
    a.warn(250, false);
    assert.ok(!e.move || e.move.id !== 'smoke', 'vanished with ninjutsu off');
  }
});

// Warns the target of a jab and hits it with one, until it substitutes, at most n times.
function hitUntilSubstitute(game, a, e, n) {
  a.move = jab(game);
  for (let i = 0; i < n; i++) {
    Object.assign(e, { state: 'idle', move: null, md: null, x: 330, z: 50, alt: 0, facing: -1, subFrom: null, invis: false });
    a.x = 300; a.facing = 1;
    a.warn(250, false);
    if (!e.subFrom) continue;
    const hp = e.hp;
    e.takeHit(a, jab(game), 'body', { x: 320, y: 300 });
    assert.equal(e.hp, hp, 'a substitution still took damage');
    return true;
  }
  return false;
}

test('a fighter hit may leave a log behind and appear behind the attacker, then strike', () => {
  const { game, a, e } = load();
  assert.ok(hitUntilSubstitute(game, a, e, 400), 'never substituted');
  assert.equal(game.stats.subs, 1);
  assert.ok(game.fx.some(o => o.type === 'log'), 'no log left behind');
  assert.ok(e.x < a.x, `appeared at ${e.x}, attacker at ${a.x}`);
  assert.equal(e.facing, 1, 'does not face the attacker');
  assert.equal(e.move.id, 'substitute');
  for (let t = 0; t < 0.5 && e.move && e.move.id === 'substitute'; t += 1 / 60) e.update(1 / 60);
  assert.ok(e.move && e.move.id !== 'substitute', 'no counter-attack');
});

test('a substitution is used once, against the attacker it was readied for, and expires', () => {
  const { game, a, e } = load();
  const c = { facing: 1 };   // Someone other than the attacker the substitution was readied for
  assert.ok(hitUntilSubstitute(game, a, e, 400));
  let hp = e.hp;
  Object.assign(e, { state: 'idle', move: null, md: null });
  e.takeHit(a, jab(game), 'body', { x: 0, y: 0 });
  assert.ok(e.hp < hp, 'substituted twice');

  e.subFrom = a; e.subT = 0.5;
  hp = e.hp;
  Object.assign(e, { state: 'idle', move: null, md: null });
  e.takeHit(c, jab(game), 'body', { x: 0, y: 0 });
  assert.ok(e.hp < hp, 'substituted for a hit from someone else');

  e.subFrom = a; e.subT = 0.5;
  e.update(0.6);
  hp = e.hp;
  Object.assign(e, { state: 'idle', move: null, md: null });
  e.takeHit(a, jab(game), 'body', { x: 0, y: 0 });
  assert.ok(e.hp < hp, 'substituted after it expired');
});

test('no substitution is readied with ninjutsu off', () => {
  const { game, a, e } = load();
  game.cfg.styles.ninjutsu = false;
  assert.equal(hitUntilSubstitute(game, a, e, 400), false);
});

test('with only ninjutsu on, the attack after a substitution is a ninjutsu one', () => {
  const { game, a, e } = load();
  for (const s of Object.keys(game.cfg.styles)) game.cfg.styles[s] = s === 'ninjutsu';
  assert.ok(hitUntilSubstitute(game, a, e, 400));
  for (let t = 0; t < 0.5 && e.move && e.move.id === 'substitute'; t += 1 / 60) e.update(1 / 60);
  assert.equal(e.move.style, 'ninjutsu', `follow-up ${e.move.id}`);
});

test('turning ninjutsu off drops a readied substitution', () => {
  const { game, a, e, window } = load();
  e.subFrom = a; e.subT = 1;
  window.wallpaperPropertyListener.applyUserProperties({ styleninjutsu: { value: false } });
  assert.equal(e.subFrom, null);
  const hp = e.hp;
  e.takeHit(a, jab(game), 'body', { x: 0, y: 0 });
  assert.ok(e.hp < hp, 'substituted after ninjutsu was turned off');
});

test('a substitution readied against a shuriken throw triggers when a star hits (issue #31)', () => {
  const { game, a, e } = load();
  e.subFrom = a; e.subT = 1;
  const hp = e.hp, y = (e.W.sh.y + e.W.hip.y) / 2;
  // Two stars of one fan reach the body in the same step; the second must miss the log
  for (const dy of [0, 6]) game.shots.push({ x: e.W.sh.x - 8, y: y + dy, vx: 600, vy: 0, z: e.z, owner: a,
    m: tech(game, 'shuriken'), life: 3, col: '#fff', kind: 'star', dmg: 3 });
  game.update(1 / 60);
  assert.equal(game.stats.subs, 1, 'no substitution');
  assert.equal(e.hp, hp, 'the star did damage');
  assert.equal(e.move && e.move.id, 'substitute');
  assert.ok(Math.abs(e.x - a.x) < 40, `appeared at ${e.x}, thrower at ${a.x}`);
});
