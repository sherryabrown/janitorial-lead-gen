// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  workflowRequest,
  mutationKey,
  acknowledged,
  workflowOrigin,
} from './procurement-workflow';
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));
vi.mock('./supabase', () => ({ supabase: { auth } }));
beforeEach(() => {
  sessionStorage.clear();
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'old' } },
  });
  auth.refreshSession.mockResolvedValue({
    data: { session: { access_token: 'new' } },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('refreshes once and resends the same mutation identity without exposing tokens in errors', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{"trigger_id":"saved"}'));
  vi.stubGlobal('fetch', fetch);
  expect(
    await workflowRequest('/v1/triggers', {
      body: { confirmed_scope: true },
      key: 'stable',
    }),
  ).toEqual({ trigger_id: 'saved' });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer old');
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe('stable');
});
it('fails closed on expired authentication, sanitizes backend diagnostics and preserves aborts', async () => {
  auth.getSession.mockResolvedValueOnce({ data: { session: null } });
  await expect(workflowRequest('/v1/counties')).rejects.toMatchObject({
    code: 'SESSION',
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('private SQL credentials', { status: 500 }),
      ),
  );
  await expect(workflowRequest('/v1/counties')).rejects.toThrow(
    'Action was not confirmed',
  );
  const abort = new DOMException('aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
  await expect(workflowRequest('/v1/counties')).rejects.toBe(abort);
});
it('retains keys across retry/remount, changes keys for changed input and clears acknowledged operations', () => {
  const key = mutationKey('user', 'run', { ids: ['05001'] });
  expect(mutationKey('user', 'run', { ids: ['05001'] })).toBe(key);
  expect(mutationKey('user', 'run', { ids: ['05003'] })).not.toBe(key);
  acknowledged('user', 'run');
  expect(mutationKey('user', 'run', { ids: ['05001'] })).not.toBe(key);
});
it('explains missing report endpoints and read failures without suggesting a rejected mutation',async()=>{
  for(const status of [404,422,500]){
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private diagnostic',{status})));
    const read=workflowRequest('/v1/admin/metric-members?member_metric=added');
    await expect(read).rejects.toMatchObject({code:'READ'});
    await expect(read).rejects.toThrow(status===404?'Report links are unavailable on this backend':'Saved report records could not load');
  }
});
it('rejects credential-bearing and malformed API origins', () => {
  for (const value of [
    'http://example.com',
    'https://key:secret@example.com',
    'https://example.com/path',
    'https://example.com?token=secret',
  ])
    expect(() => workflowOrigin(value)).toThrow();
  expect(workflowOrigin('http://127.0.0.1:4100')).toBe('http://127.0.0.1:4100');
});
