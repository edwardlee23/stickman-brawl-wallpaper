// Runs main.js in a sandbox with a recording canvas, to check the optional name
// tags and head gear (issue #92): names from the settings panel label fighters
// and the win text, head gear is stable per fighter, and both are off by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));

// Loads the wallpaper; calls records every canvas method called with its arguments
function load(search = '?count=3&mode=ffa') {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push([k, ...a]); return grad; },
    set: () => true,
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

// Knocks out every fighter but the one given and lets the round end
function winBy(game, i) {
  for (const f of game.fighters) f.W = f.joints();
  for (const f of game.fighters) if (f.id !== i) { f.hp = 0; f.ko(0, 0); }
  game.checkRound(0);
  return game.winnerText;
}

test('names are trimmed, empty entries keep #n, and the win text uses the name', () => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value: ' ann , ,Bo' } });
  const [a, b, c] = game.fighters;
  assert.equal(game.nameOf(a), 'ann');
  assert.equal(game.nameOf(b), '');
  assert.equal(game.nameOf(c), 'Bo');
  assert.equal(winBy(game, 0), 'ANN WINS!');
});

test('a fighter without a name still wins as #n', () => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value: ' ann , ,Bo' } });
  assert.equal(winBy(game, 1), '#2 WINS!');
});

test('a 20-character name is cut to 12', () => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value: 'abcdefghijklmnopqrst' } });
  assert.equal(game.nameOf(game.fighters[0]), 'abcdefghijkl');
});

test('a name with emoji is cut by characters, not code units', () => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value: 'abcdefghijk😀xyz' } });
  assert.equal(game.nameOf(game.fighters[0]), 'abcdefghijk😀');
});

test('the free-for-all score shows a fighter by its name', () => {
  const { game, we, calls } = load();
  we.applyUserProperties({ fighternames: { value: 'ann' }, showscore: { value: true } });
  winBy(game, 0);
  game.newRound();
  for (const f of game.fighters) f.W = f.joints();
  calls.length = 0;
  game.render();
  assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === 'ANN ×1'), 'score line names the winner');
});

test('names split on the full-width and enumeration commas a Chinese keyboard types', () => {
  const { game, we } = load();
  we.applyUserProperties({ fighternames: { value: '小明，小華、阿強' } });
  assert.deepEqual(game.fighters.map(f => game.nameOf(f)).join('|'), '小明|小華|阿強');
});

test('a name tag is drawn above a named fighter only', () => {
  const { game, we, calls } = load();
  we.applyUserProperties({ fighternames: { value: 'ann' } });
  for (const f of game.fighters) f.W = f.joints();
  calls.length = 0; game.render();
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  assert.deepEqual(texts, ['ann']);
  const f = game.fighters[0];
  const tag = calls.find(c => c[0] === 'fillText');
  assert.ok(tag[3] < Math.min(f.W.head.y, f.W.hip.y - 30) - 17, 'the tag sits above the health bar');
});

test('head gear is chosen by index, the same for a fighter across newRound', () => {
  const { game, we } = load('?count=8&mode=ffa');
  we.applyUserProperties({ headgear: { value: true } });
  const before = game.fighters.map(f => game.gearOf(f));
  assert.equal(new Set(before).size, 4, 'all four kinds are used by eight fighters');
  game.newRound();
  assert.deepEqual(game.fighters.map(f => game.gearOf(f)), before);
});

test('head gear adds lines to the drawing only when turned on', () => {
  const { game, we, calls } = load();
  for (const f of game.fighters) f.W = f.joints();
  const strokes = () => { calls.length = 0; game.render(); return calls.filter(c => c[0] === 'stroke').length; };
  const off = strokes();
  we.applyUserProperties({ headgear: { value: true } });
  assert.ok(strokes() > off, 'head gear draws more lines');
  we.applyUserProperties({ headgear: { value: false } });
  assert.equal(strokes(), off);
});

test('names and head gear are empty and off by default', () => {
  const { game } = load();
  assert.equal(project.general.properties.fighternames.value, '');
  assert.equal(project.general.properties.headgear.value, false);
  assert.equal(game.cfg.headgear, false);
  for (const f of game.fighters) assert.equal(game.nameOf(f), '');
  assert.equal(winBy(game, 2), '#3 WINS!');
});

test('at the highest altitude a name tag stays on screen (#118)', () => {
  const { game, we, calls } = load('?count=2&mode=ffa');
  we.applyUserProperties({ fighternames: { value: 'Agy,Bo' } });
  const [f] = game.fighters;
  // maxAlt(z): the health bar tops out about 108 above the feet, 110 below the screen top
  Object.assign(f, { state: 'air', alt: game.groundY(f.z) - 110, va: 0 });
  for (const g of game.fighters) g.W = g.joints();
  calls.length = 0; game.render();
  const tag = calls.find(c => c[0] === 'fillText' && c[1] === 'Agy');
  assert.ok(tag, 'no tag drawn');
  assert.ok(tag[3] - 9 >= 0, 'the tag top is off screen at y ' + (tag[3] - 9));
  // It does not cover the health bar either
  const hy = Math.min(f.W.head.y, f.W.hip.y - 30);
  const beside = tag[2] > f.W.head.x + 13;
  assert.ok(beside || tag[3] <= hy - 17, 'the tag covers the health bar');
});
