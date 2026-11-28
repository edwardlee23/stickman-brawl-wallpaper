// The settings AGENTS.md states for CI, Dependabot, the check script and the demo recording,
// pinned so that a change to any of them fails a test instead of passing unnoticed (#508).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECS } from '../scripts/record-demo.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the CI job is named check, the check main requires (#508)', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.match(/^jobs:\n {2}check:.*\n((?: {4,}.*\n|\n)*)/m);
  assert.ok(job, 'ci.yml has a check job');
  const name = job[1].split('\n').find((l) => /^ {4}name:/.test(l));
  assert.ok(name, 'the check job has a name');
  assert.equal(name.replace(/^ {4}name:\s*/, '').trim(), 'check');
});

test('both Dependabot ecosystems wait 7 days before proposing an update (#508)', () => {
  const dependabot = read('.github/dependabot.yml');
  const entries = dependabot.split(/\n(?= {2}- package-ecosystem:)/).slice(1);
  const ecosystems = entries.map((e) => e.match(/package-ecosystem:\s*(\S+)/)[1]);
  assert.deepEqual(ecosystems.sort(), ['github-actions', 'npm']);
  for (const e of entries) {
    assert.match(e, /\n {4}cooldown:\n {6}default-days: 7\n/, e.match(/package-ecosystem:\s*(\S+)/)[1] + ' has a 7-day cooldown');
  }
});

test('Dependabot updates merge themselves by squash, once the check passes (#508)', () => {
  const autoMerge = read('.github/workflows/dependabot-auto-merge.yml');
  const merges = autoMerge.split('\n').filter((l) => /gh pr merge/.test(l));
  assert.equal(merges.length, 1);
  assert.equal(merges[0].trim(), 'run: gh pr merge --auto --squash "$PR_URL"');
});

test('npm run check checks the syntax of main.js, then runs the tests (#508)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.check, 'node --check wallpaper/main.js && node --test');
});

test('the demo records six fighters for 14 seconds, as its header and the README say (#508)', () => {
  const script = read('scripts/record-demo.mjs');
  assert.equal(SECS, 14);
  const query = script.match(/^const QUERY = '([^']*)';$/m);
  assert.ok(query, 'record-demo.mjs sets QUERY');
  const params = new URLSearchParams(query[1]);
  assert.equal(params.get('count'), '6');
  assert.equal(params.get('mode'), 'ffa');
  assert.match(script, /Six fighters, free-for-all,\n\/\/ 14 seconds/);
  assert.match(read('README.md'), /!\[Six fighters brawling in free-for-all mode\]\(demo\.gif\)/);
});
