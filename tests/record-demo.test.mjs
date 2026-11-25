// The demo recorder patches main.js on the fly; this fails if main.js changes so that it no longer can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exposeFighters } from '../scripts/record-demo.mjs';

test('the demo recorder can hand the fighters to the page', () => {
  const src = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');
  const out = exposeFighters(src);
  assert.match(out, /window\.__fighters = \(\) => fighters;\nrequestAnimationFrame\(frame\);\n\}\)\(\);\n$/);
});

test('the demo recorder refuses a main.js it cannot patch', () => {
  assert.throws(() => exposeFighters('(() => {})();'), /no longer ends with/);
});

// demo.gif was last recorded with this seed, the one where all eight move styles appear.
// The script's default, its header and AGENTS.md must all name it, so that a re-record
// following the documented command shows every style.
const DEMO_SEED = 29;

test('the script default, its header and AGENTS.md all name the demo seed', () => {
  const script = readFileSync(new URL('../scripts/record-demo.mjs', import.meta.url), 'utf8');
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.equal(Number(script.match(/const opt = \{ seed: (\d+),/)?.[1]), DEMO_SEED, 'script default');
  assert.equal(Number(script.match(/^\/\/ +node scripts\/record-demo\.mjs --seed (\d+)/m)?.[1]), DEMO_SEED, 'script header');
  assert.equal(Number(agents.match(/^node scripts\/record-demo\.mjs --seed (\d+)/m)?.[1]), DEMO_SEED, 'AGENTS.md');
});
