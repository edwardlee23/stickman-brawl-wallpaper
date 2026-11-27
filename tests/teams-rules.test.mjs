// Teams mode (issue #183): King and Ladder are free-for-all rules, so in teams mode nobody
// waits, nobody is crowned and nobody targets a teammate; fighters are drawn in their team's
// color even with Unique colors on; and the win banner names the team in its color.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMain } from './load-main.mjs';

const RED = '#ff6b6b', BLUE = '#4dabf7';

// Loads the wallpaper with a canvas that records every call, and the fill and stroke
// style in force at that moment
function load(search = '?count=6&mode=teams') {
  const calls = [], style = {};
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, k) => (...a) => { calls.push({ k, a, fill: style.fillStyle, stroke: style.strokeStyle }); return grad; },
    set: (_, k, v) => { style[k] = v; return true; },
  });
  // A seeded generator, so every run is the same (issue #161)
  const { game, window } = loadMain({ search, ctx });
  return { game, we: window.wallpaperPropertyListener, calls };
}

for (const rules of ['ladder', 'king']) {
  test('in teams mode ' + rules + ' rules change nothing: nobody waits or is crowned, and nobody targets a teammate', () => {
    const { game, we } = load();
    we.applyUserProperties({ roundrules: { value: rules } });
    assert.equal(game.cfg.mode, 'teams');
    assert.equal(game.cfg.rules, rules);
    for (let t = 0; t < 1; t += 1 / 60) game.update(1 / 60);
    for (const f of game.fighters) {
      assert.notEqual(f.state, 'wait', 'fighter #' + (f.id + 1) + ' waits');
      assert.ok(!f.king, 'fighter #' + (f.id + 1) + ' is crowned');
      for (let i = 0; i < 5; i++) {
        const e = game.pickTarget(f);
        assert.ok(e, 'fighter #' + (f.id + 1) + ' has a target');
        assert.notEqual(e.team, f.team, 'fighter #' + (f.id + 1) + ' targets teammate #' + (e.id + 1));
      }
    }
  });
}

test('with Unique colors on, teams are still drawn red and blue, not in rainbow hues', () => {
  const { game, we, calls } = load();
  we.applyUserProperties({ colorful: { value: true } });
  assert.equal(game.cfg.colorful, true);
  for (const f of game.fighters) f.W = f.joints();
  game.render();
  const used = new Set(calls.flatMap(c => [c.fill, c.stroke]).filter(v => typeof v === 'string'));
  assert.ok(used.has(RED) && used.has(BLUE), 'team colors used: ' + [...used].join(' '));
  const hues = [...used].filter(v => /^hsl\([\d.]+,80%,66%\)$/.test(v));
  assert.deepEqual(hues, [], 'fighter hues drawn in teams mode');
});

for (const [team, name, color] of [[0, 'RED', RED], [1, 'BLUE', BLUE]]) {
  test('when ' + name + ' wins, the banner reads ' + name + ' WINS! in ' + name + '\'s color', () => {
    const { game, calls } = load();
    for (const f of game.fighters) f.W = f.joints();
    for (const f of game.fighters) if (f.team !== team) { f.hp = 0; f.ko(0, 0); }
    game.checkRound(0);
    assert.equal(game.winnerText, name + ' WINS!');
    calls.length = 0;
    game.render();
    const banner = calls.filter(c => c.k === 'fillText' && c.a[0] === name + ' WINS!');
    assert.ok(banner.length, 'banner drawn');
    for (const c of banner) assert.equal(c.fill, color);
  });
}
