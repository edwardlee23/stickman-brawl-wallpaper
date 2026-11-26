// Runs main.js in a sandbox with a recording canvas, to check that the win banner follows the
// settings while it shows (issue #391): a name, Unique colors or Line color changed during it
// shows on the next frame, as the name tags and the score already do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper; log records every canvas method called as [name, ...args] and every
// property set as ['=name', value]
function load(search = '?count=2&mode=ffa') {
  const log = [];
  const ctx = new Proxy({}, {
    get: (_, k) => (k === 'measureText' ? () => ({ width: 40 }) : (...a) => { log.push([k, ...a]); return { addColorStop() {} }; }),
    set: (_, k, v) => { log.push(['=' + String(k), v]); return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  return {
    game, we: window.wallpaperPropertyListener,
    // Draws one frame and gives the banner: its text and the fill color it was drawn in
    banner(text) {
      log.length = 0;
      game.render();
      const i = log.findIndex(e => e[0] === 'fillText' && e[1] === text);
      if (i < 0) return { texts: log.filter(e => e[0] === 'fillText').map(e => e[1]) };
      return { text, color: log.slice(0, i).filter(e => e[0] === '=fillStyle').pop()?.[1] };
    },
  };
}

// Knocks out the second fighter so the first wins the round
function firstWins(game) {
  for (const f of game.fighters) f.W = f.joints();
  const b = game.fighters[1];
  b.hp = 0; b.ko(0, 0);
  game.checkRound(0);
}

test('the win banner shows a name changed during it on the next frame (#391)', () => {
  const w = load();
  w.we.applyUserProperties({ fighternames: { value: 'ann, bo' } });
  firstWins(w.game);
  assert.equal(w.banner('ANN WINS!').text, 'ANN WINS!');
  w.we.applyUserProperties({ fighternames: { value: 'Cy, Dee' } });
  const b = w.banner('CY WINS!');
  assert.equal(b.text, 'CY WINS!', 'banner drew ' + JSON.stringify(b.texts));
  assert.equal(w.game.winnerText, 'CY WINS!');
});

test('the win banner color follows Unique colors and Line color changed during it (#391)', () => {
  const w = load();
  w.we.applyUserProperties({ colorful: { value: true }, linecolor: { value: '1 1 1' } });
  firstWins(w.game);
  const hue = w.game.fighters[0].hue;
  assert.equal(w.banner('#1 WINS!').color, `hsl(${hue},80%,66%)`);
  w.we.applyUserProperties({ colorful: { value: false } });
  assert.equal(w.banner('#1 WINS!').color, 'rgb(255,255,255)');
  w.we.applyUserProperties({ linecolor: { value: '1 0 0' } });
  assert.equal(w.banner('#1 WINS!').color, 'rgb(255,0,0)');
});
