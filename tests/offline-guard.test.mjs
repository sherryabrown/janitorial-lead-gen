import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import './offline-only.mjs';

test('offline suite rejects direct and child-process network access', () => {
  assert.throws(() => fetch('https://example.invalid'), /Network access is disabled/);
  assert.throws(() => connect(443, 'example.invalid'), /Network access is disabled/);
  assert.throws(
    () => execFileSync(process.execPath, ['-e', "fetch('https://example.invalid')"], { stdio: 'pipe' }),
    /Network access is disabled/,
  );
});
