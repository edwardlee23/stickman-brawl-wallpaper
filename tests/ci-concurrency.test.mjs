import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

// The top-level concurrency block: from "concurrency:" to the next line that
// starts at column zero.
function concurrencyBlock() {
  const m = ci.match(/^concurrency:\n((?:[ \t]+.*\n|\n)*)/m);
  assert.ok(m, 'ci.yml has a top-level concurrency block');
  return m[1];
}

test('CI cancels an older run only for pull requests, never on main (#358)', () => {
  const block = concurrencyBlock();
  const cancel = block.match(/^\s+cancel-in-progress:\s*(.+?)\s*$/m);
  assert.ok(cancel, 'concurrency sets cancel-in-progress');
  // A push to main must not cancel the run of the commit merged just before,
  // or that commit ends with no completed check of its own.
  assert.equal(cancel[1], "${{ github.event_name == 'pull_request' }}");
});

test('CI still groups runs by ref, so a pull request run replaces its older one (#358)', () => {
  const block = concurrencyBlock();
  assert.match(block, /^\s+group:\s*ci-\$\{\{ github\.ref \}\}\s*$/m);
});
