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

test('CI groups pull request runs by ref and gives every other run a group of its own (#358)', () => {
  const block = concurrencyBlock();
  const group = block.match(/^\s+group:\s*(.+?)\s*$/m);
  assert.ok(group, 'concurrency sets group');
  // A group keeps at most one pending run: a third push to main would cancel
  // the one waiting, even with cancel-in-progress off, if main shared a group.
  assert.equal(group[1], "ci-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}");
});
