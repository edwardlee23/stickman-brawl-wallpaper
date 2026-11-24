// Checks that the wallpaper's files agree with each other: project.json is
// valid, every settings label is translated in every language, every setting
// the panel offers is read by main.js, and wallpaper/ holds only the files
// Wallpaper Engine needs, since the Workshop upload takes the whole folder.
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
  for (const [lang, table] of Object.entries(localization)) {
    for (const t of tokens) assert.ok(t in table, `${lang} is missing ${t}`);
    for (const t of Object.keys(table)) assert.ok(tokens.has(t), `${lang} has unused ${t}`);
  }
});

test('main.js reads every setting in project.json', () => {
  const read = new Set([...main.matchAll(/\bp\.(\w+)/g)].map(m => m[1]));
  const styles = main.match(/styles:\s*\{([^}]*)\}/)[1];
  for (const s of styles.matchAll(/(\w+):/g)) read.add('style' + s[1]);
  for (const key of Object.keys(properties)) {
    assert.ok(read.has(key), `main.js never reads "${key}"`);
  }
});
