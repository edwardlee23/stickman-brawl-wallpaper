// Runs main.js in a sandbox with a stubbed canvas and window, then dispatches
// pointerdown events to check the "Click to blast" setting (issue #85): a click
// launches nearby fighters away from it, has a cooldown, and does nothing while
// the setting is off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 1280 x 720 at figure size 100%: one world unit is 720 / 540 screen pixels
const S = 720 / 540;

function load() {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const listeners = {};
  const window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const context = vm.createContext({
    window, console, performance, URLSearchParams,
    location: { search: '?count=2&mode=ffa' },
    document: { getElementById: () => canvas, body: { style: {} } },
    requestAnimationFrame() {},
  });
  vm.runInContext(readFileSync('wallpaper/main.js', 'utf8'), context, { filename: 'wallpaper/main.js' });
  const game = window.__stickmanBrawl;
  const [a, b] = game.fighters;
  Object.assign(a, { x: 300, z: 50, alt: 0, facing: 1, state: 'idle', vx: 0, va: 0 });
  Object.assign(b, { x: 900, z: 50, alt: 0, facing: -1, state: 'idle', vx: 0, va: 0 });
  a.W = a.joints(); b.W = b.joints();
  // A click at a world point, as a browser reports it: in CSS pixels of the window
  const click = (x, y, timeStamp = 0) => {
    for (const fn of listeners.pointerdown ?? []) fn({ clientX: x * S, clientY: y * S, button: 0, timeStamp });
  };
  return { game, we: window.wallpaperPropertyListener, a, b, click };
}
const snap = f => JSON.stringify({ x: f.x, z: f.z, alt: f.alt, vx: f.vx, va: f.va, state: f.state });

test('a click with Click to blast on launches a nearby fighter away from it and leaves a far one alone', () => {
  const { we, a, b, click } = load();
  we.applyUserProperties({ clickblast: { value: true } });
  const before = snap(b);
  const c = a.bodyPoint();
  click(c.x - 20, c.y + 30);              // Below and left of a's body
  assert.equal(a.state, 'launched');
  assert.ok(a.vx > 0, `launched rightward, away from the click (vx ${a.vx})`);
  assert.ok(a.va > 0, `launched upward, away from the click (va ${a.va})`);
  assert.equal(snap(b), before, 'the far fighter is untouched');

  const { we: we2, a: a2, click: click2 } = load();
  we2.applyUserProperties({ clickblast: { value: true } });
  const c2 = a2.bodyPoint();
  click2(c2.x + 20, c2.y);
  assert.equal(a2.state, 'launched');
  assert.ok(a2.vx < 0, `launched leftward, away from the click (vx ${a2.vx})`);
});

test('a second click inside the Click to blast cooldown does nothing', () => {
  const { we, a, click } = load();
  we.applyUserProperties({ clickblast: { value: true } });
  const c = a.bodyPoint();
  click(c.x - 20, c.y, 1000);
  assert.equal(a.state, 'launched');
  Object.assign(a, { state: 'idle', vx: 0, va: 0, alt: 0, rot: 0 });
  a.W = a.joints();
  const before = snap(a);
  click(c.x - 20, c.y, 1200);             // 0.2 s later
  assert.equal(snap(a), before, 'a click inside the cooldown changes nothing');
  click(c.x - 20, c.y, 1700);             // 0.7 s after the first
  assert.equal(a.state, 'launched', 'a click after the cooldown works again');
});

test('with Click to blast off (the default), a click changes no fighter', () => {
  const { game, a, b, click } = load();
  assert.equal(game.cfg.clickBlast, false, 'off by default');
  const before = [snap(a), snap(b)];
  const c = a.bodyPoint();
  click(c.x - 20, c.y);
  assert.deepEqual([snap(a), snap(b)], before);
  assert.equal(game.fx.length, 0, 'no effect is drawn');
});

test('a click with Click to blast on pushes a knocked-out ragdoll away', () => {
  const { game, we, a, click } = load();
  we.applyUserProperties({ clickblast: { value: true } });
  a.hp = 0; a.ko(0, 0);
  // Let the body fall and come to rest (a body stops simulating at 5 s; the round would
  // restart before that), then click just left of its hip
  for (let t = 0; t < 2; t += 1 / 60) game.update(1 / 60);
  a.rag.age = 5;
  const hip = a.rag.pts.hip;
  const rest = hip.x;
  game.update(1 / 60);
  assert.equal(hip.x, rest, 'the body is at rest');
  click(hip.x - 25, hip.y);
  assert.ok(hip.x - hip.px > 0, 'the hip moves rightward, away from the click');
  const x0 = hip.x;
  game.update(1 / 60);
  assert.ok(hip.x > x0, 'a body at rest simulates again after the push');
});

test('Click to blast is in the settings panel at order 28 and off by default', () => {
  const project = JSON.parse(readFileSync('wallpaper/project.json', 'utf8'));
  const p = project.general.properties.clickblast;
  assert.ok(p, 'clickblast setting exists');
  assert.deepEqual([p.order, p.type, p.value, p.text], [28, 'bool', false, 'ui_clickblast']);
});
