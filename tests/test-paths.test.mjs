// Every test finds the repository's files from its own location (import.meta.url), not from
// the working directory, so a single test file also runs from tests/ or an editor (#468).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'test-paths.test.mjs');

test('no test reads a file by a path relative to the working directory', () => {
  const bad = [];
  for (const f of files) {
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      // A file call whose path is a string literal, or a join() of one
      if (/\b(readFileSync|readdirSync|existsSync|statSync|readFile|readdir)\(\s*(['"`]|join\()/.test(line)) bad.push(f + ':' + (i + 1) + ': ' + line.trim());
      // A folder named as a bare string, to be joined later
      if (/^const \w+ = '[\w./-]+';\s*$/.test(line) && /'(wallpaper|docs|scripts)\b/.test(line)) bad.push(f + ':' + (i + 1) + ': ' + line.trim());
    });
  }
  assert.deepEqual(bad, []);
});
