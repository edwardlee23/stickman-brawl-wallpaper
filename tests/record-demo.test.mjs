// The demo recorder patches main.js on the fly; this fails if main.js changes so that it no longer can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exposeFighters, parseArgs, launchOptions } from '../scripts/record-demo.mjs';

test('the demo recorder can hand the fighters to the page', () => {
  const src = readFileSync(new URL('../wallpaper/main.js', import.meta.url), 'utf8');
  const out = exposeFighters(src);
  assert.match(out, /window\.__fighters = \(\) => fighters;\nrequestAnimationFrame\(frame\);\n\}\)\(\);\n$/);
});

test('the demo recorder refuses a main.js it cannot patch', () => {
  assert.throws(() => exposeFighters('(() => {})();'), /no longer ends with/);
});

// Any change to main.js can shift the random sequence, so a seed that showed all eight move
// styles once may miss some later (issue #178). No seed is fixed: a recording needs --seed,
// and the docs say to run --scan first and pick a seed that shows every style today.
test('a recording needs a seed; a scan does not', () => {
  assert.throws(() => parseArgs([]), /--seed/);
  assert.deepEqual(parseArgs(['--scan', '1-3']).scan, { from: 1, to: 3 });
  assert.equal(parseArgs(['--seed', '23']).seed, 23);
});

test('the script header and AGENTS.md say to scan first and name no fixed seed', () => {
  const script = readFileSync(new URL('../scripts/record-demo.mjs', import.meta.url), 'utf8');
  const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  for (const [name, text, prefix] of [['script header', script, '\\/\\/ +'], ['AGENTS.md', agents, '']]) {
    const scanAt = text.search(new RegExp('^' + prefix + 'node scripts\\/record-demo\\.mjs --scan', 'm'));
    const seedAt = text.search(new RegExp('^' + prefix + 'node scripts\\/record-demo\\.mjs --seed <n>', 'm'));
    assert.ok(scanAt >= 0 && seedAt > scanAt, name + ': --scan, then --seed <n>');
    assert.doesNotMatch(text, /record-demo\.mjs --seed \d/, name + ' names a fixed seed');
  }
});

// Chrome draws the canvas on the GPU by default, and then a few frames of the same seed can
// differ by one in a colour value from one run to the next. Drawing in software keeps them equal.
test('the recorder launches Chrome with the canvas drawn in software', () => {
  for (const env of [{}, { CHROME: 'C:/chromium/chrome.exe' }]) {
    const args = launchOptions(env).args;
    assert.ok(args.includes('--disable-accelerated-2d-canvas') && args.includes('--disable-gpu'), JSON.stringify(env));
  }
  assert.equal(launchOptions({ CHROME: 'C:/chromium/chrome.exe' }).executablePath, 'C:/chromium/chrome.exe');
  assert.equal(launchOptions({}).channel, 'chrome');
});
