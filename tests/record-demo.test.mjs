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
