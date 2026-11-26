// Specials hold their depth (issue #246): a fighter that starts a special while
// walking in depth stops there, as it does in a strike, instead of gliding on at
// its walking speed. The dive and the wall run steer their depth on purpose; the
// teleport and the substitution move the fighter behind its target. Math.random
// is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

// Loads the wallpaper with Math.random fixed at 0.99: no random jumps, dashes or reactions
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
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}
const DT = 1 / 60;
const byId = (game, id) => [...game.MOVES, ...game.SUPER, ...game.MAGIC, ...game.NINJA].find(m => m.id === id);

// a stands at z 40 walking in depth at vz; e stands in hitstun 30 px ahead at z 49, the
// largest depth gap a move starts from, so it neither moves nor blocks. Only a is stepped,
// until the move ends or hands over to another.
function fight(id, vz) {
  const game = load();
  const [a, e] = game.fighters;
  Object.assign(a, { x: 300, z: 40, alt: 0, va: 0, vx: 0, vz, facing: 1, state: 'idle', hp: 1000, cool: 99, retarget: 99, target: e });
  Object.assign(e, { x: 330, z: 49, alt: 0, va: 0, vx: 0, vz: 0, facing: -1, state: 'hit', st: 0, dur: 99, hp: 1000, cool: 99, retarget: 99, target: a });
  for (const f of game.fighters) f.W = f.joints();
  const m = byId(game, id);
  a.startMove(m);
  for (let t = 0; t < 3 && a.state === 'attack' && a.move === m; t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
  return { game, a, e };
}

const STEERED = ['dive', 'wallrun', 'teleport', 'substitute'];
test('every special started while walking in depth ends within 2 px of the depth it started at', () => {
  const game = load();
  const ids = [...game.SUPER, ...game.MAGIC, ...game.NINJA].map(m => m.id).filter(id => !STEERED.includes(id));
  assert.ok(ids.length >= 10, 'specials checked: ' + ids);
  const drift = ids.map(id => [id, Math.abs(fight(id, 36).a.z - 40)]).filter(([, d]) => d > 2);
  assert.deepEqual(drift, [], 'drift in depth');
});

test('a barrage started at the largest depth gap lands every punch while walking in depth', () => {
  const still = fight('barrage', 0), moving = fight('barrage', 36);
  const hits = r => r.game.stats.hits.barrage || 0;
  assert.ok(hits(still) >= 10, 'standing still the barrage lands ' + hits(still));
  assert.equal(hits(moving), hits(still), 'punches landed');
  assert.ok(Math.abs(1000 - moving.e.hp - (1000 - still.e.hp)) < 1e-9, 'damage ' + (1000 - moving.e.hp) + ' vs ' + (1000 - still.e.hp));
  assert.equal(still.e.state, 'launched', 'standing still the finisher launches the target');
  assert.equal(moving.e.state, 'launched', 'the finisher launched the target');
});
