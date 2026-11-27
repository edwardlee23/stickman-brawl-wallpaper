// Runs main.js in a sandbox with a recording canvas, to check that the win banner and the
// score line are shrunk to fit a narrow (portrait) screen with long names (issue #249)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

// Text width from the font size in ctx.font: 0.86 em per Latin character, 1 em per CJK one,
// about what Chrome measures for the banner's 900 26px "Microsoft JhengHei"
const textW = (t, font) => {
  const px = Number(/([\d.]+)px/.exec(font)[1]);
  return Array.from(String(t)).reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 0.86 : 1) * px, 0);
};
// Loads the wallpaper; every fillText is recorded with the font and textAlign it was drawn in
function load(search, w, h) {
  const texts = [];
  const state = { font: '10px sans-serif', textAlign: 'start' };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return t => ({ width: textW(t, state.font) });
      if (k === 'fillText') return (t, x, y) => { texts.push({ t, x, y, font: state.font, align: state.textAlign }); };
      return () => grad;
    },
    set: (_, k, v) => { state[k] = v; return true; },
  });
  const { game, window } = loadMain({ search, width: w, height: h, ctx });
  return { game, we: window.wallpaperPropertyListener, texts };
}
const span = o => {
  const w = textW(o.t, o.font);
  const left = o.align === 'center' ? o.x - w / 2 : o.x;
  return [left, left + w];
};
// The margin kept free at each side: the score line starts this far in
const margin = 14;

// Knocks out every fighter but the one given and lets the round end, then draws a frame
function winBy(game, texts, i) {
  for (const f of game.fighters) f.W = f.joints();
  for (const f of game.fighters) if (f.id !== i) { f.hp = 0; f.ko(0, 0); }
  game.checkRound(0);
  texts.length = 0; game.render();
  return texts.find(o => o.t === game.winnerText);
}

const cases = [
  ['a 12-character CJK name at 1080x1920, 100%', '?count=3&mode=ffa', 1080, 1920, 1, '火柴人格鬥火柴人格鬥火柴'],
  ['a 12-letter Latin name at 1080x1920, 100%', '?count=3&mode=ffa', 1080, 1920, 1, 'MMMMMMMMMMMM'],
  ['a 12-character CJK name at 1280x1024, 200%', '?count=3&mode=ffa', 1280, 1024, 2, '火柴人格鬥火柴人格鬥火柴'],
  ['BLUE WINS! at 1080x1920, 200%', '?count=4&mode=teams', 1080, 1920, 2, ''],
];
for (const [what, search, w, h, scale, name] of cases) {
  test(`the win banner for ${what} fits the screen`, () => {
    const { game, we, texts } = load(search, w, h);
    we.applyUserProperties({ fighternames: { value: name }, figurescale: { value: scale * 100 } });
    assert.equal(game.cfg.scale, scale);
    const worldW = w / (scale * h / 540);
    const i = game.fighters.findIndex(f => game.cfg.mode !== 'teams' || f.team === 1);
    const banner = winBy(game, texts, i);
    assert.ok(banner, 'no banner drawn');
    const [l, r] = span(banner);
    assert.ok(l >= margin - 1e-9 && r <= worldW - margin + 1e-9, `"${banner.t}" spans ${l.toFixed(1)} to ${r.toFixed(1)} of ${worldW}`);
  });
}

test('the win banner keeps its full size where it fits', () => {
  const { game, we, texts } = load('?count=3&mode=ffa', 1280, 720);
  we.applyUserProperties({ fighternames: { value: 'Bo' } });
  assert.match(winBy(game, texts, 0).font, /\b26px/);
});

for (const [script, name] of [['CJK', '火柴人格鬥火柴人格鬥火柴'], ['Latin', 'MMMMMMMMMMMM']]) {
  test(`a score line of three 12-character ${script} names fits a 1080x1920 screen`, () => {
    const { game, we, texts } = load('?count=3&mode=ffa', 1080, 1920);
    we.applyUserProperties({ fighternames: { value: [name, name, name].join(',') }, showscore: { value: true } });
    const worldW = 1080 / (1920 / 540);
    game.score.wins.splice(0, 3, 3, 2, 1);
    for (const f of game.fighters) f.W = f.joints();
    texts.length = 0; game.render();
    const parts = texts.filter(o => o.t.includes('×'));
    assert.equal(parts.length, 3, 'three names on the score line');
    const l = span(parts[0])[0], r = span(parts[2])[1];
    assert.ok(l >= margin - 1e-9 && r <= worldW - margin + 1e-9, `score line spans ${l.toFixed(1)} to ${r.toFixed(1)} of ${worldW}`);
  });
}

test('the score line keeps its full size where it fits', () => {
  const { game, we, texts } = load('?count=3&mode=ffa', 1280, 720);
  we.applyUserProperties({ fighternames: { value: 'Ann,Bo,Cy' }, showscore: { value: true } });
  game.score.wins.splice(0, 3, 3, 2, 1);
  for (const f of game.fighters) f.W = f.joints();
  texts.length = 0; game.render();
  const parts = texts.filter(o => o.t.includes('×'));
  assert.equal(parts.length, 3);
  for (const o of parts) assert.match(o.font, /\b14px/);
});
