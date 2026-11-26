// Runs main.js in a sandbox with a stubbed canvas and window, then checks the
// "Round rules" variants (issue #89): King, Ladder and Survival, and that
// Normal leaves rounds as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(search = '?count=6&mode=ffa') {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, listeners,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  return window;
}

// Sets the round rules through the settings panel, which starts a new round
function withRules(rules, search) {
  const window = load(search);
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: rules } });
  return Object.assign(window.__stickmanBrawl, { window });
}

// Knocks f out without a ragdoll, which checkRound does not need
const knockOut = f => { f.hp = 0; f.state = 'ko'; };
// Knocks f out with a ragdoll, for a fight that runs on
const ragdoll = f => { f.hp = 0; f.W = f.joints(); f.ko(0, 0); };

// Ends the round with only the given fighters standing, then lets the next one start
function endRound(game, winners) {
  for (const f of game.fighters) if (!winners.includes(f)) knockOut(f);
  game.checkRound(0);
  game.checkRound(5);
}

test('the round rules default to Normal', () => {
  const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));
  const p = project.general.properties.roundrules;
  assert.equal(p.order, 6);
  assert.equal(p.value, 'normal');
  assert.equal(load().__stickmanBrawl.cfg.rules, 'normal');
});

test('Normal: every fighter starts at full health and fights', () => {
  const game = withRules('normal');
  for (let r = 0; r < 3; r++) {
    for (const f of game.fighters) {
      assert.equal(f.maxHp, 100);
      assert.equal(f.hp, 100);
      assert.ok(!f.king);
      assert.notEqual(f.state, 'wait');
    }
    const [w] = game.fighters;
    w.hp = 40;
    endRound(game, [w]);
  }
});

test('King: one fighter has double health and every other fighter targets it', () => {
  const game = withRules('king');
  for (let r = 0; r < 5; r++) {
    const kings = game.fighters.filter(f => f.maxHp === 200);
    assert.equal(kings.length, 1, 'exactly one king');
    const [king] = kings;
    assert.ok(king.king);
    assert.equal(king.hp, 200);
    for (const f of game.fighters) if (f !== king) {
      assert.equal(f.maxHp, 100);
      for (let i = 0; i < 20; i++) assert.equal(game.pickTarget(f), king);
    }
    // Once the king is out, the others go back to picking whoever is near
    knockOut(king);
    const [a] = game.fighters.filter(f => f !== king);
    assert.ok(game.pickTarget(a) && game.pickTarget(a) !== king);
    game.newRound();
  }
});

test('King is ignored in teams mode', () => {
  const game = withRules('king', '?count=6&mode=teams');
  for (const f of game.fighters) assert.equal(f.maxHp, 100);
});

test('Ladder: at most two fighters fight, and the next one steps in at a knockout', () => {
  const game = withRules('ladder');
  const fighting = () => game.fighters.filter(f => f.alive && f.state !== 'wait');
  assert.equal(fighting().length, 2);
  assert.equal(game.fighters.filter(f => f.state === 'wait').length, 4);
  for (let t = 0; t < 2; t += 1 / 60) {
    game.update(1 / 60);
    assert.ok(fighting().length <= 2);
  }
  // The two fighters target each other, never someone waiting
  const [a, b] = fighting();
  assert.equal(game.pickTarget(a), b);
  assert.equal(game.pickTarget(b), a);
  const before = new Set(game.fighters.filter(f => f.state === 'wait'));
  ragdoll(a);
  game.update(1 / 60);
  const now = fighting();
  assert.equal(now.length, 2, 'the next waiting fighter entered');
  assert.ok(now.includes(b), 'the winner stays');
  assert.ok(before.has(now.find(f => f !== b)));
  assert.equal(game.fighters.filter(f => f.state === 'wait').length, 3);
  // Waiting fighters cannot be hit
  for (const f of game.fighters) if (f.state === 'wait') assert.equal(f.hittable, false);
});

test('Ladder: the round goes on until one fighter is left', () => {
  const game = withRules('ladder', '?count=4&mode=ffa');
  const rounds = game.stats.rounds;
  for (let k = 0; k < 2; k++) {
    const [a] = game.fighters.filter(f => f.alive && f.state !== 'wait');
    ragdoll(a);
    game.update(1 / 60);
    assert.equal(game.stats.rounds, rounds, 'not over while fighters wait');
  }
  ragdoll(game.fighters.filter(f => f.alive && f.state !== 'wait')[0]);
  game.update(1 / 60);
  assert.equal(game.stats.rounds, rounds + 1);
});

test('Ladder: each bout gets the full time before the round times out', () => {
  const game = withRules('ladder');
  for (let t = 0; t < 2; t += 1 / 60) game.update(1 / 60);
  ragdoll(game.fighters.find(f => f.alive && f.state !== 'wait'));
  game.update(1 / 60);
  const list = game.fighters;
  game.checkRound(149);
  assert.equal(game.fighters, list, 'the round goes on');
});

test('Survival: a winner keeps its health, the knocked-out return at full', () => {
  const game = withRules('survival');
  const w = game.fighters[2];
  w.hp = 40;
  endRound(game, [w]);
  assert.equal(game.fighters[2].hp, 40);
  for (const f of game.fighters) if (f.id !== 2) assert.equal(f.hp, 100);
  // Below 15% the winner is restored too
  game.fighters[2].hp = 10;
  endRound(game, [game.fighters[2]]);
  assert.equal(game.fighters[2].hp, 100);
});

