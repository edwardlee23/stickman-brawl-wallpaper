// Checks that the wallpaper's files agree with each other: project.json is
// valid, every settings label is translated in every language, every setting
// the panel offers is read by applyUserProperties in main.js, and wallpaper/
// holds only the files Wallpaper Engine needs, since the Workshop upload takes
// the whole folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'wallpaper';
const project = JSON.parse(readFileSync(join(DIR, 'project.json'), 'utf8'));
const main = readFileSync(join(DIR, 'main.js'), 'utf8');
const { properties, localization } = project.general;

test('the entry file and preview image exist', () => {
  assert.ok(existsSync(join(DIR, project.file)), project.file);
  assert.ok(existsSync(join(DIR, project.preview)), project.preview);
});

test('the wallpaper folder holds only the files Wallpaper Engine needs', () => {
  const want = ['index.html', 'main.js', 'preview.jpg', 'project.json'];
  assert.deepEqual(readdirSync(DIR).sort(), want);
});

test('every label is a ui_ token translated in every language', () => {
  const tokens = new Set();
  for (const p of Object.values(properties)) {
    tokens.add(p.text);
    for (const o of p.options ?? []) tokens.add(o.label);
  }
  for (const t of tokens) assert.match(t, /^ui_/, `label "${t}" is not a ui_ token`);
  assert.deepEqual(Object.keys(localization).sort(), ['en-us', 'zh-chs', 'zh-cht']);
  for (const [lang, table] of Object.entries(localization)) {
    for (const t of tokens) {
      assert.ok(t in table, `${lang} is missing ${t}`);
      assert.ok(typeof table[t] === 'string' && table[t].trim(), `${lang} has an empty ${t}`);
    }
    for (const t of Object.keys(table)) assert.ok(tokens.has(t), `${lang} has unused ${t}`);
  }
});

test('applyUserProperties reads every setting in project.json', () => {
  // Only the listener's body counts: pose code reads p.t, p.aB and so on, and
  // applyGeneralProperties reads p.fps, none of which is a user setting.
  const start = main.indexOf('applyUserProperties(p) {');
  const end = main.indexOf('applyGeneralProperties(', start);
  assert.ok(start >= 0 && end > start, 'applyUserProperties not found');
  const body = main.slice(start, end);
  const read = new Set([...body.matchAll(/\bp\.(\w+)/g)].map(m => m[1]));
  // The style switches are read by one loop over cfg.styles
  if (body.includes("p['style' + s]")) {
    const styles = main.match(/styles:\s*\{([^}]*)\}/)[1];
    for (const s of styles.matchAll(/(\w+):/g)) read.add('style' + s[1]);
  }
  for (const key of Object.keys(properties)) {
    assert.ok(read.has(key), `applyUserProperties never reads "${key}"`);
  }
});
