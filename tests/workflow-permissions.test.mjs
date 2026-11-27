import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n');
const ci = read('ci.yml');
const autoMerge = read('dependabot-auto-merge.yml');
const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, read(f)]);

const indent = (line) => line.match(/^ */)[0].length;

// A top-level block: from "<key>:" to the next line that starts at column zero.
function topBlock(text, key) {
  const m = text.match(new RegExp('^' + key + ':(.*)\\n((?:[ \\t]+.*\\n|\\n)*)', 'm'));
  assert.ok(m, 'the workflow has a top-level ' + key);
  return { inline: m[1].trim(), body: m[2].trim() };
}

// The value of a step's "if:", with a folded (>-) value joined into one line.
function stepCondition(text, marker) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes(marker));
  assert.ok(at >= 0, 'a step runs ' + marker);
  // Walk up to the "- " that starts this step.
  let start = at;
  while (start > 0 && !/^\s*- /.test(lines[start])) start--;
  const stepIndent = indent(lines[start]);
  let end = start + 1;
  while (end < lines.length && !(lines[end].trim() && indent(lines[end]) <= stepIndent)) end++;
  const step = lines.slice(start, end);
  const i = step.findIndex((l) => /^\s*(- )?if:/.test(l));
  assert.ok(i >= 0, 'the step that runs ' + marker + ' has a condition');
  const value = step[i].replace(/^\s*(- )?if:\s*/, '').trim();
  if (!/^>-?$/.test(value)) return value;
  const keyIndent = indent(step[i].replace('- ', '  '));
  const folded = [];
  for (let j = i + 1; j < step.length && indent(step[j]) > keyIndent; j++) folded.push(step[j].trim());
  return folded.join(' ');
}

test('only minor and patch Dependabot updates merge themselves (#41, #428)', () => {
  // An update fetch-metadata cannot classify leaves update-type empty: a
  // "!= semver-major" test would let it merge itself.
  assert.equal(
    stepCondition(autoMerge, 'gh pr merge'),
    "steps.metadata.outputs.update-type == 'version-update:semver-minor' || " +
      "steps.metadata.outputs.update-type == 'version-update:semver-patch'",
  );
});

test('the auto-merge job runs only on pull requests Dependabot opened (#468)', () => {
  // The job holds contents: write and pull-requests: write; its own condition keeps it off
  // every other pull request.
  const job = autoMerge.match(/^  auto-merge:\n((?: {4,}.*\n|\n)*)/m);
  assert.ok(job, 'the workflow has an auto-merge job');
  const cond = job[1].split('\n').find((l) => /^ {4}if:/.test(l));
  assert.ok(cond, 'the auto-merge job has a job-level if');
  assert.equal(cond.replace(/^ {4}if:\s*/, '').trim(), "github.event.pull_request.user.login == 'dependabot[bot]'");
});

test('the auto-merge workflow grants nothing at workflow level, and write only to its job (#428)', () => {
  const perms = topBlock(autoMerge, 'permissions');
  assert.equal(perms.inline, '{}');
  assert.equal(perms.body, '');
  assert.doesNotMatch(autoMerge, /write-all/);
  for (const line of autoMerge.split('\n')) {
    // jobs.<job>.permissions.<scope> sits at six spaces.
    if (/:\s*write\b/.test(line)) assert.ok(indent(line) >= 6, 'write access outside a job: ' + line.trim());
  }
});

test('CI reads the repository and nothing more (#428)', () => {
  const perms = topBlock(ci, 'permissions');
  assert.equal(perms.inline, '');
  assert.equal(perms.body, 'contents: read');
  assert.doesNotMatch(ci, /write/);
});

test('every checkout leaves no credentials behind (#133, #428)', () => {
  let checkouts = 0;
  for (const [name, text] of workflows) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!/uses:\s*actions\/checkout@/.test(line)) return;
      checkouts++;
      // The step's other keys, down to the next step or the end of the job.
      const keyIndent = indent(line.replace('- ', '  '));
      const rest = [];
      for (let j = i + 1; j < lines.length && (!lines[j].trim() || indent(lines[j]) >= keyIndent) && !/^\s*- /.test(lines[j]); j++) rest.push(lines[j]);
      assert.ok(rest.some((l) => /^\s+persist-credentials:\s*false\s*$/.test(l)), name + ' line ' + (i + 1) + ' checks out without persist-credentials: false');
    });
  }
  assert.ok(checkouts > 0, 'some workflow checks out the repository');
});