test('Survival: a round that times out or is reset restores everyone', () => {
  const game = withRules('survival');
  game.fighters[0].hp = 40;
  game.fighters[1].hp = 60;
  game.checkRound(151);
  for (const f of game.fighters) assert.equal(f.hp, 100);
  // A reset from the settings panel, here a new figure size
  game.fighters[0].hp = 40;
  game.fighters[1].hp = 60;
  game.window.wallpaperPropertyListener.applyUserProperties({ figurescale: { value: 150 } });
  for (const f of game.fighters) assert.equal(f.hp, 100);
});

test('Survival: a settings change during the win banner restores everyone (#123)', () => {
  const window = load();
  const we = window.wallpaperPropertyListener;
  we.applyUserProperties({ roundrules: { value: 'survival' } });
  const game = window.__stickmanBrawl;
  const w = game.fighters[2];
  w.hp = 40;
  for (const f of game.fighters) if (f !== w) knockOut(f);
  game.checkRound(0);                     // #3 WINS! is on screen
  we.applyUserProperties({ figurescale: { value: 150 } });
  for (const f of game.fighters) assert.equal(f.hp, 100, '#' + (f.id + 1) + ' starts at ' + f.hp);

  // A Normal round won at 30, then the rules switched to Survival during the banner
  we.applyUserProperties({ roundrules: { value: 'normal' } });
  const v = game.fighters[1];
  v.hp = 30;
  for (const f of game.fighters) if (f !== v) knockOut(f);
  game.checkRound(0);
  we.applyUserProperties({ roundrules: { value: 'survival' } });
  for (const f of game.fighters) assert.equal(f.hp, 100, '#' + (f.id + 1) + ' starts at ' + f.hp);
});

test('Ladder: a click with Click to blast on leaves the waiting fighters where they are (#341)', () => {
  const window = load();
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: 'ladder' }, clickblast: { value: true } });
  const game = window.__stickmanBrawl;
  // World units to CSS pixels, as main.js scales the page: figure scale times window height over 540
  const S = game.cfg.scale * window.innerHeight / 540, worldW = window.innerWidth / S;
  let t = 1e6;                            // Clicks a second apart, past the blast cooldown
  const click = c => { t += 1000; for (const fn of window.listeners.pointerdown) fn({ button: 0, timeStamp: t, clientX: c.x * S, clientY: c.y * S }); };
  const waiting = game.fighters.filter(f => f.state === 'wait');
  assert.ok(waiting.some(f => f.x < worldW / 2) && waiting.some(f => f.x > worldW / 2), 'waiting fighters on both sides');
  for (const f of waiting) {
    const before = { x: f.x, z: f.z, alt: f.alt };
    click(f.bodyPoint());
    assert.equal(f.state, 'wait', '#' + (f.id + 1) + ' was launched by a click on it');
    assert.deepEqual({ x: f.x, z: f.z, alt: f.alt }, before, '#' + (f.id + 1) + ' moved');
  }
  assert.equal(game.fighters.filter(f => f.alive && f.state !== 'wait').length, 2, 'still two fighting');
  // The same clicks reach a fighter that is not waiting, so the ones above landed on their fighters
  const a = game.fighters.find(f => f.alive && f.state !== 'wait');
  assert.notEqual(a.state, 'launched', 'a click on a waiting fighter launched #' + (a.id + 1));
  click(a.bodyPoint());
  assert.equal(a.state, 'launched', 'a click on a fighting fighter launches it');
});

test('King: the crown fades with its king during a teleport (#120)', () => {
  // A context that keeps the styles set on it and logs each fill with the alpha it used
  const fills = [], state = {};
  const ctx = new Proxy(state, {
    get: (s, k) => (k in s ? s[k] : (...a) => { if (k === 'fill') fills.push({ style: s.fillStyle, alpha: s.globalAlpha }); return { addColorStop() {} }; }),
    set: (s, k, v) => { s[k] = v; return true; },
  });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=3&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  window.wallpaperPropertyListener.applyUserProperties({ roundrules: { value: 'king' } });
  const game = window.__stickmanBrawl;
  const king = game.fighters.find(f => f.king);
  for (const f of game.fighters) f.W = f.joints();
  king.alpha = 0.1;
  fills.length = 0;
  game.render();
  const crown = fills.filter(f => f.style === '#ffd43b');
  assert.ok(crown.length, 'no crown drawn');
  for (const c of crown) assert.ok(c.alpha <= 0.1, 'the crown is drawn at alpha ' + c.alpha);
});

test('Ladder: after a double knockout the next pair steps in and the round goes on (#126)', () => {
  const game = withRules('ladder', '?count=5&mode=ffa');
  const rounds = game.stats.rounds;
  const fighting = () => game.fighters.filter(f => f.alive && f.state !== 'wait');
  const [a, b] = fighting();
  const waiting = new Set(game.fighters.filter(f => f.state === 'wait'));
  ragdoll(a); ragdoll(b);
  game.checkRound(1 / 60);
  assert.equal(game.stats.rounds, rounds, 'the round ended');
  const now = fighting();
  assert.equal(now.length, 2, 'the next two waiting fighters stepped in');
  for (const f of now) assert.ok(waiting.has(f));
});

test('Ladder: a double knockout that leaves one fighter waiting is a draw, not a win for it (#126)', () => {
  const game = withRules('ladder', '?count=3&mode=ffa');
  const [a, b] = game.fighters.filter(f => f.alive && f.state !== 'wait');
  const [c] = game.fighters.filter(f => f.state === 'wait');
  ragdoll(a); ragdoll(b);
  game.checkRound(1 / 60);
  assert.notEqual(game.winnerText, '#' + (c.id + 1) + ' WINS!', 'a fighter that never fought won');
  assert.equal(game.winnerText, 'DRAW');
  assert.equal(game.score.wins[c.id], 0, 'a win was scored for it');
});
