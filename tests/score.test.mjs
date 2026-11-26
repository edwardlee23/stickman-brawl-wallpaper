// Runs main.js in a sandbox with a canvas stub that records the text drawn, to
// check the running score board (issue #86): wins are counted across rounds,
// draws are not, the tally resets only when the fighter count or mode changes,
// and the score line is drawn in the documented formats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Loads the wallpaper and returns its debug hook, its settings listener, a
// function that draws one frame, and the text that frame drew, each piece as
// { text, color } in the order drawn.
function load(search) {
  const noop = () => {};
  const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
  let drawn = [];
  const state = {};
  const ctx = new Proxy({}, {
    get: (_, k) => k === 'fillText' ? text => drawn.push({ text, color: state.fillStyle })
      : k === 'measureText' ? text => ({ width: String(text).length * 8 })
      : k in state ? state[k] : stub,
    set: (_, k, v) => { state[k] = v; return true; },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  let next = null, now = 0;
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: noop };
  Object.assign(window, {
    window,
    document: { getElementById: () => canvas, body: { style: {} } },
    location: { search },
    URLSearchParams,
    performance: { now: () => 0 },
    requestAnimationFrame: cb => { next = cb; },
    Math, Object, Set, Map, JSON, Array, Number, String, Infinity, NaN,
  });
  vm.runInNewContext(readFileSync('wallpaper/main.js', 'utf8'), window);
  return {
    game: window.__stickmanBrawl,
    we: window.wallpaperPropertyListener,
    draw: () => { drawn = []; next(now += 16); return drawn; },
  };
}

// Knocks out every fighter for whom lose(f) is true, then lets the round end
// and the next one start.
function finish(game, lose) {
  for (const f of game.fighters) if (lose(f)) f.state = 'ko';
  game.checkRound(0.016);
  game.checkRound(5);
}

// The pieces of the score line: everything drawn except the winner banner
const scoreLine = d => d.filter(p => !/WINS!|DRAW/.test(p.text));

test('a team win adds one to that team and a draw changes nothing', () => {
  const { game, we } = load('?count=4&mode=teams');
  we.applyUserProperties({ showscore: { value: true } });
  finish(game, f => f.team === 1);
  assert.deepEqual([...game.score.wins], [1, 0]);
  finish(game, f => f.team === 1);
  finish(game, f => f.team === 0);
  assert.deepEqual([...game.score.wins], [2, 1]);
  finish(game, () => true);
  assert.deepEqual([...game.score.wins], [2, 1], 'a draw is not counted');
});

test('changing fightercount or gamemode resets the tally, gamespeed does not', () => {
  const { game, we } = load('?count=4&mode=teams');
  finish(game, f => f.team === 0);
  we.applyUserProperties({ gamespeed: { value: 200 } });
  assert.deepEqual([...game.score.wins], [0, 1]);
  we.applyUserProperties({ figurescale: { value: 150 } });
  assert.deepEqual([...game.score.wins], [0, 1], 'a new round from another setting keeps the tally');
  we.applyUserProperties({ fightercount: { value: 6 } });
  assert.deepEqual([...game.score.wins], [0, 0]);
  finish(game, f => f.team === 0);
  we.applyUserProperties({ gamemode: { value: 'ffa' } });
  assert.deepEqual([...game.score.wins], [0, 0, 0, 0, 0, 0]);
});

test('the teams score is drawn as RED n : m BLUE in team colors', () => {
  const { game, we, draw } = load('?count=4&mode=teams');
  we.applyUserProperties({ showscore: { value: true } });
  for (let i = 0; i < 5; i++) finish(game, f => f.team === 1);
  for (let i = 0; i < 3; i++) finish(game, f => f.team === 0);
  const line = scoreLine(draw());
  assert.equal(line.map(p => p.text).join(''), 'RED 5 : 3 BLUE');
  assert.equal(line[0].color, '#ff6b6b');
  assert.equal(line.at(-1).color, '#4dabf7');
});

test('the free-for-all score lists the top fighters by wins in their colors', () => {
  const { game, we, draw } = load('?count=6&mode=ffa');
  we.applyUserProperties({ showscore: { value: true } });
  const win = id => finish(game, f => f.id !== id);
  for (const id of [2, 2, 2, 2, 0, 0, 4, 5, 5, 5]) win(id);
  const line = scoreLine(draw()).filter(p => p.text.trim());
  assert.deepEqual(line.map(p => p.text), ['#3 ×4', '#6 ×3', '#1 ×2']);
  const hue = id => game.fighters[id].hue;
  assert.deepEqual(line.map(p => p.color), [2, 5, 0].map(id => `hsl(${hue(id)},80%,66%)`));
});

test('the score is off by default and draws nothing then', () => {
  const { game, draw } = load('?count=4&mode=teams');
  finish(game, f => f.team === 1);
  assert.equal(game.cfg.showScore, false);
  assert.deepEqual(scoreLine(draw()), []);
});

// Issue #271: fighters 2 and 3 are red and blue too, so a win by one of them is counted for
// its team, not at its fighter number past the two-team tally
test('a teams round won by fighter 2 or 3 counts for that fighter\'s team', () => {
  const { game } = load('?count=4&mode=teams');
  finish(game, f => f.id !== 3);
  assert.deepEqual([...game.score.wins], [0, 1]);
  finish(game, f => f.id !== 2);
  assert.deepEqual([...game.score.wins], [1, 1]);
});
