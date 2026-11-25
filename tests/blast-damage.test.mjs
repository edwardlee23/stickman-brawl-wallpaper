// The energy blast takes each shot's damage from its SUPER table entry
// (issue #222): changing the table's dmg changes the damage a blast deals.
// Math.random is stubbed, so each run is the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('wallpaper/main.js', 'utf8');

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
  // 0.99: no random jumps, dashes, blocks or launches
  vm.runInContext('Math.random = () => 0.99;', context);
  vm.runInContext(source, context, { filename: 'wallpaper/main.js' });
  return window.__stickmanBrawl;
}

const DT = 1 / 60;

// Fires one blast at a target 220 px away and returns the hp the target lost to the blast's shots
function blastDamage(tableDmg) {
  const game = load();
  const [a, e] = game.fighters;
  const blast = game.SUPER.find(m => m.id === 'blast');
  blast.dmg = tableDmg;
  for (const [f, x, facing] of [[a, 300, 1], [e, 520, -1]]) {
    Object.assign(f, { x, facing, z: 50, alt: 0, va: 0, vx: 0, vz: 0, state: 'idle', hp: 1000, cool: 99, retarget: 99 });
    f.W = f.joints();
  }
  a.target = e; e.target = a;
  // Count only the hp the blast's shots take, not what later moves take
  let lost = 0;
  const takeHit = e.takeHit.bind(e);
  e.takeHit = (src, m, ...rest) => {
    const hp = e.hp, r = takeHit(src, m, ...rest);
    if (m === blast) lost += hp - e.hp;
    return r;
  };
  a.startMove(blast);
  for (let t = 0; t < 3; t += DT) game.update(DT);
  return lost;
}

test('the hp a blast takes follows the dmg in its SUPER table entry', () => {
  const low = blastDamage(4), high = blastDamage(40);
  assert.ok(low > 0, 'the blast hit');
  assert.ok(Math.abs(high / low - 10) < 0.01, `10x the table dmg gives 10x the damage (${low} -> ${high})`);
});

test('every blast shot carries the dmg of its SUPER table entry', () => {
  const game = load();
  const [a, e] = game.fighters;
  const blast = game.SUPER.find(m => m.id === 'blast');
  blast.dmg = 17;
  Object.assign(a, { x: 300, facing: 1, z: 50, alt: 0, cool: 99, retarget: 99 }); a.W = a.joints();
  Object.assign(e, { x: 900, facing: -1, z: 50, alt: 0, cool: 99, retarget: 99 }); e.W = e.joints();
  a.target = e;
  a.startMove(blast);
  for (let t = 0; t < 1; t += DT) { a.update(DT); if (!a.rag) a.W = a.joints(); }
  const fired = game.shots.filter(s => s.owner === a);
  assert.ok(fired.length > 0, 'the blast fired shots');
  for (const s of fired) assert.equal(s.dmg, 17);
});
