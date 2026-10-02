import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifiedPublicMethod } from '../scripts/lib/public-method-verification.mjs';

function fixture(code = 'ariba') {
  const url = code === 'ariba' ? 'https://sas.arkansas.gov/procurement/bid-opportunities/' :
    'https://sas.arkansas.gov/procurement/state-contracts/';
  const label = code === 'ariba' ? 'Bid Opportunities' : 'State Contracts';
  const heading = code === 'ariba' ? 'Current Solicitations' : 'State Contracts';
  const bytes = Buffer.from(`<html><head><title>${label}</title></head><body><main>${heading}` +
    '<table><tbody><tr><td>Example listing</td></tr></tbody></table></main></body></html>');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const source = { id: 'source', code, url,
    source_coverage_areas: [{ area_type: 'state', state_code: 'AR' }] };
  const task = { id: 'task', kind: 'source_entry', source_id: source.id };
  const run = { id: 'run', coverage_task_id: task.id, source_id: source.id,
    status: 'review_required', detail: { state: 'content_saved', scope: 'entry_only', content_sha256: hash } };
  const capture = { run_id: run.id, source_id: source.id, requested_url: url, final_url: url,
    content_type: 'text/html', content_base64: bytes.toString('base64'), content_sha256: hash,
    retrieved_at: new Date().toISOString() };
  const state = { id: '05', kind: 'state', state_code: 'AR', source_active: true };
  return { source, state, run, task, capture };
}

test('official public bid listing becomes a bounded opportunity check with explicit scope limit', () => {
  const f = fixture();
  const method = verifiedPublicMethod(f.source, f.state, f.run, f.task, f.capture);
  assert.equal(method.kind, 'opportunity');
  assert.equal(method.method_spec.runner_id, 'public-fetch');
  assert.match(method.verification_evidence.coverage_limit, /other units.*not covered/);
  assert.equal(method.verification_evidence.interpretation, 'pending');
  assert.throws(() => verifiedPublicMethod(f.source, { ...f.state, id: '05091' }, f.run, f.task, f.capture),
    /Arkansas public entry/);
  assert.throws(() => verifiedPublicMethod(f.source, f.state, f.run, f.task,
    { ...f.capture, content_sha256: '0'.repeat(64) }), /bytes do not match/);
});

test('state contracts listing is a contract reference check, not executed award proof', () => {
  const f = fixture('state-contracts');
  const method = verifiedPublicMethod(f.source, f.state, f.run, f.task, f.capture);
  assert.equal(method.kind, 'award');
  assert.match(method.verification_evidence.coverage_limit, /execution and award-action details need separate review/);
  const empty = { ...f.capture, content_base64: Buffer.from('<title>State Contracts</title>').toString('base64') };
  assert.throws(() => verifiedPublicMethod(f.source, f.state, f.run, f.task, empty), /bytes do not match/);
});
